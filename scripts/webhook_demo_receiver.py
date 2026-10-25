#!/usr/bin/env python3
"""Local demonstration consumer for Invoice Keeper, not an external automation service.
Only event metadata and a body digest are retained; payment details are never logged.
"""
import hashlib
import hmac
import json
import os
import re
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path


def receiver(secret, database):
    if len(secret) < 32:
        raise ValueError("WEBHOOK_SECRET must contain at least 32 characters")
    with closing(sqlite3.connect(database)) as db, db:
        db.execute("CREATE TABLE IF NOT EXISTS inbox (delivery TEXT PRIMARY KEY, event TEXT NOT NULL, occurrence_id INTEGER NOT NULL, body_sha256 TEXT NOT NULL, received_at TEXT NOT NULL)")
        db.execute("CREATE TABLE IF NOT EXISTS test_inbox (delivery TEXT PRIMARY KEY, event TEXT NOT NULL, body_sha256 TEXT NOT NULL, received_at TEXT NOT NULL)")

    class Handler(BaseHTTPRequestHandler):
        server_version = "KeeperWebhook"
        sys_version = ""

        def log_message(self, *_):
            pass  # BaseHTTPRequestHandler would include user-controlled paths.

        def respond(self, status, result):
            body = json.dumps({"status": result}).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(body)
            self.close_connection = True

        def do_GET(self):
            if self.path != "/healthz":
                return self.respond(404, "not_found")
            with closing(sqlite3.connect(database)) as db, db:
                db.execute("SELECT 1").fetchone()
            self.respond(200, "ok")

        def do_POST(self):
            self.connection.settimeout(5)
            if self.path != "/events":
                return self.respond(404, "not_found")
            if self.headers.get("Transfer-Encoding") or self.headers.get("Content-Type", "").split(";")[0] != "application/json":
                return self.respond(400, "invalid_request")
            try:
                size = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                return self.respond(400, "invalid_length")
            if not 0 < size <= 65536:
                return self.respond(413, "invalid_length")
            body = self.rfile.read(size)
            if len(body) != size:
                return self.respond(400, "incomplete_body")
            signature = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
            if not hmac.compare_digest(self.headers.get("X-Invoice-Keeper-Signature", "").encode("utf-8"), signature.encode("ascii")):
                return self.respond(401, "invalid_signature")
            try:
                payload = json.loads(body)
                event = payload["event"]
                delivery = self.headers.get("X-Invoice-Keeper-Delivery", "")
                if event == "webhook.test":
                    if payload != {"event": "webhook.test", "message": "Invoice Keeper webhook test"}:
                        raise ValueError()
                    if not re.fullmatch(r"test:(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})", delivery):
                        raise ValueError()
                else:
                    occurrence = payload["occurrence"]["id"]
                    if event not in ("reminder.due", "reminder.overdue") or type(occurrence) is not int or occurrence <= 0:
                        raise ValueError()
                    if delivery != f"{occurrence}-{event}":
                        raise ValueError()
                if self.headers.get("X-Invoice-Keeper-Event") != event:
                    raise ValueError()
            except (ValueError, KeyError, TypeError):
                return self.respond(400, "invalid_event")
            with closing(sqlite3.connect(database, timeout=3)) as db, db:
                digest = hashlib.sha256(body).hexdigest()
                received_at = datetime.now(timezone.utc).isoformat()
                if event == "webhook.test":
                    inserted = db.execute("INSERT OR IGNORE INTO test_inbox VALUES(?,?,?,?)", (delivery, event, digest, received_at)).rowcount
                else:
                    inserted = db.execute("INSERT OR IGNORE INTO inbox VALUES(?,?,?,?,?)", (delivery, event, occurrence, digest, received_at)).rowcount
            print(json.dumps({"event": "webhook.accepted" if inserted else "webhook.duplicate", "delivery": delivery}), flush=True)
            self.respond(200, "accepted" if inserted else "duplicate")

    return Handler


if __name__ == "__main__":
    os.umask(0o077)
    path = Path(os.environ["INBOX_DATABASE"])
    path.parent.mkdir(parents=True, exist_ok=True)
    HTTPServer(("127.0.0.1", 18082), receiver(os.environ["WEBHOOK_SECRET"], path)).serve_forever()
