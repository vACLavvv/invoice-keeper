from dataclasses import replace
from datetime import date
from email import policy
from email.parser import BytesParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import hashlib
import hmac
import json
import socket
import sqlite3
import threading

from aiosmtpd.controller import Controller
from fastapi.testclient import TestClient
import pytest

from backend.app.config import Settings
from backend.app.db import Database, SCHEMA
from backend.app.domain import timestamp
from backend.app.main import create_app
from backend.app.notifications import EmailSender, NotificationWorker, WebhookSender, public_destination
from backend.app.telegram import TelegramBotWorker
from conftest import create_payment,sign_in


def test_forecast_year_and_calendar_exact_without_materialization(setup):
    app,client,_,clock=setup
    sign_in(client)
    create_payment(client,amount="0.10")
    create_payment(client,amount="0.20")
    create_payment(client,amount="12.49",currency="EUR")
    with app.state.db.connect() as conn:before=conn.execute("SELECT COUNT(*) FROM payment_occurrences").fetchone()[0]
    budget=client.get("/api/v1/payments/budget?year=2027").json()
    assert budget["currencies"]["RUB"]["planned"]=="3.60"
    assert budget["currencies"]["EUR"]["planned"]=="149.88"
    assert len(budget["months"])==12 and budget["projection_count"]==36
    feb=client.get("/api/v1/calendar?from_date=2027-02-01&to_date=2027-02-28").json()
    assert len(feb["days"])==28
    day=feb["days"][-1]
    assert day["date"]=="2027-02-28" and len(day["items"])==3
    assert day["currencies"]["RUB"]["planned"]=="0.30"
    with app.state.db.connect() as conn:assert conn.execute("SELECT COUNT(*) FROM payment_occurrences").fetchone()[0]==before
    assert client.get("/api/v1/payments/budget?year=2027&month=13").status_code==422
    assert client.get("/api/v1/calendar?from_date=2027-01-01&to_date=2028-01-01").status_code==422


def test_forecast_starts_at_first_due_and_preserves_paid_snapshots(setup):
    _,client,_,clock=setup
    sign_in(client)
    first=create_payment(client,first_due_date="2026-11-30",amount="100.25")
    result=client.get("/api/v1/payments/budget?year=2026").json()
    assert result["currencies"]["RUB"]["planned"]=="200.50"
    assert result["months"][9]["currencies"]["RUB"]["planned"]=="0.00"
    assert client.delete(f"/api/v1/recurring-payments/{first['id']}").status_code==204
    assert client.get("/api/v1/payments/budget?year=2026").json()["currencies"]["RUB"]["planned"]=="0.00"
    archived=client.get("/api/v1/payments/budget?year=2026&include_archived=true").json()
    assert archived["currencies"]["RUB"]["planned"]=="100.25" # Only the stored first period remains in archive.


def test_projected_occurrence_can_be_paid_by_regular_user(setup):
    app,admin,_,_=setup
    sign_in(admin)
    payment=create_payment(admin)
    admin.post("/api/v1/users",json={"username":"alex","display_name":"Alex","password":"User-password123!"})
    user=TestClient(app)
    sign_in(user,"alex","User-password123!")
    path=f"/api/v1/recurring-payments/{payment['id']}/occurrences"
    bad=user.post(path,json={"due_date":"2027-02-27"})
    assert bad.status_code==422
    item=user.post(path,json={"due_date":"2027-02-28"}).json()
    assert user.post(path,json={"due_date":"2027-02-28"}).json()["id"]==item["id"]
    result=user.patch(f"/api/v1/payment-occurrences/{item['id']}",json={"paid":True})
    assert result.status_code==200 and result.json()["paid_at"]=="2026-01-28"
    assert user.get("/api/v1/payments/budget?year=2027&month=2").json()["currencies"]["RUB"]["paid"]=="100.10"
    assert user.post("/api/v1/recurring-payments",json={"title":"x","amount":"1","currency":"RUB","first_due_date":"2026-01-31"}).status_code==403


