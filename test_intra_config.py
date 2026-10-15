"""Configuration wiring and real All Intra preset outputs."""
import json
import shlex
import unittest
from experiments import validate,INTRA_OPTIONS,INTRA_PRESETS,intra_preset,PUBLIC

class IntraConfigChecks(unittest.TestCase):
    def test_validation_and_legacy_defaults(self):
        self.assertEqual(validate({})['intraQpOffset'],-1)
        self.assertEqual(validate({'profile':'I'})['intraQpOffset'],0)
        self.assertEqual(validate({'profile':'I','intraQpOffset':2})['intraQpOffset'],2)
        for option in INTRA_OPTIONS:
            for bad in (option['min']-1,option['max']+1,0.5,'1',True):
                with self.assertRaises(ValueError):validate({option['key']:bad})
        self.assertEqual((PUBLIC/'intra-options-legacy-check/stream.265').read_bytes(),(PUBLIC/'baseline-ctu4-1/stream.265').read_bytes())

    def test_presets_and_actual_encoder_options(self):
        for preset in INTRA_PRESETS:
            with self.subTest(preset=preset['id']):
                data=json.loads((PUBLIC/(preset['id']+'-ctu4-1')/'result.json').read_text(encoding='utf-8'))
                cfg=data['summary']['config']
                self.assertEqual(cfg,intra_preset(preset))
                self.assertEqual([f['sliceType'] for f in data['frames']],['I']*5)
                self.assertEqual([f['qp'] for f in data['frames']],[cfg['qp']+cfg['intraQpOffset']]*5)
                self.assertNotIn('interPath',data)
                args=shlex.split(data['provenance']['command'])
                self.assertIn('--LambdaFromQpEnable=1',args)
                for item in INTRA_OPTIONS:self.assertIn('--'+item['option']+'='+str(cfg[item['key']]),args)
                stats=data['summary']['intraStats']
                self.assertEqual(stats['searches'],sum(e.get('phase')=='INTRA' for e in data['events']))
                index=json.loads((PUBLIC.parent/data['intraPath']).read_text(encoding='utf-8'))
                search=next(s for s in index['searches'] if s['size']==64 and s['poc']==0)
                rows=json.loads((PUBLIC.parent/search['path']).read_text(encoding='utf-8'))['events']
                shortlist=next(e for e in rows if e['stage']=='SHORTLIST')
                self.assertEqual(shortlist['baseCount'],3 if cfg['fastIntraMpm'] else 5)
                if not cfg['fastIntraMpm']:self.assertFalse(any(e['stage']=='MPM' for e in rows))

if __name__=='__main__':unittest.main()
