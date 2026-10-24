from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo
import os
import re

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
FRONTEND_ROOT = ROOT / "frontend"


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
    telegram_buttons_enabled: bool = True
    telegram_commands_enabled: bool = True
    telegram_allowed_user_ids: tuple[int, ...] = ()
    smtp_enabled: bool = False
    smtp_host: str = ""
    smtp_port: int = 465
    smtp_security: str = "ssl"
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_to: str = ""
    webhook_enabled: bool = False
    webhook_url: str = ""
    webhook_secret: str = ""
    webhook_allow_localhost: bool = False
    in_app_enabled: bool = True
    max_attachment_bytes: int = 5 * 1024 * 1024
    allowed_hosts: tuple[str,...] = ('127.0.0.1','localhost','::1')
    public_base_url: str = ''

    def __post_init__(self):
        ZoneInfo(self.timezone)
        if not re.fullmatch(r"[A-Za-z0-9_.-]{1,64}", self.admin_username) or not 12 <= len(self.admin_password) <= 128 or self.admin_password == "replace-with-a-long-random-password":
            raise ValueError("Задайте ADMIN_USERNAME и случайный ADMIN_PASSWORD (минимум 12 символов). Запуск: python -m backend.app.bootstrap --demo")
        if self.telegram_enabled and not (self.telegram_bot_token and self.telegram_chat_id):
            raise ValueError("Для Telegram необходимы TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID")
        if not 1 <= self.session_hours <= 168 or not 10 <= self.reminder_interval <= 3600:
            raise ValueError("Недопустимый срок сессии или интервал напоминаний")
        if not self.allowed_hosts or any(not re.fullmatch(r'[A-Za-z0-9.\-:\[\]]{1,253}',h) for h in self.allowed_hosts):
            raise ValueError('APP_ALLOWED_HOSTS должен содержать точные имена хостов/IP без портов и wildcard')
        if self.public_base_url:
            public=urlsplit(self.public_base_url)
            if public.scheme not in ('http','https') or not public.hostname or public.username or public.password or public.path not in ('','/') or public.query or public.fragment:
                raise ValueError('PUBLIC_BASE_URL должен быть корневым HTTP(S) адресом приложения')
            _=public.port
            if self.cookie_secure and public.scheme!='https':raise ValueError('COOKIE_SECURE требует HTTPS PUBLIC_BASE_URL')
        if self.smtp_security not in ("ssl", "starttls", "none") or not 1 <= self.smtp_port <= 65535:
            raise ValueError("Проверьте SMTP_SECURITY и SMTP_PORT")
        if self.smtp_enabled:
            if not self.smtp_host or not all(valid_email(x) for x in (self.smtp_from, self.smtp_to)):
                raise ValueError("Для SMTP нужны SMTP_HOST, SMTP_FROM и SMTP_TO (по одному email)")
            if bool(self.smtp_username) != bool(self.smtp_password):
                raise ValueError("Укажите оба SMTP_USERNAME и SMTP_PASSWORD")
            if self.smtp_security == "none" and self.smtp_host not in ("localhost", "127.0.0.1", "::1"):
                raise ValueError("Незашифрованный SMTP разрешён только на локальном тестовом сервере")
        if self.webhook_enabled:
            url = urlsplit(self.webhook_url)
            local_http = self.webhook_allow_localhost and url.scheme == "http" and url.hostname in ("localhost", "127.0.0.1", "::1")
            if not url.hostname or url.username or url.password or url.fragment or not (url.scheme == "https" or local_http):
                raise ValueError("Webhook требует HTTPS URL без логина и фрагмента")
            if len(self.webhook_secret) < 24:
                raise ValueError("WEBHOOK_SECRET должен содержать минимум 24 символа")

    @property
    def telegram_actors(self):
        if self.telegram_allowed_user_ids:
            return self.telegram_allowed_user_ids
        if self.telegram_chat_id.isdigit() and int(self.telegram_chat_id) > 0:
            return (int(self.telegram_chat_id),)
        return ()

    @property
    def telegram_buttons(self):
        return self.telegram_enabled and self.telegram_buttons_enabled and bool(self.telegram_actors)

    @property
    def telegram_commands(self):
        return self.telegram_enabled and self.telegram_commands_enabled and bool(self.telegram_actors)

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
            telegram_buttons_enabled=os.getenv("TELEGRAM_BUTTONS_ENABLED", "true").lower() == "true",
            telegram_commands_enabled=os.getenv("TELEGRAM_COMMANDS_ENABLED", "true").lower() == "true",
            telegram_allowed_user_ids=tuple(int(x.strip()) for x in os.getenv("TELEGRAM_ALLOWED_USER_IDS", "").split(",") if x.strip()),
            smtp_enabled=os.getenv("SMTP_ENABLED", "false").lower() == "true",
            smtp_host=os.getenv("SMTP_HOST", ""), smtp_port=int(os.getenv("SMTP_PORT", "465")),
            smtp_security=os.getenv("SMTP_SECURITY", "ssl"), smtp_username=os.getenv("SMTP_USERNAME", ""),
            smtp_password=os.getenv("SMTP_PASSWORD", ""), smtp_from=os.getenv("SMTP_FROM", ""), smtp_to=os.getenv("SMTP_TO", ""),
            webhook_enabled=os.getenv("WEBHOOK_ENABLED", "false").lower() == "true",
            webhook_url=os.getenv("WEBHOOK_URL", ""), webhook_secret=os.getenv("WEBHOOK_SECRET", ""),
            webhook_allow_localhost=os.getenv("WEBHOOK_ALLOW_LOCALHOST", "false").lower() == "true",
            in_app_enabled=os.getenv("IN_APP_ENABLED", "true").lower() == "true",
            allowed_hosts=tuple(h.strip().lower() for h in os.getenv('APP_ALLOWED_HOSTS','127.0.0.1,localhost,::1').split(',') if h.strip()),
            public_base_url=os.getenv('PUBLIC_BASE_URL','').rstrip('/'),
        )


def valid_email(value):
    return bool(re.fullmatch(r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}", value)) and len(value) <= 254
