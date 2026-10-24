"""Run on the VPS against an isolated fake database, never the production env/data."""
from pathlib import Path
import datetime
import http.client
import http.cookies
import json
import os
import secrets
import socket
import subprocess
import sys
import time


def main(release,image):
    if '/' in release or not image.startswith('invoice-keeper:'):raise RuntimeError('Expected an Invoice Keeper release')
    root=Path('/opt/invoice-keeper');stage=root/'staging'/release
    stage.mkdir(mode=0o700,exist_ok=True)
    data=stage/'data';data.mkdir(mode=0o700,exist_ok=True);os.chown(data,10001,10001)
    password=secrets.token_urlsafe(24)
    values={'ADMIN_USERNAME':'deployment_check','ADMIN_PASSWORD':password,'DATABASE_PATH':'/data/invoice-keeper.sqlite3','APP_TIMEZONE':'Europe/Moscow','COOKIE_SECURE':'true','PUBLIC_BASE_URL':'https://aezakeeper.ru','TELEGRAM_ENABLED':'false','SMTP_ENABLED':'false','WEBHOOK_ENABLED':'false','WEBHOOK_SECRET':secrets.token_urlsafe(32),'IN_APP_ENABLED':'false'}
    env=stage/'runtime.env';env.write_text('\n'.join(k+'='+v for k,v in values.items())+'\n');env.chmod(0o600)
    with socket.socket() as probe:probe.bind(('127.0.0.1',18082))
    name='invoice-keeper-staging'
    cmd=['docker','run','--detach','--pull=never','--name',name,'--cpus','0.35','--memory','384m','--memory-swap','384m','--pids-limit','64','--oom-score-adj','500','--cap-drop','ALL','--security-opt','no-new-privileges:true','--read-only','--tmpfs','/tmp:size=16m,mode=1777','--env-file',str(env),'-v',str(data)+':/data','-p','127.0.0.1:18082:8000',image,'python','-m','backend.app.run','--host','0.0.0.0','--port','8000','--demo-webhook']
    subprocess.run(cmd,check=True,stdout=subprocess.DEVNULL)
    headers={'Host':'aezakeeper.ru','Origin':'https://aezakeeper.ru','Content-Type':'application/json'}
    def request(method,path,body=None):
        connection=http.client.HTTPConnection('127.0.0.1',18082,timeout=10)
        connection.request(method,path,json.dumps(body) if body is not None else None,headers)
        response=connection.getresponse();result=(response.status,response.read(),dict(response.getheaders()));connection.close();return result
    passed=False
    try:
        for _ in range(80):
            try:
                if request('GET','/healthz')[0]==200:break
            except (OSError,http.client.HTTPException):pass
            time.sleep(.5)
        else:raise RuntimeError('Staging did not become ready')
        assert request('GET','/api/v1/payment-occurrences')[0]==401
        status,body,returned=request('POST','/api/v1/auth/login',{'username':'deployment_check','password':password})
        assert status==200,(status,body[:200])
        cookie=returned.get('set-cookie',returned.get('Set-Cookie'))
        assert all(flag in cookie.lower() for flag in ('secure','httponly','samesite=strict'))
        parsed=http.cookies.SimpleCookie();parsed.load(cookie)
        headers['Cookie']='invoice_session='+parsed['invoice_session'].value
        headers['X-CSRF-Token']=json.loads(body)['csrf_token']
        assert request('GET','/api/v1/auth/me')[0]==200
        due=(datetime.date.today()+datetime.timedelta(days=5)).isoformat()
        status,body,_=request('POST','/api/v1/one-time-payments',{'title':'Staging acceptance','amount':'1.00','currency':'RUB','due_date':due,'notes':'Temporary isolated database'})
        assert status==201,(status,body[:100])
        item=json.loads(body);assert item['frequency']=='once'
        assert request('PATCH','/api/v1/payment-occurrences/'+str(item['id']),{'paid':True})[0]==200
        assert request('DELETE','/api/v1/one-time-payments/'+str(item['id']))[0]==204
        diagnostics=json.loads(request('GET','/api/v1/system-logs')[1])
        assert any(r['source']=='invoice_keeper.webhook' for r in diagnostics['items'])
        assert any(r['source']=='uvicorn.error' for r in diagnostics['items'])
        subprocess.run(['docker','exec',name,'python','-m','pip','check'],check=True)
        subprocess.run(['docker','exec',name,'python','-c','import os; assert os.getuid()==10001; assert open("/sys/fs/cgroup/memory.max").read().strip()=="402653184"; print("Non-root UID and memory limit verified")'],check=True)
        assert subprocess.run(['docker','exec',name,'touch','/app/write-probe'],capture_output=True).returncode!=0
        print(subprocess.check_output(['docker','stats','--no-stream','--format','{{.Name}} | {{.MemUsage}} | {{.CPUPerc}}',name],text=True).strip(),flush=True)
        result={'image':image,'status':'passed','checks':['secure_cookie','public_origin','auth','once_create_pay_archive','server_and_webhook_logs','read_only_root','non_root','resource_limits','dependencies']}
        (stage/'acceptance.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result),flush=True)
        passed=True
    finally:
        subprocess.run(['docker','stop','--time','45',name],check=False,stdout=subprocess.DEVNULL)
        if passed:subprocess.run(['docker','rm',name],check=True,stdout=subprocess.DEVNULL)
        else:
            log=subprocess.check_output(['docker','logs','--tail','50',name],stderr=subprocess.STDOUT,text=True)
            (stage/'failure.log').write_text(log);print(log)


if __name__=='__main__':main(*sys.argv[1:])
