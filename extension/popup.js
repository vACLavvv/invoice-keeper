'use strict';
// Popup: runs detect.js in the active tab (allowed by activeTab because the user clicked),
// lets the user correct what was found and sends it as suggestions with the API key.

const $ = (selector) => document.querySelector(selector);
let settings = { server: '', key: '' };
let page = { host: '', url: '', pageTitle: '' };

async function loadSettings() {
  const stored = await chrome.storage.local.get(['server', 'key', 'username']);
  // The panel puts its own address into config.js when the extension is downloaded from it.
  settings = { server: stored.server || self.INVOICE_KEEPER_SERVER || '', key: stored.key || '' };
  $('#server').value = settings.server;
  $('#key').value = settings.key;
  $('#connected').hidden = !settings.key;
  $('#connected-as').textContent = stored.username ? `подключено: @${stored.username}` : 'ключ сохранён';
}

// --- connecting through the panel: a random code, confirmed by the signed-in user, claimed once ---

const PAIRING_TTL = 10 * 60 * 1000;

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** «Chrome · macOS» — the name of the key in the panel. */
function deviceName() {
  const ua = navigator.userAgent;
  const browser = [['Edg/', 'Edge'], ['YaBrowser/', 'Яндекс Браузер'], ['OPR/', 'Opera'], ['Firefox/', 'Firefox'], ['Chrome/', 'Chrome']].find(([m]) => ua.includes(m))?.[1] || 'Браузер';
  const system = [['Windows', 'Windows'], ['Mac OS X', 'macOS'], ['Android', 'Android'], ['Linux', 'Linux'], ['CrOS', 'ChromeOS']].find(([m]) => ua.includes(m))?.[1];
  return system ? `${browser} · ${system}` : browser;
}

async function connect() {
  const status = $('#settings-status');
  status.className = 'muted';
  try {
    const server = normalizeServer($('#server').value);
    const code = randomCode();
    await chrome.storage.local.set({ server, pendingCode: code, pendingAt: Date.now() });
    const url = `${server}/extension?${new URLSearchParams({ connect: code, device: deviceName() })}`;
    await chrome.tabs.create({ url });
    status.textContent = 'подтвердите в панели, затем снова откройте расширение';
  } catch (e) {
    status.textContent = e.message;
    status.className = 'bad';
  }
}

/** Claims the key confirmed in the panel; returns a message for the user, or null when nothing is pending. */
async function claimPending() {
  const { server, pendingCode, pendingAt } = await chrome.storage.local.get(['server', 'pendingCode', 'pendingAt']);
  if (!pendingCode) return null;
  if (Date.now() - pendingAt > PAIRING_TTL) {
    await chrome.storage.local.remove(['pendingCode', 'pendingAt']);
    return { text: 'Подключение не подтвердили за 10 минут. Нажмите «Подключить» ещё раз.', bad: true };
  }
  let response;
  try {
    response = await fetch(server + '/api/v1/extension/pairings/claim', {
      method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: pendingCode }),
    });
  } catch {
    return { text: 'Сервер недоступен: подключение не завершено.', bad: true };
  }
  const data = await response.json().catch(() => ({}));
  if (response.status === 200 && data.token) {
    await chrome.storage.local.set({ key: data.token, username: data.username });
    await chrome.storage.local.remove(['pendingCode', 'pendingAt']);
    await loadSettings();
    return { text: `Подключено: @${data.username}. Ключ действует год.`, bad: false };
  }
  return { text: 'Подтвердите подключение во вкладке панели и снова откройте расширение.', bad: true };
}

async function disconnect() {
  await chrome.storage.local.remove(['key', 'username']);
  await loadSettings();
  showSettings(true);
  $('#settings-status').textContent = 'ключ удалён из браузера; в панели его можно отозвать';
}

function normalizeServer(value) {
  const url = new URL(value.trim());
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Адрес должен начинаться с http:// или https://');
  return url.origin;
}

async function call(path, options = {}) {
  let response;
  try {
    response = await fetch(settings.server + '/api/v1' + path, {
      ...options,
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + settings.key },
    });
  } catch {
    throw new Error('Сервер недоступен. Проверьте адрес');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data.detail;
    throw new Error(typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map((e) => e.msg).join('. ') : `Ошибка ${response.status}`);
  }
  return data;
}

function showSettings(show) {
  $('#settings').hidden = !show;
  $('#main').hidden = show;
  $('#toggle-settings').textContent = show ? 'Назад' : 'Настройки';
}

async function saveSettings() {
  const status = $('#settings-status');
  status.className = 'muted';
  status.textContent = 'проверяем…';
  try {
    settings = { server: normalizeServer($('#server').value), key: $('#key').value.trim() };
    const me = await call('/extension/whoami');
    await chrome.storage.local.set({ ...settings, username: me.username });
    status.textContent = `подключено: @${me.username}`;
    setTimeout(() => { showSettings(false); detect(); }, 700);
  } catch (e) {
    status.textContent = e.message;
    status.className = 'bad';
  }
}

