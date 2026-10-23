'use strict';
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const symbols = {RUB: '₽', USD: '$', EUR: '€'};
const currencyNames = {RUB: 'Российский рубль', USD: 'Доллар США', EUR: 'Евро'};
const fmt = (value) => new Intl.NumberFormat('ru-RU', {minimumFractionDigits: Number(value) % 1 ? 2 : 0, maximumFractionDigits: 2}).format(Number(value));
const dateFmt = (value, options = {day:'numeric', month:'short'}) => value ? new Intl.DateTimeFormat('ru-RU', options).format(new Date(value + 'T12:00:00')) : '—';
const plural = (n, one, few, many) => n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many;
const state = {user: null, config: null, occurrences: [], recurring: [], users: [], month: '', status: 'all', currency: '', search: '', page: 'payments', refreshId: 0};
const pageNames = {payments: ['Платежи', 'Обзор платежей', 'Планируйте расходы. Отмечайте оплату. Дальше — мы напомним.'], recurring: ['Регулярные', 'Регулярные платежи', 'Один раз настройте расход — система создаст следующие периоды.'], calendar: ['Календарь', 'Календарь оплат', 'Посмотрите, как распределяются расходы в течение месяца.'], users: ['Команда', 'Ваша команда', 'Дайте коллегам доступ к платежам и истории оплат.'], activity: ['Журнал', 'История действий', 'Состояние напоминаний и последние изменения в системе.']};
const statusNames = {paid:'Оплачено', unpaid:'К оплате', overdue:'Просрочено'};
let toastTimer;

function toast(message, error = false) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').classList.toggle('error', error);
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4500);
}

