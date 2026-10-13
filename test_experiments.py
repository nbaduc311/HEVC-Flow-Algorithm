"""Check relationships in real HM outputs, rather than snapshots of UI markup."""
import json
import math
from pathlib import Path
import unittest
from experiments import ROOT, validate

class ExperimentChecks(unittest.TestCase):
    def test_config_validation(self):
        for c in ({'qp':52},{'qp':22.5},{'ctuY':6},{'esd':2},{'profile':'arbitrary.cfg'},{'command':'echo x'}):
            with self.assertRaises(ValueError): validate(c)
        self.assertEqual(validate({'ctuY':5})['ctuY'],5)

    def test_real_measurements(self):
        paths=list((ROOT/'web/runs').glob('*/result.json'))
        self.assertGreaterEqual(len(paths),8)
        for path in paths:
            with self.subTest(run=path.parent.name):
                d=json.loads(path.read_text(encoding='utf-8'));s=d['summary'];c=s['config']
                self.assertEqual(len(d['frames']),5)
                self.assertEqual(s['bytes'],(path.parent/'stream.265').stat().st_size)
                self.assertAlmostEqual(s['bitrateKbps'],s['bytes']*8/(5/8)/1000)
                self.assertAlmostEqual(s['psnrY'],sum(f['psnrY'] for f in d['frames'])/5)
                self.assertEqual(s['trials'],sum(e['event']=='TRIAL' for e in d['events']))
                for f in d['frames']:
                    self.assertEqual(len(f['ctus']),54)
                    leaves=[n for ctu in f['ctus'] for n in ctu['nodes'] if not n['split']]
                    visible=lambda n:min(n['width'],576-n['x'])*min(n['height'],324-n['y'])
                    self.assertEqual(sum(map(visible,leaves)),576*324)
                    self.assertAlmostEqual(f['skipAreaPercent'],sum(visible(n) for n in leaves if n['mode']=='SKIP')/(576*324)*100)
                for e in d['events']:
                    self.assertEqual((e['x']//64,e['y']//64),(c['ctuX'],c['ctuY']))
                    if e['event']!='TRIAL': continue
                    self.assertTrue(math.isclose(e['cost'],e['distortion']+e['lambda']*e['bits'],rel_tol=1e-10,abs_tol=1e-5))
                    self.assertEqual(e['accepted'],e['bestBefore'] is None or e['cost']<e['bestBefore'])
                    if 'org' in e:
                        for key in ('org','pred','reco'):
                            self.assertEqual(len(e[key]),64)
                            self.assertTrue(all(0<=v<=1023 for v in e[key]))
                        if e['skip']: self.assertEqual(e['pred'],e['reco'])
                    if e['phase']=='MERGE' and e['pass']==1:
                        self.assertTrue(e['skip']);self.assertEqual(e['cbf'],0)

    def test_observation_preserves_baseline(self):
        # Same input/config as the demo captured before adding the new RD hooks.
        self.assertEqual((ROOT/'data/sample.265').read_bytes(),(ROOT/'web/runs/baseline/stream.265').read_bytes())

if __name__=='__main__': unittest.main()
