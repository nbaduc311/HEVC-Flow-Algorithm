"""Reproducible HM experiments, shared by the local API and CLI."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import time
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent
def find_encoder():
    configured = os.environ.get('HEVC_ENCODER_BIN')
    encoder = Path(configured).expanduser().resolve() if configured else ROOT / 'build/TAppEncoder'
    if not encoder.is_file() or not os.access(encoder, os.X_OK):
        raise RuntimeError('Chưa có encoder HM. Chạy ./build.sh trước, hoặc đặt HEVC_ENCODER_BIN tới encoder đã build có hook trace.')
    return encoder

INPUT = ROOT / 'data/sample_576x324_10bit.yuv'
PUBLIC = ROOT / 'web/runs'
RAW = ROOT / 'data/runs'
DEFAULTS = dict(qp=32, searchRange=64, mergeCandidates=5, esd=0, fdm=1, cfm=0, ecu=0, amp=1, profile='P', ctuX=4, ctuY=1)
PRESETS = [
    ('baseline', 'Mốc · QP 32', {}),
    ('qp22', 'QP 22 · tăng chất lượng', dict(qp=22)),
    ('qp42', 'QP 42 · giảm số bit', dict(qp=42)),
    ('merge1', 'Chỉ 1 merge candidate', dict(mergeCandidates=1)),
    ('range8', 'SearchRange 8', dict(searchRange=8)),
    ('esd', 'Bật Early Skip', dict(esd=1)),
    ('fdmoff', 'Tắt Fast Merge', dict(fdm=0)),
    ('bframes', 'Low Delay B', dict(profile='B')),
]

def validate(raw):
    if not isinstance(raw, dict) or set(raw)-set(DEFAULTS):
        raise ValueError('Cấu hình có trường không hợp lệ.')
    c = DEFAULTS | raw
    ranges = dict(qp=(0,51), searchRange=(4,128), mergeCandidates=(1,5), ctuX=(0,8), ctuY=(0,5))
    ranges.update({k:(0,1) for k in ('esd','fdm','cfm','ecu','amp')})
    for key,(lo,hi) in ranges.items():
        if type(c[key]) is not int or not lo <= c[key] <= hi:
            raise ValueError(f'{key} phải là số nguyên trong [{lo}, {hi}].')
    if c['profile'] not in ('P','B'):
        raise ValueError('profile phải là P hoặc B.')
    return c

def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False), encoding='utf-8')
    tmp.replace(path)

def manifest():
    path=PUBLIC/'manifest.json'
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else []

def run_experiment(config, run_id=None, label=None, publish=True):
    config=validate(config)
    encoder=find_encoder()
    if not INPUT.is_file():
        raise RuntimeError('Thiếu input mẫu: data/sample_576x324_10bit.yuv')
    if not shutil.which('ffmpeg'):
        raise RuntimeError('Thiếu FFmpeg. Hãy cài ffmpeg rồi thử lại.')
    run_id=run_id or ('run-'+datetime.now().strftime('%Y%m%d-%H%M%S')+'-'+os.urandom(3).hex())
    out=RAW/run_id; public=PUBLIC/run_id
    out.mkdir(parents=True, exist_ok=True); public.mkdir(parents=True, exist_ok=True)
    profile='encoder_lowdelay_P_main10.cfg' if config['profile']=='P' else 'encoder_lowdelay_main10.cfg'
    cfg=ROOT/'hm/cfg'/profile
    args=[str(encoder), '-c',str(cfg), '-i',str(INPUT), '-o',str(out/'recon.yuv'), '-b',str(out/'stream.265'),
          '-wdt','576','-hgt','324','-fr','8','-f','5','--InputBitDepth=10','--ConformanceWindowMode=1',
          '-q',str(config['qp']), '--SearchRange='+str(config['searchRange']), '--MaxNumMergeCand='+str(config['mergeCandidates'])]
    for key,opt in dict(esd='ESD',fdm='FDM',cfm='CFM',ecu='ECU',amp='AMP').items():
        args.append('--'+opt+'='+str(config[key]))
    env=os.environ | dict(VISUAL_CTU_X='0', VISUAL_CTU_Y='0', VISUAL_CU_SIZE='0', VISUAL_POC='-1', VISUAL_DUMP_EXIT='0',
        VISUAL_OUTPUT_DIR=str(out), INTER_LAB_TRACE='1', INTER_LAB_CTU_X=str(config['ctuX']), INTER_LAB_CTU_Y=str(config['ctuY']))
    start=time.perf_counter()
    with (out/'encoder.log').open('w', encoding='utf-8') as log:
        proc=subprocess.run(args, cwd=ROOT/'hm', env=env, stdout=log, stderr=subprocess.STDOUT, timeout=180)
    if proc.returncode:
        raise RuntimeError('HM thất bại: '+(out/'encoder.log').read_text(encoding='utf-8')[-2000:])
    wall=time.perf_counter()-start
    log=(out/'encoder.log').read_text(encoding='utf-8')
    frames=[]
    pattern=r'POC\s+(\d+)\s+TId:\s*(\d+)\s+\(\s*(\w)-SLICE, nQP\s+(-?\d+) QP\s+(-?\d+)\s*\)\s+(\d+) bits \[Y\s+([\d.]+) dB\s+U\s+([\d.]+) dB\s+V\s+([\d.]+) dB\].*?\[L0([^\]]*)\]\s*\[L1([^\]]*)\]'
    for m in re.finditer(pattern, log):
        poc,tid,kind,nqp,qp,bits,y,u,v,l0,l1=m.groups()
        frames.append(dict(poc=int(poc), tid=int(tid), sliceType=kind, qp=int(qp), nqp=int(nqp), bits=int(bits), psnrY=float(y),psnrU=float(u),psnrV=float(v), l0=list(map(int,l0.split())), l1=list(map(int,l1.split())),ctus=[]))
    if len(frames)!=5: raise RuntimeError('Không đọc được 5 dòng POC từ encoder.log')
    frames.sort(key=lambda f:f['poc'])
    for line in (out/'trace.jsonl').open(encoding='utf-8'):
        e=json.loads(line)
        if e['event']=='CTU_PARTITION':
            frames[e['poc']]['ctus'].append(dict(x=e['ctu_x']*64,y=e['ctu_y']*64,nodes=e['nodes']))
    decisions=out/'decisions.jsonl'
    if not decisions.exists(): raise RuntimeError('Encoder chưa có trace RD. Hãy build lại HM.')
    events=[json.loads(line) for line in decisions.open(encoding='utf-8')]
    if not events: raise RuntimeError('Không có trace trong CTU đã chọn.')
    for i,e in enumerate(events):
        e['seq']=i+1
        origin=e.get('distortionOrigin')
        if origin:
            if not origin['matches']:
                raise RuntimeError(f"D provenance mismatch: event {i+1}, D={e['distortion']}, sum={origin['sum']}")
            planes=[]
            for component in origin['components']:
                planes.append({k:component[k] for k in ('component','width','height','original','reconstruction')})
                del component['original'];del component['reconstruction']
            path=public/'details'/f'{i+1}.json'
            atomic_json(path,dict(components=planes))
            e['samplesPath']=f'runs/{run_id}/details/{i+1}.json'
        if e.get('originVersion') and e['event']=='TRIAL':
            if e['phase']=='SPLIT':
                if sum(child['distortion'] for child in e['splitChildren'])!=e['distortion']:
                    raise RuntimeError(f'Split D provenance mismatch: event {i+1}')
            elif not e['rateSteps'] or e['rateSteps'][-1]['after']!=e['bits']:
                raise RuntimeError(f'Rate provenance mismatch: event {i+1}')
    for f in frames:
        if len(f['ctus'])!=54: raise RuntimeError('Thiếu CTU trong trace')
        leaves=[n for c in f['ctus'] for n in c['nodes'] if not n['split']]
        counts={k:sum(n['mode']==k for n in leaves) for k in ('INTRA','INTER','SKIP')}
        # Visible luma area avoids overcounting the bottom conformance padding.
        areas={k:sum(min(n['width'],576-n['x'])*min(n['height'],324-n['y']) for n in leaves if n['mode']==k) for k in counts}
        f.update(counts=counts,skipAreaPercent=areas['SKIP']/(576*324)*100)
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-pixel_format','yuv420p10le','-video_size','576x324','-i',str(out/'recon.yuv'),'-frames:v','5','-c:v','libwebp','-quality','92',str(public/'recon_%02d.webp')],check=True,timeout=30)
    total_bytes=(out/'stream.265').stat().st_size
    cpu=re.search(r'Total Time:\s*([\d.]+)',log)
    summary=dict(id=run_id,label=label or f"{config['profile']} · QP {config['qp']} · {run_id[-6:]}",config=config,
        bytes=total_bytes,bitrateKbps=total_bytes*8/(5/8)/1000,psnrY=sum(f['psnrY'] for f in frames)/5,
        wallSeconds=wall,encoderSeconds=float(cpu.group(1)) if cpu else None,
        trials=sum(e['event']=='TRIAL' for e in events),pruned=sum(e['event']=='PRUNED' for e in events),
        skipAreaPercent=sum(f['skipAreaPercent'] for f in frames[1:])/4,
        created=datetime.now(timezone.utc).isoformat())
    command=' '.join(f'{k}={shlex.quote(env[k])}' for k in ('VISUAL_CTU_X','VISUAL_CTU_Y','VISUAL_CU_SIZE','VISUAL_POC','VISUAL_DUMP_EXIT','VISUAL_OUTPUT_DIR','INTER_LAB_TRACE','INTER_LAB_CTU_X','INTER_LAB_CTU_Y'))+' '+shlex.join(args)
    provenance=dict(command=command,input=str(INPUT.relative_to(ROOT)),inputSha256=hashlib.sha256(INPUT.read_bytes()).hexdigest(),
        encoderSha256=hashlib.sha256(encoder.read_bytes()).hexdigest(),configFile=profile,configText=cfg.read_text(encoding='utf-8'),bitDepth=10,roi=dict(x=config['ctuX']*64,y=config['ctuY']*64,size=64))
    bundle=dict(summary=summary,provenance=provenance,frames=frames,events=events)
    atomic_json(public/'result.json',bundle)
    for name in ('encoder.log','decisions.jsonl','stream.265'):
        (public/name).write_bytes((out/name).read_bytes())
    (public/'command.txt').write_text(command+'\n', encoding='utf-8')
    (public/'encoder.cfg').write_text(cfg.read_text(encoding='utf-8')+'\n# Overrides: '+json.dumps(config)+'\n', encoding='utf-8')
    items=[r for r in manifest() if r['id']!=run_id]+[summary]
    if publish: atomic_json(PUBLIC/'manifest.json',items)
    return summary

if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--presets',action='store_true'); parser.add_argument('--config',default='{}')
    args=parser.parse_args()
    if args.presets:
        for key,label,overrides in PRESETS:
            config=DEFAULTS|overrides
            run_id=f"{key}-ctu{config['ctuX']}-{config['ctuY']}"
            print(json.dumps(run_experiment(config,run_id,label),ensure_ascii=False),flush=True)
    else: print(json.dumps(run_experiment(json.loads(args.config)),ensure_ascii=False))
