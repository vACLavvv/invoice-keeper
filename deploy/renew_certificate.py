"""Renew this project's certificate only; reload Nginx only after a certificate change."""
import fcntl
import hashlib
import os
from pathlib import Path
import re
import subprocess

ROOT=Path('/opt/invoice-keeper')
DOMAIN='aezakeeper.ru'


def main():
    image=(ROOT/'config/certbot-image.txt').read_text().strip()
    if not re.fullmatch(r'certbot/certbot@sha256:[0-9a-f]{64}',image):raise RuntimeError('Expected a pinned official Certbot image')
    fd=os.open(ROOT/'config/.certbot.lock',os.O_WRONLY|os.O_CREAT,0o600)
    with os.fdopen(fd,'w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        cert=ROOT/f'letsencrypt/live/{DOMAIN}/fullchain.pem'
        before=hashlib.sha256(cert.read_bytes()).hexdigest()
        command=['docker','run','--rm','--pull=never','--name','invoice-keeper-certbot-renew','--cpus','0.20','--memory','256m','--memory-swap','256m','--pids-limit','64','--cap-drop','ALL','--security-opt','no-new-privileges:true','--read-only','--tmpfs','/tmp:size=32m,mode=1777',
                 '-v',str(ROOT/'letsencrypt')+':/etc/letsencrypt','-v',str(ROOT/'acme-logs')+':/var/log/letsencrypt','-v','/var/www/invoice-keeper-acme:/var/www/acme',image,'renew','--work-dir','/tmp/certbot-work','--cert-name',DOMAIN,'--webroot','--webroot-path','/var/www/acme','--quiet','--no-random-sleep-on-renew','--max-log-backups','3']
        subprocess.run(command,check=True,timeout=300)
        after=hashlib.sha256(cert.read_bytes()).hexdigest()
        if before!=after:
            subprocess.run(['nginx','-t'],check=True)
            subprocess.run(['systemctl','reload','nginx'],check=True)
            print('Invoice Keeper certificate renewed; Nginx gracefully reloaded')
        else:print('Invoice Keeper certificate is current; no Nginx reload needed')


if __name__=='__main__':main()
