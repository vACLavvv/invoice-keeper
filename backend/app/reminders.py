"""Persistent outbox. Ambiguous delivery is never automatically retried."""
from datetime import timedelta
import logging
import threading
import time
import secrets

import httpx

from .domain import local_today, materialize, money, timestamp
from .notifications import NotificationWorker
from .telegram import keyboard

logger = logging.getLogger("invoice_keeper")


class TelegramSender:
    def __init__(self, settings):
        self.settings = settings

    def __call__(self, row):
        text = (
            f"🔔 Пора запланировать оплату\n\n{row['title']}\n"
            f"Сумма: {money(row['amount_cents'])} {row['currency']}\n"
            f"Срок: {row['due_date']}\n\nInvoice Keeper · отметьте оплату в панели"
        )
        try:
            payload={"chat_id": self.settings.telegram_chat_id, "text": text}
            token=dict(row).get("callback_token")
            if self.settings.telegram_buttons and token:
                payload["reply_markup"]=keyboard(self.settings,token)
            response = httpx.post(
                f"https://api.telegram.org/bot{self.settings.telegram_bot_token}/sendMessage",
                json=payload,
                timeout=8, follow_redirects=False,
            )
        except httpx.ConnectError:
            return "pending", "Соединение не установлено", None, 60
        except httpx.RequestError:
            return "uncertain", "Неизвестен результат отправки; автоматический повтор остановлен", None, 0
        try:
            result = response.json()
        except ValueError:
            return "uncertain", "Неоднозначный ответ Telegram", None, 0
        if response.status_code == 200 and result.get("ok") and result.get("result", {}).get("message_id"):
            return "sent", None, str(result["result"]["message_id"]), 0
        if response.status_code == 429 and not result.get("ok"):
            delay = max(1, int(result.get("parameters", {}).get("retry_after", 60)))
            return "pending", "Telegram ограничил частоту запросов", None, delay
        # Never persist the response or request URL: either can expose the bot token.
        return "uncertain", f"Telegram отклонил запрос (HTTP {response.status_code}); проверьте настройки", None, 0


class ReminderWorker:
    def __init__(self, db, settings, sender=None, today=None):
        self.db = db
        self.settings = settings
        self.sender = sender or TelegramSender(settings)
        self.today = today or (lambda: local_today(settings))
        self.lock = threading.Lock()
        self.stop_event = threading.Event()
        self.thread = None
        self.notifications=NotificationWorker(db,settings,today=self.today)

    def tick(self):
        self._tick_telegram()
        self.notifications.tick()

    def _tick_telegram(self):
        if not self.lock.acquire(blocking=False):
            return
        try:
            today = self.today()
            now = int(time.time())
            with self.db.connect(write=True) as conn:
                materialize(conn, today)
                conn.execute("DELETE FROM sessions WHERE expires_at<=?", (now,))
                conn.execute("DELETE FROM auth_attempts WHERE reset_at<=?", (now,))
                conn.execute("UPDATE reminders SET state='uncertain',error='Отправка прервана; автоматический повтор остановлен' WHERE state='sending' AND attempted_at<?", (now - 300,))
                conn.execute("""UPDATE reminders SET state='cancelled' WHERE state='pending' AND occurrence_id IN
                    (SELECT o.id FROM payment_occurrences o JOIN recurring_payments r ON r.id=o.recurring_payment_id WHERE o.paid_at IS NOT NULL OR r.active=0)""")
                if not self.settings.telegram_enabled:
                    return
                conn.execute("""INSERT OR IGNORE INTO reminders(occurrence_id,state)
                    SELECT o.id,'pending' FROM payment_occurrences o JOIN recurring_payments r ON r.id=o.recurring_payment_id
                    WHERE r.active=1 AND o.paid_at IS NULL AND o.due_date<=?""", ((today + timedelta(days=3)).isoformat(),))
                # Cancelling payment confirmation can make an unsent reminder eligible again.
                conn.execute("""UPDATE reminders SET state='pending' WHERE state='cancelled' AND occurrence_id IN
                    (SELECT o.id FROM payment_occurrences o JOIN recurring_payments r ON r.id=o.recurring_payment_id
                    WHERE r.active=1 AND o.paid_at IS NULL AND o.due_date<=?)""", ((today + timedelta(days=3)).isoformat(),))
            for _ in range(20):
                with self.db.connect(write=True) as conn:
                    row = conn.execute("""SELECT m.occurrence_id,m.callback_token,o.*,r.title FROM reminders m
                        JOIN payment_occurrences o ON o.id=m.occurrence_id JOIN recurring_payments r ON r.id=o.recurring_payment_id
                        WHERE m.state='pending' AND m.retry_after<=? AND r.active=1 AND o.paid_at IS NULL
                        ORDER BY o.due_date,o.id LIMIT 1""", (int(time.time()),)).fetchone()
                    if not row:
                        break
                    occurrence_id = row["occurrence_id"]
                    token=row["callback_token"] or secrets.token_urlsafe(24)
                    row=dict(row)|{"callback_token":token}
                    conn.execute("UPDATE reminders SET callback_token=? WHERE occurrence_id=?",(token,occurrence_id))
                    conn.execute("UPDATE reminders SET state='sending',attempts=attempts+1,attempted_at=? WHERE occurrence_id=?", (int(time.time()), occurrence_id))
                # Claims survive crashes. Recheck before I/O, but do not keep the SQLite
                # writer lock while waiting for an external service.
                with self.db.connect(write=True) as conn:
                    current = conn.execute("SELECT o.paid_at,r.active FROM payment_occurrences o JOIN recurring_payments r ON r.id=o.recurring_payment_id WHERE o.id=?", (occurrence_id,)).fetchone()
                    if current["paid_at"] or not current["active"]:
                        conn.execute("UPDATE reminders SET state='cancelled' WHERE occurrence_id=?", (occurrence_id,))
                        continue
                try:
                    state, error, message_id, retry_delay = self.sender(row)
                except Exception:
                    logger.exception("Неожиданная ошибка отправки Telegram; период %s", occurrence_id)
                    state, error, message_id, retry_delay = "uncertain", "Ошибка отправки; автоматический повтор остановлен", None, 0
                with self.db.connect(write=True) as conn:
                    conn.execute("UPDATE reminders SET state=?,error=?,message_id=?,sent_at=?,retry_after=? WHERE occurrence_id=?",
                                 (state, error, message_id, timestamp() if state == "sent" else None, int(time.time()) + retry_delay, occurrence_id))
                    if state=="sent" and self.settings.telegram_buttons:
                        conn.execute("UPDATE reminders SET button_version=1 WHERE occurrence_id=?",(occurrence_id,))
                logger.log(logging.INFO if state == "sent" else logging.WARNING, "Telegram: период %s, состояние %s%s", occurrence_id, state, ": "+error if error else "")
                if state == "pending":
                    break
        finally:
            self.lock.release()

    def _run(self):
        while not self.stop_event.is_set():
            try:
                self.tick()
            except Exception:
                logger.exception("Не удалось выполнить фоновую проверку платежей")
            self.stop_event.wait(self.settings.reminder_interval)

    def start(self):
        logger.info("Фоновая проверка платежей запущена; интервал %s с", self.settings.reminder_interval)
        self.thread = threading.Thread(target=self._run, name="invoice-reminders", daemon=True)
        self.thread.start()

    def stop(self):
        self.stop_event.set()
        if self.thread:
            self.thread.join(timeout=10)
