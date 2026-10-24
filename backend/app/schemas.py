"""Explicit public response contracts. Private DB fields never become API fields."""
from datetime import date
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field

Currency=Literal['RUB','USD','EUR']
Money=Annotated[str,Field(pattern=r'^[0-9]+\.[0-9]{2}$',examples=['100.10'])]
Timestamp=Annotated[str,Field(json_schema_extra={'format':'date-time'})]


class CurrentUser(BaseModel):
    id:int
    username:str
    display_name:str
    role:Literal['admin','user']
    csrf_token:str=Field(description='Передавайте в X-CSRF-Token для изменений. Swagger подставляет автоматически.')


class RegularUser(BaseModel):
    id:int
    username:str
    display_name:str
    role:Literal['user']
    created_at:Timestamp


class RecurringCreated(BaseModel):
    id:int
    title:str
    amount:Money
    currency:Currency
    first_due_date:date
    frequency:Literal['monthly']
    active:bool


class RecurringPayment(RecurringCreated):
    anchor_day:int=Field(ge=1,le=31)
    unpaid_count:int=Field(ge=0)
    created_at:Timestamp
    deleted_at:Timestamp|None


class PaymentOccurrence(BaseModel):
    id:int
    recurring_payment_id:int
    frequency:Literal['monthly','once']='monthly'
    notes:str=''
    title:str
    amount:Money
    currency:Currency
    due_date:date
    paid_at:date|None
    status:Literal['paid','unpaid','overdue']
    days_overdue:int=Field(ge=0)
    is_late:bool
    active:bool
    updated_by:str|None
    attachment_count:int=Field(ge=0)


class CurrencySummary(BaseModel):
    total:Money
    paid:Money
    unpaid:Money=Field(description='Все неоплаченные суммы, включая просроченные')
    overdue:Money=Field(description='Просроченная часть unpaid')
    count:int=Field(ge=0)


class CurrencySummaries(BaseModel):
    RUB:CurrencySummary
    USD:CurrencySummary
    EUR:CurrencySummary


class PaymentSummary(BaseModel):
    from_date:date|None
    to_date:date|None
    currencies:CurrencySummaries


class AuditEvent(BaseModel):
    id:int
    actor:str
    action:str
    entity:str
    created_at:str
    details:dict[str,Any]
    action_label:str
    result:Literal['success','failure','denied','attention']


class AuditActionOption(BaseModel):
    value:str
    label:str


class AuditPage(BaseModel):
    items:list[AuditEvent]
    total:int
    page:int
    page_size:int
    pages:int
    snapshot_id:int=Field(description='Верхняя граница ID для стабильной навигации по страницам. Для обновления истории не передавайте её в запросе.')
    timezone:str
    actors:list[str]
    actions:list[AuditActionOption]


class SystemLogEntry(BaseModel):
    id:str
    timestamp:Timestamp
    level:Literal['DEBUG','INFO','WARNING','ERROR','CRITICAL']
    source:str
    message:str
    process:int
    request_id:str


class SystemLogPage(BaseModel):
    items:list[SystemLogEntry]
    total:int
    page:int
    pages:int
    page_size:int
    snapshot_id:str
    sources:list[str]
    timezone:str
    unavailable:bool
    retention_bytes:int