def test_receipts_and_links_bound_to_period_and_private(setup):
    app,client,settings,clock=setup
    sign_in(client);create_payment(client)
    items=client.get("/api/v1/payment-occurrences").json()
    first,second=items[:2]
    path=f"/api/v1/payment-occurrences/{first['id']}"
    blob=b"%PDF-1.4\nInvoice Keeper receipt fixture\n%%EOF"
    upload=client.post(path+"/attachments",files={"file":("../../чек.pdf",blob,"application/octet-stream")})
    assert upload.status_code==201,upload.text
    file=upload.json()
    assert file["name"]=="чек.pdf" and file["content_type"]=="application/pdf"
    saved=client.post(path+"/attachment-links",json={"title":"Квитанция","url":"https://example.com/receipt/42"})
    assert saved.status_code==201
    assert len(client.get(path+"/attachments").json())==2
    assert client.get(f"/api/v1/payment-occurrences/{second['id']}/attachments").json()==[]
    assert client.get(path).json()["attachment_count"]==2
    download=client.get(file["download_url"])
    assert download.content==blob and download.headers["content-disposition"].startswith("attachment;")
    assert TestClient(app).get(file["download_url"]).status_code==401
    # BLOBs are in SQLite, so a plain DB restart retains them.
    fresh=create_app(settings,start_worker=False,today_provider=lambda:clock[0])
    with TestClient(fresh) as restarted:
        sign_in(restarted)
        assert restarted.get(file["download_url"]).content==blob
    assert client.delete(f"/api/v1/attachments/{file['id']}").status_code==204
    assert client.get(file["download_url"]).status_code==404


@pytest.mark.parametrize("url",["javascript:alert(1)","file:///etc/passwd","https://user:password@example.com/x","https://example.com/\r\nX-Test:yes"])
def test_unsafe_receipt_links_rejected(setup,url):
    _,client,_,_=setup
    sign_in(client);create_payment(client)
    item=client.get("/api/v1/payment-occurrences").json()[0]
    assert client.post(f"/api/v1/payment-occurrences/{item['id']}/attachment-links",json={"title":"x","url":url}).status_code==422


def test_receipt_size_type_and_csrf_limits(setup):
    _,client,_,_=setup
    sign_in(client);create_payment(client)
    item=client.get("/api/v1/payment-occurrences").json()[0]
    path=f"/api/v1/payment-occurrences/{item['id']}/attachments"
    assert client.post(path,files={"file":("script.svg",b"<svg onload='alert(1)'/>","image/png")}).status_code==415
    assert client.post(path,files={"file":("big.pdf",b"%PDF-"+b"x"*(5*1024*1024),"application/pdf")}).status_code==413
    assert client.post(path,content=b"x",headers={"Content-Length":str(7*1024*1024)}).status_code==413
    client.headers.pop("X-CSRF-Token")
    assert client.post(path,files={"file":("ok.pdf",b"%PDF-x","application/pdf")}).status_code==403


def test_inapp_is_independent_of_telegram_and_read_marks_are_personal(setup):
    app,admin,settings,_=setup
    sign_in(admin);create_payment(admin)
    first=admin.get("/api/v1/notifications").json()
    assert first["unread_count"]==1 and len(first["items"])==1
    app.state.worker.tick();app.state.worker.tick()
    assert len(admin.get("/api/v1/notifications").json()["items"])==1
    admin.post("/api/v1/users",json={"username":"alex","display_name":"Alex","password":"User-password123!"})
    user=TestClient(app);sign_in(user,"alex","User-password123!")
    assert admin.post("/api/v1/notifications/read-all").status_code==200
    assert admin.get("/api/v1/notifications").json()["unread_count"]==0
    assert user.get("/api/v1/notifications").json()["unread_count"]==1
    notification_id=first["items"][0]["id"]
    assert user.patch(f"/api/v1/notifications/{notification_id}",json={"read":True}).status_code==200
    assert user.get("/api/v1/notifications").json()["unread_count"]==0
    assert user.get("/api/v1/integrations").status_code==403


def smtp_fixture():
    class Handler:
        def __init__(self):self.messages=[]
        async def handle_DATA(self,server,session,envelope):
            self.messages.append(envelope.original_content)
            return "250 OK"
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    handler=Handler();controller=Controller(handler,hostname='127.0.0.1',port=port)
    controller.start()
    return handler,controller,port


def test_real_local_smtp_delivery_deduplicates_and_builds_mime(setup):
    app,client,settings,clock=setup
    sign_in(client);create_payment(client,title="Аренда <офис>")
    handler,controller,port=smtp_fixture()
    try:
        configured=replace(settings,smtp_enabled=True,smtp_host='127.0.0.1',smtp_port=port,smtp_security='none',smtp_from='sender@example.com',smtp_to='recipient@example.com')
        worker=NotificationWorker(app.state.db,configured,today=lambda:clock[0])
        worker.tick();worker.tick()
        assert len(handler.messages)==1
        message=BytesParser(policy=policy.default).parsebytes(handler.messages[0])
        assert message['To']=='recipient@example.com'
        assert 'Аренда <офис>' in str(message['Subject'])
        assert '100.10 RUB' in message.get_body(preferencelist=('plain',)).get_content()
        assert 'Аренда &lt;офис&gt;' in message.get_body(preferencelist=('html',)).get_content()
        with app.state.db.connect() as conn:
            row=conn.execute("SELECT * FROM notification_deliveries WHERE channel='email'").fetchone()
            assert row['state']=='sent' and row['attempts']==1 and row['message_id']==str(message['Message-ID'])
    finally:controller.stop()


