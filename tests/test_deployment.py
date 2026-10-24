from pathlib import Path
import importlib.util
import sqlite3


def load_backup():
    path=Path(__file__).resolve().parents[1]/'deploy/backup_database.py'
    spec=importlib.util.spec_from_file_location('keeper_backup',path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module


def test_online_backup_preserves_live_data_limits_only_owned_backup_files(tmp_path):
    module=load_backup();(tmp_path/'data').mkdir();(tmp_path/'backups').mkdir()
    source=tmp_path/'data/invoice-keeper.sqlite3'
    with sqlite3.connect(source) as db:
        db.execute('PRAGMA journal_mode=WAL');db.execute('CREATE TABLE paid(id INTEGER PRIMARY KEY,date TEXT)');db.execute("INSERT INTO paid VALUES(1,'2026-10-24')");db.commit()
        sentinel=tmp_path/'backups/diploma.sqlite3';sentinel.write_bytes(b'keep')
        for _ in range(4):value=module.backup(tmp_path,keep=2,minimum_free=0)
        assert value['retained']==2 and sentinel.read_bytes()==b'keep'
        with sqlite3.connect(tmp_path/'backups'/value['file']) as copy:
            assert copy.execute('SELECT * FROM paid').fetchall()==[(1,'2026-10-24')]
        assert db.execute('SELECT COUNT(*) FROM paid').fetchone()[0]==1
    assert all(p.stat().st_mode&0o777==0o600 for p in (tmp_path/'backups').glob('invoice-keeper-*.sqlite3'))


def test_online_backup_refuses_wrong_database_and_does_not_follow_symlinks(tmp_path):
    import pytest
    module=load_backup();(tmp_path/'data').mkdir();(tmp_path/'backups').mkdir()
    external=tmp_path/'other.sqlite3';external.write_bytes(b'private')
    (tmp_path/'data/invoice-keeper.sqlite3').symlink_to(external)
    with pytest.raises(RuntimeError):module.backup(tmp_path,minimum_free=0)
    assert external.read_bytes()==b'private'
    assert not list((tmp_path/'backups').glob('*.sqlite3'))
