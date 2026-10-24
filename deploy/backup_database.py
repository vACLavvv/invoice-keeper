"""Private online backups of Invoice Keeper only; bounded retention, no Docker pruning."""
from datetime import datetime, timezone
import fcntl
import hashlib
import os
from pathlib import Path
import re
import shutil
import sqlite3
import tempfile

ROOT = Path('/opt/invoice-keeper')
PATTERN = re.compile(r'invoice-keeper-[0-9]{8}T[0-9]{12}Z\.sqlite3')


def backup(root=ROOT, *, keep=7, budget=512*1024*1024, minimum_free=1024**3):
    root=Path(root)
    source=root/'data/invoice-keeper.sqlite3'
    target=root/'backups'
    if not source.is_file() or source.is_symlink() or target.is_symlink():
        raise RuntimeError('Expected the dedicated Invoice Keeper database and backup directory')
    target.mkdir(mode=0o700,exist_ok=True)
    target.chmod(0o700)
    fd=os.open(target/'.backup.lock',os.O_CREAT|os.O_WRONLY|getattr(os,'O_NOFOLLOW',0),0o600)
    with os.fdopen(fd,'w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        needed=sum(p.stat().st_size for p in (source,Path(str(source)+'-wal')) if p.is_file())
        if shutil.disk_usage(target).free < minimum_free+needed*2:
            raise RuntimeError('Not enough disk headroom for a safe backup; no files changed')
        name='invoice-keeper-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')+'.sqlite3'
        handle,temporary=tempfile.mkstemp(prefix='.backup-',suffix='.partial',dir=target)
        os.fchmod(handle,0o600);os.close(handle)
        temporary=Path(temporary)
        try:
            with sqlite3.connect(source.resolve().as_uri()+'?mode=ro',uri=True) as src,sqlite3.connect(temporary) as dst:
                src.backup(dst)
                if dst.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise RuntimeError('Backup integrity check failed')
            with temporary.open('rb') as stream:os.fsync(stream.fileno())
            destination=target/name
            if destination.exists():raise RuntimeError('Backup name already exists')
            os.replace(temporary,destination)
            files=sorted(p for p in target.iterdir() if PATTERN.fullmatch(p.name) and p.is_file() and not p.is_symlink())
            while len(files)>1 and (len(files)>keep or sum(p.stat().st_size for p in files)>budget):
                files.pop(0).unlink()
            return {'file':destination.name,'sha256':hashlib.sha256(destination.read_bytes()).hexdigest(),'retained':len(files),'bytes':sum(p.stat().st_size for p in files)}
        finally:temporary.unlink(missing_ok=True)


if __name__=='__main__':
    import json
    print(json.dumps(backup()))
