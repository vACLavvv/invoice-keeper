"""Audit trail: access, calendar boundaries, stable pages and historical details."""
import json

from fastapi.testclient import TestClient
import pytest

from backend.app.domain import audit
from backend.app.main import create_app
from conftest import create_payment, sign_in


def test_audit_pages_are_admin_only_and_validate_filters(setup):
    app, client, _, _ = setup
    assert client.get('/api/v1/audit-log/page').status_code == 401
    sign_in(client)
    user = client.post('/api/v1/users', json={
        'username':'alex', 'display_name':'Алексей', 'password':'User-password123!'}).json()
    with TestClient(app) as ordinary:
        sign_in(ordinary, 'alex', 'User-password123!')
        assert ordinary.get('/api/v1/audit-log/page').status_code == 403
        assert ordinary.get('/api/v1/audit-log').status_code == 403
    for query in ('page=0', 'page_size=101', 'snapshot_id=-1',
                  'snapshot_id=9223372036854775808', 'from_date=2026-01-29&to_date=2026-01-28',
                  'to_date=9999-12-31', 'from_date=not-a-date'):
        assert client.get('/api/v1/audit-log/page?' + query).status_code == 422
    rows = client.get('/api/v1/audit-log/page?action=authorization.denied').json()['items']
    assert len(rows) == 2 and all(r['actor'] == user['username'] and r['result'] == 'denied' for r in rows)


def test_audit_pagination_reaches_old_events_without_new_event_duplicates(setup):
    app, client, _, _ = setup
    sign_in(client)
    with app.state.db.connect(write=True) as conn:
        for i in range(113):
            audit(conn, 'history', 'recurring.create', i, {'title':f'Платёж {i}'})
    first = client.get('/api/v1/audit-log/page?actor=history&page_size=25').json()
    assert first['total'] == 113 and first['pages'] == 5
    ids = [r['id'] for r in first['items']]
    with app.state.db.connect(write=True) as conn:
        audit(conn, 'history', 'recurring.create', 'new', {'title':'Новый платёж'})
    for page in range(2, 6):
        data = client.get('/api/v1/audit-log/page', params={
            'actor':'history', 'page_size':25, 'page':page, 'snapshot_id':first['snapshot_id']}).json()
        assert data['total'] == 113
        ids.extend(r['id'] for r in data['items'])
    assert len(ids) == len(set(ids)) == 113
    assert ids == sorted(ids, reverse=True)
    fresh = client.get('/api/v1/audit-log/page?actor=history').json()
    assert fresh['total'] == 114 and fresh['items'][0]['entity'] == 'new'
    assert len(client.get('/api/v1/audit-log').json()) == 100  # Existing API stays a list.


def test_audit_date_filters_use_application_timezone_and_include_whole_day(setup):
    app, client, _, _ = setup
    sign_in(client)
    times = ['2026-01-27T20:59:59+00:00', '2026-01-27T21:00:00+00:00',
             '2026-01-28T20:59:59.999999+00:00', '2026-01-28T21:00:00+00:00']
    with app.state.db.connect(write=True) as conn:
        conn.executemany("INSERT INTO audit_log(actor,action,entity,created_at) VALUES('clock','login',?,?)",
                         [(str(i), value) for i, value in enumerate(times)])
    data = client.get('/api/v1/audit-log/page', params={
        'actor':'clock', 'from_date':'2026-01-28', 'to_date':'2026-01-28'}).json()
    assert data['timezone'] == 'Europe/Moscow'
    assert [r['entity'] for r in data['items']] == ['2', '1']


def test_audit_search_combines_filters_handles_cyrillic_and_literal_sql_characters(setup):
    app, client, _, _ = setup
    sign_in(client)
    with app.state.db.connect(write=True) as conn:
        audit(conn,'alex','recurring.create',1,{'title':'Облачный СЕРВЕР 100%'})
        audit(conn,'other','recurring.create',2,{'title':'Облачный СЕРВЕР 100%'})
        audit(conn,'alex','recurring.archive',1,{'title':'Облачный СЕРВЕР 100%'})
        audit(conn,'alex','occurrence.paid',1,{'old_paid_at':None,'paid_at':'2026-01-28'})
        audit(conn,'alex','occurrence.paid',1,{'old_paid_at':'2026-01-28','paid_at':'2026-01-27'})
    args = {'actor':'alex','action':'recurring.create','search':'облачный сервер'}
    data = client.get('/api/v1/audit-log/page',params=args).json()
    assert data['total'] == 1
    assert data['items'][0]['details']['title'] == 'Облачный СЕРВЕР 100%'
    for query, expected in [('100%',3), ("' OR 1=1 --",0), ('ИСПРАВЛЕНА ДАТА',1)]:
        data = client.get('/api/v1/audit-log/page',params={'search':query}).json()
        assert data['total'] == expected
    assert any(a['value']=='recurring.archive' for a in data['actions'])


