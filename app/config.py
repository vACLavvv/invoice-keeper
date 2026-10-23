from dataclasses import dataclass
from pathlib import Path
from zoneinfo import ZoneInfo
import os
import re

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class Settings:
    database_path: Path
    admin_username: str
    admin_password: str
    timezone: str = "Europe/Moscow"
    session_hours: int = 12
    cookie_secure: bool = False
    telegram_enabled: bool = False
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""
    reminder_interval: int = 60

    def __post_init__(self):
        ZoneInfo(self.timezone)
        if not re.fullmatch(r"[A-Za-z0-9_.-]{1,64}", self.admin_username) or not 12 <= len(self.admin_password) <= 128 or self.admin_password == "replace-with-a-long-random-password":
            raise ValueError("Задайте ADMIN_USERNAME и случайный ADMIN_PASSWORD (минимум 12 символов). Запуск: python -m app.bootstrap --demo")
        if self.telegram_enabled and not (self.telegram_bot_token and self.telegram_chat_id):
            raise ValueError("Для Telegram необходимы TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID")
        if not 1 <= self.session_hours <= 168 or not 10 <= self.reminder_interval <= 3600:
            raise ValueError("Недопустимый срок сессии или интервал напоминаний")

    @classmethod
    def from_env(cls):
        load_dotenv(ROOT / ".env", override=False)
        database_path = Path(os.getenv("DATABASE_PATH", "./data/invoice-keeper.sqlite3"))
        if not database_path.is_absolute():
            database_path = ROOT / database_path
        return cls(
            database_path=database_path,
            admin_username=os.getenv("ADMIN_USERNAME", "admin"),
            admin_password=os.getenv("ADMIN_PASSWORD", ""),
            timezone=os.getenv("APP_TIMEZONE", "Europe/Moscow"),
            session_hours=int(os.getenv("SESSION_HOURS", "12")),
            cookie_secure=os.getenv("COOKIE_SECURE", "false").lower() == "true",
            telegram_enabled=os.getenv("TELEGRAM_ENABLED", "false").lower() == "true",
            telegram_bot_token=os.getenv("TELEGRAM_BOT_TOKEN", ""),
            telegram_chat_id=os.getenv("TELEGRAM_CHAT_ID", ""),
            reminder_interval=int(os.getenv("REMINDER_INTERVAL_SECONDS", "60")),
        )
