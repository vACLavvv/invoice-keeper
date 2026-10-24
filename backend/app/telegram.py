"""Telegram payment buttons: opaque tokens, chat + actor binding, durable update offsets."""
import json
import logging
import secrets
import threading

import httpx

from .domain import audit, local_today, timestamp
from .telegram_commands import TelegramCommands

logger=logging.getLogger("invoice_keeper")


def keyboard(settings,token):
    if not settings.telegram_buttons or not token:return {"inline_keyboard":[]}
    return {"inline_keyboard":[[{"text":"✅ Оплачено","callback_data":"paid:"+token}]]}


class TelegramBotWorker:
    def __init__(self,db,settings,today=None,api=None):
        self.db,self.settings=db,settings
        self.today=today or (lambda:local_today(settings))
        self.api=api or self._api
        self.stop_event=threading.Event()
        self.thread=None
        self.sync_count=0
        self.commands=TelegramCommands(self)

    def _api(self,method,payload):
        try:
            response=httpx.post(f"https://api.telegram.org/bot{self.settings.telegram_bot_token}/{method}",json=payload,timeout=12,follow_redirects=False)
            result=response.json()
            return result if isinstance(result,dict) else {"ok":False}
        except (httpx.RequestError,ValueError):
            logger.warning("Telegram: сетевая ошибка или некорректный ответ; метод %s", method)
            return {"ok":False}

    def sync_buttons(self):
        if not self.settings.telegram_buttons:return
        with self.db.connect() as conn:
            rows=conn.execute("""SELECT m.occurrence_id,m.message_id,m.callback_token,m.button_version,o.paid_at,r.active FROM reminders m
                JOIN payment_occurrences o ON o.id=m.occurrence_id JOIN recurring_payments r ON r.id=o.recurring_payment_id
                WHERE m.state='sent' ORDER BY o.due_date DESC LIMIT 100""").fetchall()
        for row in rows:
            if self.stop_event.is_set():break
            desired=2 if row["paid_at"] or not row["active"] else 1
            if row["button_version"]==desired:continue
            token=row["callback_token"] or secrets.token_urlsafe(24)
            with self.db.connect(write=True) as conn:
                conn.execute("UPDATE reminders SET callback_token=COALESCE(callback_token,?) WHERE occurrence_id=?",(token,row["occurrence_id"]))
                token=conn.execute("SELECT callback_token FROM reminders WHERE occurrence_id=?",(row["occurrence_id"],)).fetchone()[0]
            result=self.api("editMessageReplyMarkup",{"chat_id":self.settings.telegram_chat_id,"message_id":row["message_id"],"reply_markup":keyboard(self.settings,token) if desired==1 else {"inline_keyboard":[]}})
            # Editing markup is idempotent. Telegram's 400 "not modified" can happen after a crash.
            no_change=result.get("error_code")==400 and "message is not modified" in str(result.get("description","")).lower()
            if result.get("ok") or no_change:
                with self.db.connect(write=True) as conn:
                    # A concurrent payment change can invalidate this result; leave it for the next sync.
                    current=conn.execute("SELECT o.paid_at,r.active FROM payment_occurrences o JOIN recurring_payments r ON r.id=o.recurring_payment_id WHERE o.id=?",(row["occurrence_id"],)).fetchone()
                    current_desired=2 if current["paid_at"] or not current["active"] else 1
                    if current_desired==desired:conn.execute("UPDATE reminders SET button_version=? WHERE occurrence_id=?",(desired,row["occurrence_id"]))

    def handle_update(self,update):
        if not isinstance(update,dict):return
        query=update.get("callback_query")
        if 'message' in update or (isinstance(query,dict) and isinstance(query.get('data'),str) and query['data'].startswith('ui:')):
            return self.commands.handle(update)
        if not isinstance(query,dict):return
        update_id=update.get("update_id")
        if type(update_id) is not int or not 0 <= update_id < 2**53:return
        message=query.get("message") or {}
        actor=query.get("from") or {}
        if not isinstance(message,dict) or not isinstance(actor,dict) or not isinstance(message.get('chat'),dict):return
        if actor.get('is_bot') or type(actor.get('id')) is not int or type(message['chat'].get('id')) is not int:return
        data=query.get("data","")
        chat=(message.get("chat") or {}).get("id")
        response="Кнопка недоступна"
        paid=False
        occurrence_id=None
        with self.db.connect(write=True) as conn:
            previous=conn.execute("SELECT response_text FROM telegram_callbacks WHERE update_id=?",(update_id,)).fetchone()
            if previous:response=previous[0]
            else:
                allowed=self.settings.telegram_buttons and str(chat)==self.settings.telegram_chat_id and actor.get("id") in self.settings.telegram_actors
                if not allowed:
                    response="Нет доступа к оплате через этого бота"
                    audit(conn,"telegram:"+str(actor.get("id","unknown")),"authorization.denied","telegram.callback")
                elif not isinstance(data,str) or not data.startswith("paid:") or len(data)>64:
                    response="Некорректная кнопка"
                else:
                    row=conn.execute("""SELECT m.occurrence_id,m.message_id,m.state,o.paid_at,o.due_date,r.active,r.title FROM reminders m
                        JOIN payment_occurrences o ON o.id=m.occurrence_id JOIN recurring_payments r ON r.id=o.recurring_payment_id
                        WHERE m.callback_token=?""",(data[5:],)).fetchone()
                    if not row or row["state"]!="sent" or str(message.get("message_id"))!=str(row["message_id"]):
                        response="Кнопка устарела или относится к другому сообщению"
                    elif not row["active"]:response="Платёж в архиве; историю можно изменить в панели"
                    else:
                        occurrence_id=row["occurrence_id"]
                        if row["paid_at"]:response="Этот период уже оплачен"
                        else:
                            paid_at=self.today().isoformat()
                            name="telegram:"+str(actor["id"])
                            conn.execute("UPDATE payment_occurrences SET paid_at=?,updated_by=?,updated_at=? WHERE id=?",(paid_at,name,timestamp(),occurrence_id))
                            conn.execute("UPDATE reminders SET button_version=0 WHERE occurrence_id=?",(occurrence_id,))
                            audit(conn,name,"occurrence.paid",occurrence_id,{"source":"telegram","old_paid_at":None,"paid_at":paid_at,"title":row["title"],"due_date":row["due_date"]})
                            paid=True
                            response="Оплата отмечена: "+paid_at
                conn.execute("INSERT INTO telegram_callbacks(update_id,response_text,handled_at) VALUES(?,?,?)",(update_id,response,timestamp()))
        self.api("answerCallbackQuery",{"callback_query_id":query.get("id"),"text":response,"show_alert":not (paid or occurrence_id)})
        if occurrence_id:
            result=self.api("editMessageReplyMarkup",{"chat_id":self.settings.telegram_chat_id,"message_id":message.get("message_id"),"reply_markup":{"inline_keyboard":[]}})
            if result.get("ok"):
                with self.db.connect(write=True) as conn:
                    conn.execute("UPDATE reminders SET button_version=2 WHERE occurrence_id=? AND EXISTS(SELECT 1 FROM payment_occurrences WHERE id=? AND paid_at IS NOT NULL)",(occurrence_id,occurrence_id))

    def poll_once(self):
        with self.db.connect() as conn:
            row=conn.execute("SELECT value FROM app_meta WHERE key='telegram_offset'").fetchone()
            offset=int(row[0]) if row else 0
        result=self.api("getUpdates",{"offset":offset,"timeout":5,"limit":100,"allowed_updates":["message","callback_query"] if self.settings.telegram_commands else ["callback_query"]})
        if not result.get("ok"):return False
        updates=result.get("result",[])
        if not isinstance(updates,list):return False
        for update in updates:
            if self.stop_event.is_set():break
            self.handle_update(update)
            if isinstance(update,dict) and type(update.get("update_id")) is int:
                with self.db.connect(write=True) as conn:
                    conn.execute("INSERT INTO app_meta(key,value) VALUES('telegram_offset',?) ON CONFLICT(key) DO UPDATE SET value=MAX(CAST(value AS INTEGER),CAST(excluded.value AS INTEGER))",(str(update["update_id"]+1),))
        return True

    def _run(self):
        info=self.api("getWebhookInfo",{})
        if not info.get("ok"):
            logger.warning("Telegram: проверка обработчика кнопок не удалась")
        elif info.get("result",{}).get("url"):
            logger.warning("Telegram: уже установлен webhook; polling не запущен, webhook не изменён")
            return
        self.commands.configure()
        while not self.stop_event.is_set():
            try:
                if self.sync_count%6==0:self.sync_buttons()
                self.sync_count+=1
                ok=self.poll_once()
                self.stop_event.wait(1 if ok else 10)
            except Exception:
                logger.exception("Telegram: ошибка обработки обновления")
                self.stop_event.wait(10)

    def start(self):
        if not (self.settings.telegram_buttons or self.settings.telegram_commands):return
        self.thread=threading.Thread(target=self._run,name="telegram-bot",daemon=True)
        self.thread.start()

    def stop(self):
        self.stop_event.set()
        if self.thread:self.thread.join(timeout=14)