def test_audit_records_date_correction_undo_and_failed_signin_without_secrets(setup):
    app, client, settings, _ = setup
    bad_password = 'never-store-this-password'
    assert client.post('/api/v1/auth/login',json={'username':'admin','password':bad_password}).status_code == 401
    sign_in(client)
    create_payment(client, title='Сервер')
    item = client.get('/api/v1/payment-occurrences').json()[0]
    path = f"/api/v1/payment-occurrences/{item['id']}"
    for patch in ({'paid':True}, {'paid_at':'2026-01-27'}, {'paid':False}):
        assert client.patch(path,json=patch).status_code == 200
    response = client.get('/api/v1/audit-log/page')
    events = [r for r in response.json()['items'] if r['action'].startswith('occurrence.')]
    assert [r['action_label'] for r in events] == ['Отменена оплата','Исправлена дата оплаты','Отмечена оплата']
    assert events[0]['details']['old_paid_at'] == '2026-01-27' and events[0]['details']['paid_at'] is None
    assert events[1]['details']['old_paid_at'] == '2026-01-28'
    assert events[1]['details']['title'] == 'Сервер' and events[1]['details']['due_date'] == item['due_date']
    assert any(r['result']=='failure' for r in response.json()['items'])
    with app.state.db.connect() as conn:
        saved = json.dumps([dict(r) for r in conn.execute('SELECT * FROM audit_log')])
    assert all(secret not in response.text + saved for secret in (bad_password,settings.admin_password,client.headers['X-CSRF-Token'],client.cookies['invoice_session']))


def test_deleted_user_history_survives_restart_and_password_change_is_only_a_flag(setup):
    app, client, settings, _ = setup
    sign_in(client)
    created = client.post('/api/v1/users',json={
        'username':'alex','display_name':'Алексей','password':'User-password123!'}).json()
    with TestClient(app) as ordinary:
        sign_in(ordinary,'alex','User-password123!')
        assert ordinary.post('/api/v1/auth/logout').status_code == 204
    replacement = 'Replacement-password123!'
    assert client.patch(f"/api/v1/users/{created['id']}",json={
        'username':'alex_new','display_name':'Алексей Петров','password':replacement}).status_code == 200
    assert client.delete(f"/api/v1/users/{created['id']}").status_code == 204
    restarted = create_app(settings,start_worker=False)
    with TestClient(restarted) as again:
        sign_in(again)
        data = again.get('/api/v1/audit-log/page').json()
        updated = next(r for r in data['items'] if r['action']=='user.update')['details']
        assert updated['old_username']=='alex' and updated['username']=='alex_new'
        assert updated['old_display_name']=='Алексей' and updated['display_name']=='Алексей Петров'
        assert updated['password_changed'] is True and 'password' not in updated
        assert replacement not in json.dumps(data)
        assert 'alex' in data['actors']
        assert again.get('/api/v1/audit-log/page?actor=alex').json()['total'] == 2


def test_failed_audit_write_rolls_back_payment_operation(setup,monkeypatch):
    app, client, _, _ = setup
    sign_in(client)
    def fail(*args,**kwargs):
        raise RuntimeError('Audit unavailable')
    monkeypatch.setattr('backend.app.main.audit',fail)
    with pytest.raises(RuntimeError,match='Audit unavailable'):
        client.post('/api/v1/recurring-payments',json={
            'title':'Must roll back','amount':'1.00','currency':'RUB','first_due_date':'2026-01-31'})
    with app.state.db.connect() as conn:
        assert conn.execute('SELECT COUNT(*) FROM recurring_payments').fetchone()[0] == 0
        assert conn.execute("SELECT COUNT(*) FROM audit_log WHERE action='recurring.create'").fetchone()[0] == 0


def test_legacy_and_malformed_details_do_not_break_audit_history(setup):
    app, client, _, _ = setup
    sign_in(client)
    with app.state.db.connect(write=True) as conn:
        conn.executemany("INSERT INTO audit_log(actor,action,entity,created_at,details) VALUES('legacy','login','session','2026-01-01',?)",
                         [('not-json',), ('[]',), ('{}',)])
    rows = client.get('/api/v1/audit-log/page?actor=legacy&search=вход').json()['items']
    assert len(rows) == 3 and all(r['details']=={} for r in rows)
