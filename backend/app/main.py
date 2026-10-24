from contextlib import asynccontextmanager
from datetime import date, timedelta
from decimal import Decimal
from typing import Annotated, Literal
from urllib.parse import urlsplit
import hmac
import logging
import secrets
import sqlite3
import time
import re

from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Path, Query, Request, Response, Security
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.security import APIKeyCookie
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, field_validator, model_validator

from .config import FRONTEND_ROOT, Settings
from .db import Database
from .domain import OCCURRENCES, audit, local_today, materialize, money, occurrence, timestamp
from .reminders import ReminderWorker
from .security import digest, hash_password, verify_password, needs_rehash
from .http_security import RequestBoundary, origin_allowed
from .schemas import CurrentUser, RegularUser, RecurringCreated, RecurringPayment, PaymentOccurrence, PaymentSummary, AuditPage
from .schemas import SystemLogPage
from .service_logs import ServiceLogs, RequestLogMiddleware, ID_PATTERN
from .logging_security import install_secret_filters
from .audit import audit_item, read_audit_page
from .extras import register_extras
from .telegram import TelegramBotWorker

COOKIE = "invoice_session"
cookie_auth = APIKeyCookie(name=COOKIE, auto_error=False)


class Payload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    @field_validator("*", mode="before")
    @classmethod
    def trim_text(cls, value, info: ValidationInfo):
        return value.strip() if isinstance(value, str) and info.field_name != "password" else value


class Login(Payload):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128,json_schema_extra={"format":"password","writeOnly":True})


class RecurringCreate(Payload):
    title: str = Field(min_length=1, max_length=120, examples=["Аренда офиса"])
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2, examples=["45000.00"])
    currency: Literal["RUB", "USD", "EUR"]
    first_due_date: date
    frequency: Literal["monthly"] = "monthly"

    @field_validator("first_due_date")
    @classmethod
    def valid_date(cls, value):
        if not date(2000, 1, 1) <= value <= date(2100, 12, 31):
            raise ValueError("Дата должна быть между 2000 и 2100 годами")
        return value


class OneTimeCreate(Payload):
    title: str = Field(min_length=1,max_length=120)
    amount: Decimal = Field(gt=0,max_digits=12,decimal_places=2)
    currency: Literal["RUB","USD","EUR"]
    due_date: date
    notes: str = Field(default="",max_length=1000)

    @field_validator("due_date")
    @classmethod
    def valid_date(cls,value):
        if not date(2000,1,1)<=value<=date(2100,12,31):raise ValueError("Дата должна быть между 2000 и 2100 годами")
        return value


class OccurrencePatch(Payload):
    paid: bool | None = None
    paid_at: date | None = None

    @model_validator(mode="after")
    def valid_patch(self):
        if not self.model_fields_set:
            raise ValueError("Укажите paid или paid_at")
        if "paid" in self.model_fields_set and self.paid is None:
            raise ValueError("paid должен быть true или false")
        if self.paid is False and self.paid_at is not None:
            raise ValueError("При отмене оплаты paid_at должна быть пустой")
        if self.paid is True and "paid_at" in self.model_fields_set and self.paid_at is None:
            raise ValueError("Для оплаты укажите фактическую дату")
        return self


class UserCreate(Payload):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9_.-]+$")
    display_name: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=12, max_length=128,json_schema_extra={"format":"password","writeOnly":True})


class UserPatch(Payload):
    username: str | None = Field(default=None, min_length=3, max_length=64, pattern=r"^[A-Za-z0-9_.-]+$")
    display_name: str | None = Field(default=None, min_length=1, max_length=80)
    password: str | None = Field(default=None, min_length=12, max_length=128,json_schema_extra={"format":"password","writeOnly":True})

    @model_validator(mode="after")
    def valid_patch(self):
        if not self.model_fields_set or any(getattr(self, x) is None for x in self.model_fields_set):
            raise ValueError("Укажите хотя бы одно непустое поле")
        return self


def origin_check(request):
    if not origin_allowed(request,request.app.state.settings):
        raise HTTPException(403,"Запрос с другого сайта запрещён")