async function api(path, options = {}) {
  const headers = {'Content-Type': 'application/json', ...options.headers};
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

function renderSummary(summary) {
  $('#summary-cards').innerHTML = Object.entries(summary.currencies).map(([currency, totals]) => {
    const ratio = Number(totals.total) ? Math.round(Number(totals.paid) / Number(totals.total) * 10) * 10 : 0;
    return `<article class="summary-card"><div class="summary-top"><span class="currency-label"><span class="currency-symbol">${symbols[currency]}</span>${currency}</span><span>${currencyNames[currency]}</span></div><div class="summary-amount">${fmt(totals.unpaid)}<small>${symbols[currency]}</small></div><p class="summary-caption">Осталось оплатить в этом месяце</p><div class="summary-track" aria-label="Оплачено ${ratio}%"><span class="track-${ratio}"></span></div><div class="summary-bottom"><span>Оплачено <b>${fmt(totals.paid)} ${symbols[currency]}</b></span><span>Всего ${fmt(totals.total)} ${symbols[currency]}</span></div></article>`;
  }).join('');
}

function renderNotice() {
  const overdue = state.occurrences.filter((o) => o.active && o.status === 'overdue');
  const notice = $('#due-notice');
  notice.hidden = overdue.length === 0;
  if (overdue.length) notice.innerHTML = `<span class="notice-symbol" aria-hidden="true">◷</span><span><b>${overdue.length} ${plural(overdue.length, 'платёж требует', 'платежа требуют', 'платежей требуют')} внимания.</b> Есть неоплаченные периоды с истёкшим сроком.</span><button class="text-button notice-detail" data-action="show-overdue">Показать просрочки ↗</button>`;
  $('#nav-count').textContent = state.occurrences.filter((o) => o.active && o.status !== 'paid' && o.due_date <= state.config.today).length;
}

function renderPayments() {
  const filterBase = selectedOccurrences().filter((o) => (!state.currency || o.currency === state.currency) && (!state.search || o.title.toLocaleLowerCase('ru').includes(state.search)));
  const counts = {all: filterBase.length, unpaid: filterBase.filter((o) => o.status !== 'paid').length, overdue: filterBase.filter((o) => o.status === 'overdue').length, paid: filterBase.filter((o) => o.status === 'paid').length};
  Object.entries(counts).forEach(([name, n]) => { $('#count-' + name).textContent = n; });
  $$('.status-tab').forEach((tab) => { const selected = tab.dataset.status === state.status; tab.classList.toggle('selected', selected); tab.setAttribute('aria-pressed', String(selected)); });
  const items = filterBase.filter((o) => state.status === 'all' || (state.status === 'unpaid' ? o.status !== 'paid' : o.status === state.status));
  $('#table-count').textContent = `${items.length} ${plural(items.length, 'платёж', 'платежа', 'платежей')}`;
  const root = $('#occurrence-table');
  if (!items.length) {
    const filtered = state.search || state.currency || state.status !== 'all';
    root.innerHTML = `<div class="empty-state"><b>${filtered ? 'Ничего не нашлось' : 'Здесь пока спокойно'}</b>${filtered ? 'Измените запрос, валюту или статус.' : 'В этом месяце нет созданных периодов оплаты.<br>Система создаёт периоды до конца следующего месяца.'}${state.user.role === 'admin' && !filtered ? '<br><button class="button secondary" data-action="create-payment">Добавить платёж</button>' : ''}</div>`;
    return;
  }
  root.innerHTML = `<table><thead><tr><th>ПЛАТЁЖ</th><th>СУММА</th><th>СРОК ОПЛАТЫ</th><th>СТАТУС</th><th>ДАТА ОПЛАТЫ</th><th></th></tr></thead><tbody>${items.map((o) => `<tr><td><div class="payment-name"><span class="payment-icon ${o.currency.toLowerCase()}" aria-hidden="true">${o.currency === 'RUB' ? '⌂' : o.currency === 'USD' ? '☁' : '▧'}</span><span><b>${esc(o.title)}</b><small>${o.active ? 'Ежемесячно' : 'В архиве · история сохранена'}</small></span></div></td><td class="amount-cell">${fmt(o.amount)}<small>${symbols[o.currency]}</small></td><td class="date-cell ${o.is_late ? 'late' : ''}">${dateFmt(o.due_date)}${o.is_late ? `<small class="late-detail"> · ${o.days_overdue} дн.</small>` : ''}</td><td><span class="pill ${o.status}">${statusNames[o.status]}</span></td><td class="date-cell">${dateFmt(o.paid_at)}</td><td><button class="row-action ${o.status === 'paid' ? 'edit' : ''}" data-action="pay" data-id="${o.id}">${o.status === 'paid' ? 'Изменить ↗' : 'Отметить оплату'}</button></td></tr>`).join('')}</tbody></table>`;
}

function renderRecurring() {
  $('#recurring-table').innerHTML = state.recurring.length ? `<table><thead><tr><th>ПЛАТЁЖ</th><th>СУММА</th><th>ПОВТОРЕНИЕ</th><th>ПЕРВЫЙ СРОК</th><th>СОСТОЯНИЕ</th>${state.user.role === 'admin' ? '<th></th>' : ''}</tr></thead><tbody>${state.recurring.map((r) => `<tr><td><div class="payment-name"><span class="payment-icon ${r.currency.toLowerCase()}">⟳</span><span><b>${esc(r.title)}</b><small>${r.unpaid_count} неоплаченных периодов</small></span></div></td><td class="amount-cell">${fmt(r.amount)}<small>${symbols[r.currency]}</small></td><td class="date-cell">${r.anchor_day}-го числа ежемесячно</td><td class="date-cell">${dateFmt(r.first_due_date, {day:'numeric',month:'short',year:'numeric'})}</td><td><span class="pill ${r.active ? 'paid' : 'archived'}">${r.active ? 'Активен' : 'Архив'}</span></td>${state.user.role === 'admin' ? `<td>${r.active ? `<button class="row-action delete" data-action="archive" data-id="${r.id}">Прекратить ↗</button>` : '—'}</td>` : ''}</tr>`).join('')}</tbody></table>` : '<div class="empty-state"><b>Начните с регулярного платежа</b>Добавьте аренду, сервер или подписку.</div>';
}

function renderCalendar() {
  const [year, month] = state.month.split('-').map(Number);
  const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const last = new Date(year, month, 0).getDate();
  const items = selectedOccurrences();
  let html = ['ПН','ВТ','СР','ЧТ','ПТ','СБ','ВС'].map((d) => `<div class="calendar-weekday">${d}</div>`).join('');
  html += '<div class="calendar-day blank" aria-hidden="true"></div>'.repeat(firstWeekday);
  for (let day = 1; day <= last; day++) {
    const date = `${state.month}-${String(day).padStart(2, '0')}`;
    const daily = items.filter((o) => o.due_date === date);
    html += `<div class="calendar-day ${date === state.config.today ? 'today' : ''}"><span class="calendar-number">${day}</span>${daily.map((o) => `<button class="calendar-item ${o.status}" data-action="pay" data-id="${o.id}" title="${esc(o.title)} · ${fmt(o.amount)} ${symbols[o.currency]}">${esc(o.title)}<strong>${fmt(o.amount)} ${symbols[o.currency]}</strong></button>`).join('')}</div>`;
  }
  const tail = (7 - ((firstWeekday + last) % 7)) % 7;
  html += '<div class="calendar-day blank" aria-hidden="true"></div>'.repeat(tail);
  $('#calendar-grid').innerHTML = html;
}

function renderUsers() {
  $('#users-table').innerHTML = state.users.length ? `<table><thead><tr><th>ИМЯ</th><th>ЛОГИН</th><th>РОЛЬ</th><th>СОЗДАН</th><th></th></tr></thead><tbody>${state.users.map((u) => `<tr><td><b>${esc(u.display_name)}</b></td><td class="date-cell">${esc(u.username)}</td><td><span class="pill paid">Пользователь</span></td><td class="date-cell">${dateFmt(u.created_at.slice(0,10))}</td><td><div class="row-action-group"><button class="row-action" data-action="edit-user" data-id="${u.id}">Изменить ↗</button><button class="row-action delete" data-action="delete-user" data-id="${u.id}">Удалить</button></div></td></tr>`).join('')}</tbody></table>` : '<div class="empty-state"><b>Пригласите команду</b>Создайте учётную запись для коллеги.<br>Администратор не отображается в этом списке.</div>';
}

async function renderActivity() {
  const [reminders, audit] = await Promise.all([api('/reminders'), api('/audit-log')]);
  $('#telegram-notice').textContent = state.config.telegram_enabled ? 'Telegram включён. Проверка выполняется автоматически. Неопределённая отправка требует проверки администратором — автоматического повтора не будет.' : 'Telegram пока выключен. Для реальных напоминаний задайте токен и ID чата в .env, установите TELEGRAM_ENABLED=true и перезапустите приложение.';
  const names = {pending:'Ожидает', sending:'Отправляется', sent:'Отправлено', uncertain:'Нужна проверка', cancelled:'Отменено'};
  $('#reminder-table').innerHTML = reminders.length ? `<table><thead><tr><th>ПЛАТЁЖ</th><th>СРОК</th><th>СОСТОЯНИЕ</th><th>ПРИМЕЧАНИЕ</th></tr></thead><tbody>${reminders.map((r) => `<tr><td>${esc(r.title)}</td><td class="date-cell">${dateFmt(r.due_date)}</td><td><span class="pill ${r.state === 'sent' ? 'paid' : r.state === 'uncertain' ? 'overdue' : 'unpaid'}">${names[r.state]}</span></td><td class="date-cell">${esc(r.error || (r.sent_at ? 'Отправлено ' + dateFmt(r.sent_at.slice(0,10)) : '—'))}</td></tr>`).join('')}</tbody></table>` : '<div class="empty-state">Отправок пока нет. Здесь появится состояние каждого напоминания.</div>';
  const actions = {login:'Вход в систему', 'recurring.create':'Добавлен регулярный платёж', 'recurring.archive':'Прекращён регулярный платёж', 'occurrence.paid':'Отмечена или исправлена оплата', 'occurrence.unpaid':'Отменена оплата', 'user.create':'Создан пользователь', 'user.update':'Изменён пользователь', 'user.delete':'Удалён пользователь'};
  $('#audit-table').innerHTML = audit.length ? `<table><thead><tr><th>ВРЕМЯ</th><th>КТО</th><th>ДЕЙСТВИЕ</th><th>ЗАПИСЬ</th></tr></thead><tbody>${audit.map((a) => `<tr><td class="date-cell">${esc(new Intl.DateTimeFormat('ru-RU',{timeZone:state.config.timezone,day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(a.created_at)))}</td><td>${esc(a.actor)}</td><td>${esc(actions[a.action] || a.action)}</td><td class="date-cell">${esc(a.entity)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty-state">Действий пока нет.</div>';
}

function updateMonths() {
  const label = dateFmt(state.month + '-01', {month:'long',year:'numeric'}).replace(/ г\.$/, '');
  const capitalized = label[0].toUpperCase() + label.slice(1);
  $('#month-label').textContent = capitalized;
  $('#calendar-month').textContent = capitalized;
}

async function refresh() {
  const id = ++state.refreshId;
  $('#global-error').hidden = true;
  try {
    const range = new URLSearchParams(monthRange());
    const [occurrences, recurring, summary, config] = await Promise.all([api('/payment-occurrences'), api('/recurring-payments'), api('/payments/summary?' + range), api('/settings')]);
    if (id !== state.refreshId) return;
    state.occurrences = occurrences;
    state.recurring = recurring;
    state.config = config;
    $('#today-label').textContent = dateFmt(config.today,{day:'numeric',month:'long',year:'numeric'});
    renderSummary(summary); renderPayments(); renderNotice(); renderRecurring(); renderCalendar(); updateMonths();
    if (state.page === 'users') { state.users = await api('/users'); renderUsers(); }
    if (state.page === 'activity') await renderActivity();
  } catch (error) {
    if (id !== state.refreshId) return;
    $('#global-error').textContent = error.message;
    $('#global-error').hidden = false;
  }
}

function switchPage(page) {
  if (!pageNames[page] || ((page === 'users' || page === 'activity') && state.user.role !== 'admin')) return;
  state.page = page;
  $$('.page-panel').forEach((p) => { p.hidden = p.id !== page + '-page'; });
  $$('.nav-item').forEach((n) => { n.classList.toggle('active', n.dataset.page === page); n.setAttribute('aria-current', n.dataset.page === page ? 'page' : 'false'); });
  const [breadcrumb, title, subtitle] = pageNames[page];
  $('#breadcrumb-page').textContent = breadcrumb; $('#page-title').textContent = title; $('#page-subtitle').textContent = subtitle;
  $('#add-payment').hidden = state.user.role !== 'admin' || page === 'activity';
  $('#add-payment').innerHTML = page === 'users' ? '<span>＋</span> Добавить участника' : '<span>＋</span> Добавить платёж';
  document.title = breadcrumb + ' · Invoice Keeper';
  refresh();
}

function openModal(title, html, onSubmit) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = html;
  const form = $('#modal-body form');
  if (form) form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = $('button[type=submit]', form);
    const error = $('.form-error', form);
    submit.disabled = true; error.hidden = true;
    try { await onSubmit(new FormData(form), event.submitter); }
    catch (e) { error.textContent = e.message; error.hidden = false; }
    finally { submit.disabled = false; }
  });
  $('#modal').showModal();
}

