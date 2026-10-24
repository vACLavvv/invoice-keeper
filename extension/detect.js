// Injected into the active tab only when the user clicks the extension (activeTab).
// Reads the page locally and returns found payments; page text never leaves the browser.
// The value of the last expression is what chrome.scripting.executeScript returns.
(() => {
  const host = location.hostname.replace(/^www\./, '');

  // Banks and mail: never read, even on click.
  const blocked = [
    /(^|\.)(sberbank|sber|tbank|tinkoff|vtb|alfabank|gazprombank|raiffeisen|open|psbank|sovcombank|pochtabank|rshb|mkb|unicredit|rosbank)\.ru$/,
    /(^|\.)(online\.sberbank|ib\.psbank|my\.tinkoff)\./,
    /^(mail\.google\.com|mail\.yandex\.(ru|com)|e\.mail\.ru|outlook\.(live|office)\.com|mail\.proton\.me)$/,
    /(^|\.)(paypal\.com|revolut\.com|wise\.com)$/,
  ];
  if (blocked.some((rule) => rule.test(host))) return { host, url: location.href, pageTitle: document.title, blocked: true, candidates: [] };

  const space = '[\\s\\u00a0\\u202f]';
  const number = `\\d{1,3}(?:${space}\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,3})?`;
  const symbol = { '₽': 'RUB', 'руб': 'RUB', 'руб.': 'RUB', 'р.': 'RUB', 'rub': 'RUB', '$': 'USD', 'us$': 'USD', 'usd': 'USD', '€': 'EUR', 'eur': 'EUR', 'евро': 'EUR' };
  const currencyWord = '₽|руб\\.?|р\\.|RUB|US\\$|\\$|USD|€|EUR|евро';
  const moneyRe = new RegExp(`(?:(${currencyWord})${space}?(${number}))|(?:(${number})${space}?(${currencyWord}))`, 'gi');

  const months = {
    'январ': 1, 'феврал': 2, 'март': 3, 'апрел': 4, 'ма': 5, 'июн': 6, 'июл': 7, 'август': 8, 'сентябр': 9, 'октябр': 10, 'ноябр': 11, 'декабр': 12,
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  };
  const dateRes = [
    [/\b(\d{1,2})[./](\d{1,2})[./](20\d{2})\b/g, (m) => [m[3], m[2], m[1]]],
    [/\b(20\d{2})-(\d{2})-(\d{2})\b/g, (m) => [m[1], m[2], m[3]]],
    [/\b(\d{1,2})\s+(январ[ья]|феврал[ья]|марта?|апрел[ья]|ма[йя]|июн[ья]|июл[ья]|августа?|сентябр[ья]|октябр[ья]|ноябр[ья]|декабр[ья])\s+(20\d{2})/gi, (m) => [m[3], m[2], m[1]]],
    [/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(20\d{2})\b/gi, (m) => [m[3], m[1], m[2]]],
    [/\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(20\d{2})\b/gi, (m) => [m[3], m[2], m[1]]],
  ];

  function monthNumber(value) {
    if (/^\d+$/.test(value)) return Number(value);
    const word = value.toLowerCase();
    const key = Object.keys(months).sort((a, b) => b.length - a.length).find((k) => word.startsWith(k));
    return key ? months[key] : 0;
  }

  function findDates(text) {
    const found = [];
    for (const [re, parts] of dateRes) {
      for (const m of text.matchAll(re)) {
        const [y, mo, d] = parts(m);
        const year = Number(y), month = monthNumber(mo), day = Number(d);
        const date = new Date(Date.UTC(year, month - 1, day));
        if (month && date.getUTCMonth() === month - 1 && date.getUTCDate() === day && year >= 2000 && year <= 2100) {
          found.push({ iso: date.toISOString().slice(0, 10), index: m.index });
        }
      }
    }
    return found.sort((a, b) => a.index - b.index);
  }

  // "1 490,00" → 1490.00; "1.490" → 1490 (thousands); "9.89" → 9.89.
  function parseAmount(raw) {
    let value = raw.replace(/[\s  ]/g, '');
    const decimal = value.match(/[.,](\d{1,2})$/);
    value = decimal ? value.slice(0, -decimal[0].length).replace(/[.,]/g, '') + '.' + decimal[1] : value.replace(/[.,]/g, '');
    const n = Number(value);
    return n > 0 && n < 1e10 ? n.toFixed(2) : null;
  }

  function findMoney(text) {
    const found = [];
    for (const m of text.matchAll(moneyRe)) {
      const code = symbol[(m[1] || m[4] || '').toLowerCase()];
      const amount = parseAmount(m[2] || m[3] || '');
      if (code && amount) found.push({ amount, currency: code, index: m.index, end: m.index + m[0].length });
    }
    return found;
  }

  const yearly = /(\/|в|per|a)\s*(год|year|yr)|ежегодно|annual|yearly/i;
  const clean = (text) => text.replace(/\s+/g, ' ').trim();
  const brand = (() => {
    const parts = host.split('.');
    return parts.length >= 2 ? parts[parts.length - 2] : host;
  })();
  const siteKey = host.split('.').slice(-2).join('.');

  function titleFrom(text, money, dates) {
    // The service name is usually the text before the first price or date in the row.
    const cut = Math.min(money?.index ?? text.length, ...dates.map((d) => d.index), text.length);
    let title = clean(text.slice(0, cut)).replace(/[|·:—–-]+$/, '').trim();
    title = title.split(/\s{2,}|\n/)[0];
    if (title.length > 80) title = title.slice(0, 80).trim() + '…';
    return title;
  }

  const candidates = [];
  const seen = new Set();
  function add(title, money, dateIso, context, how) {
    // A selection may lack a date: the user fills it in the popup.
    if (!money || (!dateIso && how !== 'выделение')) return;
    const name = clean(title) || clean(document.title) || host;
    const full = name.toLowerCase().includes(brand.toLowerCase()) ? name : `${brand} · ${name}`;
    const key = `${full.toLowerCase()}|${money.amount}|${money.currency}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({
      title: full.slice(0, 120), amount: money.amount, currency: money.currency, date: dateIso,
      yearly: yearly.test(context), context: clean(context).slice(0, 160), how,
      sourceKey: `${siteKey}:${clean(name).toLowerCase()}`.slice(0, 200),
    });
  }

  // 1. Selected text wins: the user pointed at the payment.
  const selection = clean(String(window.getSelection?.() || ''));
  if (selection) {
    const money = findMoney(selection)[0];
    const dates = findDates(selection);
    if (money) add(titleFrom(selection, money, dates) || document.title, money, dates[0]?.iso || '', selection, 'выделение');
  }

  // 2. Tables with a price column and a date column (billing pages, hosting panels).
  const priceHeader = /цена|стоимость|сумма|тариф.*руб|price|amount|cost|total/i;
  const dateHeader = /действует|оплачен|продлен|следующ|списани|окончан|истека|срок|renew|next|due|expir|until|billing date/i;
  const nameHeader = /имя|название|услуга|сервис|сервер|подписк|name|service|plan|product|item/i;
  const tables = [...document.querySelectorAll('table, [role="table"], [role="grid"]')];
  for (const table of tables) {
    const rows = [...table.querySelectorAll('tr, [role="row"]')];
    if (rows.length < 2) continue;
    const cellsOf = (row) => [...row.querySelectorAll('th, td, [role="columnheader"], [role="cell"], [role="gridcell"]')].map((c) => clean(c.innerText || ''));
    const header = cellsOf(rows[0]);
    const priceCol = header.findIndex((h) => priceHeader.test(h));
    const dateCol = header.findIndex((h) => dateHeader.test(h));
    if (priceCol < 0 && dateCol < 0) continue;
    const nameCol = Math.max(0, header.findIndex((h) => nameHeader.test(h)));
    for (const row of rows.slice(1)) {
      const cells = cellsOf(row);
      if (!cells.length) continue;
      const rowText = cells.join('  ');
      const money = findMoney(priceCol >= 0 && cells[priceCol] ? cells[priceCol] : rowText)[0] || findMoney(rowText)[0];
      const dates = findDates(dateCol >= 0 && cells[dateCol] ? cells[dateCol] : rowText);
      const date = dates.length ? dates[dates.length - 1] : findDates(rowText).pop();
      add(cells[nameCol]?.split(/\s{2,}/)[0] || titleFrom(rowText, money, []), money, date?.iso, rowText, 'таблица');
    }
  }

  // 3. Rows built from divs: the smallest blocks that contain both a price and a date.
  if (candidates.length < 30) {
    const blocks = [...document.body.querySelectorAll('li, article, section, div, p, tr')]
      .filter((el) => el.offsetParent !== null && !el.closest('table'))
      .map((el) => ({ el, text: (el.innerText || '').trim() }))
      .filter(({ text }) => text.length > 0 && text.length < 400 && findMoney(text).length && findDates(text).length);
    const smallest = blocks.filter(({ el }) => !blocks.some((other) => other.el !== el && el.contains(other.el)));
    for (const { text } of smallest.slice(0, 50)) {
      const money = findMoney(text)[0];
      const dates = findDates(text);
      const date = dates[dates.length - 1];
      add(titleFrom(text, money, dates), money, date.iso, text, 'страница');
    }
  }

  return { host, url: location.href, pageTitle: document.title, blocked: false, candidates: candidates.slice(0, 30) };
})();
