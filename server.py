"""Local-only experiment API and static Inter Lab, standard library only."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import json
from pathlib import Path
import threading
import uuid
from urllib.parse import urlparse
from experiments import ROOT, DEFAULTS, validate, run_experiment, manifest

jobs={}
lock=threading.Lock()
active=None

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs): super().__init__(*args,directory=str(ROOT/'web'),**kwargs)
    def reply(self,status,data):
        payload=json.dumps(data,ensure_ascii=False).encode()
        self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(payload)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(payload)
    def do_GET(self):
        path=urlparse(self.path).path
        if path=='/api/runs': return self.reply(200,manifest())
        if path=='/api/status': return self.reply(200,dict(defaults=DEFAULTS,active=active))
        if path.startswith('/api/jobs/'):
            job=jobs.get(path.rsplit('/',1)[1])
            return self.reply(200 if job else 404,job or dict(error='Không có job này'))
        if path.startswith('/source/'):
            allowed={'TEncCu.cpp':'TLibEncoder/TEncCu.cpp','TEncSearch.cpp':'TLibEncoder/TEncSearch.cpp','VisualDumper.cpp':'TLibCommon/VisualDumper.cpp','TComRdCost.cpp':'TLibCommon/TComRdCost.cpp','TEncSlice.cpp':'TLibEncoder/TEncSlice.cpp','TEncTop.cpp':'TLibEncoder/TEncTop.cpp','TEncBinCoderCABACCounter.cpp':'TLibEncoder/TEncBinCoderCABACCounter.cpp'}
            name=path.rsplit('/',1)[1]
            if name not in allowed: return self.reply(404,dict(error='Không có file này'))
            payload=(ROOT/'hm/source/Lib'/allowed[name]).read_bytes()
            self.send_response(200);self.send_header('Content-Type','text/plain; charset=utf-8');self.send_header('Content-Length',str(len(payload)));self.end_headers();self.wfile.write(payload);return
        if path=='/README.md':
            payload=(ROOT/'README.md').read_bytes();self.send_response(200);self.send_header('Content-Type','text/plain; charset=utf-8');self.end_headers();self.wfile.write(payload);return
        super().do_GET()
    def do_POST(self):
        global active
        if self.path!='/api/runs': return self.reply(404,dict(error='Không có API này'))
        # Accept browser requests only from this local server, plus local CLI clients.
        origin=self.headers.get('Origin')
        if origin and origin not in ('http://127.0.0.1:5174','http://localhost:5174'):
            return self.reply(403,dict(error='Origin không hợp lệ'))
        try:
            size=int(self.headers.get('Content-Length','0'))
            if size<=0 or size>4096: raise ValueError('Request không hợp lệ')
            config=validate(json.loads(self.rfile.read(size)))
        except (ValueError,TypeError) as exc: return self.reply(400,dict(error=str(exc)))
        with lock:
            if active: return self.reply(409,dict(error='HM đang chạy một cấu hình. Chờ kết quả rồi chạy tiếp.',job=active))
            key=uuid.uuid4().hex;active=key;jobs[key]=dict(status='running',config=config)
        def work():
            global active
            try: result=run_experiment(config);jobs[key]=dict(status='done',result=result)
            except Exception as exc: jobs[key]=dict(status='error',error=str(exc))
            finally:
                with lock: active=None
        threading.Thread(target=work,daemon=True).start()
        self.reply(202,dict(job=key))

if __name__=='__main__':
    print('HEVC Inter Lab: http://127.0.0.1:5174/',flush=True)
    ThreadingHTTPServer(('127.0.0.1',5174),Handler).serve_forever()
