'use strict';
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const symbols = {RUB: '₽', USD: '$', EUR: '€'};
const currencyNames = {RUB: 'Российский рубль', USD: 'Доллар США', EUR: 'Евро'};
const fmt = (value) => new Intl.NumberFormat('ru-RU', {minimumFractionDigits: Number(value) % 1 ? 2 : 0, maximumFractionDigits: 2}).format(Number(value));
const dateFmt = (value, options = {day:'numeric', month:'short'}) => value ? new Intl.DateTimeFormat('ru-RU', options).format(new Date(value + 'T12:00:00')) : '—';
const plural = (n, one, few, many) => n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many;
const state = {user: null, config: null, occurrences: [], recurring: [], users: [], month: '', status: 'all', currency: '', search: '', page: 'overview', range:'all', frequency:'', historyFilter:'all', refreshId: 0, calendar:null, notifications:[], budgetMode:'year',budgetYear:0,budgetMonth:1,includeArchived:false,audit:[]};
Object.assign(state, {auditPage:1, auditPages:1, auditTotal:0, auditSize:25, auditSnapshot:null, auditFilters:{}, auditRequest:0, auditLoading:false});
const pageNames = {payments: ['К оплате', 'К оплате', 'Неоплаченные задачи команды. Регулярные и разовые — в одном списке.'], recurring: ['Регулярные', 'Регулярные платежи', 'Один раз настройте расход — система создаст следующие периоды.'], calendar: ['Календарь', 'Календарь оплат', 'Посмотрите, как распределяются расходы в течение месяца.'], users: ['Команда', 'Ваша команда', 'Дайте коллегам доступ к платежам и истории оплат.'], activity: ['Журнал', 'Журнал', 'Действия команды, доставка уведомлений и состояние сервиса.']};
const statusNames = {paid:'Оплачено', unpaid:'К оплате', overdue:'Просрочено'};
Object.assign(pageNames,{budget:['Бюджет','План расходов','Посмотрите, сколько потребуется на месяц и год — отдельно по каждой валюте.'],notifications:['Уведомления','Ничего не упустить','Важные сроки, история напоминаний и личные отметки прочтения.'],channels:['Каналы','Оставайтесь на связи','Telegram, email, webhook и уведомления в панели — под вашим контролем.']});
Object.assign(pageNames,{overview:['Обзор','Рабочий обзор','Текущие задачи, ближайшие сроки и история оплат.'],history:['История','История','Оплаченные и архивные задачи. Фактические даты и чеки сохранены.']});
Object.assign(state,{logTab:'actions',systemPage:1,systemSnapshot:null,systemRequest:0,systemLoading:false,systemFilters:{}});
let toastTimer;

function toast(message, error = false) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').classList.toggle('error', error);
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4500);
}

async function api(path, options = {}) {
  const headers = {...(options.body instanceof FormData ? {} : {'Content-Type': 'application/json'}), ...options.headers};
  if (state.user) headers['X-CSRF-Token'] = state.user.csrf_token;
  let response;
  try { response = await fetch('/api/v1' + path, {...options, headers}); }
  catch { throw new Error('Нет связи с сервером. Проверьте соединение и повторите действие.'); }
  if (response.status === 401) { window.location.assign('/login'); throw new Error('Сессия завершена'); }
  if (response.status === 204) return null;
  const data = await response.json();
  if (!response.ok) {
    const names = {title:'Название', amount:'Сумма', first_due_date:'Дата первого платежа', username:'Логин', display_name:'Имя', password:'Пароль', paid_at:'Дата оплаты'};
    let message = typeof data.detail === 'string' ? data.detail : (data.detail || []).map((e) => `${names[e.loc?.at(-1)] || e.loc?.at(-1) || 'Поле'}: ${e.msg.replace(/^Value error, /, '')}`).join('. ');
    throw new Error(message || 'Не удалось выполнить действие');
  }
  return data;
}

function monthRange() {
  const [year, month] = state.month.split('-').map(Number);
  return {from_date: `${state.month}-01`, to_date: `${state.month}-${new Date(year, month, 0).getDate()}`};
}

function selectedOccurrences() {
  return state.occurrences.filter((o) => o.due_date.startsWith(state.month));
}

const receiptIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h4"/></svg>';
const cycleIcon = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 7a8 8 0 0 0-13-1L3 9m0-5v5h5m-3 8a8 8 0 0 0 13 1l3-3m0 5v-5h-5"/></svg>';
const checkIcon = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
const clockIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></svg>';

function workflowRows(items,empty) {
  if(!items.length)return `<p class="work-empty">${empty}</p>`;
  return items.map(o=>`<button class="work-item" data-action="pay" data-id="${o.id}"><span class="work-item-icon ${o.status}">${o.status==='paid' ? checkIcon : receiptIcon}</span><span class="work-item-copy"><b>${esc(o.title)}</b><small>${o.frequency==='once' ? 'Разовый' : 'Ежемесячный'} · ${o.paid_at ? 'Оплачено '+dateFmt(o.paid_at) : dateFmt(o.due_date)}</small></span><span class="work-item-money">${fmt(o.amount)} <small>${symbols[o.currency]}</small><span class="work-item-state ${o.status}">${statusNames[o.status]}</span></span><span class="work-item-arrow" aria-hidden="true">›</span></button>`).join('');
}

function renderOverview() {
  const active=state.occurrences.filter(o=>o.active && o.status!=='paid');
  const overdue=active.filter(o=>o.status==='overdue');
  const end=new Date(state.config.today+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+7);const edge=end.toISOString().slice(0,10);
  const soon=active.filter(o=>o.due_date>=state.config.today && o.due_date<=edge);
  const once=active.filter(o=>o.frequency==='once');
  const tile=(view,label,value,caption,accent='')=>`<button class="workflow-tile ${accent}" data-action="workflow-open" data-view="${view}"><span>${label}</span><strong>${value}<span aria-hidden="true">↗</span></strong><small>${caption}</small></button>`;
  $('#workflow-summary').innerHTML=tile('all','К оплате',active.length,'Все открытые задачи')+tile('overdue','Просрочено',overdue.length,'Требуют внимания','urgent')+tile('week','На этой неделе',soon.length,'В ближайшие 7 дней')+tile('once','Разовые',once.length,'Работы, услуги и покупки');
  $('#attention-list').innerHTML=workflowRows(active.filter(o=>o.due_date<=edge).slice(0,4),'Срочных платежей нет. Можно заняться другими задачами.');
  const later=active.filter(o=>o.due_date>edge);
  $('#upcoming-list').innerHTML=workflowRows(later.slice(0,4),'Других запланированных платежей пока нет.')+(later.length>4 ? `<button class="work-more text-button" data-action="workflow-open" data-view="all">Ещё ${later.length-4} ${plural(later.length-4,'платёж','платежа','платежей')} →</button>` : '');
  const recent=state.occurrences.filter(o=>o.paid_at).sort((a,b)=>b.paid_at.localeCompare(a.paid_at)||b.id-a.id).slice(0,4);
  $('#recent-list').innerHTML=workflowRows(recent,'Здесь появятся оплаченные задачи и прикреплённые чеки.');
}

function renderMonthHealth() {
  const root = $('#month-health');
  root.hidden = state.page !== 'overview';
  const items = selectedOccurrences(), paid = items.filter((o) => o.status === 'paid').length;
  const percent = items.length ? Math.round(paid / items.length * 100) : 0;
  root.innerHTML = `<svg class="health-ring" viewBox="0 0 56 56" aria-hidden="true"><circle class="health-track" cx="28" cy="28" r="23" fill="none" stroke-width="3"/><circle class="health-value" cx="28" cy="28" r="23" fill="none" stroke-width="3" pathLength="100" stroke-dasharray="${percent} 100" transform="rotate(-90 28 28)"/><path class="health-check" d="m20 28 5 5 11-12" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><div><strong>${paid}<span> / ${items.length}</span></strong><small>${items.length ? 'задач месяца закрыто' : 'периодов в месяце'}</small></div>`;
}

function moneySize(value) {
  const length = fmt(value).length;
  return length > 17 ? 'amount-giant' : length > 15 ? 'amount-extra-long' : length > 11 ? 'amount-long' : '';
}

