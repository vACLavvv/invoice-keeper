"""Exports schemas without opening a database or sending anything."""
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.config import ROOT, Settings
from app.main import create_app

app = create_app(Settings(database_path=ROOT / "data/unused.sqlite3", admin_username="admin", admin_password="schema-generation-only"), start_worker=False)
path = ROOT / "docs/openapi.json"
path.write_text(json.dumps(app.openapi(), ensure_ascii=False, indent=2) + "\n")
print(path)
