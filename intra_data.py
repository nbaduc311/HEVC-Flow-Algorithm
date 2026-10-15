"""Package observed Intra search stages without recomputing any encoder decision."""
import json
import math
from collections import defaultdict


def build_intra_bundle(source, public, events, write):
    if not source.exists():
        return None
    searches=defaultdict(list)
    with source.open(encoding='utf-8') as trace:
        for line in trace:
            row=json.loads(line)
            rows=searches[row['search']]
            row['step']=len(rows)+1
            if 'cost' in row:
                expected=row['distortion']+row['lambda']*row['bits']
                if not math.isclose(row['cost'],expected,rel_tol=1e-9,abs_tol=1e-5):
                    raise RuntimeError(f"Intra {row['search']} {row['stage']}: D/R/J do not reconcile")
                if row['stage'] in ('LUMA','CHROMA'):
                    if row['accepted']!=(row['bestBefore'] is None or row['cost']<row['bestBefore']):
                        raise RuntimeError('Intra decision mismatch')
            rows.append(row)
    stats=dict(searches=0,fastModes=0,lumaTrials=0,refineTrials=0,chromaTrials=0,tuEvaluations=0)
    index=[]
    for final in events:
        if final.get('phase')!='INTRA':continue
        search=final.get('intraSearchId')
        rows=searches.pop(search,[])
        if not rows:raise RuntimeError('Missing Intra mode trace for final CU')
        stats['searches']+=1
        for field,stage in [('fastModes','FAST'),('lumaTrials','LUMA'),('chromaTrials','CHROMA'),('tuEvaluations','TU')]:
            stats[field]+=sum(r['stage']==stage for r in rows)
        stats['refineTrials']+=sum(r['stage']=='LUMA' and r['pass']=='REFINE' for r in rows)
        y=[r for r in rows if r['stage']=='LUMA_PICK']
        c=[r for r in rows if r['stage']=='CHROMA_PICK']
        if sum(r['distortion'] for r in y+c)!=final['distortion']:
            raise RuntimeError('Final Intra D differs from selected Y + chroma')
        for shortlist in (r for r in rows if r['stage']=='SHORTLIST'):
            fast=[r for r in rows if r['stage']=='FAST' and r['offset']==shortlist['offset']]
            tested=[r['mode'] for r in rows if r['stage']=='LUMA' and r['pass']=='RDO' and r['offset']==shortlist['offset']]
            if fast and len(fast)!=35:raise RuntimeError('Expected 35 fast luma modes')
            if tested!=shortlist['modes']:raise RuntimeError('Shortlist does not match RDO traversal')
        path=f"runs/{public.name}/intra/{search}.json"
        final['intraPath']=path
        summary={k:final[k] for k in ('seq','poc','x','y','size','part','qp','distortion','bits','lambda','cost','accepted','bestBefore')}
        summary.update(search=search,path=path,lumaModes=[r['mode'] for r in y],chromaModes=[r['mode'] for r in c],steps=len(rows))
        write(public/'intra'/f'{search}.json',dict(version=1,summary=summary,events=rows))
        index.append(summary)
    if searches:raise RuntimeError('Intra trace has unmatched CU searches')
    write(public/'intra/index.json',dict(version=1,searches=index,stats=stats))
    return f'runs/{public.name}/intra/index.json'
