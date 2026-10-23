"""Consistent SQLite backup. Does not stop services or overwrite existing files."""
import argparse
from datetime import datetime, timezone
import os
from pathlib import Path
import sqlite3
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.config import ROOT, Settings


def main():
    parser = argparse.ArgumentParser(description="Консистентная резервная копия локальной базы Invoice Keeper")
    parser.add_argument("--destination", type=Path)
    args = parser.parse_args()
    settings = Settings.from_env()
    source_path = settings.database_path.resolve()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    destination = (args.destination or ROOT / f"backups/invoice-keeper-{stamp}.sqlite3").resolve()
    if not source_path.is_file():
        raise SystemExit("Исходная база не найдена. Ничего не изменено.")
    if destination == source_path:
        raise SystemExit("Копия не может совпадать с исходной базой.")
    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        raise SystemExit("Файл назначения уже существует. Перезапись запрещена.")
    os.close(fd)
    source = sqlite3.connect(source_path.as_uri() + "?mode=ro", uri=True)
    target = sqlite3.connect(destination)
    try:
        source.backup(target)
        if target.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise RuntimeError("Копия не прошла integrity_check")
    finally:
        target.close()
        source.close()
    print(f"Создана копия: {destination}")


if __name__ == "__main__":
    main()