function renderSummary(summary) {
  const markup = Object.entries(summary.currencies).map(([currency, totals]) => {
    const total = Number(totals.total), paid = Number(totals.paid);
    const ratio = total ? Math.min(paid < total ? 99 : 100, Math.round(paid / total * 100)) : 0;
    return `<article class="summary-card currency-${currency.toLowerCase()}"><div class="summary-top"><span class="currency-label"><span class="currency-symbol">${symbols[currency]}</span><span>${currency}<small>${currencyNames[currency]}</small></span></span><span class="currency-code" title="Оплачено ${ratio}% суммы плана" aria-label="Оплачено ${ratio}% суммы плана">${ratio}%</span></div><p class="summary-caption">Осталось оплатить</p><div class="summary-amount ${moneySize(totals.unpaid)}">${fmt(totals.unpaid)}<small>${symbols[currency]}</small></div><progress class="summary-track" value="${paid}" max="${total || 1}" aria-label="Оплачено ${ratio}%">${ratio}%</progress><div class="summary-bottom"><span>Оплачено <b>${fmt(totals.paid)} ${symbols[currency]}</b></span><span>План <b>${fmt(totals.total)} ${symbols[currency]}</b></span></div></article>`;
  }).join('');
  $('#summary-cards').innerHTML=markup;
  $('#overview-currencies').innerHTML=markup;
  renderMonthHealth();
}

function renderNotice() {
  const overdue = state.occurrences.filter((o) => o.active && o.status === 'overdue');
  const notice = $('#due-notice');
  notice.hidden = overdue.length === 0;
  if (overdue.length) notice.innerHTML = `<span class="notice-symbol" aria-hidden="true">${clockIcon}</span><div class="attention-copy"><b>${overdue.length} ${plural(overdue.length, 'просроченный платёж', 'просроченных платежа', 'просроченных платежей')}</b><span>${esc(overdue[0].title)} · срок ${dateFmt(overdue[0].due_date)}${overdue.length > 1 ? ' и другие' : ''}</span></div><button class="text-button notice-detail" data-action="show-overdue">Показать <span aria-hidden="true">↗</span></button>`;
  $('#nav-count').textContent = state.occurrences.filter((o) => o.active && o.status !== 'paid').length;
}

function dueHint(item) {
  if (item.is_late) return `${item.days_overdue} дн. задержки`;
  if (item.status === 'paid') return 'В срок';
  const days = Math.round((Date.parse(item.due_date + 'T00:00:00Z') - Date.parse(state.config.today + 'T00:00:00Z')) / 86400000);
  return days === 0 ? 'Сегодня' : days === 1 ? 'Завтра' : days > 1 ? `Через ${days} дн.` : '';
}

function renderPayments() {
  const weekEnd = new Date(state.config.today+'T12:00:00Z');weekEnd.setUTCDate(weekEnd.getUTCDate()+7);
  const windowEnd=weekEnd.toISOString().slice(0,10);
  const base=state.occurrences.filter((o)=>state.page==='history' ? (o.status==='paid' || !o.active) && (state.historyFilter==='all' || (state.historyFilter==='paid' ? o.status==='paid' : !o.active)) : o.active && o.status!=='paid');
  const filterBase = base.filter((o)=>(state.range==='all' || (state.range==='month' ? (state.page==='history' && o.paid_at ? o.paid_at : o.due_date).startsWith(state.month) : o.due_date>=state.config.today && o.due_date<=windowEnd)) && (!state.frequency || (o.frequency || 'monthly')===state.frequency) && (!state.currency || o.currency===state.currency) && (!state.search || o.title.toLocaleLowerCase('ru').includes(state.search)));
  $('#history-filter-label').hidden=state.page!=='history';
  $('#history-date-note').hidden=state.page!=='history' || state.range!=='month';
  $('#payment-range option[value=week]').hidden=state.page==='history';
  $('#payment-range option[value=all]').textContent=state.page==='history' ? 'Всё время' : 'Все сроки';
  $('#month-label').closest('.period-switcher').hidden=state.range!=='month';
  $('#payment-range').value=state.range;

  const counts = {all: filterBase.length, unpaid: filterBase.filter((o) => o.status !== 'paid').length, overdue: filterBase.filter((o) => o.status === 'overdue').length, paid: filterBase.filter((o) => o.status === 'paid').length};
  Object.entries(counts).forEach(([name, n]) => { $('#count-' + name).textContent = n; });
  $$('.status-tabs .status-tab').forEach((tab) => { const selected = tab.dataset.status === state.status; tab.classList.toggle('selected', selected); tab.setAttribute('aria-pressed', String(selected)); });
  const items = filterBase.filter((o) => state.status === 'all' || (state.status === 'unpaid' ? o.status !== 'paid' : o.status === state.status));
  if(state.page==='history')items.sort((a,b)=>(b.paid_at || '').localeCompare(a.paid_at || '') || b.id-a.id);
  $('#table-count').textContent = `${items.length} ${plural(items.length, 'платёж', 'платежа', 'платежей')}`;
  const root = $('#occurrence-table');
  if (!items.length) {
    const filtered = state.search || state.currency || state.frequency || state.range!=='all' || state.status!=='all' || (state.page==='history' && state.historyFilter!=='all');
    const heading=filtered ? 'Подходящих платежей нет' : state.page==='history' ? 'История пока пуста' : 'Открытых задач нет';
    const copy=filtered ? 'Измените поиск, тип, валюту или период.' : state.page==='history' ? 'Здесь появятся оплаченные и архивные задачи.' : 'Все текущие задачи закрыты. Новые платежи появятся здесь.';
    const action=filtered ? '<button class="button secondary" data-action="reset-filters">Сбросить фильтры</button>' : state.user.role==='admin' && state.page!=='history' ? '<button class="button secondary" data-action="create-payment">Добавить платёж</button>' : '<button class="button secondary" data-action="workflow-open" data-view="all">К оплате</button>';
    root.innerHTML=`<div class="empty-state"><b>${heading}</b>${copy}<br>${action}</div>`;
    return;
  }
  root.innerHTML = `<table><thead><tr><th>ПЛАТЁЖ</th><th>СУММА</th><th>СРОК ОПЛАТЫ</th><th>СТАТУС</th><th>ДАТА ОПЛАТЫ</th><th></th></tr></thead><tbody>${items.map((o) => `<tr class="payment-row ${o.status}"><td><div class="payment-name"><span class="payment-icon ${o.currency.toLowerCase()}" aria-hidden="true">${receiptIcon}</span><span><b>${esc(o.title)}</b><small>${o.active ? (o.frequency==='once' ? 'Разовый платёж' : 'Ежемесячно') : 'В архиве · история сохранена'}${o.attachment_count ? ' · '+o.attachment_count+' '+plural(o.attachment_count,'вложение','вложения','вложений') : ''}</small></span></div></td><td class="amount-cell ${moneySize(o.amount)}">${fmt(o.amount)}<small>${symbols[o.currency]}</small></td><td class="date-cell ${o.is_late ? 'late' : ''}">${dateFmt(o.due_date)}<small class="due-hint">${dueHint(o)}</small></td><td><span class="pill ${o.status}">${statusNames[o.status]}</span></td><td class="date-cell">${dateFmt(o.paid_at)}</td><td><button class="row-action ${o.status === 'paid' || !o.active ? 'edit' : ''}" data-action="pay" data-id="${o.id}">${!o.active ? 'Открыть запись' : o.status === 'paid' ? 'Изменить ↗' : 'Отметить оплату'}</button></td></tr>`).join('')}</tbody></table>`;
}

