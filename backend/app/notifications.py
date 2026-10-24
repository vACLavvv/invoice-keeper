"""Independent persisted deliveries for SMTP, signed webhooks and in-app notices."""
from email.message import EmailMessage
from email.utils import formatdate
from html import escape
import hashlib
import hmac
import http.client
import ipaddress
import json
import logging
import secrets
import smtplib
import socket
import ssl
import threading
import time
from urllib.parse import urlsplit
import certifi

from .domain import local_today, money, timestamp


class EmailSender:
    def __init__(self, settings):
        self.settings=settings

    def __call__(self, row):
        s=self.settings
        domain=s.smtp_from.rsplit("@",1)[-1]
        message_id=f"<{row['delivery_key']}@{domain}>"
        message=EmailMessage()
        message["From"]=s.smtp_from
        message["To"]=s.smtp_to
        message["Subject"]="Напоминание об оплате: "+" ".join(row["title"].split())
        message["Date"]=formatdate(localtime=False,usegmt=True)
        message["Message-ID"]=message_id
        message["Auto-Submitted"]="auto-generated"
        amount=money(row["amount_cents"])
        if row["id"]==0:
            message.set_content("Invoice Keeper: тест подключения\n\nSMTP настроен: приложение может отправлять напоминания на этот адрес.\nЭто тестовое письмо; оплачивать ничего не нужно.")
            message.add_alternative("<!doctype html><html lang='ru'><body><h2>Invoice Keeper подключён</h2><p>SMTP настроен: приложение может отправлять напоминания на этот адрес.</p><p>Это тестовое письмо; оплачивать ничего не нужно.</p></body></html>",subtype="html")
        else:
            message.set_content(f"Invoice Keeper\n\n{row['title']}\nСумма: {amount} {row['currency']}\nСрок: {row['due_date']}\n\nОтметьте оплату в панели Invoice Keeper.\nЭто напоминание о платеже, не требование перевода денег.")
            message.add_alternative(f"<!doctype html><html lang='ru'><body><h2>Пора запланировать оплату</h2><p>{escape(row['title'])}</p><p><strong>{amount} {escape(row['currency'])}</strong></p><p>Срок: {escape(row['due_date'])}</p><p>Отметьте оплату в панели Invoice Keeper.</p></body></html>",subtype="html")
        client=None
        submitting=False
        try:
            context=ssl.create_default_context(cafile=certifi.where())
            if s.smtp_security=="ssl":
                client=smtplib.SMTP_SSL(s.smtp_host,s.smtp_port,timeout=8,context=context,local_hostname="invoice-keeper.local")
            else:
                client=smtplib.SMTP(s.smtp_host,s.smtp_port,timeout=8,local_hostname="invoice-keeper.local")
                client.ehlo()
                if s.smtp_security=="starttls":
                    client.starttls(context=context)
                    client.ehlo()
            if s.smtp_username:
                client.login(s.smtp_username,s.smtp_password)
            if client.sock:
                client.sock.settimeout(30)  # Allow the provider time to scan DATA; no DB lock is held.
            submitting=True
            refused=client.send_message(message,from_addr=s.smtp_from,to_addrs=[s.smtp_to])
            if refused:
                return "uncertain","SMTP не принял адрес получателя; проверьте настройки",None,0
            return "sent",None,message_id,0
        except smtplib.SMTPAuthenticationError:
            return "uncertain","SMTP: ошибка авторизации; проверьте пароль приложения",None,0
        except (smtplib.SMTPDataError,smtplib.SMTPSenderRefused,smtplib.SMTPConnectError) as error:
            retry=400<=error.smtp_code<500
            return ("pending" if retry else "uncertain"),f"SMTP отклонил запрос (код {error.smtp_code})",None,60 if retry else 0
        except smtplib.SMTPRecipientsRefused as error:
            retry=bool(error.recipients) and all(400<=v[0]<500 for v in error.recipients.values())
            return ("pending" if retry else "uncertain"),"SMTP отклонил адрес получателя",None,60 if retry else 0
        except (ssl.SSLError,smtplib.SMTPNotSupportedError):
            return "uncertain","SMTP: не удалось установить защищённое соединение",None,0
        except (OSError,smtplib.SMTPException):
            return ("uncertain" if submitting else "pending"),"SMTP: результат отправки неизвестен" if submitting else "SMTP: соединение не установлено",None,0 if submitting else 60
        finally:
            if client:
                # A QUIT failure after a successful DATA response must not turn acceptance into a retry.
                try:client.close()
                except OSError:pass


