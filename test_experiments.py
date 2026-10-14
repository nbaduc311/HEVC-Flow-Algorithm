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

    def test_rd_origin_arithmetic(self):
        checked_samples=set()
        for path in (ROOT/'web/runs').glob('*/result.json'):
            d=json.loads(path.read_text(encoding='utf-8'))
            for e in d['events']:
                if not e.get('originVersion'): continue
                if e['phase']=='SPLIT':
                    self.assertEqual(e['distortion'],sum(c['distortion'] for c in e['splitChildren']))
                    self.assertGreaterEqual(e['bits'],sum(c['bits'] for c in e['splitChildren']))
                    continue
                self.assertEqual(e['bits'],sum(s['delta'] for s in e['rateSteps']))
                self.assertEqual(e['rateSteps'][-1]['after'],e['bits'])
                origin=e['distortionOrigin']
                self.assertTrue(origin['matches'])
                self.assertEqual(e['distortion'],sum(c['weighted'] for c in origin['components']))
                for c in origin['components']:
                    self.assertEqual(c['sse'],sum(g['sse'] for g in c['groups']))
                    self.assertEqual(c['weighted'],sum(int(g['sse']*c['weight']) for g in c['groups']))
                    self.assertEqual(c['width']*c['height'],sum(g['width']*g['height'] for g in c['groups']))
                # Verify raw buffers for the first recorded candidate at each size/mode/run.
                sample_key=(path.parent.name,e['phase'],e['size'])
                if sample_key in checked_samples: continue
                checked_samples.add(sample_key)
                sample=json.loads((ROOT/'web'/e['samplesPath']).read_text(encoding='utf-8')) if 'samplesPath' in e else origin
                for c,meta in zip(sample['components'],origin['components']):
                    self.assertEqual(sum((a-b)**2 for a,b in zip(c['original'],c['reconstruction'])),meta['sse'])
                    for g in meta['groups']:
                        vals=[(c['original'][y*c['width']+x]-c['reconstruction'][y*c['width']+x])**2 for y in range(g['y'],g['y']+g['height']) for x in range(g['x'],g['x']+g['width'])]
                        self.assertEqual(sum(vals),g['sse'])
        self.assertTrue(checked_samples)

    def test_observation_preserves_baseline(self):
        # Same input/config as the demo captured before adding the new RD hooks.
        self.assertEqual((ROOT/'data/sample.265').read_bytes(),(ROOT/'web/runs/baseline/stream.265').read_bytes())

if __name__=='__main__': unittest.main()
