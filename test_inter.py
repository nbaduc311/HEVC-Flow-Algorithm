"""Relationships in observed Merge/AMVP/ME trials and replay invariance."""
import json
import math
import unittest
from experiments import PUBLIC,manifest

class InterChecks(unittest.TestCase):
    def test_saved_replays(self):
        for item in manifest():
            data=json.loads((PUBLIC/item['id']/'result.json').read_text(encoding='utf-8'))
            if item['config']['profile']=='I':
                self.assertNotIn('interPath',data)
                self.assertFalse(any(e.get('phase') in ('INTER','MERGE') for e in data['events']))
                continue
            self.assertIn('interPath',data,item['id'])
            replay=data['provenance'].get('interReplay')
            if replay:
                self.assertEqual((PUBLIC/item['id']/'stream.265').read_bytes(),(PUBLIC/replay['id']/'stream.265').read_bytes())
                self.assertTrue(replay['decisionsIdentical'])
            index=json.loads((PUBLIC.parent/data['interPath']).read_text(encoding='utf-8'))['searches']
            final={e['seq']:e for e in data['events'] if e.get('interSearchId')}
            self.assertEqual(set(final),{seq for s in index for seq in s['seqs']})
            for s in index:
                for seq in s['seqs']:self.assertEqual(final[seq]['interPath'],s['path'])

    def test_motion_and_merge(self):
        seen=set()
        for run_id in ('baseline-ctu4-1','bframes-ctu4-1','merge1-ctu4-1','esd-ctu4-1'):
            data=json.loads((PUBLIC/run_id/'result.json').read_text(encoding='utf-8'))
            finals={e['seq']:e for e in data['events']}
            index=json.loads((PUBLIC.parent/data['interPath']).read_text(encoding='utf-8'))['searches']
            for s in index:
                events=json.loads((PUBLIC.parent/s['path']).read_text(encoding='utf-8'))['events']
                for e in events:
                    self.assertEqual((e['poc'],e['x'],e['y'],e['size']),(s['poc'],s['x'],s['y'],s['size']))
                    if 'distortion' in e and 'rateCost' in e:self.assertEqual(e['distortion']+e['rateCost'],e['cost'])
                    if 'motionLambda' in e:
                        self.assertEqual(math.floor(e['motionLambda']*e['bits']),e['rateCost'])
                    if e['stage']=='DIRECTION_PICK':
                        costs=[e['l0Cost'],e['l1Cost'],e['biCost']]
                        costs=[math.inf if c is None else c for c in costs]
                        self.assertEqual(e['dir'],3 if costs[2]<=min(costs[:2]) else 1 if costs[0]<=costs[1] else 2)
                    if 'mvd' in e:self.assertEqual(e['mvd'],[a-b for a,b in zip(e['mv'],e['predictor'])])
                    if e['stage']=='AMVP_PICK':
                        group=[r for r in events if r['stage']=='AMVP_TEMPLATE' and (r['pu'],r['list'],r['ref'])==(e['pu'],e['list'],e['ref'])]
                        self.assertEqual(e['candidate'],min(group,key=lambda r:r['cost'])['candidate'])
                    if e['stage']=='ME_RESULT':
                        group=[r for r in events if r['stage']=='QUARTER' and r['attempt']==e['attempt']]
                        self.assertEqual(e['mv'],min(group,key=lambda r:r['cost'])['mv'])
                        self.assertEqual(e['distortion'],math.floor(e['weight']*e['rawDistortion']))
                        seen.add('bi' if e['bi'] else 'uni')
                    if e['stage']=='MVP_RECHECK':
                        self.assertLessEqual(e['mvBits'],e['beforeMvBits'])
                    if e['stage']=='PU_COMPARE':
                        self.assertEqual(e['chooseMerge'],e['meCost'] is None or e['mergeCost']<e['meCost'])
                        seen.add('pu_compare')
                    if e['stage']=='PU_FINAL':
                        f=next(finals[seq] for seq in s['seqs'] if finals[seq]['event']=='TRIAL')
                        pu=f['pus'][e['pu']];mv=pu['l'+str(e['list'])]
                        self.assertEqual(e['mv'],[mv['mv_x_qpel'],mv['mv_y_qpel']])
                        self.assertEqual(e['merge'],pu['merge'])
                        self.assertEqual(e['ref'],mv['ref_idx'])
                    if e['stage']=='MERGE_END':
                        if not e['earlySkipEnabled']:self.assertFalse(e['earlyDetected'])
                        if e['earlyDetected']:self.assertEqual(e['bestCbf'],0)
                if s['kind']=='MERGE_2Nx2N':
                    candidates=[r for r in events if r['stage']=='MERGE_LIST']
                    self.assertEqual(len(candidates),data['summary']['config']['mergeCandidates'])
                    for seq in s['seqs']:
                        f=finals[seq]
                        if f['event']!='TRIAL':continue
                        c=candidates[f['candidate']];pu=f['pus'][0]
                        self.assertEqual(c['dir'],pu['inter_dir'])
                        for l,field in enumerate(c['fields']):
                            if field:
                                actual=pu['l'+str(l)]
                                self.assertEqual(field['mv'],[actual['mv_x_qpel'],actual['mv_y_qpel']])
                        if f['pass']==1:self.assertTrue(f['skip']);self.assertEqual(f['cbf'],0)
        self.assertTrue({'uni','bi','pu_compare'}<=seen)

if __name__=='__main__':unittest.main()
