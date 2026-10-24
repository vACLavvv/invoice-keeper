"""Additive, idempotent examples; no network I/O and no existing rows modified."""
from datetime import timedelta

from .domain import audit,materialize,timestamp


def add_examples(db,today,actor='demo'):
    samples=[
        ('feature-design','Макеты страницы продукта',1800000,'RUB',5,'once',False,'Оплата за готовые макеты после согласования. Разовая работа.'),
        ('crm-integration','Интеграция с CRM',38000,'EUR',10,'once',False,'Разовая разработка: приёмка интеграции и передача исходников.'),
        ('security-review','Аудит безопасности',25000,'USD',14,'once',False,'Разовый аудит перед запуском новой функции.'),
        ('analytics-setup','Настройка аналитики',750000,'RUB',-2,'once',True,'Завершённый пример: настройка событий и проверка отчётов.'),
        ('cloud-storage','Облачное хранилище',999,'EUR',8,'monthly',False,''),
        ('monitoring','Мониторинг сервисов',1200,'USD',11,'monthly',False,''),
    ]
    added=[]
    with db.connect(write=True) as conn:
        for key,title,cents,currency,offset,frequency,paid,notes in samples:
            marker='demo.workflow.v3.'+key
            if conn.execute('SELECT 1 FROM app_meta WHERE key=?',(marker,)).fetchone():continue
            due=today+timedelta(days=offset)
            cur=conn.execute('INSERT INTO recurring_payments(title,amount_cents,currency,first_due_date,anchor_day,created_at,frequency,notes) VALUES(?,?,?,?,?,?,?,?)',
                             (title,cents,currency,due.isoformat(),due.day,timestamp(),frequency,notes))
            conn.execute('INSERT INTO app_meta(key,value) VALUES(?,?)',(marker,str(cur.lastrowid)))
            added.append((cur.lastrowid,paid,due))
        materialize(conn,today)
        for payment_id,paid,due in added:
            if paid:
                conn.execute('UPDATE payment_occurrences SET paid_at=?,updated_by=?,updated_at=? WHERE recurring_payment_id=? AND due_date=?',(due.isoformat(),actor,timestamp(),payment_id,due.isoformat()))
            audit(conn,actor,'example.create',payment_id,{'source':'workflow-demo'})
    return len(added)
