"""Read-only comparison against the VPS inventory taken before this deployment."""
from pathlib import Path
import hashlib
import json
import shutil
import sqlite3
import subprocess
import urllib.request

ROOT=Path('/opt/invoice-keeper')


def normalized(value):
    if isinstance(value,dict):return {key:normalized(item) for key,item in sorted(value.items())}
    if isinstance(value,list):return sorted((normalized(item) for item in value),key=lambda item:json.dumps(item,sort_keys=True))
    return value


def main():
    baseline=json.loads((ROOT/'baseline.json').read_text())
    ids=[value['Id'] for value in baseline['containers']]
    actual={value['Id']:value for value in json.loads(subprocess.check_output(['docker','inspect',*ids],text=True))}
    for before in baseline['containers']:
        after=actual[before['Id']]
        assert after['Image']==before['Image'] and after['State']['StartedAt']==before['started_at'] and after['State']['Status']==before['status'] and after['RestartCount']==before['RestartCount'],before['Name']
        assert normalized(after['Mounts'])==normalized(before['Mounts']),before['Name']
        assert normalized(after['HostConfig']['PortBindings'])==normalized(before['ports']),before['Name']
    for name,digest in baseline['config_sha256'].items():
        if name!='/etc/nginx/nginx.conf':assert hashlib.sha256(Path(name).read_bytes()).hexdigest()==digest,name
    original=(ROOT/'config/nginx-main.before.conf').read_text();position=original.rfind('}')
    expected=original[:position]+'    include /etc/nginx/conf.d/invoice-keeper.conf;\n'+original[position:]
    assert Path('/etc/nginx/nginx.conf').read_text()==expected
    for name,pid in baseline['service_pids'].items():
        assert subprocess.check_output(['systemctl','show',name,'--property=MainPID','--value'],text=True).strip()==pid,name
    for url in ('http://127.0.0.1:18000/readyz','http://127.0.0.1:18001/docs','https://aezakeeper.ru/healthz'):
        with urllib.request.urlopen(url,timeout=5) as response:assert response.status==200
    backups=sorted((ROOT/'backups').glob('invoice-keeper-*.sqlite3'));assert backups
    with sqlite3.connect(backups[-1]) as db:assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
    value={'unchanged_existing_containers':len(ids),'unchanged_shared_service_pids':baseline['service_pids'],'free_bytes':shutil.disk_usage('/').free,'backup_integrity':'ok','backup':backups[-1].name,'nginx_change':'one appended project-specific include; previous default server preserved'}
    (ROOT/'verification.json').write_text(json.dumps(value,indent=2)+'\n');(ROOT/'verification.json').chmod(0o600)
    print(json.dumps(value),flush=True)


if __name__=='__main__':main()
