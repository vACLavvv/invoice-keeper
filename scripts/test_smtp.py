"""Explicit, single SMTP test. Reads secrets locally and never changes .env."""
from dataclasses import replace
from pathlib import Path
import secrets
import sys

sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from backend.app.config import Settings
from backend.app.domain import local_today
from backend.app.notifications import EmailSender


def main():
    try:settings=replace(Settings.from_env(),smtp_enabled=True)
    except ValueError:
        raise SystemExit("Заполните SMTP_HOST, SMTP_FROM, SMTP_TO и данные авторизации в .env. Секреты не выводятся.")
    row={"id":0,"recurring_payment_id":0,"title":"Проверка подключения Invoice Keeper","amount_cents":100,"currency":"RUB","due_date":local_today(settings).isoformat(),"delivery_key":secrets.token_hex(16)}
    state,error,_,_=EmailSender(settings)(row)
    if state=="sent":print("SMTP принял тестовое письмо. Проверьте папки «Входящие» и «Спам» получателя. Настройки не изменены.")
    else:raise SystemExit(error or "SMTP не подтвердил отправку. Тест автоматически не повторяется.")


if __name__=="__main__":main()
