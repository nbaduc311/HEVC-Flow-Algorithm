"""Package real Merge/AMVP/ME events by the enclosing CU search."""
import json
import math
from collections import defaultdict


def build_inter_bundle(source, public, events, write):
    if not source.exists():return None
    groups=defaultdict(list)
    for line in source.open(encoding='utf-8'):
        row=json.loads(line)
        row['step']=len(groups[row['search']])+1
        if 'distortion' in row and 'rateCost' in row:
            if row['distortion']+row['rateCost']!=row['cost']:
                raise RuntimeError(f'Inter cost mismatch: {row}')
        if 'motionLambda' in row and 'rateCost' in row:
            if math.floor(row['motionLambda']*row['bits'])!=row['rateCost']:raise RuntimeError('Motion bit cost mismatch')
        if 'mvd' in row:
            if row['mvd']!=[a-b for a,b in zip(row['mv'],row['predictor'])]:
                raise RuntimeError('MVD differs from MV - MVP')
        groups[row['search']].append(row)
    finals=defaultdict(list)
    for e in events:
        if 'interSearchId' in e:finals[e['interSearchId']].append(e)
    index=[]
    for search,rows in groups.items():
        if rows[0]['stage']!='BEGIN':raise RuntimeError('Inter search has no BEGIN')
        trials=finals.pop(search,[])
        if not trials:raise RuntimeError('Inter search has no final trial')
        first=rows[0]
        path=f'runs/{public.name}/inter/{search}.json'
        summary={k:first[k] for k in ('search','kind','poc','x','y','size','part')}
        summary.update(path=path,seqs=[e['seq'] for e in trials],steps=len(rows),pus=sorted({r['pu'] for r in rows}))
        for e in trials:e['interPath']=path
        write(public/'inter'/f'{search}.json',dict(version=2,summary=summary,events=rows))
        index.append(summary)
    if finals:raise RuntimeError('Inter final trial missing search')
    write(public/'inter/index.json',dict(version=2,searches=index))
    return f'runs/{public.name}/inter/index.json'
