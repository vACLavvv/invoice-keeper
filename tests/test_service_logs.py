"""Private operational logging: roles, redaction, failures, retention and restart."""
from datetime import date
import json
import logging
import os
from pathlib import Path
import time

from fastapi.testclient import TestClient
import pytest

from backend.app.main import create_app
from backend.app.service_logs import ServiceLogs
from conftest import sign_in


def test_service_logs_are_admin_only_and_filters_are_validated(setup):
    app,client,_,_=setup
    assert client.get('/api/v1/system-logs').status_code==401
    sign_in(client)
    client.post('/api/v1/users',json={'username':'logs_user','display_name':'User','password':'Ordinary-test-password123!'})
    sign_in(client,'logs_user','Ordinary-test-password123!')
    assert client.get('/api/v1/system-logs').status_code==403
    sign_in(client)
    for query in ('level=INVALID','page=0','page_size=101','from_date=9999-12-31','from_date=2026-02-01&to_date=2026-01-01','snapshot_id=../../.env','search='+'x'*201):
        assert client.get('/api/v1/system-logs?'+query).status_code==422


def test_http_logs_omit_queries_bodies_headers_and_viewing_itself(setup):
    app,client,settings,_=setup;sign_in(client)
    headers={'Authorization':'Bearer a-new-private-token','Cookie':'invoice_session='+client.cookies['invoice_session']}
    client.get('/api/v1/absent?password=never-save-query',headers=headers)
    client.post('/api/v1/auth/login',json={'username':'admin','password':'never-save-request-body'})
    sign_in(client)
    data=client.get('/api/v1/system-logs?source=invoice_keeper.http').json()
    assert any('GET /api/v1/absent → 404' in item['message'] for item in data['items'])
    assert all(item['request_id'] for item in data['items'])
    before=data['total']
    assert client.get('/api/v1/system-logs?source=invoice_keeper.http').json()['total']==before
    saved=''.join(p.read_text() for p in (settings.database_path.parent/'logs').glob('*.jsonl*'))
    for secret in ('never-save-query','never-save-request-body','a-new-private-token',settings.admin_password,client.cookies['invoice_session'],client.headers['X-CSRF-Token']):
        assert secret not in saved


def test_server_background_and_exception_logs_redact_before_disk_and_html_is_data(setup):
    app,client,settings,_=setup;sign_in(client)
    unknown='a-password-not-in-settings'
    try:
        raise RuntimeError('password='+unknown+' '+settings.admin_password)
    except RuntimeError:
        logging.getLogger('invoice_keeper.worker').exception('Worker failed')
    logging.getLogger('uvicorn.error').warning('Server warning <script>alert(1)</script>')
    logging.getLogger('invoice_keeper.'+settings.admin_password).warning('Source credential hidden')
    rows=client.get('/api/v1/system-logs').json()['items']
    error=next(r for r in rows if r['source']=='invoice_keeper.worker')
    assert 'Traceback' in error['message'] and '[REDACTED]' in error['message']
    assert unknown not in error['message'] and settings.admin_password not in error['message']
    assert len([r for r in rows if r['source']=='uvicorn.error' and 'Server warning' in r['message']])==1
    saved=''.join(p.read_text() for p in (settings.database_path.parent/'logs').glob('*.jsonl*'))
    assert unknown not in saved and settings.admin_password not in saved
    js=(Path(__file__).resolve().parents[1]/'frontend/assets/js/app.js').read_text()
    assert 'content=esc(item.message)' in js


def test_unhandled_request_errors_are_logged_without_breaking_error_path(setup):
    app,client,_,_=setup;sign_in(client)
    @app.get('/log-test-error')
    def error():raise RuntimeError('password=do-not-store-error-password')
    with pytest.raises(RuntimeError):client.get('/log-test-error')
    rows=client.get('/api/v1/system-logs?level=ERROR').json()['items']
    assert any('GET /log-test-error → 500' in r['message'] for r in rows)
    assert any('Необработанная ошибка' in r['message'] for r in rows)
    assert all('do-not-store-error-password' not in r['message'] for r in rows)


