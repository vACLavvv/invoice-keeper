from datetime import date, timedelta
from pathlib import Path
from urllib.parse import quote, urlsplit
import json
import logging
import re
import secrets

from fastapi import BackgroundTasks, Depends, File, HTTPException, Query, Request, Response, UploadFile
from pydantic import BaseModel, ConfigDict, Field, field_validator

from .domain import OCCURRENCES, audit, materialize, monthly_date, occurrence, timestamp
from .planning import planned_items, totals


class LinkCreate(BaseModel):
    model_config=ConfigDict(extra="forbid",str_strip_whitespace=True)
    title:str=Field(min_length=1,max_length=180)
    url:str=Field(min_length=8,max_length=2048)

    @field_validator("url")
    @classmethod
    def safe_url(cls,value):
        parsed=urlsplit(value)
        if parsed.scheme not in ("http","https") or not parsed.hostname or parsed.username or parsed.password or re.search(r"[\x00-\x20\x7f]",value):
            raise ValueError("Нужна HTTP(S) ссылка без логина и управляющих символов")
        return value


class ReadPatch(BaseModel):
    model_config=ConfigDict(extra="forbid")
    read:bool=True


class EnsureOccurrence(BaseModel):
    model_config=ConfigDict(extra="forbid")
    due_date:date


