from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from datetime import date
import time

import httpx

from backend.app.reminders import ReminderWorker, TelegramSender
from conftest import create_payment, sign_in


def make_worker(setup, sender):
    app, _, settings, clock = setup
    return ReminderWorker(app.state.db, replace(settings,telegram_enabled=True,telegram_bot_token="test-token",telegram_chat_id="test-chat"), sender=sender, today=lambda:clock[0])


def test_due_minus_three_immediate_late_entry_no_duplicates(setup):
    app, client, _, clock = setup
    sign_in(client)
    create_payment(client)
    sent = []
    def sender(row):
        sent.append(dict(row))
        return "sent", None, "123", 0
    worker = make_worker(setup,sender)
    clock[0] = date(2026,1,27)
    worker.tick()
    assert len(sent) == 0
    clock[0] = date(2026,1,28)
    worker.tick(); worker.tick()
    assert len(sent) == 1 and sent[0]["due_date"] == "2026-01-31"
    clock[0] = date(2026,1,30)
    create_payment(client,title="Позднее добавление",first_due_date="2026-01-31")
    worker.tick()
    assert len(sent) == 2
    # Restart with the same outbox.
    make_worker(setup,sender).tick()
    assert len(sent) == 2


def test_paid_archived_and_disabled_do_not_send(setup):
    _, client, _, _ = setup
    sign_in(client)
    first = create_payment(client)
    second = create_payment(client,title="Удалённый")
    item = client.get("/api/v1/payment-occurrences").json()[0]
    client.patch(f"/api/v1/payment-occurrences/{item['id']}",json={"paid":True})
    client.delete(f"/api/v1/recurring-payments/{second['id']}")
    sent = []
    worker = make_worker(setup,lambda row: (sent.append(row) or ("sent",None,"1",0)))
    worker.tick()
    assert not sent
    client.patch(f"/api/v1/payment-occurrences/{item['id']}",json={"paid":False})
    setup[0].state.worker.tick()  # Telegram disabled in the application fixture.
    assert not sent
    worker.tick(); worker.tick()
    assert len(sent) == 1


def test_ambiguous_delivery_and_crash_are_not_retried(setup):
    app, client, _, _ = setup
    sign_in(client)
    create_payment(client)
    calls = []
    def broken(row):
        calls.append(row["id"])
        raise TimeoutError("network timeout")
    worker = make_worker(setup,broken)
    worker.tick(); worker.tick()
    assert len(calls) == 1
    with app.state.db.connect(write=True) as conn:
        assert conn.execute("SELECT state FROM reminders").fetchone()[0] == "uncertain"
        conn.execute("UPDATE reminders SET state='sending',attempted_at=?", (int(time.time())-600,))
    make_worker(setup,broken).tick()
    assert len(calls) == 1
    with app.state.db.connect() as conn:
        assert conn.execute("SELECT state FROM reminders").fetchone()[0] == "uncertain"


def test_two_workers_claim_once(setup):
    app, client, _, _ = setup
    sign_in(client)
    create_payment(client)
    calls = []
    def sender(row):
        calls.append(row["id"])
        return "sent", None, "42", 0
    a,b = make_worker(setup,sender),make_worker(setup,sender)
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(lambda w:w.tick(),[a,b]))
    assert len(calls) == 1


def test_immediate_reminder_after_create_uses_background_task(setup):
    app, client, settings, clock = setup
    sign_in(client)
    calls = []
    app.state.worker.settings = replace(settings,telegram_enabled=True,telegram_bot_token="test",telegram_chat_id="test")
    app.state.worker.sender = lambda row: (calls.append(row["id"]) or ("sent",None,"1",0))
    create_payment(client,first_due_date="2026-01-29")
    assert len(calls) == 1


def test_telegram_payload_and_safe_retry(setup,monkeypatch):
    _,_,settings,_ = setup
    sender = TelegramSender(replace(settings,telegram_bot_token="SECRET-TOKEN",telegram_chat_id="123"))
    row = {"title":"Аренда <офис>","amount_cents":4500000,"currency":"RUB","due_date":"2026-01-31"}
    captured = []
    def ok_post(url, **kwargs):
        captured.append(kwargs["json"])
        return httpx.Response(200,json={"ok":True,"result":{"message_id":9}})
    monkeypatch.setattr(httpx,"post",ok_post)
    assert sender(row) == ("sent",None,"9",0)
    text = captured[0]["text"]
    assert all(x in text for x in ["Аренда <офис>","45000.00","RUB","2026-01-31"])
    assert "parse_mode" not in captured[0]
    monkeypatch.setattr(httpx,"post",lambda *a,**k: httpx.Response(429,json={"ok":False,"parameters":{"retry_after":12}}))
    result = sender(row)
    assert result[0] == "pending" and result[3] == 12
    def timeout(*a,**k):
        raise httpx.ReadTimeout("SECRET-TOKEN")
    monkeypatch.setattr(httpx,"post",timeout)
    result = sender(row)
    assert result[0] == "uncertain" and "SECRET-TOKEN" not in str(result)
