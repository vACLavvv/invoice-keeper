from calendar import monthrange
from datetime import date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo


def local_today(settings):
    return datetime.now(ZoneInfo(settings.timezone)).date()


def timestamp():
    return datetime.now(ZoneInfo("UTC")).isoformat()


def monthly_date(first: date, index: int, anchor: int | None = None):
    total = first.year * 12 + first.month - 1 + index
    year, month = divmod(total, 12)
    month += 1
    return date(year, month, min(anchor or first.day, monthrange(year, month)[1]))


def materialize(conn, today: date):
    # Keep the calendar complete for both the current and the following month.
    horizon = monthly_date(today.replace(day=1), 2) - timedelta(days=1)
    for row in conn.execute("SELECT * FROM recurring_payments WHERE active=1").fetchall():
        first = date.fromisoformat(row["first_due_date"])
        index = row["next_index"]
        while True:
            due = monthly_date(first, index, row["anchor_day"])
            if index > 0 and due > horizon:
                break
            conn.execute(
                "INSERT OR IGNORE INTO payment_occurrences(recurring_payment_id,due_date,amount_cents,currency) VALUES(?,?,?,?)",
                (row["id"], due.isoformat(), row["amount_cents"], row["currency"]),
            )
            index += 1
        conn.execute("UPDATE recurring_payments SET next_index=? WHERE id=?", (index, row["id"]))


def money(cents):
    return f"{Decimal(cents) / 100:.2f}"


def occurrence(row, today):
    due = date.fromisoformat(row["due_date"])
    paid_at = date.fromisoformat(row["paid_at"]) if row["paid_at"] else None
    days_overdue = max(0, ((paid_at or today) - due).days)
    status = "paid" if paid_at else ("overdue" if today > due else "unpaid")
    return {
        "id": row["id"], "recurring_payment_id": row["recurring_payment_id"],
        "title": row["title"], "amount": money(row["amount_cents"]), "currency": row["currency"],
        "due_date": row["due_date"], "paid_at": row["paid_at"], "status": status,
        "days_overdue": days_overdue, "is_late": days_overdue > 0,
        "active": bool(row["active"]), "updated_by": row["updated_by"],
    }


def audit(conn, actor, action, entity):
    conn.execute("INSERT INTO audit_log(actor,action,entity,created_at) VALUES(?,?,?,?)", (actor, action, str(entity), timestamp()))


OCCURRENCES = """SELECT o.*,r.title,r.active FROM payment_occurrences o
JOIN recurring_payments r ON r.id=o.recurring_payment_id"""
