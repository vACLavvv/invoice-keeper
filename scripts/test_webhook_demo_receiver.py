import hashlib
import hmac
import json
import sqlite3
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import HTTPServer
from pathlib import Path
from webhook_demo_receiver import receiver


class ReceiverTest(unittest.TestCase):
    def test_signature_and_persistent_deduplication(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "inbox.sqlite3"
            key = "test-secret-" * 5
            server = HTTPServer(("127.0.0.1", 0), receiver(key, path))
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            body = json.dumps({"event": "reminder.due", "occurrence": {"id": 42}}).encode()
            signature = "sha256=" + hmac.new(key.encode(), body, hashlib.sha256).hexdigest()
            def send(sig, delivery="42-reminder.due"):
                request = urllib.request.Request(f"http://127.0.0.1:{server.server_port}/events", data=body, headers={"Content-Type": "application/json", "X-Invoice-Keeper-Event": "reminder.due", "X-Invoice-Keeper-Delivery": delivery, "X-Invoice-Keeper-Signature": sig})
                try:
                    with urllib.request.urlopen(request, timeout=2) as response:
                        return response.status, json.load(response)["status"]
                except urllib.error.HTTPError as error:
                    return error.code, None
            try:
                self.assertEqual(send("sha256=bad")[0], 401)
                self.assertEqual(send(signature, "43-reminder.due")[0], 400)
                self.assertEqual(send(signature), (200, "accepted"))
                self.assertEqual(send(signature), (200, "duplicate"))
                receiver(key, path)  # Reopening the database preserves the idempotency record.
                with sqlite3.connect(path) as db:
                    self.assertEqual(db.execute("SELECT count(*) FROM inbox").fetchone()[0], 1)
            finally:
                server.shutdown()
                thread.join()
                server.server_close()


if __name__ == "__main__":
    unittest.main()
