"""Creates only project-local configuration and optional non-destructive demo data."""
import argparse
from datetime import timedelta
import os
import secrets

from .config import ROOT, Settings
from .db import Database
from .domain import local_today, materialize, monthly_date, timestamp
from .security import hash_password


def main():
    parser = argparse.ArgumentParser(description="Локальная подготовка Invoice Keeper")
    parser.add_argument("--demo", action="store_true", help="Добавить демоданные только в пустую базу")
    args = parser.parse_args()
    env_path = ROOT / ".env"
    if not env_path.exists():
        admin_password = secrets.token_urlsafe(20)
        demo_password = secrets.token_urlsafe(16)
        content = (
            f"ADMIN_USERNAME=admin\nADMIN_PASSWORD={admin_password}\n"
            "APP_TIMEZONE=Europe/Moscow\nDATABASE_PATH=./data/invoice-keeper.sqlite3\n"
            "SESSION_HOURS=12\nCOOKIE_SECURE=false\nTELEGRAM_ENABLED=false\n"
            "TELEGRAM_BOT_TOKEN=\nTELEGRAM_CHAT_ID=\nREMINDER_INTERVAL_SECONDS=60\n"
            f"DEMO_USERNAME=teammate\nDEMO_PASSWORD={demo_password}\n"
        )
        fd = os.open(env_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as stream:
            stream.write(content)
        print("Создан .env с уникальными паролями. Файл доступен только владельцу.")
    else:
        print("Существующий .env сохранён без изменений.")
    settings = Settings.from_env()
    db = Database(settings.database_path)
    db.initialize()
    if args.demo:
        demo_password = os.getenv("DEMO_PASSWORD")
        if not demo_password:
            raise SystemExit("Для демопользователя добавьте DEMO_PASSWORD (12+ символов) в .env. База не изменена.")
        if len(demo_password) < 12:
            raise SystemExit("DEMO_PASSWORD должен содержать минимум 12 символов.")
        if os.getenv("DEMO_USERNAME", "teammate").casefold() == settings.admin_username.casefold():
            raise SystemExit("Логины администратора и демопользователя должны различаться.")
        today = local_today(settings)
        first = today.replace(day=1)
        samples = [
            ("Аренда офиса", 4500000, "RUB", today + timedelta(days=3), False),
            ("Облачный сервер", 2400, "USD", today + timedelta(days=1), False),
            ("Notion · командный план", 1800, "EUR", today + timedelta(days=7), False),
            ("Домен и почта", 149000, "RUB", today - timedelta(days=4), False),
            ("Figma · рабочее пространство", 1500, "USD", today - timedelta(days=2), True),
            ("Интернет в офисе", 250000, "RUB", monthly_date(first, 0), True),
        ]
        with db.connect(write=True) as conn:
            if conn.execute("SELECT COUNT(*) FROM recurring_payments").fetchone()[0] or conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]:
                print("В базе уже есть данные: демоданные не добавлены, существующие записи сохранены.")
                return
            conn.execute("INSERT INTO users(username,display_name,password_hash,created_at) VALUES(?,?,?,?)",
                         (os.getenv("DEMO_USERNAME", "teammate"), "Алексей · команда", hash_password(demo_password), timestamp()))
            paid_ids = []
            for title, cents, currency, due, paid in samples:
                cur = conn.execute("INSERT INTO recurring_payments(title,amount_cents,currency,first_due_date,anchor_day,created_at) VALUES(?,?,?,?,?,?)",
                                   (title, cents, currency, due.isoformat(), due.day, timestamp()))
                if paid:
                    paid_ids.append((cur.lastrowid, due.isoformat()))
            materialize(conn, today)
            for recurring_id, paid_at in paid_ids:
                conn.execute("UPDATE payment_occurrences SET paid_at=?,updated_by='demo',updated_at=? WHERE recurring_payment_id=? AND due_date=?", (paid_at, timestamp(), recurring_id, paid_at))
        print("Добавлены платежи в RUB, USD, EUR и обычный пользователь. Отправка в Telegram отключена по умолчанию.")
    print("Учётные данные: ADMIN_USERNAME / ADMIN_PASSWORD в .env.")
    if args.demo:
        print("Обычный пользователь: DEMO_USERNAME / DEMO_PASSWORD в .env.")
    print("Запуск: python -m app.run   →   http://127.0.0.1:18080")


if __name__ == "__main__":
    main()
