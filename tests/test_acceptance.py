from concurrent.futures import ThreadPoolExecutor
from datetime import date
import json
import sqlite3

from fastapi.testclient import TestClient
import pytest

from app.main import create_app
from app.domain import monthly_date
from conftest import create_payment, sign_in


@pytest.mark.parametrize("path", ["/api/v1/auth/me", "/api/v1/recurring-payments", "/api/v1/payment-occurrences", "/api/v1/payments/summary", "/api/v1/users", "/api/v1/docs", "/api/v1/openapi.json", "/api/v1/reminders", "/api/v1/audit-log"])
def test_data_requires_authorization(setup, path):
    _, client, _, _ = setup
    assert client.get(path).status_code == 401
    assert client.get("/", follow_redirects=False).headers["location"] == "/login"
    assert client.get("/assets/index.html").status_code == 404
    assert client.get("/assets/../templates/index.html").status_code == 404


def test_cookie_csrf_and_logout(setup):
    app, client, _, _ = setup
    response = client.post("/api/v1/auth/login", json={"username":"admin", "password":"wrong"})
    assert response.status_code == 401
    user = sign_in(client)
    assert "HttpOnly" in client.post("/api/v1/auth/login", json={"username":"admin", "password":"TestAdmin-Only123!"}).headers["set-cookie"]
    # The second session has its own CSRF value.
    csrf = client.get("/api/v1/auth/me").json()["csrf_token"]
    client.headers.pop("X-CSRF-Token")
    assert client.post("/api/v1/recurring-payments", json={"title":"x", "amount":"1", "currency":"RUB", "first_due_date":"2026-01-31"}).status_code == 403
    client.headers["X-CSRF-Token"] = csrf
    assert client.post("/api/v1/auth/logout", headers={"Origin":"https://evil.example"}).status_code == 403
    assert client.post("/api/v1/auth/logout").status_code == 204
    assert client.get("/api/v1/auth/me").status_code == 401
    with app.state.db.connect() as conn:
        hashes = conn.execute("SELECT token_hash FROM sessions").fetchall()
    assert all(len(row[0]) == 64 for row in hashes)


def test_regular_user_permissions_and_user_lifecycle(setup):
    app, admin, _, _ = setup
    sign_in(admin)
    r = create_payment(admin)
    created = admin.post("/api/v1/users", json={"username":"alex", "display_name":"Алексей", "password":"User-password123!"})
    assert created.status_code == 201
    user_id = created.json()["id"]
    assert "password_hash" not in created.json()
    ordinary = TestClient(app)
    sign_in(ordinary, "ALEX", "User-password123!")
    cases = [("get", "/api/v1/users", None), ("post", "/api/v1/recurring-payments", {"title":"x", "amount":"1", "currency":"RUB", "first_due_date":"2026-01-31"}), ("delete", f"/api/v1/recurring-payments/{r['id']}", None), ("post", "/api/v1/users", {"username":"other", "display_name":"X", "password":"User-password123!"}), ("patch", f"/api/v1/users/{user_id}", {"display_name":"test"}), ("delete", f"/api/v1/users/{user_id}", None)]
    for method, path, body in cases:
        kwargs = {"json":body} if body else {}
        assert ordinary.request(method, path, **kwargs).status_code == 403
    items = ordinary.get("/api/v1/payment-occurrences").json()
    result = ordinary.patch(f"/api/v1/payment-occurrences/{items[0]['id']}", json={"paid":True})
    assert result.status_code == 200 and result.json()["paid_at"] == "2026-01-28"
    assert ordinary.get("/api/v1/docs").status_code == 200
    assert admin.patch(f"/api/v1/users/{user_id}", json={"display_name":"Алексей Петров"}).status_code == 200
    assert ordinary.get("/api/v1/auth/me").json()["display_name"] == "Алексей Петров"
    assert admin.patch(f"/api/v1/users/{user_id}", json={"password":"Replacement-pass123!"}).status_code == 200
    assert ordinary.get("/api/v1/auth/me").status_code == 401
    sign_in(ordinary,"alex","Replacement-pass123!")
    assert admin.delete(f"/api/v1/users/{user_id}").status_code == 204
    assert ordinary.get("/api/v1/auth/me").status_code == 401
    assert admin.get("/api/v1/payment-occurrences").json()[0]["paid_at"] == "2026-01-28"