function renderRecurring() {
  $('#recurring-table').innerHTML = state.recurring.length ? `<table><thead><tr><th>ПЛАТЁЖ</th><th>СУММА</th><th>ПОВТОРЕНИЕ</th><th>ПЕРВЫЙ СРОК</th><th>СОСТОЯНИЕ</th>${state.user.role === 'admin' ? '<th></th>' : ''}</tr></thead><tbody>${state.recurring.map((r) => `<tr><td><div class="payment-name"><span class="payment-icon ${r.currency.toLowerCase()}">${cycleIcon}</span><span><b>${esc(r.title)}</b><small>${r.unpaid_count} неоплаченных периодов</small></span></div></td><td class="amount-cell ${moneySize(r.amount)}">${fmt(r.amount)}<small>${symbols[r.currency]}</small></td><td class="date-cell">${r.anchor_day}-го числа ежемесячно</td><td class="date-cell">${dateFmt(r.first_due_date, {day:'numeric',month:'short',year:'numeric'})}</td><td><span class="pill ${r.active ? 'paid' : 'archived'}">${r.active ? 'Активен' : 'Архив'}</span></td>${state.user.role === 'admin' ? `<td>${r.active ? `<button class="row-action delete" data-action="archive" data-id="${r.id}">Прекратить ↗</button>` : '—'}</td>` : ''}</tr>`).join('')}</tbody></table>` : '<div class="empty-state"><b>Начните с регулярного платежа</b>Добавьте аренду, сервер или подписку.</div>';
}

function renderCalendar() {
  const [year, month] = state.month.split('-').map(Number);
  const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const last = new Date(year, month, 0).getDate();
  const items = state.calendar ? state.calendar.days.flatMap((day)=>day.items) : selectedOccurrences();
  let html = ['ПН','ВТ','СР','ЧТ','ПТ','СБ','ВС'].map((d) => `<div class="calendar-weekday">${d}</div>`).join('');
  html += '<div class="calendar-day blank" aria-hidden="true"></div>'.repeat(firstWeekday);
  for (let day = 1; day <= last; day++) {
    const date = `${state.month}-${String(day).padStart(2, '0')}`;
    const daily = items.filter((o) => o.due_date === date);
    const dayTotals=state.calendar?.days.find((d)=>d.date===date)?.currencies;
    const totalsHtml=dayTotals ? Object.entries(dayTotals).filter(([,t])=>Number(t.planned)>0).map(([c,t])=>`${fmt(t.planned)} ${symbols[c]}`).join(' · ') : '';
    html += `<div class="calendar-day ${date === state.config.today ? 'today' : ''}"><span class="calendar-number">${day}</span>${daily.map((o) => `<button class="calendar-item ${o.status} ${o.is_projection ? 'projection' : ''}" data-action="${o.is_projection ? 'pay-projection' : 'pay'}" data-id="${o.id || ''}" data-payment="${o.recurring_payment_id}" data-date="${o.due_date}" title="${esc(o.title)} · ${fmt(o.amount)} ${symbols[o.currency]}${o.is_projection ? ' · прогноз' : ''}">${esc(o.title)}<strong>${fmt(o.amount)} ${symbols[o.currency]}${o.is_projection ? ' *' : ''}</strong></button>`).join('')}${totalsHtml ? `<button class="calendar-day-total" data-action="day-totals" data-date="${date}" title="Итоги на ${dateFmt(date)}">${totalsHtml}</button>` : ''}</div>`;
  }
  const tail = (7 - ((firstWeekday + last) % 7)) % 7;
  html += '<div class="calendar-day blank" aria-hidden="true"></div>'.repeat(tail);
  $('#calendar-grid').innerHTML = html;
}

function renderUsers() {
  $('#users-table').innerHTML = state.users.length ? `<table><thead><tr><th>ИМЯ</th><th>ЛОГИН</th><th>РОЛЬ</th><th>СОЗДАН</th><th></th></tr></thead><tbody>${state.users.map((u) => `<tr><td><b>${esc(u.display_name)}</b></td><td class="date-cell">${esc(u.username)}</td><td><span class="pill paid">Пользователь</span></td><td class="date-cell">${dateFmt(u.created_at.slice(0,10))}</td><td><div class="row-action-group"><button class="row-action" data-action="edit-user" data-id="${u.id}">Изменить ↗</button><button class="row-action delete" data-action="delete-user" data-id="${u.id}">Удалить</button></div></td></tr>`).join('')}</tbody></table>` : '<div class="empty-state"><b>Пригласите команду</b>Создайте учётную запись для коллеги.<br>Администратор не отображается в этом списке.</div>';
}

async function renderActivity() {
  if(state.logTab==='system')return loadSystemLogs({latest:state.systemPage===1});
  if(state.logTab!=='delivery')return loadAudit({latest:state.auditPage===1});
  const [reminders, deliveries] = await Promise.all([api('/reminders'), api('/deliveries')]);
  $('#telegram-notice').textContent = state.config.telegram_enabled ? 'Telegram включён. Проверка выполняется автоматически. Неопределённая отправка требует проверки администратором — автоматического повтора не будет.' : 'Telegram пока выключен. Для реальных напоминаний задайте токен и ID чата в .env, установите TELEGRAM_ENABLED=true и перезапустите приложение.';
  const names = {pending:'Ожидает', sending:'Отправляется', sent:'Отправлено', uncertain:'Нужна проверка', cancelled:'Отменено'};
  $('#reminder-table').innerHTML = reminders.length ? `<table><thead><tr><th>ПЛАТЁЖ</th><th>СРОК</th><th>СОСТОЯНИЕ</th><th>ПРИМЕЧАНИЕ</th></tr></thead><tbody>${reminders.map((r) => `<tr><td>${esc(r.title)}</td><td class="date-cell">${dateFmt(r.due_date)}</td><td><span class="pill ${r.state === 'sent' ? 'paid' : r.state === 'uncertain' ? 'overdue' : 'unpaid'}">${names[r.state]}</span></td><td class="date-cell">${esc(r.error || (r.sent_at ? 'Отправлено ' + dateFmt(r.sent_at.slice(0,10)) : '—'))}</td></tr>`).join('')}</tbody></table>` : '<div class="empty-state">Отправок пока нет. Здесь появится состояние каждого напоминания.</div>';
  const channels={email:'Email / SMTP',webhook:'Webhook',in_app:'В панели'};
  $('#delivery-table').innerHTML=deliveries.length ? `<table><thead><tr><th>КАНАЛ</th><th>ПЛАТЁЖ</th><th>СРОК</th><th>СОСТОЯНИЕ</th><th>ПРИМЕЧАНИЕ</th></tr></thead><tbody>${deliveries.map((r)=>`<tr><td>${channels[r.channel]}</td><td>${esc(r.title)}</td><td class="date-cell">${dateFmt(r.due_date)}</td><td><span class="pill ${r.state==='sent' ? 'paid' : r.state==='uncertain' ? 'overdue' : 'unpaid'}">${r.channel==='email' && r.state==='sent' ? 'Принято SMTP' : names[r.state]}</span></td><td class="date-cell">${esc(r.error || '—')}</td></tr>`).join('')}</tbody></table>` : '<div class="empty-state">Доставок через дополнительные каналы пока нет.</div>';
}

function auditDetails(a) {
  const d=a.details || {}, lines=[];
  const fullDate=(v)=>v ? dateFmt(v,{day:'numeric',month:'long',year:'numeric'}) : 'не указана';
  if (d.title) lines.push(esc(d.title));
  if (d.due_date) lines.push('Срок: '+esc(fullDate(d.due_date)));
  if (d.amount) lines.push('Сумма: '+esc(d.amount)+' '+esc(d.currency || ''));
  if (Object.hasOwn(d,'old_paid_at')) {
    lines.push(`Дата оплаты: <span class="audit-before">${esc(fullDate(d.old_paid_at))}</span> → <b>${esc(fullDate(d.paid_at))}</b>`);
  } else if (d.paid_at) lines.push('Дата оплаты: '+esc(fullDate(d.paid_at)));
  for (const [field,label] of [['username','Логин'],['display_name','Имя']]) {
    if (d[field] && d['old_'+field] && d[field]!==d['old_'+field]) lines.push(`${label}: ${esc(d['old_'+field])} → <b>${esc(d[field])}</b>`);
    else if (d[field]) lines.push(label+': '+esc(d[field]));
  }
  if (d.password_changed) lines.push('Пароль изменён · сеансы пользователя завершены');
  if (d.name) lines.push('Вложение: '+esc(d.name));
  if (d.kind) lines.push('Тип: '+esc(({file:'файл',link:'ссылка'})[d.kind] || d.kind));
  if (d.state) lines.push('Доставка: '+esc(({sent:'принято каналом',pending:'ожидает',sending:'отправляется',uncertain:'нужна проверка',cancelled:'отменена'})[d.state] || d.state));
  if (d.source) lines.push('Источник: '+esc(({panel:'панель / API',telegram:'Telegram',calendar:'календарь','workflow-demo':'демонстрация'})[d.source] || d.source));
  return lines.map((line)=>`<div>${line}</div>`).join('') || '—';
}

