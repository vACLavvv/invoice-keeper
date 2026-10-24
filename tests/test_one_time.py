from datetime import date
from conftest import sign_in,create_payment
from backend.app.domain import materialize
from backend.app.examples import add_examples


def create_once(client,**changes):
    response=client.post('/api/v1/one-time-payments',json={'title':'Доработка сайта','amount':'1200.99','currency':'RUB','due_date':'2026-01-31','notes':'После приёмки макетов'}|changes)
    assert response.status_code==201,response.text
    return response.json()


def test_once_is_one_occurrence_across_months_restarts_and_forecasts(setup):
    app,client,settings,clock=setup;sign_in(client)
    one=create_once(client)
    assert one['frequency']=='once' and one['notes']=='После приёмки макетов'
    assert client.get('/api/v1/recurring-payments').json()==[]
    clock[0]=date(2027,3,31)
    rows=client.get('/api/v1/payment-occurrences').json()
    assert len(rows)==1 and rows[0]['id']==one['id']
    year=client.get('/api/v1/payments/budget?year=2026').json()
    assert year['currencies']['RUB']['planned']=='1200.99'
    assert client.get('/api/v1/payments/budget?year=2027').json()['currencies']['RUB']['planned']=='0.00'
    assert client.post(f"/api/v1/recurring-payments/{one['recurring_payment_id']}/occurrences",json={'due_date':'2026-02-28'}).status_code==422
    app.state.db.initialize()
    with app.state.db.connect(write=True) as conn:materialize(conn,clock[0])
    assert len(client.get('/api/v1/payment-occurrences').json())==1


def test_regular_user_can_pay_once_but_cannot_create_or_archive(setup):
    app,client,_,_=setup;sign_in(client)
    one=create_once(client)
    client.post('/api/v1/users',json={'username':'alex','display_name':'Alex','password':'Test-user-password123!'})
    sign_in(client,'alex','Test-user-password123!')
    assert client.post('/api/v1/one-time-payments',json={'title':'x','amount':'1','currency':'USD','due_date':'2026-02-01'}).status_code==403
    assert client.delete(f"/api/v1/one-time-payments/{one['id']}").status_code==403
    paid=client.patch(f"/api/v1/payment-occurrences/{one['id']}",json={'paid':True})
    assert paid.status_code==200 and paid.json()['paid_at']=='2026-01-28'
    assert client.patch(f"/api/v1/payment-occurrences/{one['id']}",json={'paid':False}).json()['paid_at'] is None


def test_once_archive_preserves_paid_date_and_attachments(setup):
    _,client,_,_=setup;sign_in(client);one=create_once(client)
    client.patch(f"/api/v1/payment-occurrences/{one['id']}",json={'paid':True})
    client.post(f"/api/v1/payment-occurrences/{one['id']}/attachment-links",json={'title':'Акт','url':'https://example.com/act'})
    assert client.delete(f"/api/v1/recurring-payments/{one['recurring_payment_id']}").status_code==404
    assert client.delete(f"/api/v1/one-time-payments/{one['id']}").status_code==204
    row=client.get(f"/api/v1/payment-occurrences/{one['id']}").json()
    assert row['active'] is False and row['paid_at']=='2026-01-28' and row['attachment_count']==1


def test_examples_are_additive_idempotent_and_do_not_mutate_existing(setup):
    app,client,_,clock=setup;sign_in(client)
    create_payment(client)
    before=client.get('/api/v1/payment-occurrences').json()
    assert add_examples(app.state.db,clock[0])==6
    assert add_examples(app.state.db,clock[0])==0
    after=client.get('/api/v1/payment-occurrences').json()
    assert [r for r in after if r['recurring_payment_id']==before[0]['recurring_payment_id']]==before
    assert len(client.get('/api/v1/one-time-payments').json())==4
    assert len(client.get('/api/v1/recurring-payments').json())==3


def test_one_time_reminder_uses_same_durable_deduplication(setup):
    from test_reminders import make_worker
    app,client,_,clock=setup;sign_in(client);one=create_once(client)
    deliveries=[]
    sender=lambda row:(deliveries.append(row['id']) or ('sent',None,'123',0))
    worker=make_worker(setup,sender)
    worker.tick();worker.tick();make_worker(setup,sender).tick()
    assert len(deliveries)==1
    clock[0]=date(2026,4,30)
    worker.tick()
    assert len(deliveries)==1
    assert len(client.get('/api/v1/one-time-payments').json())==1


def test_version_two_migration_preserves_existing_periods_and_outbox(tmp_path):
    import sqlite3
    from backend.app.db import SCHEMA,EXTRAS_SCHEMA,Database
    path=tmp_path/'v2.sqlite3'
    with sqlite3.connect(path) as conn:
        conn.executescript(SCHEMA+EXTRAS_SCHEMA)
        conn.execute('PRAGMA user_version=2')
        conn.execute("INSERT INTO recurring_payments(id,title,amount_cents,currency,first_due_date,anchor_day,next_index,created_at) VALUES(7,'Existing',100,'USD','2026-01-31',31,1,'2026-01-01')")
        conn.execute("INSERT INTO payment_occurrences(id,recurring_payment_id,due_date,amount_cents,currency,paid_at) VALUES(11,7,'2026-01-31',100,'USD','2026-01-28')")
        conn.execute("INSERT INTO reminders(occurrence_id,state,attempts,message_id) VALUES(11,'sent',1,'42')")
    db=Database(path);db.initialize();db.initialize()
    with db.connect() as conn:
        assert conn.execute('PRAGMA user_version').fetchone()[0]==4
        row=conn.execute('SELECT * FROM recurring_payments').fetchone()
        assert row['id']==7 and row['frequency']=='monthly' and row['next_index']==1
        assert conn.execute('SELECT paid_at FROM payment_occurrences WHERE id=11').fetchone()[0]=='2026-01-28'
        sent=conn.execute('SELECT * FROM reminders').fetchone()
        assert sent['message_id']=='42' and sent['attempts']==1 and sent['state']=='sent'
