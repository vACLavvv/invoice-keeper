"""Loopback-only signed webhook receiver for a local demonstration."""
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
import argparse
import hashlib
import hmac
import json
import os
import threading
import time
import re
import logging
import signal

from dotenv import dotenv_values
from .config import ROOT
from .service_logs import ServiceLogs


def main():
    parser=argparse.ArgumentParser(description="Локальный приёмник webhook. Не публикуется в сети.")
    parser.add_argument('--port',type=int,default=18083)
    args=parser.parse_args()
    secret=os.getenv('WEBHOOK_SECRET') or dotenv_values(ROOT/'.env').get('WEBHOOK_SECRET','')
    if len(secret or '')<24:raise SystemExit('Задайте WEBHOOK_SECRET длиной минимум 24 символа в .env')
    database_path=Path(os.getenv('DATABASE_PATH','./data/invoice-keeper.sqlite3'))
    if not database_path.is_absolute():database_path=ROOT/database_path
    logs=ServiceLogs(database_path.parent/'logs',(secret,),filename='webhook.jsonl')
    logs.start()
    logger=logging.getLogger('invoice_keeper.webhook')
    output=database_path.parent/'webhook-demo.jsonl'
    output.parent.mkdir(exist_ok=True)
    seen=set()
    if output.exists():
        for line in output.read_text().splitlines():
            try:seen.add(json.loads(line)['event_id'])
            except (ValueError,KeyError,TypeError):pass
    lock=threading.Lock()

    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup()
            self.connection.settimeout(5)

        def do_GET(self):
            if self.path!='/healthz':
                self.send_response(404);self.end_headers();return
            body=b'{"status":"ok","service":"invoice-keeper-webhook-demo"}'
            self.send_response(200)
            self.send_header('Content-Type','application/json')
            self.send_header('Content-Length',str(len(body)))
            self.end_headers();self.wfile.write(body)

        def do_POST(self):
            length=self.headers.get('Content-Length','')
            if self.path!='/events' or len(length)>6 or not length.isascii() or not length.isdigit() or not 1<=int(length)<=65536:
                self.send_response(400);self.end_headers();return
            try:body=self.rfile.read(int(length))
            except TimeoutError:
                self.send_response(408);self.end_headers();return
            stamp=self.headers.get('X-Invoice-Timestamp','')
            supplied=self.headers.get('X-Invoice-Signature','')
            if len(body)!=int(length) or not re.fullmatch(r'[0-9]{1,12}',stamp) or not re.fullmatch(r'sha256=[0-9a-f]{64}',supplied):
                self.send_response(401);self.end_headers();return
            expected='sha256='+hmac.new(secret.encode(),stamp.encode()+b'.'+body,hashlib.sha256).hexdigest()
            if abs(time.time()-int(stamp))>300 or not hmac.compare_digest(expected,supplied):
                self.send_response(401);self.end_headers();return
            try:
                payload=json.loads(body)
                event_id=payload['event_id']
                if not isinstance(event_id,str) or not re.fullmatch(r'[0-9a-f]{32}',event_id) or event_id!=self.headers.get('Idempotency-Key'):raise ValueError()
            except (ValueError,KeyError,TypeError):
                self.send_response(400);self.end_headers();return
            with lock:
                if event_id not in seen:
                    fd=os.open(output,os.O_WRONLY|os.O_APPEND|os.O_CREAT,0o600)
                    with os.fdopen(fd,'a') as stream:stream.write(json.dumps(payload,ensure_ascii=False)+'\n')
                    seen.add(event_id)
                    logger.info('Webhook принят, подпись проверена; event_id=%s',event_id)
            self.send_response(204);self.end_headers()
        def log_request(self,code='-',size='-'):
            path=getattr(self,'path','')
            if path=='/healthz':return
            logger.log(logging.WARNING if isinstance(code,int) and code>=400 else logging.INFO,
                       '%s %s → %s',getattr(self,'command',''),path.split('?',1)[0][:200],code)
        def log_message(self,*args):pass

    server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    print(f'Локальный приёмник: http://127.0.0.1:{args.port}/events\nСобытия: {output}',flush=True)
    def stop_receiver(signum,frame):raise KeyboardInterrupt
    signal.signal(signal.SIGTERM,stop_receiver)
    logger.info("Локальный webhook-приёмник запущен; порт %s",args.port)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:
        server.server_close()
        logger.info("Локальный webhook-приёмник остановлен")
        logs.stop()


if __name__=='__main__':main()