def test_admin_account_cannot_be_managed_in_panel(setup):
    _, client, _, _ = setup
    sign_in(client)
    assert client.delete("/api/v1/users/0").status_code == 403
    assert client.patch("/api/v1/users/0", json={"display_name":"Hack"}).status_code == 403
    assert client.post("/api/v1/users", json={"username":"ADMIN", "display_name":"x", "password":"VeryLongPassword!"}).status_code == 409
    assert client.post("/api/v1/users", json={"username":"other", "display_name":"x", "password":"VeryLongPassword!", "role":"admin"}).status_code == 422


def test_month_end_anchor_and_unpaid_independent_periods(setup):
    _, client, _, clock = setup
    sign_in(client)
    create_payment(client)
    clock[0] = date(2026, 3, 31)
    occurrences = client.get("/api/v1/payment-occurrences").json()
    assert [o["due_date"] for o in occurrences] == ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]
    assert [o["status"] for o in occurrences] == ["overdue", "overdue", "unpaid", "unpaid"]
    assert client.patch(f"/api/v1/payment-occurrences/{occurrences[0]['id']}", json={"paid_at":"2026-01-31"}).status_code == 200
    occurrences = client.get("/api/v1/payment-occurrences").json()
    assert occurrences[0]["status"] == "paid"
    assert occurrences[1]["status"] == "overdue"
    assert monthly_date(date(2028,1,31),1).isoformat() == "2028-02-29"
    assert monthly_date(date(2026,12,31),1).isoformat() == "2027-01-31"


def test_payment_date_correction_undo_and_due_day(setup):
    _, client, _, clock = setup
    sign_in(client)
    create_payment(client, first_due_date="2026-01-28")
    item = client.get("/api/v1/payment-occurrences").json()[0]
    assert item["status"] == "unpaid" and item["days_overdue"] == 0
    clock[0] = date(2026,2,2)
    path = f"/api/v1/payment-occurrences/{item['id']}"
    late = client.patch(path, json={"paid":True, "paid_at":"2026-01-30"}).json()
    assert late["is_late"] and late["days_overdue"] == 2
    corrected = client.patch(path, json={"paid_at":"2026-01-28"}).json()
    assert corrected["status"] == "paid" and not corrected["is_late"]
    assert corrected["due_date"] == "2026-01-28"
    undone = client.patch(path, json={"paid":False}).json()
    assert undone["paid_at"] is None and undone["status"] == "overdue" and undone["days_overdue"] == 5
    assert client.patch(path,json={"paid_at":"2026-02-03"}).status_code == 422
    assert client.patch(path,json={"paid":False,"paid_at":"2026-01-28"}).status_code == 422
    assert client.patch(path,json={"paid":True,"paid_at":None}).status_code == 422
    assert client.patch(path,json={}).status_code == 422
    assert client.patch(path,json={"paid":None}).status_code == 422
    assert client.patch(path,json={"amount":"0.01"}).status_code == 422


def test_next_month_is_complete_even_when_due_after_today(setup):
    _, client, _, clock = setup
    sign_in(client)
    clock[0] = date(2026, 10, 23)
    create_payment(client, first_due_date="2026-10-26")
    items = client.get("/api/v1/payment-occurrences").json()
    assert [x["due_date"] for x in items] == ["2026-10-26", "2026-11-26"]
    client.patch(f"/api/v1/payment-occurrences/{items[0]['id']}",json={"paid":True})
    next_month = client.get("/api/v1/payment-occurrences?from_date=2026-11-01&to_date=2026-11-30").json()
    assert next_month[0]["status"] == "unpaid" and next_month[0]["paid_at"] is None


def test_currency_summary_exact_and_date_filters(setup):
    _, client, _, clock = setup
    sign_in(client)
    for currency, amount in [("RUB","0.10"),("RUB","0.20"),("USD","29.99"),("EUR","12.49")]:
        create_payment(client,currency=currency,amount=amount)
    params = {"from_date":"2026-01-01","to_date":"2026-01-31"}
    summary = client.get("/api/v1/payments/summary",params=params).json()["currencies"]
    assert summary["RUB"]["total"] == "0.30"
    assert summary["USD"]["unpaid"] == "29.99"
    assert summary["EUR"]["unpaid"] == "12.49"
    assert summary["RUB"]["overdue"] == "0.00"
    clock[0] = date(2026,2,1)
    summary = client.get("/api/v1/payments/summary",params=params).json()["currencies"]
    assert summary["RUB"]["overdue"] == "0.30"
    items = client.get("/api/v1/payment-occurrences", params=params | {"currency":"USD"}).json()
    assert len(items) == 1
    client.patch(f"/api/v1/payment-occurrences/{items[0]['id']}", json={"paid_at":"2026-01-31"})
    summary = client.get("/api/v1/payments/summary",params=params).json()["currencies"]
    assert summary["USD"]["paid"] == "29.99" and summary["USD"]["overdue"] == "0.00"
    assert client.get("/api/v1/payments/summary", params={"from_date":"2026-02-01","to_date":"2026-01-01"}).status_code == 422
    assert len(client.get("/api/v1/payment-occurrences",params={"search":"АРЕНДА"}).json()) > 0