function auditEntity(a) {
  if (a.entity==='session') return 'Авторизация';
  if (a.action==='authorization.denied') return a.entity;
  if (a.action==='notification.test') return ({email:'Email',webhook:'Webhook'})[a.entity] || a.entity;
  const label=a.action.startsWith('user.') ? 'Пользователь' : a.action.startsWith('recurring.') || ['example.create','one_time.create','occurrence.create'].includes(a.action) ? 'Платёж' : 'Период';
  return `${label} №${a.entity}`;
}

function renderAudit() {
  const results={success:['paid','Успешно'],failure:['overdue','Ошибка входа'],denied:['overdue','Доступ запрещён'],attention:['unpaid','Нужна проверка']};
  const timestamp=new Intl.DateTimeFormat('ru-RU',{timeZone:state.config.timezone,day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'});
  $('#audit-table').innerHTML=state.audit.length ? `<table><thead><tr><th>ВРЕМЯ</th><th>ПОЛЬЗОВАТЕЛЬ</th><th>ДЕЙСТВИЕ / ОБЪЕКТ</th><th>РЕЗУЛЬТАТ</th><th>ПОДРОБНОСТИ</th></tr></thead><tbody>${state.audit.map((a)=>{
    const result=results[a.result] || results.attention;
    const parsed=new Date(a.created_at);
    return `<tr><td class="date-cell">${esc(Number.isNaN(parsed.getTime()) ? a.created_at : timestamp.format(parsed))}</td><td class="audit-actor">${esc(a.actor)}${a.action==='login.failed' ? '<small>Логин не подтверждён</small>' : ''}</td><td class="audit-detail"><b>${esc(a.action_label)}</b><small>${esc(auditEntity(a))}</small></td><td><span class="pill ${result[0]}">${result[1]}</span></td><td class="audit-detail">${auditDetails(a)}</td></tr>`;
  }).join('')}</tbody></table>` : '<div class="empty-state"><b>События не найдены</b>Измените фильтры или сбросьте их, чтобы увидеть всю историю.</div>';
  const first=state.auditTotal ? (state.auditPage-1)*state.auditSize+1 : 0;
  $('#audit-count').textContent=`${first}–${Math.min(state.auditPage*state.auditSize,state.auditTotal)} из ${state.auditTotal}`;
  $('#audit-page-info').textContent=`Страница ${state.auditPage} из ${state.auditPages}`;
  $('#audit-timezone').textContent='Время событий: '+state.config.timezone;
  $('#audit-prev').disabled=state.auditLoading || state.auditPage<=1;
  $('#audit-next').disabled=state.auditLoading || state.auditPage>=state.auditPages;
}

async function loadAudit({reset=false,latest=false,page=state.auditPage}={}) {
  const request=++state.auditRequest;
  const query=new URLSearchParams({...state.auditFilters,page:reset ? 1 : page,page_size:state.auditSize});
  if (!reset && !latest && state.auditSnapshot!==null) query.set('snapshot_id',state.auditSnapshot);
  state.auditLoading=true;
  $('#audit-table').setAttribute('aria-busy','true');
  $('#audit-prev').disabled=true;$('#audit-next').disabled=true;
  $('#audit-error').hidden=true;
  try {
    const data=await api('/audit-log/page?'+query);
    if (request!==state.auditRequest) return;
    state.audit=data.items;state.auditTotal=data.total;state.auditPage=data.page;
    state.auditPages=data.pages;state.auditSnapshot=data.snapshot_id;
    for (const [id,options,empty] of [['audit-actor',data.actors.map((a)=>({value:a,label:a})),'Все пользователи'],['audit-action',data.actions,'Все действия']]) {
      const select=$('#'+id),selected=select.value;
      select.innerHTML=`<option value="">${empty}</option>`+options.map((o)=>`<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
      select.value=selected;
    }
  } catch (e) {
    if (request!==state.auditRequest) return;
    $('#audit-error').textContent=e.message+' · Список не обновлён.';
    $('#audit-error').hidden=false;
  } finally {
    if (request===state.auditRequest) {
      state.auditLoading=false;
      $('#audit-table').setAttribute('aria-busy','false');
      renderAudit();
    }
  }
}

async function renderBudget(){
  const query=new URLSearchParams({year:state.budgetYear,include_archived:String(state.includeArchived)});
  if(state.budgetMode==='month')query.set('month',state.budgetMonth);
  const budget=await api('/payments/budget?'+query);
  $('#budget-cards').innerHTML=Object.entries(budget.currencies).map(([c,t])=>`<article class="summary-card"><div class="summary-top"><span class="currency-label"><span class="currency-symbol">${symbols[c]}</span>${c}</span><span>${currencyNames[c]}</span></div><div class="summary-amount ${moneySize(t.planned)}">${fmt(t.planned)}<small>${symbols[c]}</small></div><p class="summary-caption">План на ${state.budgetMode==='year' ? 'год' : 'месяц'}</p><div class="budget-card-detail"><span>Оплачено <b>${fmt(t.paid)} ${symbols[c]}</b></span><span>Осталось <b>${fmt(t.remaining)} ${symbols[c]}</b></span><span>${t.count} ${plural(t.count,'период','периода','периодов')}</span></div></article>`).join('');
  $('#budget-note').textContent=`Разовые платежи учтены один раз, регулярные — ежемесячно, по сроку оплаты. ${budget.projection_count} ${plural(budget.projection_count,'будущий период рассчитан','будущих периода рассчитаны','будущих периодов рассчитаны')} без создания записей в истории. Конвертации валют нет.`;
  $('#budget-table').innerHTML=`<table><thead><tr><th>МЕСЯЦ</th>${Object.keys(symbols).map((c)=>`<th>${c} · ПЛАН</th>`).join('')}</tr></thead><tbody>${budget.months.map((m)=>`<tr><td>${dateFmt(m.month+'-01',{month:'long',year:'numeric'})}</td>${Object.entries(m.currencies).map(([c,t])=>`<td class="amount-cell">${fmt(t.planned)}<small>${symbols[c]}</small></td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function browserStatus(){
  const button=$('#enable-browser');
  if(!('Notification' in window)){button.textContent='Недоступно в этом браузере';button.disabled=true;return;}
  const enabled=localStorage.getItem('invoice-browser-notices:'+state.user.username)==='true';
  button.textContent=Notification.permission==='denied' ? 'Заблокировано в браузере' : enabled && Notification.permission==='granted' ? 'Выключить' : 'Включить';
  button.disabled=Notification.permission==='denied';
}

function renderNotifications(data){
  state.notifications=data.items;
  $('#notification-count').textContent=data.unread_count;
  $('#bell-count').textContent=data.unread_count>99 ? '99+' : data.unread_count;
  $('#notification-list').innerHTML=data.items.length ? data.items.map((n)=>`<article class="notification-card ${n.read ? 'read' : 'unread'}"><span class="payment-icon ${n.currency.toLowerCase()}">${n.paid_at ? checkIcon : clockIcon}</span><div><h3>${esc(n.title)}</h3><p>${fmt(n.amount)} ${symbols[n.currency]} · срок ${dateFmt(n.due_date,{day:'numeric',month:'long',year:'numeric'})}</p><small>${n.paid_at ? 'Оплачено '+dateFmt(n.paid_at) : n.active ? 'Ожидает оплаты' : 'В архиве'}</small></div><div class="notification-actions"><button class="row-action" data-action="pay" data-id="${n.occurrence_id}">${n.paid_at ? 'Посмотреть' : 'Отметить оплату'}</button><button class="text-button" data-action="read-notification" data-id="${n.id}" data-read="${!n.read}">${n.read ? 'В непрочитанные' : 'Прочитать'}</button></div></article>`).join('') : '<div class="ledger empty-state"><b>Важное появится здесь</b>Когда до срока останется 3 дня, добавим напоминание.</div>';
  browserStatus();
  if('Notification' in window && Notification.permission==='granted' && localStorage.getItem('invoice-browser-notices:'+state.user.username)==='true'){
    let shown=0;
    for(const n of data.items.filter((x)=>!x.read && !x.paid_at && x.active).slice().reverse()){
      const key=`invoice-notified:${state.user.username}:${n.id}`;
      if(localStorage.getItem(key))continue;
      if(shown++<3){try{new Notification('Invoice Keeper · '+n.title,{body:`${fmt(n.amount)} ${symbols[n.currency]} · срок ${dateFmt(n.due_date)}`,tag:'invoice-'+n.id});}catch{}}
      localStorage.setItem(key,'true');
    }
  }
}

async function renderChannels(){
  const c=await api('/integrations');
  const card=(title,on,description,extra='')=>`<article class="channel-card"><div class="channel-card-top"><h2>${title}</h2><span class="pill ${on ? 'paid' : 'archived'}">${on ? 'Включён' : 'Не подключён'}</span></div><p>${description}</p>${extra}</article>`;
  $('#channel-cards').innerHTML=card('Telegram',c.telegram.enabled,`Напоминания за 3 дня до срока. ${c.telegram.commands_enabled ? 'Меню /menu: списки платежей, сводка и карточки. ' : ''}${c.telegram.buttons_enabled ? 'Кнопка «Оплачено» доступна доверенным участникам чата.' : 'Кнопки оплаты не включены: для группы нужен список доверенных участников.'}`)+card('Email / SMTP',c.email.enabled,`Отправитель: <b>${esc(c.email.sender || 'не задан')}</b><br>Получатель: <b>${esc(c.email.recipient || 'не задан')}</b><br>${esc(c.email.host || 'Сервер не задан')} · ${c.email.port} · ${esc(c.email.security.toUpperCase())}`,`<button class="button secondary" data-action="test-channel" data-channel="email" ${c.email.enabled ? '' : 'disabled'}>Отправить тестовое письмо</button><small>«Принято SMTP» означает приём сервером, а не гарантию попадания во «Входящие».</small>`)+card('Webhook',c.webhook.enabled,`Получатель: <b>${esc(c.webhook.host || 'не задан')}</b><br>JSON-события с подписью HMAC и постоянным ключом доставки.`, `<button class="button secondary" data-action="test-channel" data-channel="webhook" ${c.webhook.enabled ? '' : 'disabled'}>Отправить тестовое событие</button>`)+card('В панели и браузере',c.in_app.enabled,'Лента напоминаний для команды и персональные отметки прочтения. Браузерные уведомления включаются добровольно в разделе «Уведомления».');
}

function updateMonths() {
  const label = dateFmt(state.month + '-01', {month:'long',year:'numeric'}).replace(/ г\.$/, '');
  const capitalized = label[0].toUpperCase() + label.slice(1);
  $('#month-label').textContent = capitalized;
  $('#calendar-month').textContent = capitalized;
  $('#overview-month').textContent=capitalized+' · по сроку оплаты';
}

async function refresh() {
  const id = ++state.refreshId;
  $('#global-error').hidden = true;
  try {
    const range = new URLSearchParams(monthRange());
    const [occurrences, recurring, summary, config,calendar,notifications] = await Promise.all([api('/payment-occurrences'), api('/recurring-payments'), api('/payments/summary?' + range), api('/settings'),api('/calendar?'+range),api('/notifications')]);
    if (id !== state.refreshId) return;
    state.occurrences = occurrences;
    state.recurring = recurring;
    state.config = config;
    state.calendar=calendar;
    $('#today-label').textContent = dateFmt(config.today,{day:'numeric',month:'long',year:'numeric'});
    renderSummary(summary); renderOverview(); renderPayments(); renderNotice(); renderRecurring(); renderCalendar(); updateMonths();
    renderNotifications(notifications);
    $('#sidebar-telegram').textContent=config.telegram_enabled ? 'Telegram подключён' : 'Telegram не подключён';
    $('#reminder-caption').textContent=config.telegram_enabled ? 'Напомним в Telegram за 3 дня' : 'Telegram выключен · настройте в .env';
    if (state.page === 'users') { state.users = await api('/users'); renderUsers(); }
    if (state.page === 'activity') await renderActivity();
    if (state.page === 'budget') await renderBudget();
    if (state.page === 'channels') await renderChannels();
  } catch (error) {
    if (id !== state.refreshId) return;
    $('#global-error').textContent = error.message;
    $('#global-error').hidden = false;
  }
}

function switchPage(page) {
  if (!pageNames[page] || (['users','activity','channels'].includes(page) && state.user.role !== 'admin')) return;
  state.page = page;
  if(page==='overview')state.month=state.config.today.slice(0,7);
  if(['payments','history'].includes(page)){state.status='all';state.range='all';state.frequency='';state.currency='';state.search='';$('#search').value='';$('#currency-filter').value='';$('#frequency-filter').value='';}
  document.body.dataset.page = page;
  $('#month-health').hidden = page !== 'overview';
  $$('.page-panel').forEach((p) => { p.hidden = p.id !== (page==='history' ? 'payments' : page) + '-page'; });
  $$('.nav-item').forEach((n) => { n.classList.toggle('active', n.dataset.page === page); n.setAttribute('aria-current', n.dataset.page === page ? 'page' : 'false'); });
  const [breadcrumb, title, subtitle] = pageNames[page];
  $('#breadcrumb-page').textContent = breadcrumb; $('#page-title').textContent = title; $('#page-subtitle').textContent = subtitle;
  $('#add-payment').hidden = state.user.role !== 'admin' || ['activity','channels','notifications'].includes(page);
  $('#add-payment').innerHTML = page === 'users' ? '<span class="button-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></span> Добавить участника' : '<span class="button-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></span> Добавить платёж';
  document.title = breadcrumb + ' · Invoice Keeper';
  refresh();
}

function openModal(title, html, onSubmit) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = html;
  const form = $('#modal-body form');
  if (form) form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submits = $$('button[type=submit]', form);
    const error = $('.form-error', form);
    submits.forEach((button)=>{button.disabled=true;}); error.hidden = true;
    try { await onSubmit(new FormData(form), event.submitter); }
    catch (e) { error.textContent = e.message; error.hidden = false; }
    finally { submits.forEach((button)=>{button.disabled=false;}); }
  });
  if(!$('#modal').open)$('#modal').showModal();
}

const formEnd = (label) => `<p class="form-error" role="alert" hidden></p><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Отмена</button><button type="submit" class="button primary">${label}</button></div></form>`;

function createPayment() {
  openModal('Новый платёж', `<form class="modal-form"><div class="form-field"><label for="payment-kind">Как оплачивается</label><select id="payment-kind" name="kind"><option value="once">Один раз — за работу, услугу или покупку</option><option value="monthly">Ежемесячно — подписка или постоянный расход</option></select></div><div class="form-field"><label for="payment-title">Название платежа</label><input id="payment-title" name="title" maxlength="120" required placeholder="Например, аренда офиса" autofocus></div><div class="form-row"><div class="form-field"><label for="payment-amount">Сумма</label><input id="payment-amount" name="amount" type="number" step="0.01" min="0.01" max="9999999999.99" required placeholder="0,00"></div><div class="form-field"><label for="payment-currency">Валюта</label><select id="payment-currency" name="currency"><option>RUB</option><option>USD</option><option>EUR</option></select></div></div><div class="form-field"><label for="payment-date">Срок оплаты</label><input id="payment-date" name="first_due_date" type="date" min="2000-01-01" max="2100-12-31" value="${state.config.today}" required><small>Часовой пояс: ${esc(state.config.timezone)}</small></div><div class="form-info" id="payment-kind-help">Разовый платёж создаст одну запись и не повторится в следующем месяце.</div><div class="form-field" id="payment-notes-field"><label for="payment-notes">За что платим <small>необязательно</small></label><textarea id="payment-notes" name="notes" maxlength="1000" rows="3" placeholder="Например: за принятую разработку новой функции"></textarea></div>${formEnd('Добавить платёж')}`, async (data) => {
    const values=Object.fromEntries(data), once=values.kind==='once';
    const payload=once ? {title:values.title,amount:values.amount,currency:values.currency,due_date:values.first_due_date,notes:values.notes} : {title:values.title,amount:values.amount,currency:values.currency,first_due_date:values.first_due_date,frequency:'monthly'};
    await api(once ? '/one-time-payments' : '/recurring-payments',{method:'POST',body:JSON.stringify(payload)});
    $('#modal').close(); switchPage('payments'); toast(once ? 'Разовый платёж добавлен' : 'Регулярный платёж добавлен');
  });
  const kind=$('#payment-kind');
  const updateKind=()=>{
    const once=kind.value==='once';
    $('#payment-notes-field').hidden=!once;
    $('#payment-kind-help').textContent=once ? 'Разовый платёж создаст одну запись и не повторится в следующем месяце.' : 'Каждый месяц создаётся новый период. Оплата одного месяца не влияет на другие.';
  };
  kind.addEventListener('change',updateKind);
  if(state.page==='recurring')kind.value='monthly';
  updateKind();
}

function archiveOnce(item) {
  openModal('Убрать в архив?',`<form class="modal-form"><p class="confirm-copy">${esc(item.title)}<br>Запись, дата оплаты и чеки сохранятся. Новые напоминания прекратятся.</p>${formEnd('В архив')}`,async()=>{
    await api(`/one-time-payments/${item.id}`,{method:'DELETE'});$('#modal').close();await refresh();toast('Разовый платёж в архиве');
  });
}

function editPayment(id) {
  const o = state.occurrences.find((x) => x.id === Number(id));
  if (!o) return;
  openModal(o.paid_at ? 'Изменить оплату' : 'Отметить оплату', `<form class="modal-form"><div class="form-info"><b>${esc(o.title)}</b><br>${fmt(o.amount)} ${symbols[o.currency]} · срок ${dateFmt(o.due_date, {day:'numeric',month:'long',year:'numeric'})}<br>${!o.active ? 'Архивная запись. Напоминания выключены.' : o.frequency==='once' ? 'Разовый платёж. Повторения нет.' : 'Изменение затронет только этот период.'}${o.notes ? '<br>'+esc(o.notes) : ''}</div><div class="form-field"><label for="paid-at">Фактическая дата оплаты</label><input id="paid-at" name="paid_at" type="date" value="${o.paid_at || state.config.today}" max="${state.config.today}" required><small>Исправление этой даты автоматически пересчитает просрочку.</small></div><p class="form-error" role="alert" hidden></p><div class="modal-actions ${o.paid_at ? 'split' : ''}">${o.paid_at ? '<button type="submit" class="button secondary" name="action" value="undo" formnovalidate>Отменить оплату</button>' : '<button type="button" class="button secondary" data-action="close-modal">Назад</button>'}<button type="submit" class="button primary" name="action" value="save">${o.paid_at ? 'Сохранить дату' : 'Подтвердить оплату'}</button></div></form>`, async (data, button) => {
    const undo = button?.value === 'undo';
    await api(`/payment-occurrences/${o.id}`, {method:'PATCH', body:JSON.stringify(undo ? {paid:false} : {paid:true,paid_at:data.get('paid_at')})});
    $('#modal').close(); await refresh(); toast(undo ? 'Оплата отменена. Дата очищена.' : 'Оплата сохранена');
  });
  $('#modal-body').insertAdjacentHTML('beforeend',`<section class="receipt-section" id="receipts-panel" data-occurrence="${o.id}"><div class="receipt-heading"><h3>Чеки и ссылки</h3><span>Только для этого периода</span></div><div id="receipt-error" class="form-error" role="alert" hidden></div><div id="receipt-list" class="receipt-list">Загружаем вложения…</div><form id="receipt-file-form" class="receipt-upload"><label for="receipt-file">Чек PDF, PNG, JPEG или WebP · до 5 MiB</label><div><input id="receipt-file" name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" required><button class="button secondary" type="submit">Прикрепить</button></div></form><details class="receipt-link-details"><summary>Добавить ссылку на квитанцию</summary><form id="receipt-link-form" class="modal-form"><div class="form-field"><label for="receipt-title">Название ссылки</label><input id="receipt-title" name="title" maxlength="180" required placeholder="Например, электронный чек"></div><div class="form-field"><label for="receipt-url">Адрес</label><input id="receipt-url" name="url" type="url" maxlength="2048" required placeholder="https://…"></div><button type="submit" class="button secondary">Сохранить ссылку</button></form></details></section>`);
  const bind=(selector,callback)=>$(selector).addEventListener('submit',async(event)=>{
    event.preventDefault();const button=$('[type=submit]',event.target);button.disabled=true;$('#receipt-error').hidden=true;
    try{await callback(new FormData(event.target));event.target.reset();await loadAttachments(o.id);toast('Вложение добавлено');}
    catch(error){if($('#receipt-error')){$('#receipt-error').textContent=error.message;$('#receipt-error').hidden=false;}}
    finally{button.disabled=false;}
  });
  bind('#receipt-file-form',async(data)=>{
    const file=data.get('file');if(!file?.size || file.size>5*1024*1024)throw new Error('Выберите непустой файл размером до 5 MiB');
    await api(`/payment-occurrences/${o.id}/attachments`,{method:'POST',body:data});
  });
  bind('#receipt-link-form',async(data)=>api(`/payment-occurrences/${o.id}/attachment-links`,{method:'POST',body:JSON.stringify(Object.fromEntries(data))}));
  loadAttachments(o.id).catch((error)=>{if($('#receipt-error')){$('#receipt-error').textContent=error.message;$('#receipt-error').hidden=false;}});
  if(o.frequency==='once' && o.active && state.user.role==='admin'){const archive=document.createElement('button');archive.type='button';archive.className='text-button one-time-archive';archive.textContent='Убрать разовый платёж в архив';archive.addEventListener('click',()=>archiveOnce(o));$('#modal-body').append(archive);}
}

async function loadAttachments(occurrenceId){
  const items=await api(`/payment-occurrences/${occurrenceId}/attachments`);
  if($('#receipts-panel')?.dataset.occurrence!==String(occurrenceId))return;
  $('#receipt-list').innerHTML=items.length ? items.map((a)=>`<div class="receipt-item"><span>${a.kind==='file' ? receiptIcon : '↗'}</span><div><a href="${esc(a.kind==='file' ? a.download_url : a.url)}" target="_blank" rel="noopener noreferrer">${esc(a.name)}</a><small>${a.kind==='file' ? Math.max(1,Math.ceil(a.size/1024))+' KiB · ' : ''}${esc(a.created_by)}</small></div><button type="button" class="text-button delete-link" data-action="delete-attachment" data-id="${a.id}" data-occurrence="${occurrenceId}" aria-label="Удалить ${esc(a.name)}">Удалить</button></div>`).join('') : '<p class="muted receipt-empty">Чеков и ссылок пока нет.</p>';
  const item=state.occurrences.find((x)=>x.id===Number(occurrenceId));if(item)item.attachment_count=items.length;
}

async function openProjected(payment,due){
  const item=await api(`/recurring-payments/${payment}/occurrences`,{method:'POST',body:JSON.stringify({due_date:due})});
  if(!state.occurrences.some((x)=>x.id===item.id))state.occurrences.push(item);
  editPayment(item.id);
}

function showDayTotals(due){
  const day=state.calendar?.days.find((x)=>x.date===due);if(!day)return;
  const rows=Object.entries(day.currencies).filter(([,t])=>t.count>0);
  openModal('Итоги на '+dateFmt(due,{day:'numeric',month:'long',year:'numeric'}),`<div class="day-totals">${rows.map(([c,t])=>`<article><b>${c}</b><strong>${fmt(t.planned)} ${symbols[c]}</strong><span>Оплачено ${fmt(t.paid)} ${symbols[c]} · осталось ${fmt(t.remaining)} ${symbols[c]}</span></article>`).join('')}</div><div class="day-payment-list">${day.items.map((o)=>`<button class="day-payment" data-action="${o.is_projection ? 'pay-projection' : 'pay'}" data-id="${o.id || ''}" data-payment="${o.recurring_payment_id}" data-date="${o.due_date}"><span>${esc(o.title)}<small>${o.is_projection ? 'Прогноз' : statusNames[o.status]}</small></span><b>${fmt(o.amount)} ${symbols[o.currency]} ↗</b></button>`).join('')}</div>`);
}

function archivePayment(id) {
  const r = state.recurring.find((x) => x.id === Number(id));
  if (!r) return;
  openModal('Прекратить повторение?', `<form class="modal-form"><p class="confirm-copy"><b>${esc(r.title)}</b><br>Новые периоды и напоминания создаваться не будут. Все уже созданные периоды, даты и история оплат сохранятся в архиве.</p><p class="form-error" role="alert" hidden></p><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Оставить</button><button type="submit" class="button danger">Прекратить платёж</button></div></form>`, async () => {
    await api(`/recurring-payments/${r.id}`, {method:'DELETE'}); $('#modal').close(); await refresh(); toast('Платёж перенесён в архив. История сохранена.');
  });
}

function editUser(id) {
  const u = id ? state.users.find((x) => x.id === Number(id)) : null;
  openModal(u ? 'Изменить участника' : 'Добавить участника', `<form class="modal-form"><div class="form-field"><label for="user-name">Имя</label><input id="user-name" name="display_name" value="${esc(u?.display_name || '')}" required maxlength="80" placeholder="Алексей Иванов"></div><div class="form-field"><label for="user-login">Логин</label><input id="user-login" name="username" value="${esc(u?.username || '')}" required minlength="3" maxlength="64" pattern="[A-Za-z0-9_.-]+" autocomplete="off" placeholder="alexey"><small>Латинские буквы, цифры, точка, дефис, подчёркивание.</small></div><div class="form-field"><label for="user-password">${u ? 'Новый пароль' : 'Пароль'}</label><input id="user-password" name="password" type="password" minlength="12" maxlength="128" ${u ? '' : 'required'} autocomplete="new-password" placeholder="Минимум 12 символов"><small>${u ? 'Оставьте пустым, чтобы сохранить пароль. Смена пароля завершит все сессии пользователя.' : 'Передайте пароль коллеге лично. Пользователь сможет отмечать оплату и исправлять даты.'}</small></div>${formEnd(u ? 'Сохранить' : 'Создать участника')}`, async (data) => {
    const payload = Object.fromEntries(data);
    if (u && !payload.password) delete payload.password;
    await api(u ? `/users/${u.id}` : '/users', {method:u ? 'PATCH' : 'POST', body:JSON.stringify(payload)});
    $('#modal').close(); await refresh(); toast(u ? 'Участник обновлён' : 'Участник добавлен');
  });
}

function deleteUser(id) {
  const u = state.users.find((x) => x.id === Number(id));
  if (!u) return;
  openModal('Удалить участника?', `<form class="modal-form"><p class="confirm-copy"><b>${esc(u.display_name)}</b> потеряет доступ к системе. Его действия и история оплаты сохранятся.</p><p class="form-error" role="alert" hidden></p><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Отмена</button><button type="submit" class="button danger">Удалить участника</button></div></form>`, async () => {
    await api(`/users/${u.id}`, {method:'DELETE'}); $('#modal').close(); await refresh(); toast('Участник удалён');
  });
}

function changeMonth(delta) {
  const [y,m] = state.month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  if (d.getFullYear() < 2000 || d.getFullYear() > 2100) return;
  state.month = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  refresh();
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (action === 'close-modal') $('#modal').close();
  if (action === 'create-payment') createPayment();
  if (action === 'pay') editPayment(target.dataset.id);
  if(action==='pay-projection')openProjected(target.dataset.payment,target.dataset.date).catch((e)=>toast(e.message,true));
  if(action==='day-totals')showDayTotals(target.dataset.date);
  if(action==='reset-filters'){
    state.status='all';state.range='all';state.frequency='';state.currency='';state.search='';state.historyFilter='all';
    $('#search').value='';$('#currency-filter').value='';$('#frequency-filter').value='';$('#history-filter').value='all';renderPayments();
  }
  if(action==='workflow-open'){
    switchPage('payments');
    if(target.dataset.view==='overdue')state.status='overdue';
    if(target.dataset.view==='week')state.range='week';
    if(target.dataset.view==='once'){state.frequency='once';$('#frequency-filter').value='once';}
    renderPayments();
  }
  if(action==='open-calendar')switchPage('calendar');
  if(action==='open-history')switchPage('history');
  if(action==='open-notifications')switchPage('notifications');
  if(action==='read-notification')api(`/notifications/${target.dataset.id}`,{method:'PATCH',body:JSON.stringify({read:target.dataset.read==='true'})}).then(refresh).catch((e)=>toast(e.message,true));
  if(action==='delete-attachment' && window.confirm('Удалить вложение? Действие сохранится в журнале.'))api(`/attachments/${target.dataset.id}`,{method:'DELETE'}).then(()=>loadAttachments(target.dataset.occurrence)).catch((e)=>toast(e.message,true));
  if(action==='test-channel'){
    target.disabled=true;
    api(`/integrations/${target.dataset.channel}/test`,{method:'POST'}).then((result)=>toast(result.state==='sent' ? 'Тест принят сервисом доставки' : result.error || 'Проверьте настройки канала',result.state!=='sent')).catch((e)=>toast(e.message,true)).finally(()=>{target.disabled=false;});
  }
  if (action === 'archive') archivePayment(target.dataset.id);
  if (action === 'edit-user') editUser(target.dataset.id);
  if (action === 'delete-user') deleteUser(target.dataset.id);
  if (action === 'show-overdue') {
    switchPage('payments');
    const oldest = state.occurrences.find((o) => o.active && o.status === 'overdue');
    if (oldest) { state.range='all'; state.month = oldest.due_date.slice(0,7); state.status = 'overdue'; state.currency = ''; state.search = ''; $('#search').value = ''; $('#currency-filter').value = ''; refresh(); }
  }
});
$('#modal-close').addEventListener('click', () => $('#modal').close());
$('#modal').addEventListener('click', (e) => { if (e.target === $('#modal')) { const r = e.target.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.target.close(); } });
$$('.nav-item').forEach((n) => n.addEventListener('click', () => switchPage(n.dataset.page)));
$('#add-payment').addEventListener('click', () => state.page === 'users' ? editUser() : createPayment());
$$('.status-tabs .status-tab').forEach((t) => t.addEventListener('click', () => { state.status = t.dataset.status; renderPayments(); }));
$('#search').addEventListener('input', (e) => { state.search = e.target.value.trim().toLocaleLowerCase('ru'); renderPayments(); });
$('#history-filter').addEventListener('change',(e)=>{state.historyFilter=e.target.value;renderPayments();});
$('#frequency-filter').addEventListener('change',(e)=>{state.frequency=e.target.value;renderPayments();});
$('#payment-range').addEventListener('change',(e)=>{state.range=e.target.value;refresh();});
$('#currency-filter').addEventListener('change', (e) => { state.currency = e.target.value; renderPayments(); });
$('#prev-month').addEventListener('click', () => changeMonth(-1));
$('#next-month').addEventListener('click', () => changeMonth(1));
$('#calendar-prev').addEventListener('click', () => changeMonth(-1));
$('#calendar-next').addEventListener('click', () => changeMonth(1));
$('#current-month').addEventListener('click', () => { state.range='month'; state.month = state.config.today.slice(0,7); refresh(); });
$('#logout').addEventListener('click', async () => { try { await api('/auth/logout', {method:'POST'}); window.location.assign('/login'); } catch (e) { toast(e.message, true); } });
function selectLogTab(tab) {
  state.logTab=tab;
  $$('[data-log-tab]').forEach(button=>{
    const selected=button.dataset.logTab===tab;
    button.setAttribute('aria-selected',String(selected));button.tabIndex=selected ? 0 : -1;
    $('#log-'+button.dataset.logTab+'-panel').hidden=!selected;
  });
  renderActivity().catch(e=>toast(e.message,true));
}
$$('[data-log-tab]').forEach((button,index,buttons)=>{
  button.addEventListener('click',()=>selectLogTab(button.dataset.logTab));
  button.addEventListener('keydown',e=>{
    const next=e.key==='ArrowRight' ? (index+1)%buttons.length : e.key==='ArrowLeft' ? (index+buttons.length-1)%buttons.length : e.key==='Home' ? 0 : e.key==='End' ? buttons.length-1 : null;
    if(next!==null){e.preventDefault();buttons[next].focus();selectLogTab(buttons[next].dataset.logTab);}
  });
});
async function loadSystemLogs({reset=false,latest=false,page=state.systemPage}={}) {
  const request=++state.systemRequest;
  const query=new URLSearchParams({...state.systemFilters,page:reset ? 1 : page,page_size:50});
  if(!reset && !latest && state.systemSnapshot)query.set('snapshot_id',state.systemSnapshot);
  state.systemLoading=true;
  $('#system-log-list').setAttribute('aria-busy','true');
  $('#system-prev').disabled=true;$('#system-next').disabled=true;$('#system-refresh').disabled=true;
  $('#system-error').hidden=true;
  try {
    const data=await api('/system-logs?'+query);
    if(request!==state.systemRequest)return;
    state.systemPage=data.page;state.systemSnapshot=data.snapshot_id;
    const timestamp=new Intl.DateTimeFormat('ru-RU',{dateStyle:'short',timeStyle:'medium',timeZone:data.timezone});
    const levels={INFO:'Информация',WARNING:'Предупреждение',ERROR:'Ошибка',CRITICAL:'Критическая ошибка',DEBUG:'Диагностика'};
    $('#system-log-list').innerHTML=data.items.length ? data.items.map(item=>{
      const content=esc(item.message),lines=item.message.split('\n');
      return `<article class="system-log-entry"><div class="system-log-meta"><span class="log-level log-${item.level.toLowerCase()}">${levels[item.level] || esc(item.level)}</span><time datetime="${esc(item.timestamp)}">${esc(timestamp.format(new Date(item.timestamp)))}</time><span>${esc(item.source)}</span><span>PID ${item.process}</span>${item.request_id ? '<span>Запрос '+esc(item.request_id)+'</span>' : ''}</div>${lines.length>4 || item.message.length>500 ? `<details class="log-message-detail"><summary>${esc(lines[0].slice(0,200))} · Подробнее</summary><pre>${content}</pre></details>` : `<pre>${content}</pre>`}</article>`;
    }).join('') : '<div class="empty-state"><b>Записи не найдены</b>Измените фильтры или сбросьте их. Новые события появляются после запросов и работы сервиса.</div>';
    const source=$('#system-source'),selected=source.value;
    source.innerHTML='<option value="">Все источники</option>'+data.sources.map(value=>`<option value="${esc(value)}">${esc(value)}</option>`).join('');source.value=selected;
    $('#system-timezone').textContent='Время событий: '+data.timezone;
    $('#system-count').textContent=`${data.total ? (data.page-1)*50+1 : 0}–${Math.min(data.page*50,data.total)} из ${data.total}`;
    $('#system-page-info').textContent=`Страница ${data.page} из ${data.pages}`;
    $('#system-prev').disabled=data.page<=1;$('#system-next').disabled=data.page>=data.pages;
    if(data.unavailable){$('#system-error').textContent='Часть логов недоступна. Проверьте доступ к каталогу логов и свободное место на диске.';$('#system-error').hidden=false;}
  } catch(e) {
    if(request!==state.systemRequest)return;
    $('#system-error').textContent=e.message+' · Логи не обновлены.';$('#system-error').hidden=false;
  } finally {
    if(request===state.systemRequest){state.systemLoading=false;$('#system-log-list').setAttribute('aria-busy','false');$('#system-refresh').disabled=false;}
  }
}
$('#system-filters').addEventListener('submit',e=>{
  e.preventDefault();state.systemFilters=Object.fromEntries([...new FormData(e.currentTarget)].filter(([,value])=>value.trim()));loadSystemLogs({reset:true});
});
$('#system-reset').addEventListener('click',()=>{$('#system-filters').reset();state.systemFilters={};loadSystemLogs({reset:true});});
$('#system-refresh').addEventListener('click',()=>loadSystemLogs({reset:true}));
$('#system-prev').addEventListener('click',()=>{if(!state.systemLoading)loadSystemLogs({page:state.systemPage-1});});
$('#system-next').addEventListener('click',()=>{if(!state.systemLoading)loadSystemLogs({page:state.systemPage+1});});
$('#audit-filters').addEventListener('submit',(e)=>{
  e.preventDefault();
  state.auditFilters=Object.fromEntries([...new FormData(e.currentTarget)].filter(([,value])=>value.trim()));
  loadAudit({reset:true});
});
$('#audit-reset').addEventListener('click',()=>{
  $('#audit-filters').reset();state.auditFilters={};loadAudit({reset:true});
});
$('#audit-refresh').addEventListener('click',()=>loadAudit({reset:true}));
$('#audit-prev').addEventListener('click',()=>{if(!state.auditLoading && state.auditPage>1)loadAudit({page:state.auditPage-1});});
$('#audit-next').addEventListener('click',()=>{if(!state.auditLoading && state.auditPage<state.auditPages)loadAudit({page:state.auditPage+1});});
$('#read-all-notifications').addEventListener('click',()=>api('/notifications/read-all',{method:'POST'}).then(refresh).catch((e)=>toast(e.message,true)));
$('#enable-browser').addEventListener('click',async()=>{
  if(!('Notification' in window))return;
  const key='invoice-browser-notices:'+state.user.username;
  if(Notification.permission==='granted' && localStorage.getItem(key)==='true'){localStorage.setItem(key,'false');browserStatus();return;}
  try{
    const permission=await Notification.requestPermission();
    localStorage.setItem(key,String(permission==='granted'));browserStatus();
    toast(permission==='granted' ? 'Уведомления включены при открытой панели' : 'Разрешение на уведомления не выдано');
  }catch{toast('Этот браузер не разрешает системные уведомления',true);}
});
function setBudgetMode(mode){
  state.budgetMode=mode;$('#budget-month-label').hidden=mode!=='month';
  $('#budget-year-mode').classList.toggle('selected',mode==='year');$('#budget-month-mode').classList.toggle('selected',mode==='month');
  $('#budget-year-mode').setAttribute('aria-pressed',String(mode==='year'));$('#budget-month-mode').setAttribute('aria-pressed',String(mode==='month'));
  renderBudget().catch((e)=>toast(e.message,true));
}
$('#budget-year-mode').addEventListener('click',()=>setBudgetMode('year'));
$('#budget-month-mode').addEventListener('click',()=>setBudgetMode('month'));
$('#budget-year').addEventListener('change',(e)=>{const value=Number(e.target.value);if(value>=2000 && value<=2100){state.budgetYear=value;renderBudget().catch((e)=>toast(e.message,true));}});
$('#budget-month').addEventListener('change',(e)=>{state.budgetMonth=Number(e.target.value);renderBudget().catch((e)=>toast(e.message,true));});
$('#budget-archive').addEventListener('change',(e)=>{state.includeArchived=e.target.checked;renderBudget().catch((e)=>toast(e.message,true));});

async function init() {
  try {
    state.user = await api('/auth/me'); state.config = await api('/settings'); state.month = state.config.today.slice(0,7);
    state.budgetYear=Number(state.config.today.slice(0,4));state.budgetMonth=Number(state.config.today.slice(5,7));
    $('#budget-year').value=state.budgetYear;
    $('#budget-month').innerHTML=Array.from({length:12},(_,i)=>`<option value="${i+1}">${dateFmt(`2026-${String(i+1).padStart(2,'0')}-01`,{month:'long'})}</option>`).join('');
    $('#budget-month').value=state.budgetMonth;
    $('#profile-avatar').textContent = state.user.display_name[0].toUpperCase();
    $('#profile-name').replaceChildren(document.createTextNode(state.user.display_name), Object.assign(document.createElement('small'), {textContent:state.user.role === 'admin' ? 'Администратор' : 'Пользователь'}));
    $$('.admin-only').forEach((n) => { n.hidden = state.user.role !== 'admin'; });
    $('#today-label').textContent = dateFmt(state.config.today,{day:'numeric',month:'long',year:'numeric'});
    $('#timezone-label').textContent = state.config.timezone;
    $('#sidebar-telegram').textContent = state.config.telegram_enabled ? 'Telegram подключён' : 'Telegram не подключён';
    $('#reminder-caption').textContent = state.config.telegram_enabled ? 'Напомним в Telegram за 3 дня' : 'Telegram выключен · настройте в .env';
    await refresh();
  } catch (e) { $('#global-error').textContent = e.message; $('#global-error').hidden = false; }
}
init();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.config && !$('#modal').open) refresh(); });
setInterval(() => { if (document.visibilityState === 'visible' && state.config && !$('#modal').open) refresh(); }, 60000);