def current_user(request: Request, token: str | None = Security(cookie_auth)):
    if not token or len(token) > 128:
        raise HTTPException(401, "Войдите в систему")
    with request.app.state.db.connect() as conn:
        session = conn.execute("SELECT * FROM sessions WHERE token_hash=? AND expires_at>?", (digest(token), int(time.time()))).fetchone()
        if not session:
            raise HTTPException(401, "Сессия завершена. Войдите снова")
        if session["is_admin"]:
            settings = request.app.state.settings
            fingerprint = digest(settings.admin_username + "\0" + settings.admin_password)
            if not hmac.compare_digest(session["admin_fingerprint"] or "", fingerprint):
                raise HTTPException(401, "Настройки администратора изменены. Войдите снова")
            user = {"id": 0, "username": settings.admin_username, "display_name": "Администратор", "role": "admin"}
        else:
            row = conn.execute("SELECT id,username,display_name FROM users WHERE id=?", (session["user_id"],)).fetchone()
            if not row:
                raise HTTPException(401, "Пользователь удалён")
            user = dict(row) | {"role": "user"}
        return user | {"csrf_token": session["csrf_token"]}


def write_user(request: Request, user=Depends(current_user), x_csrf_token: str | None = Header(default=None)):
    origin_check(request)
    if not x_csrf_token or len(x_csrf_token)>128 or not hmac.compare_digest(x_csrf_token.encode(), user["csrf_token"].encode()):
        raise HTTPException(403, "Необходим X-CSRF-Token из /api/v1/auth/me")
    return user


def admin_user(request: Request,user=Depends(current_user)):
    if user["role"] != "admin":
        with request.app.state.db.connect(write=True) as conn:
            audit(conn,user["username"],"authorization.denied",request.url.path)
        raise HTTPException(403, "Действие доступно только администратору")
    return user


def admin_write(request: Request,user=Depends(write_user)):
    return admin_user(request,user)