@pytest.mark.parametrize("changes", [{"amount":"0"},{"amount":"-1"},{"amount":"1.001"},{"amount":"NaN"},{"amount":"1e30"},{"currency":"BTC"},{"frequency":"weekly"},{"title":"  "},{"first_due_date":"2026-02-30"},{"first_due_date":"1900-01-01"}])
def test_invalid_payments_rejected(setup, changes):
    _, client, _, _ = setup
    sign_in(client)
    payload = {"title":"Test","amount":"10.00","currency":"RUB","first_due_date":"2026-01-31"} | changes
    assert client.post("/api/v1/recurring-payments",json=payload).status_code == 422


def test_archive_and_restart_preserve_history(setup):
    app, client, settings, clock = setup
    sign_in(client)
    payment = create_payment(client)
    item = client.get("/api/v1/payment-occurrences").json()[0]
    client.patch(f"/api/v1/payment-occurrences/{item['id']}",json={"paid_at":"2026-01-27"})
    before = client.get("/api/v1/payment-occurrences").json()
    assert client.delete(f"/api/v1/recurring-payments/{payment['id']}").status_code == 204
    assert client.delete(f"/api/v1/recurring-payments/{payment['id']}").status_code == 204
    clock[0] = date(2027, 1, 1)
    fresh = create_app(settings,start_worker=False,today_provider=lambda:clock[0])
    with TestClient(fresh) as restarted:
        sign_in(restarted)
        after = restarted.get("/api/v1/payment-occurrences").json()
        assert len(before) == len(after)
        assert after[0]["paid_at"] == "2026-01-27" and not after[0]["active"]
        assert restarted.get("/api/v1/recurring-payments").json()[0]["active"] is False
        assert restarted.get("/api/v1/payment-occurrences?include_archived=false").json() == []


def test_existing_session_survives_restart(setup):
    app, client, settings, clock = setup
    sign_in(client)
    cookies = dict(client.cookies)
    fresh = create_app(settings,start_worker=False,today_provider=lambda:clock[0])
    with TestClient(fresh) as restarted:
        restarted.cookies.update(cookies)
        assert restarted.get("/api/v1/auth/me").status_code == 200


def test_swagger_is_local_and_openapi_is_exported(setup):
    app, client, _, _ = setup
    sign_in(client)
    html = client.get("/api/v1/docs").text
    assert "/swagger-assets/swagger-ui-bundle.js" in html and "cdn.jsdelivr" not in html
    assert client.get("/swagger-assets/swagger-ui-bundle.js").status_code == 200
    spec = client.get("/api/v1/openapi.json").json()
    for path in ["/api/v1/auth/login","/api/v1/auth/me","/api/v1/auth/logout","/api/v1/recurring-payments","/api/v1/payment-occurrences","/api/v1/payments/summary","/api/v1/users"]:
        assert path in spec["paths"]


def test_login_throttle_and_password_not_echoed(setup):
    _, client, _, _ = setup
    password = "x" * 130
    result = client.post("/api/v1/auth/login",json={"username":"admin", "password":password})
    assert result.status_code == 422 and password not in result.text
    for _ in range(10):
        assert client.post("/api/v1/auth/login",json={"username":"missing","password":"wrong"}).status_code == 401
    assert client.post("/api/v1/auth/login",json={"username":"different","password":"wrong"}).status_code == 429


def test_concurrent_reads_create_no_duplicate_periods(setup):
    app, client, _, clock = setup
    sign_in(client)
    create_payment(client)
    clock[0] = date(2026, 5, 1)
    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(lambda _: client.get("/api/v1/payment-occurrences"), range(12)))
    assert all(r.status_code == 200 for r in results)
    rows = results[-1].json()
    assert len({(r["recurring_payment_id"],r["due_date"]) for r in rows}) == len(rows)