def public_destination(url, allow_localhost=False):
    parsed=urlsplit(url)
    local=allow_localhost and parsed.hostname in ("localhost","127.0.0.1","::1")
    if not parsed.hostname or parsed.username or parsed.password or parsed.fragment or not (parsed.scheme=="https" or (local and parsed.scheme=="http")):
        raise ValueError("Недопустимый адрес webhook")
    port=parsed.port or (443 if parsed.scheme=="https" else 80)
    addresses=socket.getaddrinfo(parsed.hostname,port,type=socket.SOCK_STREAM)
    if not addresses:
        raise OSError("No DNS records")
    for address in addresses:
        ip=ipaddress.ip_address(address[4][0])
        if not ip.is_global and not (local and ip.is_loopback):
            raise ValueError("Webhook не может обращаться к внутренним адресам")
    return parsed,addresses[0][4][0],port


class PinnedHTTPSConnection(http.client.HTTPSConnection):
    def __init__(self,host,ip,port):
        super().__init__(host,port,timeout=8,context=ssl.create_default_context(cafile=certifi.where()))
        self.destination_ip=ip

    def connect(self):
        # Resolve exactly once, connect to the validated IP, preserve TLS SNI and hostname verification.
        sock=socket.create_connection((self.destination_ip,self.port),self.timeout)
        try:self.sock=self._context.wrap_socket(sock,server_hostname=self.host)
        except BaseException:
            sock.close()
            raise


class WebhookSender:
    def __init__(self,settings):
        self.settings=settings

    def __call__(self,row):
        payload={"event":"payment.due","event_id":row["delivery_key"],"payment":{"occurrence_id":row["id"],"recurring_payment_id":row["recurring_payment_id"],"title":row["title"],"amount":money(row["amount_cents"]),"currency":row["currency"],"due_date":row["due_date"]}}
        body=json.dumps(payload,ensure_ascii=False,separators=(",",":")).encode()
        stamp=str(int(time.time()))
        signature=hmac.new(self.settings.webhook_secret.encode(),stamp.encode()+b"."+body,hashlib.sha256).hexdigest()
        connection=None
        submitting=False
        try:
            parsed,ip,port=public_destination(self.settings.webhook_url,self.settings.webhook_allow_localhost)
            if parsed.scheme=="https":
                connection=PinnedHTTPSConnection(parsed.hostname,ip,port)
            else:
                connection=http.client.HTTPConnection(ip,port,timeout=8)
            connection.connect()
            headers={"Content-Type":"application/json","User-Agent":"InvoiceKeeper/2.0","Idempotency-Key":row["delivery_key"],"X-Invoice-Timestamp":stamp,"X-Invoice-Signature":"sha256="+signature}
            submitting=True
            target=(parsed.path or "/")+("?"+parsed.query if parsed.query else "")
            connection.request("POST",target,body=body,headers=headers)
            response=connection.getresponse()
            status=response.status
            if 200<=status<300:
                return "sent",None,row["delivery_key"],0
            if status==429:
                value=response.getheader("Retry-After", "60")
                delay=min(3600,max(1,int(value))) if value.isdigit() else 60
                return "pending","Webhook ограничил частоту запросов",None,delay
            return "uncertain",f"Webhook вернул HTTP {status}; автоматический повтор остановлен",None,0
        except ValueError:
            return "uncertain","Небезопасный или некорректный адрес webhook",None,0
        except ssl.SSLError:
            return "uncertain","Не удалось проверить TLS-сертификат webhook",None,0
        except (OSError,http.client.HTTPException):
            return ("uncertain" if submitting else "pending"),"Неизвестен результат webhook" if submitting else "Не удалось соединиться с webhook",None,0 if submitting else 60
        finally:
            if connection:connection.close()


