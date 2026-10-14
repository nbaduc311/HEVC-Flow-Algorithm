"""Replay saved configurations and attach provenance only after verifying identical output.
Original timing, logs and encoder identity remain attached to the original run.
"""
import json
from pathlib import Path
from experiments import PUBLIC, atomic_json, manifest, run_experiment

FIELDS=('originVersion','distortionOrigin','samplesPath','rateSteps','splitChildren')

def enrich():
    reused={}
    for summary in manifest():
        run_id=summary['id'];path=PUBLIC/run_id/'result.json'
        old=json.loads(path.read_text(encoding='utf-8'))
        if all(e.get('originVersion') for e in old['events'] if e['event']=='TRIAL'):
            print(run_id, 'already enriched',flush=True);continue
        config_key=json.dumps(summary['config'],sort_keys=True)
        if config_key not in reused:
            replay_id='origin-'+run_id
            run_experiment(summary['config'],run_id=replay_id,label='RD provenance · '+summary['label'],publish=False)
            reused[config_key]=json.loads((PUBLIC/replay_id/'result.json').read_text(encoding='utf-8'))
        fresh=reused[config_key];replay_id=fresh['summary']['id']
        if old['provenance']['inputSha256']!=fresh['provenance']['inputSha256']:
            raise RuntimeError(f'{run_id}: replay input differs; original was not changed')
        if (PUBLIC/run_id/'stream.265').read_bytes()!=(PUBLIC/replay_id/'stream.265').read_bytes():
            raise RuntimeError(f'{run_id}: replay bitstream differs; original was not changed')
        if old['frames']!=fresh['frames'] or len(old['events'])!=len(fresh['events']):
            raise RuntimeError(f'{run_id}: decision sequence differs; original was not changed')
        for before,after in zip(old['events'],fresh['events']):
            for key,value in before.items():
                if key not in FIELDS and after.get(key)!=value:
                    raise RuntimeError(f'{run_id} event {before["seq"]}: {key} differs')
            for key in FIELDS:
                if key in after:before[key]=after[key]
        old['provenance']['rdOriginReplay']=dict(id=replay_id,created=fresh['summary']['created'],encoderSha256=fresh['provenance']['encoderSha256'],command=fresh['provenance']['command'],bitstreamIdentical=True,decisionsIdentical=True)
        atomic_json(path,old)
        print(run_id,'enriched',len(old['events']),'events',flush=True)

if __name__=='__main__':enrich()