def test_signed_webhook_real_local_http_and_no_repeat(setup):
    app,client,settings,clock=setup
    sign_in(client);create_payment(client)
    received=[]
    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            received.append((dict(self.headers),self.rfile.read(int(self.headers['Content-Length'])),self.path))
            self.send_response(204);self.end_headers()
        def log_message(self,*args):pass
    server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    try:
        config=replace(settings,webhook_enabled=True,webhook_url=f'http://127.0.0.1:{server.server_port}/events?target=demo',webhook_allow_localhost=True,webhook_secret='a-secret-with-more-than-24-characters')
        worker=NotificationWorker(app.state.db,config,today=lambda:clock[0])
        worker.tick();worker.tick()
        assert len(received)==1
        headers,body,path=received[0]
        signature=hmac.new(config.webhook_secret.encode(),headers['X-Invoice-Timestamp'].encode()+b'.'+body,hashlib.sha256).hexdigest()
        assert headers['X-Invoice-Signature']=='sha256='+signature
        payload=json.loads(body)
        assert payload['event']=='payment.due' and payload['payment']['amount']=='100.10'
        assert headers['Idempotency-Key']==payload['event_id'] and path=='/events?target=demo'
        with app.state.db.connect() as conn:assert conn.execute("SELECT state FROM notification_deliveries WHERE channel='webhook'").fetchone()[0]=='sent'
    finally:server.shutdown();server.server_close();thread.join(timeout=2)


def test_webhook_ssrf_guard_and_mixed_dns(monkeypatch):
    with pytest.raises(ValueError):public_destination('http://example.com/events')
    with pytest.raises(ValueError):public_destination('https://localhost/events')
    with pytest.raises(ValueError):public_destination('http://169.254.169.254/latest',True)
    monkeypatch.setattr(socket,'getaddrinfo',lambda *a,**k:[(socket.AF_INET,socket.SOCK_STREAM,6,'',('8.8.8.8',443)),(socket.AF_INET,socket.SOCK_STREAM,6,'',('10.0.0.1',443))])
    with pytest.raises(ValueError):public_destination('https://public.example/events')


def test_failed_channel_does_not_repeat_or_block_other_channels(setup):
    app,client,settings,clock=setup
    sign_in(client);create_payment(client)
    configured=replace(settings,smtp_enabled=True,smtp_host='127.0.0.1',smtp_security='none',smtp_from='a@example.com',smtp_to='b@example.com',webhook_enabled=True,webhook_url='https://example.com/hooks',webhook_secret='a'*32)
    worker=NotificationWorker(app.state.db,configured,today=lambda:clock[0])
    calls=[]
    worker.senders['email']=lambda row:('uncertain','timeout',None,0)
    worker.senders['webhook']=lambda row:(calls.append(row['id']) or ('sent',None,'42',0))
    worker.tick();worker.tick()
    assert len(calls)==1
    with app.state.db.connect() as conn:
        states={r['channel']:r['state'] for r in conn.execute('SELECT channel,state FROM notification_deliveries')}
    assert states=={'email':'uncertain','webhook':'sent','in_app':'sent'}


def test_two_channel_workers_claim_email_once(setup):
    app,client,settings,clock=setup
    sign_in(client);create_payment(client)
    configured=replace(settings,smtp_enabled=True,smtp_host='127.0.0.1',smtp_security='none',smtp_from='a@example.com',smtp_to='b@example.com')
    calls=[]
    workers=[NotificationWorker(app.state.db,configured,today=lambda:clock[0]) for _ in range(2)]
    for worker in workers:worker.senders['email']=lambda row:(calls.append(row['id']) or ('sent',None,'42',0))
    with ThreadPoolExecutor(max_workers=2) as pool:list(pool.map(lambda worker:worker.tick(),workers))
    assert len(calls)==1