class NotificationWorker:
    def __init__(self,db,settings,today=None):
        self.db,self.settings=db,settings
        self.today=today or (lambda:local_today(settings))
        self.lock=threading.Lock()
        self.senders={"email":EmailSender(settings),"webhook":WebhookSender(settings),"in_app":lambda row:("sent",None,row["delivery_key"],0)}

    def tick(self):
        if not self.lock.acquire(blocking=False):return
        try:
            from datetime import timedelta
            enabled={"email":self.settings.smtp_enabled,"webhook":self.settings.webhook_enabled,"in_app":self.settings.in_app_enabled}
            now=int(time.time())
            cutoff=(self.today()+timedelta(days=3)).isoformat()
            with self.db.connect(write=True) as conn:
                conn.execute("UPDATE notification_deliveries SET state='uncertain',error='Отправка прервана; автоматический повтор остановлен' WHERE state='sending' AND attempted_at<?",(now-300,))
                conn.execute("""UPDATE notification_deliveries SET state='cancelled' WHERE state='pending' AND occurrence_id IN
                    (SELECT o.id FROM payment_occurrences o JOIN recurring_payments r ON r.id=o.recurring_payment_id WHERE o.paid_at IS NOT NULL OR r.active=0)""")
                eligible=conn.execute("""SELECT o.id FROM payment_occurrences o JOIN recurring_payments r ON r.id=o.recurring_payment_id
                    WHERE r.active=1 AND o.paid_at IS NULL AND o.due_date<=?""",(cutoff,)).fetchall()
                for channel,on in enabled.items():
                    if not on:continue
                    for row in eligible:
                        conn.execute("INSERT OR IGNORE INTO notification_deliveries(occurrence_id,channel,state,delivery_key) VALUES(?,?,'pending',?)",(row["id"],channel,secrets.token_hex(16)))
                    conn.execute("""UPDATE notification_deliveries SET state='pending' WHERE channel=? AND state='cancelled' AND occurrence_id IN
                        (SELECT o.id FROM payment_occurrences o JOIN recurring_payments r ON r.id=o.recurring_payment_id WHERE r.active=1 AND o.paid_at IS NULL AND o.due_date<=?)""",(channel,cutoff))
            for channel,on in enabled.items():
                if not on:continue
                for _ in range(20):
                    with self.db.connect(write=True) as conn:
                        row=conn.execute("""SELECT n.id delivery_id,n.delivery_key,n.attempts,o.*,r.title FROM notification_deliveries n
                            JOIN payment_occurrences o ON o.id=n.occurrence_id JOIN recurring_payments r ON r.id=o.recurring_payment_id
                            WHERE n.channel=? AND n.state='pending' AND n.retry_after<=? AND r.active=1 AND o.paid_at IS NULL
                            ORDER BY o.due_date,o.id LIMIT 1""",(channel,int(time.time()))).fetchone()
                        if not row:break
                        conn.execute("UPDATE notification_deliveries SET state='sending',attempts=attempts+1,attempted_at=? WHERE id=?",(int(time.time()),row["delivery_id"]))
                    with self.db.connect(write=True) as conn:
                        current=conn.execute("SELECT o.paid_at,r.active FROM payment_occurrences o JOIN recurring_payments r ON r.id=o.recurring_payment_id WHERE o.id=?",(row["id"],)).fetchone()
                        if current["paid_at"] or not current["active"]:
                            conn.execute("UPDATE notification_deliveries SET state='cancelled' WHERE id=?",(row["delivery_id"],))
                            continue
                    try:state,error,message_id,delay=self.senders[channel](row)
                    except Exception:
                        logging.getLogger("invoice_keeper.delivery").exception("Неожиданная ошибка канала %s; период %s", channel, row["id"])
                        state,error,message_id,delay="uncertain","Ошибка канала; автоматический повтор остановлен",None,0
                    if state=="pending" and row["attempts"]>=7:
                        state,error,delay="uncertain","Исчерпаны безопасные повторы; проверьте канал",0
                    with self.db.connect(write=True) as conn:
                        conn.execute("UPDATE notification_deliveries SET state=?,error=?,message_id=?,sent_at=?,retry_after=? WHERE id=?",(state,error,message_id,timestamp() if state=="sent" else None,int(time.time())+delay,row["delivery_id"]))
                    logging.getLogger("invoice_keeper.delivery").log(logging.INFO if state=="sent" else logging.WARNING, "%s: период %s, состояние %s%s", channel, row["id"], state, ": "+error if error else "")
                    if state=="pending":break
        finally:self.lock.release()