def register_extras(app,db,settings,today,worker):
    from .main import admin_user,admin_write,current_user,write_user

    def require_occurrence(conn,occurrence_id):
        row=conn.execute(OCCURRENCES+" WHERE o.id=?",(occurrence_id,)).fetchone()
        if not row:raise HTTPException(404,"Период оплаты не найден")
        return row

    def public_attachment(row):
        return {"id":row["id"],"occurrence_id":row["occurrence_id"],"kind":row["kind"],"name":row["name"],"content_type":row["content_type"],
                "url":row["url"],"size":row["size"],"created_by":row["created_by"],"created_at":row["created_at"],
                "download_url":f"/api/v1/attachments/{row['id']}/download" if row["kind"]=="file" else None}

    @app.get("/api/v1/calendar",tags=["Календарь и бюджет"],summary="Платежи и итоги по датам и валютам; будущие даты прогнозируются без записи в БД")
    def calendar(from_date:date,to_date:date,include_archived:bool=True,user=Depends(current_user)):
        if to_date<from_date or (to_date-from_date).days>62:
            raise HTTPException(422,"Выберите период не длиннее 63 дней")
        if from_date.year<2000 or to_date.year>2100:raise HTTPException(422,"Годы календаря: 2000–2100")
        with db.connect() as conn:items=planned_items(conn,from_date,to_date,today(),include_archived)
        days=[]
        day=from_date
        while day<=to_date:
            daily=[x for x in items if x["due_date"]==day.isoformat()]
            days.append({"date":day.isoformat(),"currencies":totals(daily),"items":daily})
            day+=timedelta(days=1)
        return {"from_date":from_date,"to_date":to_date,"days":days,"currencies":totals(items)}

    @app.get("/api/v1/payments/budget",tags=["Календарь и бюджет"],summary="Плановые расходы на месяц или год; суммы по валютам")
    def budget(year:int=Query(ge=2000,le=2100),month:int|None=Query(default=None,ge=1,le=12),include_archived:bool=False,user=Depends(current_user)):
        start=date(year,month or 1,1)
        end=monthly_date(start,1 if month else 12)-timedelta(days=1)
        with db.connect() as conn:items=planned_items(conn,start,end,today(),include_archived)
        periods=[]
        for m in ([month] if month else range(1,13)):
            key=f"{year}-{m:02}"
            periods.append({"month":key,"currencies":totals([x for x in items if x["due_date"].startswith(key)])})
        return {"year":year,"month":month,"include_archived":include_archived,"from_date":start,"to_date":end,"currencies":totals(items),"months":periods,"projection_count":sum(x["is_projection"] for x in items)}

    @app.post("/api/v1/recurring-payments/{payment_id}/occurrences",tags=["Календарь и бюджет"],summary="Создать конкретный будущий период из прогноза существующего активного платежа")
    def ensure_occurrence(payment_id:int,payload:EnsureOccurrence,background:BackgroundTasks,user=Depends(write_user)):
        if not 2000<=payload.due_date.year<=2100:raise HTTPException(422,"Год должен быть в пределах 2000–2100")
        with db.connect(write=True) as conn:
            row=conn.execute("SELECT * FROM recurring_payments WHERE id=? AND active=1",(payment_id,)).fetchone()
            if not row:raise HTTPException(404,"Активный регулярный платёж не найден")
            first=date.fromisoformat(row["first_due_date"])
            index=(payload.due_date.year-first.year)*12+payload.due_date.month-first.month
            if (row["frequency"]=="once" and payload.due_date!=first) or index<0 or monthly_date(first,index,row["anchor_day"])!=payload.due_date:raise HTTPException(422,"Дата не соответствует периодичности платежа")
            due=payload.due_date.isoformat()
            cursor=conn.execute("INSERT OR IGNORE INTO payment_occurrences(recurring_payment_id,due_date,amount_cents,currency) VALUES(?,?,?,?)",(payment_id,due,row["amount_cents"],row["currency"]))
            if cursor.rowcount:audit(conn,user["username"],"occurrence.create",payment_id,{"due_date":due,"source":"calendar"})
            result=conn.execute(OCCURRENCES+" WHERE o.recurring_payment_id=? AND o.due_date=?",(payment_id,due)).fetchone()
        background.add_task(worker.tick)
        return occurrence(result,today())

    @app.get("/api/v1/payment-occurrences/{occurrence_id}/attachments",tags=["Чеки и ссылки"],summary="Чеки и ссылки конкретного периода")
    def attachments(occurrence_id:int,user=Depends(current_user)):
        with db.connect() as conn:
            require_occurrence(conn,occurrence_id)
            return [public_attachment(r) for r in conn.execute("SELECT id,occurrence_id,kind,name,content_type,url,size,created_by,created_at FROM attachments WHERE occurrence_id=? ORDER BY id DESC",(occurrence_id,))]

    def check_attachment_limit(conn,occurrence_id):
        require_occurrence(conn,occurrence_id)
        if conn.execute("SELECT COUNT(*) FROM attachments WHERE occurrence_id=?",(occurrence_id,)).fetchone()[0]>=10:
            raise HTTPException(409,"У периода уже 10 вложений. Удалите ненужное перед добавлением")

    @app.post("/api/v1/payment-occurrences/{occurrence_id}/attachment-links",tags=["Чеки и ссылки"],status_code=201,summary="Прикрепить ссылку к конкретному периоду")
    def add_link(occurrence_id:int,payload:LinkCreate,user=Depends(write_user)):
        with db.connect(write=True) as conn:
            check_attachment_limit(conn,occurrence_id)
            cursor=conn.execute("INSERT INTO attachments(occurrence_id,kind,name,url,created_by,created_at) VALUES(?,'link',?,?,?,?)",(occurrence_id,payload.title,payload.url,user["username"],timestamp()))
            audit(conn,user["username"],"attachment.create",occurrence_id,{"kind":"link","attachment_id":cursor.lastrowid,"name":payload.title})
            return public_attachment(conn.execute("SELECT * FROM attachments WHERE id=?",(cursor.lastrowid,)).fetchone())

    @app.post("/api/v1/payment-occurrences/{occurrence_id}/attachments",tags=["Чеки и ссылки"],status_code=201,summary="Загрузить чек PDF/PNG/JPEG/WebP размером до 5 MiB")
    async def upload(occurrence_id:int,file:UploadFile=File(...),user=Depends(write_user)):
        try:data=await file.read(settings.max_attachment_bytes+1)
        finally:await file.close()
        if not data or len(data)>settings.max_attachment_bytes:raise HTTPException(413,"Размер чека должен быть от 1 байта до 5 MiB")
        types=[(data.startswith(b"%PDF-"),"application/pdf"),(data.startswith(b"\x89PNG\r\n\x1a\n"),"image/png"),(data.startswith(b"\xff\xd8\xff"),"image/jpeg"),(data.startswith(b"RIFF") and data[8:12]==b"WEBP","image/webp")]
        content_type=next((kind for matches,kind in types if matches),None)
        if not content_type:raise HTTPException(415,"Разрешены только PDF, PNG, JPEG и WebP; тип проверяется по содержимому")
        name=Path((file.filename or "receipt").replace("\\","/")).name
        name=re.sub(r"[\x00-\x1f\x7f]","",name).strip()[:180] or "receipt"
        with db.connect(write=True) as conn:
            check_attachment_limit(conn,occurrence_id)
            cursor=conn.execute("INSERT INTO attachments(occurrence_id,kind,name,content_type,data,size,created_by,created_at) VALUES(?,'file',?,?,?,?,?,?)",(occurrence_id,name,content_type,data,len(data),user["username"],timestamp()))
            audit(conn,user["username"],"attachment.create",occurrence_id,{"kind":"file","name":name,"size":len(data),"attachment_id":cursor.lastrowid})
            return public_attachment(conn.execute("SELECT * FROM attachments WHERE id=?",(cursor.lastrowid,)).fetchone())

    @app.get("/api/v1/attachments/{attachment_id}/download",tags=["Чеки и ссылки"],summary="Скачать чек; авторизация обязательна")
    def download(attachment_id:int,user=Depends(current_user)):
        with db.connect() as conn:row=conn.execute("SELECT * FROM attachments WHERE id=? AND kind='file'",(attachment_id,)).fetchone()
        if not row:raise HTTPException(404,"Чек не найден")
        return Response(content=row["data"],media_type=row["content_type"],headers={"Content-Disposition":"attachment; filename*=UTF-8''"+quote(row["name"],safe="")})

    @app.delete("/api/v1/attachments/{attachment_id}",tags=["Чеки и ссылки"],status_code=204,summary="Удалить вложение; операция записывается в журнал")
    def delete_attachment(attachment_id:int,user=Depends(write_user)):
        with db.connect(write=True) as conn:
            row=conn.execute("SELECT * FROM attachments WHERE id=?",(attachment_id,)).fetchone()
            if not row:raise HTTPException(404,"Вложение не найдено")
            conn.execute("DELETE FROM attachments WHERE id=?",(attachment_id,))
            audit(conn,user["username"],"attachment.delete",row["occurrence_id"],{"attachment_id":attachment_id,"name":row["name"]})
        return Response(status_code=204)

    def reader(user):return "admin" if user["role"]=="admin" else f"user:{user['id']}"

    @app.get("/api/v1/notifications",tags=["Уведомления"],summary="Уведомления в панели с персональными отметками прочтения")
    def notifications(limit:int=Query(default=100,ge=1,le=200),user=Depends(current_user)):
        with db.connect() as conn:
            rows=conn.execute("""SELECT n.id,n.sent_at,n.occurrence_id,o.due_date,o.amount_cents,o.currency,o.paid_at,r.title,r.active,
                EXISTS(SELECT 1 FROM notification_reads nr WHERE nr.delivery_id=n.id AND nr.reader=?) is_read
                FROM notification_deliveries n JOIN payment_occurrences o ON o.id=n.occurrence_id JOIN recurring_payments r ON r.id=o.recurring_payment_id
                WHERE n.channel='in_app' AND n.state='sent' ORDER BY n.id DESC LIMIT ?""",(reader(user),limit)).fetchall()
            unread=conn.execute("""SELECT COUNT(*) FROM notification_deliveries n WHERE n.channel='in_app' AND n.state='sent'
                AND NOT EXISTS(SELECT 1 FROM notification_reads nr WHERE nr.delivery_id=n.id AND nr.reader=?)""",(reader(user),)).fetchone()[0]
        from .domain import money
        return {"unread_count":unread,"items":[{"id":r["id"],"occurrence_id":r["occurrence_id"],"title":r["title"],"due_date":r["due_date"],"amount":money(r["amount_cents"]),"currency":r["currency"],"paid_at":r["paid_at"],"active":bool(r["active"]),"read":bool(r["is_read"]),"created_at":r["sent_at"]} for r in rows]}

    @app.post("/api/v1/notifications/read-all",tags=["Уведомления"],summary="Отметить все уведомления прочитанными только для своей учётной записи")
    def read_all(user=Depends(write_user)):
        with db.connect(write=True) as conn:
            conn.execute("INSERT OR IGNORE INTO notification_reads(delivery_id,reader,read_at) SELECT id,?,? FROM notification_deliveries WHERE channel='in_app' AND state='sent'",(reader(user),timestamp()))
        return {"ok":True}

    @app.patch("/api/v1/notifications/{notification_id}",tags=["Уведомления"],summary="Изменить личную отметку прочтения")
    def mark_read(notification_id:int,payload:ReadPatch,user=Depends(write_user)):
        with db.connect(write=True) as conn:
            if not conn.execute("SELECT id FROM notification_deliveries WHERE id=? AND channel='in_app' AND state='sent'",(notification_id,)).fetchone():raise HTTPException(404,"Уведомление не найдено")
            if payload.read:conn.execute("INSERT OR IGNORE INTO notification_reads(delivery_id,reader,read_at) VALUES(?,?,?)",(notification_id,reader(user),timestamp()))
            else:conn.execute("DELETE FROM notification_reads WHERE delivery_id=? AND reader=?",(notification_id,reader(user)))
        return {"id":notification_id,"read":payload.read}

    @app.get("/api/v1/deliveries",tags=["Уведомления"],summary="Журнал всех дополнительных каналов; только администратор")
    def deliveries(user=Depends(admin_user)):
        with db.connect() as conn:
            return [dict(r) for r in conn.execute("""SELECT n.id,n.occurrence_id,n.channel,n.state,n.attempts,n.sent_at,n.error,n.message_id,r.title,o.due_date
                FROM notification_deliveries n JOIN payment_occurrences o ON o.id=n.occurrence_id JOIN recurring_payments r ON r.id=o.recurring_payment_id ORDER BY n.id DESC LIMIT 150""")]

    @app.get("/api/v1/integrations",tags=["Уведомления"],summary="Настройки каналов без секретов; только администратор")
    def integrations(user=Depends(admin_user)):
        return {"telegram":{"enabled":settings.telegram_enabled,"buttons_enabled":settings.telegram_buttons,"commands_enabled":settings.telegram_commands,"actor_count":len(settings.telegram_actors)},
                "email":{"enabled":settings.smtp_enabled,"host":settings.smtp_host,"port":settings.smtp_port,"security":settings.smtp_security,"sender":settings.smtp_from,"recipient":settings.smtp_to,"password_configured":bool(settings.smtp_password)},
                "webhook":{"enabled":settings.webhook_enabled,"host":urlsplit(settings.webhook_url).hostname,"secret_configured":bool(settings.webhook_secret)},
                "in_app":{"enabled":settings.in_app_enabled},"browser":{"enabled":"opt_in"}}

    @app.post("/api/v1/integrations/{channel}/test",tags=["Уведомления"],summary="Отправить одно тестовое уведомление через настроенный email или webhook")
    def test_channel(channel:str,user=Depends(admin_write)):
        if channel not in ("email","webhook"):raise HTTPException(404,"Неизвестный тестовый канал")
        if not (settings.smtp_enabled if channel=="email" else settings.webhook_enabled):raise HTTPException(409,"Сначала настройте и включите канал в .env, затем перезапустите приложение")
        row={"id":0,"recurring_payment_id":0,"title":"Тест подключения Invoice Keeper","amount_cents":100,"currency":"RUB","due_date":today().isoformat(),"delivery_key":secrets.token_hex(16)}
        state,error,message_id,delay=worker.notifications.senders[channel](row)
        with db.connect(write=True) as conn:audit(conn,user["username"],"notification.test",channel,{"state":state})
        logging.getLogger("invoice_keeper.delivery").log(logging.INFO if state=="sent" else logging.WARNING,"Проверка канала %s: %s%s",channel,state,": "+error if error else "")
        return {"channel":channel,"state":state,"error":error,"message_id":message_id}
