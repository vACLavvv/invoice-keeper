from contextlib import asynccontextmanager
from datetime import date, timedelta
from decimal import Decimal
from typing import Literal
from urllib.parse import urlsplit
import hmac
import secrets
import sqlite3
import time

from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Query, Request, Response, Security
from fastapi.exceptions import RequestValidationError
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.security import APIKeyCookie
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, field_validator, model_validator
from swagger_ui_bundle import swagger_ui_path

from .config import ROOT, Settings
from .db import Database
from .domain import OCCURRENCES, audit, local_today, materialize, money, occurrence, timestamp
from .reminders import ReminderWorker
from .security import digest, hash_password, verify_password

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
    password: str = Field(min_length=1, max_length=128)


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
    password: str = Field(min_length=12, max_length=128)


class UserPatch(Payload):
    username: str | None = Field(default=None, min_length=3, max_length=64, pattern=r"^[A-Za-z0-9_.-]+$")
    display_name: str | None = Field(default=None, min_length=1, max_length=80)
    password: str | None = Field(default=None, min_length=12, max_length=128)

    @model_validator(mode="after")
    def valid_patch(self):
        if not self.model_fields_set or any(getattr(self, x) is None for x in self.model_fields_set):
            raise ValueError("Укажите хотя бы одно непустое поле")
        return self


def origin_check(request):
    origin = request.headers.get("origin")
    if origin and urlsplit(origin).netloc != request.url.netloc:
        raise HTTPException(403, "Запрос с другого сайта запрещён")
    if request.headers.get("sec-fetch-site") == "cross-site":
        raise HTTPException(403, "Запрос с другого сайта запрещён")


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
    if not x_csrf_token or not hmac.compare_digest(x_csrf_token, user["csrf_token"]):
        raise HTTPException(403, "Необходим X-CSRF-Token из /api/v1/auth/me")
    return user


def admin_user(user=Depends(current_user)):
    if user["role"] != "admin":
        raise HTTPException(403, "Действие доступно только администратору")
    return user


def admin_write(user=Depends(write_user)):
    return admin_user(user)


