"""Add Inter search traces to saved runs only after replay equivalence checks."""
import json
from experiments import PUBLIC,atomic_json,manifest,run_experiment


def enrich():
    reused={}
    for summary in manifest():
        run_id=summary['id'];path=PUBLIC/run_id/'result.json';old=json.loads(path.read_text(encoding='utf-8'))
        if old.get('interPath') and old.get('interTraceVersion')==2:
            print(run_id,'already has Inter trace',flush=True);continue
        key=json.dumps(summary['config'],sort_keys=True)
        if key not in reused:
            replay_id='inter-'+run_id
            run_experiment(summary['config'],run_id=replay_id,label='Inter trace · '+summary['label'],publish=False)
            reused[key]=json.loads((PUBLIC/replay_id/'result.json').read_text(encoding='utf-8'))
        fresh=reused[key];replay_id=fresh['summary']['id']
        if old['provenance']['inputSha256']!=fresh['provenance']['inputSha256'] or (PUBLIC/run_id/'stream.265').read_bytes()!=(PUBLIC/replay_id/'stream.265').read_bytes():
            raise RuntimeError(f'{run_id}: replay differs; saved run not changed')
        if old['frames']!=fresh['frames'] or len(old['events'])!=len(fresh['events']):raise RuntimeError(f'{run_id}: final tree or trials differ')
        ignored={'samplesPath','intraPath','intraSearchId','interPath','interSearchId'}
        for a,b in zip(old['events'],fresh['events']):
            for k,v in a.items():
                if k in ignored:continue
                observed=b.get(k)
                if k=='rateSteps':
                    # Older traces predate the reset snapshot and fractional-bit column.
                    by_label={r['label']:r for r in observed}
                    observed=[{field:by_label.get(r['label'],{}).get(field) for field in r} for r in v]
                if k=='distortionOrigin' and any('original' in c for c in v['components']):
                    # Older bundles stored the same buffers inline, newer ones load them on demand.
                    samples=json.loads((PUBLIC.parent/b['samplesPath']).read_text(encoding='utf-8'))
                    observed={**observed,'components':[{**meta,**{field:raw[field] for field in ('original','reconstruction')}} for meta,raw in zip(observed['components'],samples['components'])]}
                if observed!=v:raise RuntimeError(f'{run_id} #{a["seq"]}: {k} differs')
        for a,b in zip(old['events'],fresh['events']):
            for k in ('interPath','interSearchId'):
                if k in b:a[k]=b[k]
        old['interPath']=fresh['interPath']
        old['interTraceVersion']=fresh['interTraceVersion']
        old['provenance']['interReplay']=dict(id=replay_id,created=fresh['summary']['created'],encoderSha256=fresh['provenance']['encoderSha256'],command=fresh['provenance']['command'],bitstreamIdentical=True,decisionsIdentical=True)
        atomic_json(path,old)
        print(run_id,'Inter enriched',flush=True)

if __name__=='__main__':enrich()
