"""Real child processes, isolated copies and loopback only. No working .env is read."""
import hashlib
import hmac
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time

import httpx


ROOT=Path(__file__).resolve().parent.parent


def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0))
        return sock.getsockname()[1]


def wait_health(port,process):
    with httpx.Client(timeout=0.5,trust_env=False) as client:
        for _ in range(80):
            if process.poll() is not None:raise AssertionError('Test child exited before readiness')
            try:
                response=client.get(f'http://127.0.0.1:{port}/healthz')
                if response.status_code==200:return response.json()
            except httpx.RequestError:pass
            time.sleep(0.1)
    raise AssertionError('Test child did not become ready')


def isolated_project(tmp_path):
    for directory in ('backend','frontend'):
        shutil.copytree(ROOT/directory,tmp_path/directory,ignore=shutil.ignore_patterns('__pycache__'))
    (tmp_path/'.env').write_text('ADMIN_USERNAME=admin\nADMIN_PASSWORD=Isolated-test-password123!\nTELEGRAM_ENABLED=false\nSMTP_ENABLED=false\nWEBHOOK_ENABLED=false\nWEBHOOK_SECRET=isolated-webhook-secret-for-tests\n')
    environment={k:v for k,v in os.environ.items() if not k.startswith(('ADMIN_','SMTP_','TELEGRAM_','WEBHOOK_','DEMO_','APP_','PUBLIC_','DATABASE_','SESSION_','COOKIE_','IN_APP_','REMINDER_')) and k!='PYTHONPATH'}
    return environment


def stop(process):
    process.terminate()
    try:process.wait(timeout=12)
    except subprocess.TimeoutExpired:process.kill();process.wait(timeout=5)


def test_actual_demo_receiver_signature_timestamp_and_dedup(tmp_path):
    environment=isolated_project(tmp_path)
    environment['DATABASE_PATH']=str(tmp_path/'private-data/test.sqlite3')
    port=free_port()
    process=subprocess.Popen([sys.executable,'-m','backend.app.webhook_demo','--port',str(port)],cwd=tmp_path,env=environment,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        assert wait_health(port,process)['service']=='invoice-keeper-webhook-demo'
        event_id='01'*16
        body=json.dumps({'event':'payment.due','event_id':event_id,'payment':{'occurrence_id':1}}).encode()
        timestamp=str(int(time.time()))
        signature=hmac.new(b'isolated-webhook-secret-for-tests',timestamp.encode()+b'.'+body,hashlib.sha256).hexdigest()
        headers={'Content-Type':'application/json','Idempotency-Key':event_id,'X-Invoice-Timestamp':timestamp,'X-Invoice-Signature':'sha256='+signature}
        with httpx.Client(base_url=f'http://127.0.0.1:{port}',timeout=3,trust_env=False) as client:
            assert client.post('/events',content=body,headers=headers).status_code==204
            assert client.post('/events',content=body,headers=headers).status_code==204
            assert client.post('/events',content=body,headers=headers|{'X-Invoice-Timestamp':'9'*5000}).status_code==401
            assert client.post('/events',content=body,headers=headers|{'X-Invoice-Signature':'sha256=bad'}).status_code==401
            assert client.get('/events').status_code==404
        records=(tmp_path/'private-data/webhook-demo.jsonl').read_text().splitlines()
        assert not (tmp_path/'data/webhook-demo.jsonl').exists()
        assert len(records)==1 and json.loads(records[0])['event_id']==event_id
    finally:stop(process)


def test_one_command_launcher_stops_its_receiver_with_parent(tmp_path):
    environment=isolated_project(tmp_path)
    app_port,receiver_port=free_port(),free_port()
    while receiver_port==app_port:receiver_port=free_port()
    process=subprocess.Popen([sys.executable,'-m','backend.app.run','--demo-webhook','--port',str(app_port),'--webhook-port',str(receiver_port)],cwd=tmp_path,env=environment,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        assert wait_health(app_port,process)['status']=='ok'
        assert wait_health(receiver_port,process)['service']=='invoice-keeper-webhook-demo'
        with httpx.Client(base_url=f'http://127.0.0.1:{app_port}',timeout=5,trust_env=False) as client:
            auth=client.post('/api/v1/auth/login',json={'username':'admin','password':'Isolated-test-password123!'})
            assert auth.status_code==200
            assert client.get('/api/v1/settings').json()['webhook_enabled'] is True
            diagnostics=client.get('/api/v1/system-logs').json()['items']
            assert any(r['source']=='invoice_keeper.webhook' and 'запущен' in r['message'] for r in diagnostics)
            assert any(r['source']=='uvicorn.error' for r in diagnostics)
    finally:stop(process)
    main_logs=[json.loads(line) for line in (tmp_path/'data/logs/application.jsonl').read_text().splitlines()]
    assert any('Сервис Invoice Keeper остановлен' in r['message'] for r in main_logs)
    receiver_logs=[json.loads(line) for line in (tmp_path/'data/logs/webhook.jsonl').read_text().splitlines()]
    assert any('webhook-приёмник остановлен' in r['message'] for r in receiver_logs)
    with socket.socket() as probe:
        probe.settimeout(1)
        assert probe.connect_ex(('127.0.0.1',receiver_port))!=0,'Receiver was orphaned by the launcher'
