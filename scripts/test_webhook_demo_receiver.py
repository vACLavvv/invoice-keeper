import hashlib
import hmac
import json
import sqlite3
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from contextlib import closing
from http.server import HTTPServer
from pathlib import Path
from webhook_demo_receiver import receiver


class ReceiverTest(unittest.TestCase):
    test_payload = {"event": "webhook.test", "message": "Invoice Keeper webhook test"}
    test_delivery = "test:2ae3862e-64cf-416d-a968-bb1c062eb66d"

    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.path = Path(self.folder.name) / "inbox.sqlite3"
        self.key = "test-secret-" * 5
        self.server = HTTPServer(("127.0.0.1", 0), receiver(self.key, self.path))
        self.thread = threading.Thread(target=self.server.serve_forever, kwargs={"poll_interval": 0.02}, daemon=True)
        self.thread.start()
        self.url = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.thread.join()
        self.server.server_close()
        self.folder.cleanup()

    def request(self, request):
        try:
            response = urllib.request.urlopen(request, timeout=2)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.status, json.load(response)

    def send(self, payload, delivery, *, event=None, signature=None, body=None):
        if body is None:
            body = json.dumps(payload).encode()
        if event is None:
            event = payload.get("event", "") if isinstance(payload, dict) else "webhook.test"
        if signature is None:
            signature = "sha256=" + hmac.new(self.key.encode(), body, hashlib.sha256).hexdigest()
        return self.request(urllib.request.Request(self.url + "/events", data=body, headers={
            "Content-Type": "application/json",
            "X-Invoice-Keeper-Event": event,
            "X-Invoice-Keeper-Delivery": delivery,
            "X-Invoice-Keeper-Signature": signature,
        }))

    def assert_status(self, response, code, status):
        # No signed payload or secret may be echoed in an HTTP response.
        self.assertEqual(response, (code, {"status": status}))

    def test_reminder_signature_and_persistent_deduplication(self):
        due = {"event": "reminder.due", "occurrence": {"id": 42}}
        overdue = {"event": "reminder.overdue", "occurrence": {"id": 42}}
        self.assert_status(self.send(due, "42-reminder.due", signature="sha256=bad"), 401, "invalid_signature")
        self.assert_status(self.send(due, "43-reminder.due"), 400, "invalid_event")
        self.assert_status(self.send(due, "42-reminder.due"), 200, "accepted")
        self.assert_status(self.send(due, "42-reminder.due"), 200, "duplicate")
        self.assert_status(self.send(overdue, "42-reminder.overdue"), 200, "accepted")
        receiver(self.key, self.path)
        self.assert_status(self.send(due, "42-reminder.due"), 200, "duplicate")
        with closing(sqlite3.connect(self.path)) as db, db:
            self.assertEqual(db.execute("SELECT count(*) FROM inbox").fetchone()[0], 2)
            self.assertEqual(db.execute("SELECT count(*) FROM test_inbox").fetchone()[0], 0)

    def test_separate_test_inbox_and_unique_persistent_delivery_ids(self):
        self.assert_status(self.send(self.test_payload, self.test_delivery), 200, "accepted")
        self.assert_status(self.send(self.test_payload, self.test_delivery), 200, "duplicate")
        receiver(self.key, self.path)
        self.assert_status(self.send(self.test_payload, self.test_delivery), 200, "duplicate")
        self.assert_status(self.send(self.test_payload, "test:f1e97273-c6fa-4f93-948c-53b2fd8374aa"), 200, "accepted")
        self.assert_status(self.send(self.test_payload, "test:20fe689bd23f46d2a507538a96a86430"), 200, "accepted")
        with closing(sqlite3.connect(self.path)) as db, db:
            self.assertEqual(db.execute("SELECT count(*) FROM inbox").fetchone()[0], 0)
            self.assertEqual(db.execute("SELECT count(*) FROM test_inbox").fetchone()[0], 3)
            event, digest, received_at = db.execute("SELECT event, body_sha256, received_at FROM test_inbox WHERE delivery=?", (self.test_delivery,)).fetchone()
            self.assertEqual(event, "webhook.test")
            self.assertEqual(digest, hashlib.sha256(json.dumps(self.test_payload).encode()).hexdigest())
            self.assertTrue(received_at.endswith("+00:00"))
            self.assertNotIn("occurrence_id", [column[1] for column in db.execute("PRAGMA table_info(test_inbox)")])

    def test_invalid_test_signature_and_header_rejected_before_insert(self):
        self.assert_status(self.send(self.test_payload, self.test_delivery, signature="sha256=bad"), 401, "invalid_signature")
        wrong_body_signature = "sha256=" + hmac.new(self.key.encode(), b"{}", hashlib.sha256).hexdigest()
        self.assert_status(self.send(self.test_payload, self.test_delivery, signature=wrong_body_signature), 401, "invalid_signature")
        for event in ("", "reminder.due", "webhook.other"):
            with self.subTest(event=event):
                self.assert_status(self.send(self.test_payload, self.test_delivery, event=event), 400, "invalid_event")
        with closing(sqlite3.connect(self.path)) as db, db:
            self.assertEqual(db.execute("SELECT count(*) FROM test_inbox").fetchone()[0], 0)

    def test_invalid_test_delivery_ids(self):
        for delivery in (
            "", "test:hello", self.test_delivery.upper(), self.test_delivery.removeprefix("test:"),
            "test:2ae3862e-64cf-116d-a968-bb1c062eb66d",  # Not UUIDv4.
            "test:2ae3862e-64cf-416d-7968-bb1c062eb66d",  # Wrong UUID variant.
            "test:20fe689bd23f46d2a507538a96a8643",  # Incomplete compact ID.
            "test:20fe689bd23f46d2a507538a96a86430-extra",
        ):
            with self.subTest(delivery=delivery):
                self.assert_status(self.send(self.test_payload, delivery), 400, "invalid_event")

    def test_only_explicit_test_payload_is_accepted(self):
        for payload in (
            {}, [], None,
            {"event": "webhook.test"},
            {"event": "webhook.test", "message": "wrong message"},
            {**self.test_payload, "occurrence": {"id": 42}},
            {**self.test_payload, "extra": "value"},
            {**self.test_payload, "event": "webhook.other"},
        ):
            with self.subTest(payload=payload):
                self.assert_status(self.send(payload, self.test_delivery), 400, "invalid_event")
        self.assert_status(self.send(self.test_payload, self.test_delivery, body=b"not-json"), 400, "invalid_event")
        with closing(sqlite3.connect(self.path)) as db, db:
            self.assertEqual(db.execute("SELECT count(*) FROM test_inbox").fetchone()[0], 0)
            self.assertEqual(db.execute("SELECT count(*) FROM inbox").fetchone()[0], 0)

    def test_test_inbox_migration_preserves_existing_reminders(self):
        due = {"event": "reminder.due", "occurrence": {"id": 42}}
        self.assert_status(self.send(due, "42-reminder.due"), 200, "accepted")
        with closing(sqlite3.connect(self.path)) as db, db:
            before = db.execute("SELECT * FROM inbox").fetchall()
            db.execute("DROP TABLE test_inbox")
        receiver(self.key, self.path)
        with closing(sqlite3.connect(self.path)) as db, db:
            self.assertEqual(db.execute("SELECT * FROM inbox").fetchall(), before)
            self.assertEqual(db.execute("SELECT count(*) FROM test_inbox").fetchone()[0], 0)
        self.assert_status(self.send(self.test_payload, self.test_delivery), 200, "accepted")

    def test_health_does_not_create_deliveries(self):
        self.assert_status(self.request(self.url + "/healthz"), 200, "ok")
        self.assert_status(self.request(self.url + "/unknown"), 404, "not_found")
        with closing(sqlite3.connect(self.path)) as db, db:
            self.assertEqual(db.execute("SELECT count(*) FROM inbox").fetchone()[0], 0)
            self.assertEqual(db.execute("SELECT count(*) FROM test_inbox").fetchone()[0], 0)


if __name__ == "__main__":
    unittest.main()