def create_app(settings: Settings | None = None, *, start_worker=True, today_provider=None, sender=None):
    settings = settings or Settings.from_env()
    install_secret_filters(settings)
    service_logs = ServiceLogs(settings.database_path.parent / "logs", (settings.admin_password, settings.smtp_password, settings.telegram_bot_token, settings.webhook_secret))
    db = Database(settings.database_path)
    today = today_provider or (lambda: local_today(settings))
    worker = ReminderWorker(db, settings, sender=sender, today=today)
    bot=TelegramBotWorker(db,settings,today=today)
    admin_hash = hash_password(settings.admin_password)

    @asynccontextmanager
    async def lifespan(app):
        service_logs.start()
        logger = logging.getLogger('invoice_keeper.service')
        try:
            db.initialize()
            with db.connect(write=True) as conn:
                materialize(conn, today())
            logger.info('Сервис Invoice Keeper запущен; версия 3.2.0')
            if start_worker:
                worker.start()
                bot.start()
            yield
        except Exception:
            logger.exception('Ошибка жизненного цикла сервиса')
            raise
        finally:
            bot.stop()
            worker.stop()
            logger.info('Сервис Invoice Keeper остановлен')
            service_logs.stop()

    app = FastAPI(title="Invoice Keeper API", version="3.2.0", docs_url=None, redoc_url=None, openapi_url=None,
                  description="Учёт регулярных и разовых платежей. Cookie-сессия; изменения требуют X-CSRF-Token из auth/me или auth/login. Суммы передаются десятичными строками. Даты — YYYY-MM-DD в часовом поясе приложения.", lifespan=lifespan)
    app.state.db, app.state.settings, app.state.worker = db, settings, worker
    app.state.bot=bot
    app.state.service_logs=service_logs
    app.mount("/assets", StaticFiles(directory=FRONTEND_ROOT / "assets"), name="assets")
    app.mount("/swagger-assets", StaticFiles(directory=FRONTEND_ROOT / "assets/vendor/swagger"), name="swagger-assets")

    def check_upload(request,token):
        user=current_user(request,token)
        return write_user(request,user,request.headers.get('X-CSRF-Token'))
    app.add_middleware(RequestBoundary,settings=settings,authenticate_upload=check_upload)
    app.add_middleware(RequestLogMiddleware)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        # Pydantic's default output echoes submitted values, including passwords.
        errors = [{"loc": list(e["loc"]), "msg": e["msg"], "type": e["type"]} for e in exc.errors()]
        return JSONResponse(status_code=422, content={"detail": errors})

    @app.get("/healthz", include_in_schema=False)
    def health():
        with db.connect() as conn:
            conn.execute("SELECT 1").fetchone()
        return {"status": "ok"}

    @app.get("/", include_in_schema=False)
    def index(request: Request):
        try:
            current_user(request, request.cookies.get(COOKIE))
        except HTTPException:
            return RedirectResponse("/login", status_code=303)
        return FileResponse(FRONTEND_ROOT / "pages/index.html")

    @app.get("/login", include_in_schema=False)
    def login_page():
        return FileResponse(FRONTEND_ROOT / "pages/login.html")

    @app.get("/api/v1/docs", include_in_schema=False)
    def docs(user=Depends(current_user)):
        return FileResponse(FRONTEND_ROOT / "pages/docs.html")

    @app.get("/api/v1/openapi.json", include_in_schema=False)
    def openapi(user=Depends(current_user)):
        return app.openapi()

    @app.post("/api/v1/auth/login", response_model=CurrentUser, tags=["Авторизация"], summary="Войти по логину и паролю")
    def login(payload: Login, request: Request, response: Response):
        origin_check(request)
        now = int(time.time())
        client = request.client.host if request.client else "unknown"
        # Both buckets prevent changing the username or IP from trivially bypassing a limit.
        keys = [digest("ip:" + client), digest("user:" + payload.username.casefold())]
        with db.connect(write=True) as conn:
            for key in keys:
                attempt = conn.execute("SELECT * FROM auth_attempts WHERE key=? AND reset_at>?", (key, now)).fetchone()
                if attempt and attempt["count"] >= 10:
                    raise HTTPException(429, "Слишком много попыток. Попробуйте через 5 минут", headers={"Retry-After": str(attempt["reset_at"] - now)})
            for key in keys:
                conn.execute("""INSERT INTO auth_attempts(key,count,reset_at) VALUES(?,1,?)
                    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset_at<=? THEN 1 ELSE count+1 END,
                    reset_at=CASE WHEN reset_at<=? THEN ? ELSE reset_at END""", (key, now + 300, now, now, now + 300))
            row = conn.execute("SELECT * FROM users WHERE username=? COLLATE NOCASE", (payload.username,)).fetchone()
        is_admin = payload.username.casefold() == settings.admin_username.casefold()
        encoded = admin_hash if is_admin or not row else row["password_hash"]
        valid = verify_password(payload.password, encoded) and (is_admin or row is not None)
        if not valid:
            with db.connect(write=True) as conn:audit(conn,payload.username,"login.failed","session")
            raise HTTPException(401, "Неверный логин или пароль")
        upgraded=hash_password(payload.password) if not is_admin and needs_rehash(encoded) else None
        token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        with db.connect(write=True) as conn:
            if not is_admin:
                current=conn.execute("SELECT * FROM users WHERE id=?",(row["id"],)).fetchone()
                if not current or current["username"].casefold()!=payload.username.casefold() or not hmac.compare_digest(current["password_hash"],encoded):
                    raise HTTPException(401,"Учётные данные изменились. Войдите снова")
                row=current
                if upgraded:conn.execute("UPDATE users SET password_hash=? WHERE id=?",(upgraded,row["id"]))
            conn.execute("DELETE FROM sessions WHERE expires_at<=?",(now,))
            previous=request.cookies.get(COOKIE)
            if previous:conn.execute("DELETE FROM sessions WHERE token_hash=?",(digest(previous),))
            conn.execute("DELETE FROM auth_attempts WHERE key=?", (keys[1],))
            # Successful sign-ins do not accumulate failures in the shared IP bucket.
            conn.execute("UPDATE auth_attempts SET count=MAX(0,count-1) WHERE key=?", (keys[0],))
            conn.execute("INSERT INTO sessions(token_hash,user_id,is_admin,admin_fingerprint,csrf_token,expires_at) VALUES(?,?,?,?,?,?)",
                         (digest(token), None if is_admin else row["id"], int(is_admin), digest(settings.admin_username + "\0" + settings.admin_password) if is_admin else None, csrf, now + settings.session_hours * 3600))
            if is_admin:
                conn.execute("DELETE FROM sessions WHERE token_hash IN (SELECT token_hash FROM sessions WHERE is_admin=1 ORDER BY expires_at DESC,rowid DESC LIMIT -1 OFFSET 10)")
            else:
                conn.execute("DELETE FROM sessions WHERE token_hash IN (SELECT token_hash FROM sessions WHERE user_id=? ORDER BY expires_at DESC,rowid DESC LIMIT -1 OFFSET 10)",(row["id"],))
            audit(conn, payload.username, "login", "session")
        response.set_cookie(COOKIE, token, max_age=settings.session_hours * 3600, httponly=True, secure=settings.cookie_secure, samesite="strict", path="/")
        return {"id": 0 if is_admin else row["id"], "username": settings.admin_username if is_admin else row["username"],
                "display_name": "Администратор" if is_admin else row["display_name"], "role": "admin" if is_admin else "user", "csrf_token": csrf}

    @app.get("/api/v1/auth/me", response_model=CurrentUser, tags=["Авторизация"], summary="Текущая учётная запись и CSRF-токен")
    def me(user=Depends(current_user)):
        return user

    @app.post("/api/v1/auth/logout", tags=["Авторизация"], status_code=204, summary="Завершить текущую сессию")
    def logout(request: Request, user=Depends(write_user)):
        with db.connect(write=True) as conn:
            conn.execute("DELETE FROM sessions WHERE token_hash=?", (digest(request.cookies[COOKIE]),))
            audit(conn,user["username"],"logout","session")
        response = Response(status_code=204)
        response.delete_cookie(COOKIE, path="/", secure=settings.cookie_secure, httponly=True, samesite="strict")
        return response

    @app.get("/api/v1/settings", tags=["Система"], summary="Часовой пояс, текущая дата и состояние Telegram")
    def app_settings(user=Depends(current_user)):
        return {"timezone": settings.timezone, "today": today().isoformat(), "telegram_enabled": settings.telegram_enabled,
                "telegram_buttons_enabled":settings.telegram_buttons,"telegram_commands_enabled":settings.telegram_commands,"email_enabled":settings.smtp_enabled,"webhook_enabled":settings.webhook_enabled,"in_app_enabled":settings.in_app_enabled,
                "reminder_days": 3, "reminder_interval_seconds": settings.reminder_interval}

    @app.get("/api/v1/recurring-payments", response_model=list[RecurringPayment], tags=["Регулярные платежи"], summary="Список регулярных платежей, включая архив")
    def recurring_list(user=Depends(current_user)):
        with db.connect(write=True) as conn:
            materialize(conn, today())
            rows = conn.execute("""SELECT r.*, (SELECT COUNT(*) FROM payment_occurrences o WHERE o.recurring_payment_id=r.id AND o.paid_at IS NULL) unpaid_count
                FROM recurring_payments r WHERE r.frequency='monthly' ORDER BY r.active DESC,r.id DESC""").fetchall()
            return [{"id": r["id"], "title": r["title"], "amount": money(r["amount_cents"]), "currency": r["currency"],
                     "first_due_date": r["first_due_date"], "anchor_day": r["anchor_day"], "frequency": "monthly", "active": bool(r["active"]),
                     "unpaid_count": r["unpaid_count"], "created_at": r["created_at"], "deleted_at": r["deleted_at"]} for r in rows]

    @app.post("/api/v1/recurring-payments", response_model=RecurringCreated, tags=["Регулярные платежи"], status_code=201, summary="Добавить ежемесячный платёж")
    def recurring_create(payload: RecurringCreate, background: BackgroundTasks, user=Depends(admin_write)):
        with db.connect(write=True) as conn:
            cursor = conn.execute("INSERT INTO recurring_payments(title,amount_cents,currency,first_due_date,anchor_day,created_at) VALUES(?,?,?,?,?,?)",
                                  (payload.title, int(payload.amount * 100), payload.currency, payload.first_due_date.isoformat(), payload.first_due_date.day, timestamp()))
            recurring_id = cursor.lastrowid
            materialize(conn, today())
            audit(conn, user["username"], "recurring.create", recurring_id,
                  {"title":payload.title,"amount":money(int(payload.amount*100)),"currency":payload.currency,
                   "due_date":payload.first_due_date.isoformat(),"source":"panel"})
        background.add_task(worker.tick)
        return {"id": recurring_id, **payload.model_dump(mode="json"), "amount":money(int(payload.amount*100)), "active": True}

    @app.delete("/api/v1/recurring-payments/{id}", tags=["Регулярные платежи"], status_code=204, summary="Прекратить повторение, сохранив все периоды и оплаты")
    def recurring_delete(payment_id: Annotated[int,Path(alias="id")], user=Depends(admin_write)):
        with db.connect(write=True) as conn:
            row = conn.execute("SELECT * FROM recurring_payments WHERE id=? AND frequency='monthly'", (payment_id,)).fetchone()
            if not row:
                raise HTTPException(404, "Регулярный платёж не найден")
            if row["active"]:
                conn.execute("UPDATE recurring_payments SET active=0,deleted_at=? WHERE id=?", (timestamp(), payment_id))
                conn.execute("UPDATE reminders SET state='cancelled' WHERE state='pending' AND occurrence_id IN (SELECT id FROM payment_occurrences WHERE recurring_payment_id=?)", (payment_id,))
                audit(conn, user["username"], "recurring.archive", payment_id,{"title":row["title"],"source":"panel"})
        return Response(status_code=204)

    @app.get("/api/v1/one-time-payments",response_model=list[PaymentOccurrence],tags=["Разовые платежи"],summary="Разовые платежи, включая сохранённую историю")
    def one_time_list(user=Depends(current_user)):
        with db.connect(write=True) as conn:
            materialize(conn,today())
            return [occurrence(r,today()) for r in conn.execute(OCCURRENCES+" WHERE r.frequency='once' ORDER BY o.due_date,o.id")]

    @app.post("/api/v1/one-time-payments",response_model=PaymentOccurrence,tags=["Разовые платежи"],status_code=201,summary="Создать один платёж без автоматического повторения")
    def one_time_create(payload:OneTimeCreate,background:BackgroundTasks,user=Depends(admin_write)):
        with db.connect(write=True) as conn:
            cur=conn.execute("INSERT INTO recurring_payments(title,amount_cents,currency,first_due_date,anchor_day,created_at,frequency,notes) VALUES(?,?,?,?,?,?,'once',?)",
                             (payload.title,int(payload.amount*100),payload.currency,payload.due_date.isoformat(),payload.due_date.day,timestamp(),payload.notes))
            materialize(conn,today())
            audit(conn,user["username"],"one_time.create",cur.lastrowid,
                  {"title":payload.title,"amount":money(int(payload.amount*100)),"currency":payload.currency,
                   "due_date":payload.due_date.isoformat(),"source":"panel"})
            row=conn.execute(OCCURRENCES+" WHERE r.id=?",(cur.lastrowid,)).fetchone()
        background.add_task(worker.tick)
        return occurrence(row,today())

    @app.delete("/api/v1/one-time-payments/{id}",status_code=204,tags=["Разовые платежи"],summary="Убрать разовый платёж из активных, сохранив историю")
    def one_time_archive(occurrence_id:Annotated[int,Path(alias="id")],user=Depends(admin_write)):
        with db.connect(write=True) as conn:
            row=conn.execute(OCCURRENCES+" WHERE o.id=? AND r.frequency='once'",(occurrence_id,)).fetchone()
            if not row:raise HTTPException(404,"Разовый платёж не найден")
            if row["active"]:
                conn.execute("UPDATE recurring_payments SET active=0,deleted_at=? WHERE id=?",(timestamp(),row["recurring_payment_id"]))
                conn.execute("UPDATE reminders SET state='cancelled' WHERE state='pending' AND occurrence_id=?",(occurrence_id,))
                conn.execute("UPDATE notification_deliveries SET state='cancelled' WHERE state='pending' AND occurrence_id=?",(occurrence_id,))
                audit(conn,user["username"],"one_time.archive",occurrence_id,{"title":row["title"],"due_date":row["due_date"],"source":"panel"})
        return Response(status_code=204)

    def get_occurrences(conn, from_date=None, to_date=None, status=None, currency=None, include_archived=True):
        clauses, args = [], []
        for clause, value in [("o.due_date>=?", from_date), ("o.due_date<=?", to_date), ("o.currency=?", currency)]:
            if value is not None:
                clauses.append(clause)
                args.append(str(value))
        if not include_archived:
            clauses.append("r.active=1")
        query = OCCURRENCES + (" WHERE " + " AND ".join(clauses) if clauses else "") + " ORDER BY o.due_date,o.id"
        items = [occurrence(row, today()) for row in conn.execute(query, args)]
        return [r for r in items if status is None or r["status"] == status]

    @app.get("/api/v1/payment-occurrences", response_model=list[PaymentOccurrence], tags=["Оплаты"], summary="Периоды оплат и просрочки")
    def occurrence_list(from_date: date | None = None, to_date: date | None = None,
                        status: Literal["paid", "unpaid", "overdue"] | None = None,
                        currency: Literal["RUB", "USD", "EUR"] | None = None,
                        search: str | None = Query(default=None, max_length=120), include_archived: bool = True,
                        user=Depends(current_user)):
        if from_date and to_date and from_date > to_date:
            raise HTTPException(422, "Начало периода позже окончания")
        with db.connect(write=True) as conn:
            materialize(conn, today())
            items = get_occurrences(conn, from_date, to_date, status, currency, include_archived=include_archived)
            return [x for x in items if not search or search.casefold() in x["title"].casefold()]

    @app.get("/api/v1/payment-occurrences/{id}", response_model=PaymentOccurrence, tags=["Оплаты"], summary="Один период оплаты")
    def occurrence_get(occurrence_id: Annotated[int,Path(alias="id")], user=Depends(current_user)):
        with db.connect() as conn:
            row = conn.execute(OCCURRENCES + " WHERE o.id=?", (occurrence_id,)).fetchone()
            if not row:
                raise HTTPException(404, "Период оплаты не найден")
            return occurrence(row, today())

    @app.patch("/api/v1/payment-occurrences/{id}", response_model=PaymentOccurrence, tags=["Оплаты"], summary="Отметить / отменить оплату или исправить фактическую дату")
    def occurrence_update(occurrence_id: Annotated[int,Path(alias="id")], payload: OccurrencePatch, background: BackgroundTasks, user=Depends(write_user)):
        if payload.paid_at and payload.paid_at < date(2000,1,1):
            raise HTTPException(422,"Фактическая дата оплаты должна быть не раньше 2000 года")
        if payload.paid_at and payload.paid_at > today():
            raise HTTPException(422, "Фактическая дата оплаты не может быть в будущем")
        with db.connect(write=True) as conn:
            row = conn.execute(OCCURRENCES + " WHERE o.id=?", (occurrence_id,)).fetchone()
            if not row:
                raise HTTPException(404, "Период оплаты не найден")
            if payload.paid is False or ("paid_at" in payload.model_fields_set and payload.paid_at is None):
                paid_at = None
            elif payload.paid_at:
                paid_at = payload.paid_at.isoformat()
            elif payload.paid is True:
                paid_at = row["paid_at"] or today().isoformat()
            else:
                paid_at = row["paid_at"]
            conn.execute("UPDATE payment_occurrences SET paid_at=?,updated_by=?,updated_at=? WHERE id=?", (paid_at, user["username"], timestamp(), occurrence_id))
            conn.execute("UPDATE reminders SET button_version=0 WHERE occurrence_id=?",(occurrence_id,))
            audit(conn, user["username"], "occurrence.paid" if paid_at else "occurrence.unpaid", occurrence_id,
                  {"title":row["title"],"due_date":row["due_date"],"old_paid_at":row["paid_at"],"paid_at":paid_at,"source":"panel"})
            updated = conn.execute(OCCURRENCES + " WHERE o.id=?", (occurrence_id,)).fetchone()
        background.add_task(worker.tick)
        return occurrence(updated, today())

    @app.get("/api/v1/payments/summary", response_model=PaymentSummary, tags=["Оплаты"], summary="Итоги по RUB / USD / EUR без конвертации, по сроку оплаты")
    def summary(from_date: date | None = None, to_date: date | None = None, include_archived: bool = True, user=Depends(current_user)):
        if from_date and to_date and from_date > to_date:
            raise HTTPException(422, "Начало периода позже окончания")
        with db.connect(write=True) as conn:
            materialize(conn, today())
            items = get_occurrences(conn, from_date, to_date, include_archived=include_archived)
        totals = {c: {"total": Decimal(0), "paid": Decimal(0), "unpaid": Decimal(0), "overdue": Decimal(0), "count": 0} for c in ("RUB", "USD", "EUR")}
        for item in items:
            t = totals[item["currency"]]
            amount = Decimal(item["amount"])
            t["total"] += amount
            t["count"] += 1
            t["paid" if item["status"] == "paid" else "unpaid"] += amount
            if item["status"] == "overdue":
                t["overdue"] += amount
        return {"from_date": from_date, "to_date": to_date, "currencies": {
            c: {k: str(v.quantize(Decimal("0.01"))) if isinstance(v, Decimal) else v for k, v in t.items()} for c, t in totals.items()}}

    def public_user(row):
        return {"id": row["id"], "username": row["username"], "display_name": row["display_name"], "role": "user", "created_at": row["created_at"]}

    @app.get("/api/v1/users", response_model=list[RegularUser], tags=["Пользователи"], summary="Обычные пользователи, только для администратора")
    def users_list(user=Depends(admin_user)):
        with db.connect() as conn:
            return [public_user(row) for row in conn.execute("SELECT * FROM users ORDER BY id")]

    @app.post("/api/v1/users", response_model=RegularUser, tags=["Пользователи"], status_code=201, summary="Создать обычного пользователя")
    def users_create(payload: UserCreate, user=Depends(admin_write)):
        if payload.username.casefold() == settings.admin_username.casefold():
            raise HTTPException(409, "Этот логин принадлежит администратору")
        encoded = hash_password(payload.password)
        with db.connect(write=True) as conn:
            try:
                cursor = conn.execute("INSERT INTO users(username,display_name,password_hash,created_at) VALUES(?,?,?,?)", (payload.username, payload.display_name, encoded, timestamp()))
            except sqlite3.IntegrityError:
                raise HTTPException(409, "Пользователь с таким логином уже существует")
            audit(conn, user["username"], "user.create", cursor.lastrowid,
                  {"username":payload.username,"display_name":payload.display_name,"source":"panel"})
            return public_user(conn.execute("SELECT * FROM users WHERE id=?", (cursor.lastrowid,)).fetchone())

    @app.patch("/api/v1/users/{id}", response_model=RegularUser, tags=["Пользователи"], summary="Изменить пользователя; пароль отзывает его сессии")
    def users_update(user_id: Annotated[int,Path(alias="id")], payload: UserPatch, user=Depends(admin_write)):
        if user_id == 0:
            raise HTTPException(403, "Администратор управляется только через .env")
        if payload.username and payload.username.casefold() == settings.admin_username.casefold():
            raise HTTPException(409, "Этот логин принадлежит администратору")
        encoded = hash_password(payload.password) if payload.password else None
        with db.connect(write=True) as conn:
            row = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
            if not row:
                raise HTTPException(404, "Пользователь не найден")
            try:
                conn.execute("UPDATE users SET username=?,display_name=?,password_hash=? WHERE id=?", (payload.username or row["username"], payload.display_name or row["display_name"], encoded or row["password_hash"], user_id))
            except sqlite3.IntegrityError:
                raise HTTPException(409, "Пользователь с таким логином уже существует")
            if encoded:
                conn.execute("DELETE FROM sessions WHERE user_id=?", (user_id,))
            audit(conn, user["username"], "user.update", user_id,
                  {"old_username":row["username"],"username":payload.username or row["username"],
                   "old_display_name":row["display_name"],"display_name":payload.display_name or row["display_name"],
                   "password_changed":bool(encoded),"source":"panel"})
            return public_user(conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone())

    @app.delete("/api/v1/users/{id}", tags=["Пользователи"], status_code=204, summary="Удалить обычного пользователя и его сессии")
    def users_delete(user_id: Annotated[int,Path(alias="id")], user=Depends(admin_write)):
        if user_id == 0:
            raise HTTPException(403, "Администратор управляется только через .env")
        with db.connect(write=True) as conn:
            deleted_user=conn.execute("SELECT username,display_name FROM users WHERE id=?", (user_id,)).fetchone()
            if not deleted_user:
                raise HTTPException(404, "Пользователь не найден")
            conn.execute("DELETE FROM users WHERE id=?", (user_id,))
            conn.execute("DELETE FROM notification_reads WHERE reader=?",(f"user:{user_id}",))
            audit(conn, user["username"], "user.delete", user_id,{**dict(deleted_user),"source":"panel"})
        return Response(status_code=204)

    @app.get("/api/v1/reminders", tags=["Система"], summary="Журнал отправки Telegram, только для администратора")
    def reminders(user=Depends(admin_user)):
        with db.connect() as conn:
            return [dict(r) for r in conn.execute("""SELECT m.occurrence_id,m.state,m.attempts,m.attempted_at,m.retry_after,m.sent_at,m.message_id,m.error,r.title,o.due_date FROM reminders m
                JOIN payment_occurrences o ON o.id=m.occurrence_id JOIN recurring_payments r ON r.id=o.recurring_payment_id
                ORDER BY COALESCE(m.attempted_at,0) DESC LIMIT 100""")]

    @app.get("/api/v1/audit-log", tags=["Система"], summary="Последние 100 действий, только для администратора")
    def audit_list(user=Depends(admin_user)):
        with db.connect() as conn:
            return [audit_item(r) for r in conn.execute("SELECT * FROM audit_log ORDER BY id DESC LIMIT 100")]

    @app.get("/api/v1/audit-log/page", response_model=AuditPage, tags=["Система"], summary="История действий: фильтры и страницы, только для администратора")
    def audit_page(page: int = Query(default=1, ge=1), page_size: int = Query(default=25, ge=1, le=100),
                   from_date: date | None = None, to_date: date | None = None,
                   actor: str | None = Query(default=None,max_length=128),
                   action: str | None = Query(default=None,max_length=100),
                   search: str | None = Query(default=None,max_length=200),
                   snapshot_id: int | None = Query(default=None,ge=0,le=9223372036854775807),
                   user=Depends(admin_user)):
        if from_date and to_date and from_date>to_date:
            raise HTTPException(422,"Начало периода позже окончания")
        if any(d and not 2000<=d.year<=2100 for d in (from_date,to_date)):
            raise HTTPException(422,"Год должен быть в пределах 2000–2100")
        with db.connect() as conn:
            return read_audit_page(conn,timezone=settings.timezone,page=page,page_size=page_size,
                                   from_date=from_date,to_date=to_date,actor=actor,action=action,
                                   search=search,snapshot_id=snapshot_id)

    @app.get("/api/v1/system-logs", response_model=SystemLogPage, tags=["Система"], summary="Системные логи приложения и сервера; только администратор")
    def system_log_page(page: int = Query(default=1, ge=1, le=100000), page_size: int = Query(default=50, ge=1, le=100),
                        level: Literal['DEBUG','INFO','WARNING','ERROR','CRITICAL'] | None = None,
                        source: str | None = Query(default=None,max_length=128),
                        search: str | None = Query(default=None,max_length=200),
                        from_date: date | None = None, to_date: date | None = None,
                        snapshot_id: str | None = Query(default=None,pattern='^'+ID_PATTERN+'$'),
                        user=Depends(admin_user)):
        if from_date and to_date and from_date>to_date:
            raise HTTPException(422,"Начало периода позже окончания")
        if any(d and not 2000<=d.year<=2100 for d in (from_date,to_date)):
            raise HTTPException(422,"Год должен быть в пределах 2000–2100")
        return service_logs.read_page(timezone_name=settings.timezone,page=page,page_size=page_size,
                                      level=level,source=source,search=search,from_date=from_date,to_date=to_date,
                                      snapshot_id=snapshot_id)

    register_extras(app,db,settings,today,worker)
    return app