const formEnd = (label) => `<p class="form-error" role="alert" hidden></p><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Отмена</button><button type="submit" class="button primary">${label}</button></div></form>`;

function createPayment() {
  openModal('Новый регулярный платёж', `<form class="modal-form"><div class="form-field"><label for="payment-title">Название платежа</label><input id="payment-title" name="title" maxlength="120" required placeholder="Например, аренда офиса" autofocus></div><div class="form-row"><div class="form-field"><label for="payment-amount">Сумма</label><input id="payment-amount" name="amount" type="number" step="0.01" min="0.01" max="9999999999.99" required placeholder="0,00"></div><div class="form-field"><label for="payment-currency">Валюта</label><select id="payment-currency" name="currency"><option>RUB</option><option>USD</option><option>EUR</option></select></div></div><div class="form-field"><label for="payment-date">Первая дата оплаты</label><input id="payment-date" name="first_due_date" type="date" min="2000-01-01" max="2100-12-31" value="${state.config.today}" required><small>Часовой пояс: ${esc(state.config.timezone)}</small></div><div class="form-info"><b>Повторяется каждый месяц.</b><br>Если такого числа нет, срок — последний день месяца. Для каждого периода будет своя отметка оплаты.</div>${formEnd('Добавить платёж')}`, async (data) => {
    const created = await api('/recurring-payments', {method:'POST', body:JSON.stringify({...Object.fromEntries(data),frequency:'monthly'})});
    $('#modal').close(); state.month = created.first_due_date.slice(0,7); await refresh(); toast('Регулярный платёж добавлен');
  });
}

