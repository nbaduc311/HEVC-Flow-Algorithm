"""Check actual HM mode trials, TU returns and saved-run replay equivalence."""
import json
import math
import unittest
from experiments import PUBLIC, manifest


class IntraChecks(unittest.TestCase):
    def test_mode_search_and_replays(self):
        checked=set()
        saw_nxn=saw_refine=saw_split=False
        for item in manifest():
            saved=json.loads((PUBLIC/item['id']/'result.json').read_text(encoding='utf-8'))
            self.assertIn('intraPath',saved)
            replay=saved['provenance'].get('intraReplay')
            if replay:
                self.assertEqual((PUBLIC/item['id']/'stream.265').read_bytes(),(PUBLIC/replay['id']/'stream.265').read_bytes())
            index=json.loads((PUBLIC.parent/saved['intraPath']).read_text(encoding='utf-8'))
            finals={e['seq']:e for e in saved['events'] if e.get('phase')=='INTRA'}
            self.assertEqual(set(finals),{s['seq'] for s in index['searches']})
            for summary in index['searches']:
                final=finals[summary['seq']]
                self.assertEqual(final['intraPath'],summary['path'])
                if summary['path'] in checked:continue
                checked.add(summary['path'])
                data=json.loads((PUBLIC.parent/summary['path']).read_text(encoding='utf-8'))['events']
                picks=[e for e in data if e['stage'] in ('LUMA_PICK','CHROMA_PICK')]
                self.assertEqual(sum(e['distortion'] for e in picks),final['distortion'])
                luma_picks=[e for e in picks if e['stage']=='LUMA_PICK']
                if final['part']=='NxN':
                    self.assertEqual(len(luma_picks),4)
                    saw_nxn=True
                for chosen in picks:
                    trials=[e for e in data if e['stage']==chosen['stage'].removesuffix('_PICK') and e['offset']==chosen['offset']]
                    winner=min(trials,key=lambda e:e['cost'])
                    for k in ('mode','distortion','bits','cost'):
                        self.assertEqual(chosen[k],winner[k])
                for e in data:
                    if 'cost' in e:
                        self.assertTrue(math.isclose(e['cost'],e['distortion']+e['lambda']*e['bits'],rel_tol=1e-9,abs_tol=1e-5))
                    if e['stage']=='SHORTLIST':
                        fast=[r for r in data if r['stage']=='FAST' and r['offset']==e['offset']]
                        self.assertEqual({r['mode'] for r in fast},set(range(35)))
                        rdo=[r['mode'] for r in data if r['stage']=='LUMA' and r['offset']==e['offset'] and r['pass']=='RDO']
                        self.assertEqual(rdo,e['modes'])
                    if e['stage']=='LUMA':
                        tu=[r for r in data if r['stage']=='TU' and r['attempt']==e['attempt']][-1]
                        for k in ('offset','distortion','bits','cost'):
                            self.assertEqual(e[k],tu[k])
                        saw_refine |= e['pass']=='REFINE'
                    if e['stage']=='TU':
                        chosen_cost=e['splitCost'] if e['split'] else e['singleCost']
                        self.assertEqual(e['cost'],chosen_cost)
                        if e['singleCost'] is not None and e['splitCost'] is not None:
                            self.assertEqual(e['split'],e['splitCost']<e['singleCost'])
                        saw_split |= e['split']
                    if e['stage'] in ('LUMA','CHROMA'):
                        self.assertEqual(e['accepted'],e['bestBefore'] is None or e['cost']<e['bestBefore'])
        self.assertTrue(checked)
        self.assertTrue(saw_nxn and saw_refine and saw_split)


if __name__=='__main__':unittest.main()
