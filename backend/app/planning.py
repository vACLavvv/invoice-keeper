"""Calendar and expense forecasts without materializing or modifying future periods."""
from datetime import date

from .domain import OCCURRENCES, monthly_date, occurrence, money

CURRENCIES = ("RUB", "USD", "EUR")


def planned_items(conn, start, end, today, include_archived=False):
    rows = conn.execute(OCCURRENCES + " WHERE o.due_date>=? AND o.due_date<=?" + ("" if include_archived else " AND r.active=1"), (start.isoformat(),end.isoformat())).fetchall()
    items = {(r["recurring_payment_id"],r["due_date"]): occurrence(r,today) | {"is_projection":False} for r in rows}
    for row in conn.execute("SELECT * FROM recurring_payments WHERE active=1"):
        first = date.fromisoformat(row["first_due_date"])
        index = max(0,(start.year-first.year)*12+start.month-first.month)
        while True:
            if row["frequency"]=="once" and index>0:break
            due = first if row["frequency"]=="once" else monthly_date(first,index,row["anchor_day"])
            if due > end:
                break
            if due >= start and (row["id"],due.isoformat()) not in items:
                days=max(0,(today-due).days)
                items[(row["id"],due.isoformat())]={
                    "id":None,"recurring_payment_id":row["id"],"title":row["title"],"amount":money(row["amount_cents"]),"currency":row["currency"],
                    "due_date":due.isoformat(),"paid_at":None,"status":"overdue" if days else "unpaid","days_overdue":days,"is_late":bool(days),
                    "active":True,"updated_by":None,"is_projection":True,"frequency":row["frequency"],"notes":row["notes"],
                }
            index+=1
    return sorted(items.values(),key=lambda x:(x["due_date"],x["recurring_payment_id"]))


def totals(items):
    from decimal import Decimal
    result={c:{"planned":0,"paid":0,"remaining":0,"overdue":0,"count":0} for c in CURRENCIES}
    for item in items:
        entry=result[item["currency"]]
        cents=int(Decimal(item["amount"])*100)
        entry["planned"]+=cents
        entry["paid" if item["paid_at"] else "remaining"]+=cents
        entry["overdue"]+=cents if item["status"]=="overdue" else 0
        entry["count"]+=1
    return {c:{k:v if k=="count" else money(v) for k,v in entry.items()} for c,entry in result.items()}