@pytest.mark.parametrize('channel',['email','telegram'])
def test_slow_delivery_does_not_lock_web_panel(setup,channel):
    from backend.app.reminders import ReminderWorker
    app,client,settings,clock=setup
    sign_in(client);create_payment(client)
    started,released=threading.Event(),threading.Event()
    def sender(row):
        started.set()
        assert released.wait(5)
        return 'sent',None,'42',0
    if channel=='email':
        configured=replace(settings,smtp_enabled=True,smtp_host='127.0.0.1',smtp_security='none',smtp_from='a@example.com',smtp_to='b@example.com')
        worker=NotificationWorker(app.state.db,configured,today=lambda:clock[0])
        worker.senders['email']=sender
    else:
        configured=replace(settings,telegram_enabled=True,telegram_bot_token='fake',telegram_chat_id='123')
        worker=ReminderWorker(app.state.db,configured,today=lambda:clock[0],sender=sender)
    with ThreadPoolExecutor(max_workers=2) as pool:
        task=pool.submit(worker.tick)
        try:
            assert started.wait(2)
            response=pool.submit(lambda:client.get('/api/v1/payment-occurrences')).result(timeout=2)
            assert response.status_code==200
        finally:released.set()
        task.result(timeout=5)


@pytest.mark.parametrize('path',['/api/v1/calendar?from_date=2026-01-01&to_date=2026-01-31','/api/v1/payments/budget?year=2026','/api/v1/notifications','/api/v1/deliveries','/api/v1/integrations','/api/v1/payment-occurrences/1/attachments','/api/v1/attachments/1/download'])
def test_extras_require_auth(setup,path):
    assert setup[1].get(path).status_code==401


def test_smtp_auth_failure_is_redacted_and_never_marked_sent(setup,monkeypatch):
    import smtplib
    settings=replace(setup[2],smtp_enabled=True,smtp_host='smtp.example.com',smtp_username='sender',smtp_password='PRIVATE-APPLICATION-PASSWORD',smtp_from='a@example.com',smtp_to='b@example.com')
    class Client:
        def __init__(self,*args,**kwargs):pass
        def login(self,*args):raise smtplib.SMTPAuthenticationError(535,b'PRIVATE-APPLICATION-PASSWORD')
        def close(self):pass
    monkeypatch.setattr(smtplib,'SMTP_SSL',Client)
    result=EmailSender(settings)({'id':0,'delivery_key':'key','title':'test','amount_cents':100,'currency':'RUB','due_date':'2026-01-31'})
    assert result[0]=='uncertain' and 'PRIVATE-APPLICATION-PASSWORD' not in str(result)


def prepare_callback(setup):
    app,client,settings,clock=setup
    sign_in(client);create_payment(client)
    item=client.get('/api/v1/payment-occurrences').json()[0]
    with app.state.db.connect(write=True) as conn:
        conn.execute("INSERT INTO reminders(occurrence_id,state,message_id,callback_token,sent_at) VALUES(?,'sent','42','opaque-token',?)",(item['id'],timestamp()))
    configured=replace(settings,telegram_enabled=True,telegram_chat_id='123',telegram_bot_token='test')
    calls=[]
    def api(method,payload):
        calls.append((method,payload));return {'ok':True,'result':True}
    bot=TelegramBotWorker(app.state.db,configured,today=lambda:clock[0],api=api)
    update={'update_id':1,'callback_query':{'id':'query1','from':{'id':123},'message':{'message_id':42,'chat':{'id':123}},'data':'paid:opaque-token'}}
    return bot,update,item,calls


def test_telegram_button_pays_only_bound_period_and_is_idempotent(setup):
    app,client,_,clock=setup
    bot,update,item,calls=prepare_callback(setup)
    bot.handle_update(update)
    assert client.get(f"/api/v1/payment-occurrences/{item['id']}").json()['paid_at']=='2026-01-28'
    assert client.get('/api/v1/payment-occurrences').json()[1]['paid_at'] is None
    clock[0]=date(2026,1,29)
    bot.handle_update(update)
    new=json.loads(json.dumps(update));new['update_id']=2;new['callback_query']['id']='query2'
    bot.handle_update(new)
    assert client.get(f"/api/v1/payment-occurrences/{item['id']}").json()['paid_at']=='2026-01-28'
    assert any(method=='answerCallbackQuery' for method,_ in calls)
    with app.state.db.connect() as conn:
        assert conn.execute("SELECT COUNT(*) FROM audit_log WHERE actor='telegram:123' AND action='occurrence.paid'").fetchone()[0]==1
    assert 'opaque-token' not in client.get('/api/v1/reminders').text


@pytest.mark.parametrize('change',['actor','chat','message','token','archive'])
def test_telegram_callback_rejects_forged_or_archived_payment(setup,change):
    bot,update,item,_=prepare_callback(setup)
    app,client,_,_=setup
    if change=='actor':update['callback_query']['from']['id']=999
    if change=='chat':update['callback_query']['message']['chat']['id']=999
    if change=='message':update['callback_query']['message']['message_id']=999
    if change=='token':update['callback_query']['data']='paid:forged'
    if change=='archive':client.delete(f"/api/v1/recurring-payments/{item['recurring_payment_id']}")
    bot.handle_update(update)
    assert client.get(f"/api/v1/payment-occurrences/{item['id']}").json()['paid_at'] is None


