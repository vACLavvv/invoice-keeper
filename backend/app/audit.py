"""Read-only, paginated views of the persistent audit trail."""
from datetime import datetime, time, timedelta
import json
from math import ceil
from zoneinfo import ZoneInfo


ACTION_LABELS = {
    "login": "Вход в систему", "login.failed": "Неудачный вход",
    "logout": "Выход из системы", "authorization.denied": "Отказ в доступе",
    "recurring.create": "Добавлен регулярный платёж",
    "recurring.archive": "Прекращён регулярный платёж",
    "one_time.create": "Добавлен разовый платёж",
    "one_time.archive": "Разовый платёж убран в архив",
    "occurrence.paid": "Отмечена оплата", "occurrence.unpaid": "Отменена оплата",
    "occurrence.create": "Создан период из прогноза",
    "user.create": "Создан пользователь", "user.update": "Изменён пользователь",
    "user.delete": "Удалён пользователь",
    "attachment.create": "Прикреплён чек или ссылка",
    "attachment.delete": "Удалено вложение",
    "notification.test": "Проверка канала", "example.create": "Добавлен пример",
}


def audit_item(row):
    item = dict(row)
    try:
        details = json.loads(item["details"])
    except (ValueError, TypeError):
        details = {}
    item["details"] = details if isinstance(details, dict) else {}
    return item


def describe_item(row):
    item = audit_item(row)
    action, details = item["action"], item["details"]
    item["action_label"] = ACTION_LABELS.get(action, action)
    if action == "occurrence.paid" and details.get("old_paid_at") and details["old_paid_at"] != details.get("paid_at"):
        item["action_label"] = "Исправлена дата оплаты"
    item["result"] = "success"
    if action == "login.failed":
        item["result"] = "failure"
    elif action == "authorization.denied":
        item["result"] = "denied"
    elif action == "notification.test" and details.get("state") != "sent":
        item["result"] = "attention"
    return item


def read_audit_page(conn, *, timezone, page=1, page_size=25, from_date=None,
                    to_date=None, actor=None, action=None, search=None, snapshot_id=None):
    # A read transaction keeps count, options and rows consistent. The high-water
    # mark also prevents new events shifting rows while the user changes pages.
    conn.execute("BEGIN")
    if snapshot_id is None:
        snapshot_id = conn.execute("SELECT COALESCE(MAX(id),0) FROM audit_log").fetchone()[0]
    clauses, args = ["id<=?"], [snapshot_id]
    zone = ZoneInfo(timezone)
    if from_date:
        start = datetime.combine(from_date, time.min, zone).astimezone(ZoneInfo("UTC"))
        clauses.append("created_at>=?")
        args.append(start.isoformat())
    if to_date:
        end = datetime.combine(to_date + timedelta(days=1), time.min, zone).astimezone(ZoneInfo("UTC"))
        clauses.append("created_at<?")
        args.append(end.isoformat())
    for column, value in (("actor", actor), ("action", action)):
        if value:
            clauses.append(f"{column}=?")
            args.append(value)
    if search and search.strip():
        query = search.strip().casefold()
        conn.create_function("casefold", 1, lambda value: str(value or "").casefold(), deterministic=True)
        conn.create_function("audit_label", 2, lambda action, details:
                             describe_item({"action":action,"details":details})["action_label"], deterministic=True)
        match = "instr(casefold(actor || ' ' || action || ' ' || entity || ' ' || details || ' ' || audit_label(action,details)),?)>0"
        args.append(query)
        clauses.append("(" + match + ")")
    where = " WHERE " + " AND ".join(clauses)
    total = conn.execute("SELECT COUNT(*) FROM audit_log" + where, args).fetchone()[0]
    pages = max(1, ceil(total / page_size))
    page = min(page, pages)
    rows = conn.execute("SELECT * FROM audit_log" + where + " ORDER BY id DESC LIMIT ? OFFSET ?",
                        (*args, page_size, (page - 1) * page_size)).fetchall()
    actors = [r[0] for r in conn.execute("SELECT DISTINCT actor FROM audit_log WHERE id<=? ORDER BY actor COLLATE NOCASE", (snapshot_id,))]
    actions = [{"value": r[0], "label": ACTION_LABELS.get(r[0], r[0])} for r in
               conn.execute("SELECT DISTINCT action FROM audit_log WHERE id<=? ORDER BY action", (snapshot_id,))]
    return {"items": [describe_item(r) for r in rows], "total": total, "page": page,
            "page_size": page_size, "pages": pages, "snapshot_id": snapshot_id,
            "timezone": timezone, "actors": actors, "actions": actions}
