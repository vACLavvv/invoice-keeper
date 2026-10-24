from datetime import date
from pathlib import Path
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from backend.app.config import Settings
from backend.app.main import create_app


@pytest.fixture
def setup(tmp_path):
    clock = [date(2026, 1, 28)]
    settings = Settings(database_path=tmp_path / "test.sqlite3", admin_username="admin", admin_password="TestAdmin-Only123!",allowed_hosts=('testserver','localhost','127.0.0.1','::1'))
    app = create_app(settings, start_worker=False, today_provider=lambda: clock[0])
    with TestClient(app) as client:
        yield app, client, settings, clock


def sign_in(client, username="admin", password="TestAdmin-Only123!"):
    response = client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200, response.text
    client.headers["X-CSRF-Token"] = response.json()["csrf_token"]
    return response.json()


def create_payment(client, **values):
    payload = {"title": "Аренда", "amount": "100.10", "currency": "RUB", "first_due_date": "2026-01-31"} | values
    result = client.post("/api/v1/recurring-payments", json=payload)
    assert result.status_code == 201, result.text
    return result.json()
