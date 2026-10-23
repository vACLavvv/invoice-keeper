"""Persistent outbox. Ambiguous delivery is never automatically retried."""
from datetime import timedelta
import logging
import threading
import time

import httpx

from .domain import local_today, materialize, money, timestamp

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
            response = httpx.post(
                f"https://api.telegram.org/bot{self.settings.telegram_bot_token}/sendMessage",
                json={"chat_id": self.settings.telegram_chat_id, "text": text},
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

    def tick(self):
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
                    row = conn.execute("""SELECT m.occurrence_id,o.*,r.title FROM reminders m
                        JOIN payment_occurrences o ON o.id=m.occurrence_id JOIN recurring_payments r ON r.id=o.recurring_payment_id
                        WHERE m.state='pending' AND m.retry_after<=? AND r.active=1 AND o.paid_at IS NULL
                        ORDER BY o.due_date,o.id LIMIT 1""", (int(time.time()),)).fetchone()
                    if not row:
                        break
                    occurrence_id = row["occurrence_id"]
                    conn.execute("UPDATE reminders SET state='sending',attempts=attempts+1,attempted_at=? WHERE occurrence_id=?", (int(time.time()), occurrence_id))
                # The committed claim survives process death. The second transaction serializes
                # sending against payment/deletion and against other worker processes.
                with self.db.connect(write=True) as conn:
                    current = conn.execute("SELECT o.paid_at,r.active FROM payment_occurrences o JOIN recurring_payments r ON r.id=o.recurring_payment_id WHERE o.id=?", (occurrence_id,)).fetchone()
                    if current["paid_at"] or not current["active"]:
                        conn.execute("UPDATE reminders SET state='cancelled' WHERE occurrence_id=?", (occurrence_id,))
                        continue
                    try:
                        state, error, message_id, retry_delay = self.sender(row)
                    except Exception:
                        state, error, message_id, retry_delay = "uncertain", "Ошибка отправки; автоматический повтор остановлен", None, 0
                    conn.execute("UPDATE reminders SET state=?,error=?,message_id=?,sent_at=?,retry_after=? WHERE occurrence_id=?",
                                 (state, error, message_id, timestamp() if state == "sent" else None, int(time.time()) + retry_delay, occurrence_id))
                    if state == "pending":
                        break
        finally:
            self.lock.release()

    def _run(self):
        while not self.stop_event.is_set():
            try:
                self.tick()
            except Exception:
                logger.error("Не удалось выполнить фоновую проверку платежей")
            self.stop_event.wait(self.settings.reminder_interval)

    def start(self):
        self.thread = threading.Thread(target=self._run, name="invoice-reminders", daemon=True)
        self.thread.start()

    def stop(self):
        self.stop_event.set()
        if self.thread:
            self.thread.join(timeout=10)
