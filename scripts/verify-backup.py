#!/usr/bin/env python3
"""Read-only structural check of a SQLite backup; never connects to the running app."""
import argparse
import json
import sqlite3
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("backup", type=Path)
args = parser.parse_args()
path = args.backup.resolve(strict=True)
with sqlite3.connect(path.as_uri() + "?mode=ro", uri=True) as db:
    integrity = [row[0] for row in db.execute("PRAGMA integrity_check")]
    foreign_keys = db.execute("PRAGMA foreign_key_check").fetchall()
    tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    expected = ("users", "recurring_payments", "payment_occurrences", "receipts", "audit_log")
    missing = set(expected) - tables
    if integrity != ["ok"] or foreign_keys or missing:
        raise SystemExit("Backup is invalid (integrity, foreign keys or missing application tables)")
    # Names come exclusively from the fixed allow-list above.
    counts = {name: db.execute(f'SELECT count(*) FROM "{name}"').fetchone()[0] for name in expected}
    print(json.dumps({"integrity": "ok", "foreign_keys": "ok", "schema_version": db.execute("PRAGMA user_version").fetchone()[0], "counts": counts}))