function editPayment(id) {
  const o = state.occurrences.find((x) => x.id === Number(id));
  if (!o) return;
  openModal(o.paid_at ? 'Изменить оплату' : 'Отметить оплату', `<form class="modal-form"><div class="form-info"><b>${esc(o.title)}</b><br>${fmt(o.amount)} ${symbols[o.currency]} · срок ${dateFmt(o.due_date, {day:'numeric',month:'long',year:'numeric'})}<br>Изменение затронет только этот период.</div><div class="form-field"><label for="paid-at">Фактическая дата оплаты</label><input id="paid-at" name="paid_at" type="date" value="${o.paid_at || state.config.today}" max="${state.config.today}" required><small>Исправление этой даты автоматически пересчитает просрочку.</small></div><p class="form-error" role="alert" hidden></p><div class="modal-actions ${o.paid_at ? 'split' : ''}">${o.paid_at ? '<button type="submit" class="button secondary" name="action" value="undo" formnovalidate>Отменить оплату</button>' : '<button type="button" class="button secondary" data-action="close-modal">Назад</button>'}<button type="submit" class="button primary" name="action" value="save">${o.paid_at ? 'Сохранить дату' : 'Подтвердить оплату'}</button></div></form>`, async (data, button) => {
    const undo = button?.value === 'undo';
    await api(`/payment-occurrences/${o.id}`, {method:'PATCH', body:JSON.stringify(undo ? {paid:false} : {paid:true,paid_at:data.get('paid_at')})});
    $('#modal').close(); await refresh(); toast(undo ? 'Оплата отменена. Дата очищена.' : 'Оплата сохранена');
  });
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
  if (action === 'archive') archivePayment(target.dataset.id);
  if (action === 'edit-user') editUser(target.dataset.id);
  if (action === 'delete-user') deleteUser(target.dataset.id);
  if (action === 'show-overdue') {
    const oldest = state.occurrences.find((o) => o.active && o.status === 'overdue');
    if (oldest) { state.month = oldest.due_date.slice(0,7); state.status = 'overdue'; state.currency = ''; state.search = ''; $('#search').value = ''; $('#currency-filter').value = ''; refresh(); }
  }
});
$('#modal-close').addEventListener('click', () => $('#modal').close());
$('#modal').addEventListener('click', (e) => { if (e.target === $('#modal')) { const r = e.target.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.target.close(); } });
$$('.nav-item').forEach((n) => n.addEventListener('click', () => switchPage(n.dataset.page)));
$('#add-payment').addEventListener('click', () => state.page === 'users' ? editUser() : createPayment());
$$('.status-tab').forEach((t) => t.addEventListener('click', () => { state.status = t.dataset.status; renderPayments(); }));
$('#search').addEventListener('input', (e) => { state.search = e.target.value.trim().toLocaleLowerCase('ru'); renderPayments(); });
$('#currency-filter').addEventListener('change', (e) => { state.currency = e.target.value; renderPayments(); });
$('#prev-month').addEventListener('click', () => changeMonth(-1));
$('#next-month').addEventListener('click', () => changeMonth(1));
$('#calendar-prev').addEventListener('click', () => changeMonth(-1));
$('#calendar-next').addEventListener('click', () => changeMonth(1));
$('#current-month').addEventListener('click', () => { state.month = state.config.today.slice(0,7); refresh(); });
$('#logout').addEventListener('click', async () => { try { await api('/auth/logout', {method:'POST'}); window.location.assign('/login'); } catch (e) { toast(e.message, true); } });

async function init() {
  try {
    state.user = await api('/auth/me'); state.config = await api('/settings'); state.month = state.config.today.slice(0,7);
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