def test_filters_snapshots_timezone_and_restart(setup):
    app,client,settings,_=setup;sign_in(client)
    logger=logging.getLogger('invoice_keeper.sample')
    for i in range(7):logger.warning('Проверка %s',i)
    first=client.get('/api/v1/system-logs?source=invoice_keeper.sample&page_size=3').json()
    assert first['total']==7 and first['pages']==3
    logger.warning('Новый журнал')
    ids=[r['id'] for r in first['items']]
    for page in (2,3):
        result=client.get('/api/v1/system-logs',params={'source':'invoice_keeper.sample','page_size':3,'page':page,'snapshot_id':first['snapshot_id']}).json()
        ids.extend(r['id'] for r in result['items'])
    assert len(ids)==len(set(ids))==7
    assert client.get('/api/v1/system-logs?source=invoice_keeper.sample&level=ERROR').json()['total']==0
    result=client.get('/api/v1/system-logs?source=invoice_keeper.sample&search=ПРОВЕРКА%206').json()
    assert result['total']==1
    # Exact local-day filtering, including UTC-to-Moscow midnight boundary.
    handler=app.state.service_logs.handler
    for stamp,text in [('2026-01-27T20:59:59+00:00','outside'),('2026-01-27T21:00:00+00:00','inside')]:
        from datetime import datetime
        record=logging.LogRecord('invoice_keeper.clock',logging.WARNING,'test',1,text,(),None)
        record.created=datetime.fromisoformat(stamp).timestamp();handler.handle(record)
    result=client.get('/api/v1/system-logs?source=invoice_keeper.clock&from_date=2026-01-28&to_date=2026-01-28').json()
    assert [r['message'] for r in result['items']]==['inside']
    with TestClient(create_app(settings,start_worker=False)) as restarted:
        sign_in(restarted)
        assert restarted.get('/api/v1/system-logs?source=invoice_keeper.sample').json()['total']==8


def test_rotation_private_modes_and_corrupt_lines(tmp_path):
    store=ServiceLogs(tmp_path/'logs',('secret-known-to-logger',),max_bytes=700,backups=2)
    store.start()
    try:
        for i in range(45):logging.getLogger('invoice_keeper.rotation').info('%s %s',i,'x'*100)
        files=list((tmp_path/'logs').glob('application.jsonl*'))
        assert len(files)==3 and all(p.stat().st_size<=700 for p in files)
        assert all(p.stat().st_mode&0o777==0o600 for p in files)
        assert (tmp_path/'logs').stat().st_mode&0o777==0o700
        with (tmp_path/'logs/application.jsonl').open('a') as stream:stream.write('{malformed\n')
        data=store.read_page(timezone_name='Europe/Moscow')
        assert data['items'] and data['total']<45
    finally:store.stop()
    retained=store.read_page(timezone_name='Europe/Moscow')['total']
    assert retained>0


def test_log_failure_does_not_crash_requests_and_symlinks_are_not_read(setup,tmp_path,monkeypatch):
    app,client,_,_=setup;sign_in(client)
    handler=app.state.service_logs.handler
    def fail():raise OSError('Disk full')
    monkeypatch.setattr(handler,'_open',fail)
    if handler.stream:handler.stream.close();handler.stream=None
    assert client.get('/api/v1/auth/me').status_code==200
    assert client.get('/api/v1/system-logs').json()['unavailable'] is True
    external=tmp_path/'external';external.write_text('private-external-content')
    folder=tmp_path/'unsafe';folder.mkdir();(folder/'application.jsonl').symlink_to(external)
    reader=ServiceLogs(folder)
    assert reader.read_page(timezone_name='Europe/Moscow')['unavailable'] is True
    with pytest.raises(RuntimeError):reader.start()
    assert external.read_text()=='private-external-content'


def test_redaction_covers_unknown_keyed_values_and_console_arguments():
    import io
    from backend.app.logging_security import SecretFilter
    redactor=SecretFilter()
    text=redactor.redact('password="unknown pass phrase" Cookie: invoice_session=private-session')
    assert 'unknown pass phrase' not in text and 'private-session' not in text
    for raw,hidden in [('Authorization: Bearer private-token','private-token'),('https://example.com/path?api_key=private-query','private-query'),('{"smtp_password":"unknown-smtp-value"}','unknown-smtp-value')]:
        assert hidden not in redactor.redact(raw)
    record=logging.LogRecord('invoice_keeper.child',logging.WARNING,'test',1,'password=%s',('unknown-argument',),None)
    redactor.filter(record)
    assert 'unknown-argument' not in record.getMessage()