def create_app(settings: Settings | None = None, *, start_worker=True, today_provider=None, sender=None):
    settings = settings or Settings.from_env()
    db = Database(settings.database_path)
    today = today_provider or (lambda: local_today(settings))
    worker = ReminderWorker(db, settings, sender=sender, today=today)
    admin_hash = hash_password(settings.admin_password)

    @asynccontextmanager
    async def lifespan(app):
        db.initialize()
        with db.connect(write=True) as conn:
            materialize(conn, today())
        if start_worker:
            worker.start()
        yield
        worker.stop()

    app = FastAPI(title="Invoice Keeper API", version="1.0.0", docs_url=None, redoc_url=None, openapi_url=None,
                  description="Учёт регулярных платежей. Cookie-сессия; изменения требуют X-CSRF-Token из auth/me или auth/login. Суммы передаются десятичными строками. Даты — YYYY-MM-DD в часовом поясе приложения.", lifespan=lifespan)
    app.state.db, app.state.settings, app.state.worker = db, settings, worker
    app.mount("/assets", StaticFiles(directory=ROOT / "app/static"), name="assets")
    app.mount("/swagger-assets", StaticFiles(directory=swagger_ui_path), name="swagger-assets")

    @app.middleware("http")
    async def security_headers(request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["Cache-Control"] = "no-store"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        policy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
        if request.url.path == "/api/v1/docs":
            policy = policy.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'").replace("style-src 'self'", "style-src 'self' 'unsafe-inline'")
        response.headers["Content-Security-Policy"] = policy
        return response

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
        return FileResponse(ROOT / "app/templates/index.html")

    @app.get("/login", include_in_schema=False)
    def login_page():
        return FileResponse(ROOT / "app/templates/login.html")

    @app.get("/api/v1/docs", include_in_schema=False)
    def docs(user=Depends(current_user)):
        return get_swagger_ui_html(openapi_url="/api/v1/openapi.json", title="Invoice Keeper · API",
                                   swagger_js_url="/swagger-assets/swagger-ui-bundle.js",
                                   swagger_css_url="/swagger-assets/swagger-ui.css",
                                   swagger_favicon_url="/assets/favicon.svg")

    @app.get("/api/v1/openapi.json", include_in_schema=False)
    def openapi(user=Depends(current_user)):
        return app.openapi()

    @app.post("/api/v1/auth/login", tags=["Авторизация"], summary="Войти по логину и паролю")
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
            raise HTTPException(401, "Неверный логин или пароль")
        token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        with db.connect(write=True) as conn:
            conn.execute("DELETE FROM auth_attempts WHERE key=?", (keys[1],))
            # Successful sign-ins do not accumulate failures in the shared IP bucket.
            conn.execute("UPDATE auth_attempts SET count=MAX(0,count-1) WHERE key=?", (keys[0],))
            conn.execute("INSERT INTO sessions(token_hash,user_id,is_admin,admin_fingerprint,csrf_token,expires_at) VALUES(?,?,?,?,?,?)",
                         (digest(token), None if is_admin else row["id"], int(is_admin), digest(settings.admin_username + "\0" + settings.admin_password) if is_admin else None, csrf, now + settings.session_hours * 3600))
            audit(conn, payload.username, "login", "session")
        response.set_cookie(COOKIE, token, max_age=settings.session_hours * 3600, httponly=True, secure=settings.cookie_secure, samesite="strict", path="/")
        return {"id": 0 if is_admin else row["id"], "username": settings.admin_username if is_admin else row["username"],
                "display_name": "Администратор" if is_admin else row["display_name"], "role": "admin" if is_admin else "user", "csrf_token": csrf}

    @app.get("/api/v1/auth/me", tags=["Авторизация"], summary="Текущая учётная запись и CSRF-токен")
    def me(user=Depends(current_user)):
        return user

    @app.post("/api/v1/auth/logout", tags=["Авторизация"], status_code=204, summary="Завершить текущую сессию")
    def logout(request: Request, user=Depends(write_user)):
        with db.connect(write=True) as conn:
            conn.execute("DELETE FROM sessions WHERE token_hash=?", (digest(request.cookies[COOKIE]),))
        response = Response(status_code=204)
        response.delete_cookie(COOKIE, path="/", secure=settings.cookie_secure, httponly=True, samesite="strict")
        return response

    @app.get("/api/v1/settings", tags=["Система"], summary="Часовой пояс, текущая дата и состояние Telegram")
    def app_settings(user=Depends(current_user)):
        return {"timezone": settings.timezone, "today": today().isoformat(), "telegram_enabled": settings.telegram_enabled,
                "reminder_days": 3, "reminder_interval_seconds": settings.reminder_interval}

    @app.get("/api/v1/recurring-payments", tags=["Регулярные платежи"], summary="Список регулярных платежей, включая архив")
    def recurring_list(user=Depends(current_user)):
        with db.connect(write=True) as conn:
            materialize(conn, today())
            rows = conn.execute("""SELECT r.*, (SELECT COUNT(*) FROM payment_occurrences o WHERE o.recurring_payment_id=r.id AND o.paid_at IS NULL) unpaid_count
                FROM recurring_payments r ORDER BY r.active DESC,r.id DESC""").fetchall()
            return [{"id": r["id"], "title": r["title"], "amount": money(r["amount_cents"]), "currency": r["currency"],
                     "first_due_date": r["first_due_date"], "anchor_day": r["anchor_day"], "frequency": "monthly", "active": bool(r["active"]),
                     "unpaid_count": r["unpaid_count"], "created_at": r["created_at"], "deleted_at": r["deleted_at"]} for r in rows]

    @app.post("/api/v1/recurring-payments", tags=["Регулярные платежи"], status_code=201, summary="Добавить ежемесячный платёж")
    def recurring_create(payload: RecurringCreate, background: BackgroundTasks, user=Depends(admin_write)):
        with db.connect(write=True) as conn:
            cursor = conn.execute("INSERT INTO recurring_payments(title,amount_cents,currency,first_due_date,anchor_day,created_at) VALUES(?,?,?,?,?,?)",
                                  (payload.title, int(payload.amount * 100), payload.currency, payload.first_due_date.isoformat(), payload.first_due_date.day, timestamp()))
            recurring_id = cursor.lastrowid
            materialize(conn, today())
            audit(conn, user["username"], "recurring.create", recurring_id)
        background.add_task(worker.tick)
        return {"id": recurring_id, **payload.model_dump(mode="json"), "active": True}

    @app.delete("/api/v1/recurring-payments/{payment_id}", tags=["Регулярные платежи"], status_code=204, summary="Прекратить повторение, сохранив все периоды и оплаты")
    def recurring_delete(payment_id: int, user=Depends(admin_write)):
        with db.connect(write=True) as conn:
            row = conn.execute("SELECT * FROM recurring_payments WHERE id=?", (payment_id,)).fetchone()
            if not row:
                raise HTTPException(404, "Регулярный платёж не найден")
            if row["active"]:
                conn.execute("UPDATE recurring_payments SET active=0,deleted_at=? WHERE id=?", (timestamp(), payment_id))
                conn.execute("UPDATE reminders SET state='cancelled' WHERE state='pending' AND occurrence_id IN (SELECT id FROM payment_occurrences WHERE recurring_payment_id=?)", (payment_id,))
                audit(conn, user["username"], "recurring.archive", payment_id)
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

    @app.get("/api/v1/payment-occurrences", tags=["Оплаты"], summary="Периоды оплат и просрочки")
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

    @app.get("/api/v1/payment-occurrences/{occurrence_id}", tags=["Оплаты"], summary="Один период оплаты")
    def occurrence_get(occurrence_id: int, user=Depends(current_user)):
        with db.connect() as conn:
            row = conn.execute(OCCURRENCES + " WHERE o.id=?", (occurrence_id,)).fetchone()
            if not row:
                raise HTTPException(404, "Период оплаты не найден")
            return occurrence(row, today())

    @app.patch("/api/v1/payment-occurrences/{occurrence_id}", tags=["Оплаты"], summary="Отметить / отменить оплату или исправить фактическую дату")
    def occurrence_update(occurrence_id: int, payload: OccurrencePatch, background: BackgroundTasks, user=Depends(write_user)):
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
            audit(conn, user["username"], "occurrence.paid" if paid_at else "occurrence.unpaid", occurrence_id)
            updated = conn.execute(OCCURRENCES + " WHERE o.id=?", (occurrence_id,)).fetchone()
        background.add_task(worker.tick)
        return occurrence(updated, today())

    @app.get("/api/v1/payments/summary", tags=["Оплаты"], summary="Итоги по RUB / USD / EUR без конвертации, по сроку оплаты")
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

    @app.get("/api/v1/users", tags=["Пользователи"], summary="Обычные пользователи, только для администратора")
    def users_list(user=Depends(admin_user)):
        with db.connect() as conn:
            return [public_user(row) for row in conn.execute("SELECT * FROM users ORDER BY id")]

    @app.post("/api/v1/users", tags=["Пользователи"], status_code=201, summary="Создать обычного пользователя")
    def users_create(payload: UserCreate, user=Depends(admin_write)):
        if payload.username.casefold() == settings.admin_username.casefold():
            raise HTTPException(409, "Этот логин принадлежит администратору")
        encoded = hash_password(payload.password)
        with db.connect(write=True) as conn:
            try:
                cursor = conn.execute("INSERT INTO users(username,display_name,password_hash,created_at) VALUES(?,?,?,?)", (payload.username, payload.display_name, encoded, timestamp()))
            except sqlite3.IntegrityError:
                raise HTTPException(409, "Пользователь с таким логином уже существует")
            audit(conn, user["username"], "user.create", cursor.lastrowid)
            return public_user(conn.execute("SELECT * FROM users WHERE id=?", (cursor.lastrowid,)).fetchone())

    @app.patch("/api/v1/users/{user_id}", tags=["Пользователи"], summary="Изменить пользователя; пароль отзывает его сессии")
    def users_update(user_id: int, payload: UserPatch, user=Depends(admin_write)):
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
            audit(conn, user["username"], "user.update", user_id)
            return public_user(conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone())

    @app.delete("/api/v1/users/{user_id}", tags=["Пользователи"], status_code=204, summary="Удалить обычного пользователя и его сессии")
    def users_delete(user_id: int, user=Depends(admin_write)):
        if user_id == 0:
            raise HTTPException(403, "Администратор управляется только через .env")
        with db.connect(write=True) as conn:
            if not conn.execute("SELECT id FROM users WHERE id=?", (user_id,)).fetchone():
                raise HTTPException(404, "Пользователь не найден")
            conn.execute("DELETE FROM users WHERE id=?", (user_id,))
            audit(conn, user["username"], "user.delete", user_id)
        return Response(status_code=204)

    @app.get("/api/v1/reminders", tags=["Система"], summary="Журнал отправки Telegram, только для администратора")
    def reminders(user=Depends(admin_user)):
        with db.connect() as conn:
            return [dict(r) for r in conn.execute("""SELECT m.*,r.title,o.due_date FROM reminders m
                JOIN payment_occurrences o ON o.id=m.occurrence_id JOIN recurring_payments r ON r.id=o.recurring_payment_id
                ORDER BY COALESCE(m.attempted_at,0) DESC LIMIT 100""")]

    @app.get("/api/v1/audit-log", tags=["Система"], summary="Последние 100 действий, только для администратора")
    def audit_list(user=Depends(admin_user)):
        with db.connect() as conn:
            return [dict(r) for r in conn.execute("SELECT * FROM audit_log ORDER BY id DESC LIMIT 100")]

    return app