function addCard(item = {}) {
  const card = $('#card').content.firstElementChild.cloneNode(true);
  const field = (name) => card.querySelector(`[name="${name}"]`);
  field('title').value = item.title || page.pageTitle || page.host;
  field('amount').value = item.amount || '';
  field('currency').value = item.currency || 'RUB';
  field('date').value = item.date || (item.how ? today() : '');
  card.dataset.sourceKey = item.sourceKey || '';
  card.querySelector('.title-text').textContent = item.how ? `Найдено: ${item.how}` : 'Вручную';
  const notes = [item.context];
  if (item.how && !item.date) notes.unshift('дата не найдена — стоит сегодняшняя, проверьте');
  if (item.yearly) {
    field('use').checked = false;
    notes.unshift('похоже на годовую оплату — система повторяет ежемесячно');
  }
  card.querySelector('.context').textContent = notes.filter(Boolean).join(' · ');
  card.querySelector('.context').title = item.context || '';
  field('title').addEventListener('input', () => { card.dataset.sourceKey = ''; });
  $('#list').append(card);
  updateSend();
  return card;
}

/** Today in the user's time zone, as YYYY-MM-DD. */
function today() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function updateSend() {
  $('#send').disabled = !document.querySelector('.card [name="use"]:checked');
}

function notice(text, bad = false) {
  $('#notice').hidden = !text;
  $('#notice').textContent = text || '';
  $('#notice').classList.toggle('bad', bad);
}

async function detect() {
  $('#list').replaceChildren();
  notice('');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  page = { host: '', url: tab?.url || '', pageTitle: tab?.title || '' };
  try {
    const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['detect.js'] });
    page = { ...page, ...result.result };
  } catch {
    $('#headline').textContent = 'страница недоступна';
    $('#page').textContent = 'Служебные страницы браузера и магазина расширений читать нельзя.';
    return;
  }
  $('#page').textContent = page.host;
  if (page.blocked) {
    $('#headline').textContent = 'здесь не ищем';
    notice('Банки и почта в стоп-листе: расширение не читает такие страницы.');
    return;
  }
  const found = page.candidates || [];
  $('#headline').textContent = found.length ? `${found.length} ${plural(found.length, 'платёж', 'платежа', 'платежей')}` : 'ничего не нашли';
  if (!found.length) notice('Суммы на странице не нашлось. Выделите текст с ценой и откройте расширение снова — или добавьте платёж вручную.');
  found.forEach(addCard);
  if (!settings.server || !settings.key) notice('Укажите адрес сервера и ключ API в настройках, чтобы отправлять платежи.', true);
}

function plural(n, one, few, many) {
  if (n % 10 === 1 && n % 100 !== 11) return one;
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) return few;
  return many;
}

async function send() {
  if (!settings.server || !settings.key) {
    showSettings(true);
    return;
  }
  const cards = [...document.querySelectorAll('.card')].filter((card) => card.querySelector('[name="use"]').checked);
  $('#send').disabled = true;
  let ok = 0;
  for (const card of cards) {
    const value = (name) => card.querySelector(`[name="${name}"]`).value.trim();
    const status = card.querySelector('.status');
    const title = value('title');
    const body = {
      source_key: card.dataset.sourceKey || `${page.host || 'manual'}:${title.toLowerCase()}`.slice(0, 200),
      source_url: /^https?:/.test(page.url) ? page.url.slice(0, 500) : undefined,
      title, amount: value('amount').replace(',', '.'), currency: value('currency'), next_due_date: value('date'),
    };
    try {
      const answer = await call('/payment-suggestions', { method: 'POST', body: JSON.stringify(body) });
      const decided = { accepted: 'уже принято администратором', rejected: 'администратор отклонил ранее' };
      status.textContent = answer.result === 'created' ? 'отправлено' : answer.result === 'updated' ? 'обновлено' : decided[answer.suggestion.status];
      status.className = 'status ' + (answer.result === 'unchanged' ? 'warn' : 'ok');
      card.querySelector('[name="use"]').checked = false;
      ok++;
    } catch (e) {
      status.textContent = e.message;
      status.className = 'status bad';
    }
  }
  updateSend();
  if (ok) notice(`Готово: ${ok} из ${cards.length}. Предложения ждут подтверждения в панели.`);
}

$('#toggle-settings').addEventListener('click', () => showSettings($('#settings').hidden));
$('#save').addEventListener('click', saveSettings);
$('#connect').addEventListener('click', connect);
$('#disconnect').addEventListener('click', disconnect);
$('#manual').addEventListener('click', () => addCard().querySelector('[name="amount"]').focus());
$('#send').addEventListener('click', send);
$('#list').addEventListener('change', updateSend);

loadSettings().then(async () => {
  const connecting = await claimPending();
  if (!settings.server || !settings.key) showSettings(true);
  await detect(); // clears notices, so the result of connecting is shown after it
  if (connecting) {
    notice(connecting.text, connecting.bad);
    $('#settings-status').textContent = connecting.text;
  }
});