def test_existing_telegram_messages_get_buttons_without_resending(setup):
    bot,update,item,calls=prepare_callback(setup)
    bot.sync_buttons();bot.sync_buttons()
    edits=[p for m,p in calls if m=='editMessageReplyMarkup']
    assert len(edits)==1 and edits[0]['reply_markup']['inline_keyboard'][0][0]['callback_data']=='paid:opaque-token'
    assert not any(m=='sendMessage' for m,p in calls)


def test_telegram_update_offset_is_persistent(setup):
    bot,update,item,calls=prepare_callback(setup)
    polls=[]
    def api(method,payload):
        if method=='getUpdates':
            polls.append(payload['offset']);return {'ok':True,'result':[update] if payload['offset']==0 else []}
        return {'ok':True,'result':True}
    bot.api=api
    assert bot.poll_once() and bot.poll_once()
    assert polls==[0,2]
    with setup[0].state.db.connect() as conn:assert conn.execute("SELECT value FROM app_meta WHERE key='telegram_offset'").fetchone()[0]=='2'


def test_migration_v1_preserves_users_periods_and_sent_states(tmp_path):
    path=tmp_path/'legacy.sqlite3'
    with sqlite3.connect(path) as conn:
        conn.executescript(SCHEMA)
        conn.execute('PRAGMA user_version=1')
        conn.execute("INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES(1,'alex','Alex','hash','2026-01-01')")
        conn.execute("INSERT INTO recurring_payments(id,title,amount_cents,currency,first_due_date,anchor_day,created_at) VALUES(1,'Rent',100,'RUB','2026-01-31',31,'2026-01-01')")
        conn.execute("INSERT INTO payment_occurrences(id,recurring_payment_id,due_date,amount_cents,currency,paid_at) VALUES(1,1,'2026-01-31',100,'RUB','2026-01-28')")
        conn.execute("INSERT INTO reminders(occurrence_id,state,message_id,attempts) VALUES(1,'sent','42',1)")
        conn.execute("INSERT INTO audit_log(actor,action,entity,created_at) VALUES('alex','login','session','2026-01-01')")
    db=Database(path);db.initialize();db.initialize()
    with db.connect() as conn:
        assert conn.execute('PRAGMA user_version').fetchone()[0]==4
        assert conn.execute('SELECT username FROM users').fetchone()[0]=='alex'
        assert conn.execute('SELECT paid_at FROM payment_occurrences').fetchone()[0]=='2026-01-28'
        row=conn.execute('SELECT * FROM reminders').fetchone()
        assert row['state']=='sent' and row['message_id']=='42' and row['attempts']==1
        assert conn.execute('PRAGMA integrity_check').fetchone()[0]=='ok'


def test_audit_failed_login_logout_access_denial_and_date_changes(setup):
    app,client,_,_=setup
    assert client.post('/api/v1/auth/login',json={'username':'admin','password':'bad'}).status_code==401
    sign_in(client);create_payment(client)
    item=client.get('/api/v1/payment-occurrences').json()[0]
    client.patch(f"/api/v1/payment-occurrences/{item['id']}",json={'paid':True})
    client.post('/api/v1/auth/logout')
    sign_in(client)
    rows=client.get('/api/v1/audit-log').json()
    assert {'login.failed','login','logout','occurrence.paid'}<={r['action'] for r in rows}
    changed=next(r for r in rows if r['action']=='occurrence.paid')
    assert changed['details']['paid_at']=='2026-01-28'
    assert all('password' not in r['details'] for r in rows)


def test_integration_settings_hide_secrets_and_reject_insecure_config(setup):
    app,client,settings,_=setup
    sign_in(client)
    assert 'smtp_password' not in client.get('/api/v1/integrations').text
    assert client.post('/api/v1/integrations/email/test').status_code==409
    with pytest.raises(ValueError):replace(settings,smtp_enabled=True,smtp_host='example.com',smtp_security='none',smtp_from='a@example.com',smtp_to='b@example.com')
    with pytest.raises(ValueError):replace(settings,webhook_enabled=True,webhook_url='http://example.com',webhook_secret='x'*32)
    with pytest.raises(ValueError):replace(settings,webhook_enabled=True,webhook_url='https://example.com',webhook_secret='short')
