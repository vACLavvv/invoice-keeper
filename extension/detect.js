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
  // Dollar stablecoins count as USD: the panel keeps RUB, USD and EUR.
  const symbol = { '₽': 'RUB', 'руб': 'RUB', 'руб.': 'RUB', 'р.': 'RUB', 'rub': 'RUB', '$': 'USD', 'us$': 'USD', 'usd': 'USD', 'usdt': 'USD', 'usdc': 'USD', '€': 'EUR', 'eur': 'EUR', 'евро': 'EUR' };
  const currencyWord = '₽|руб\\.?|р\\.|RUB|US\\$|\\$|USDT|USDC|USD|€|EUR|евро';
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
  // offsetParent is null for position: fixed, so checkout panels and modals looked hidden.
  const visible = (el) => (el.checkVisibility ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : el.offsetParent !== null);
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
    // A selection or a lone price may lack a date: the popup suggests today and the user checks it.
    if (!money || (!dateIso && !['выделение', 'цена', 'окно оплаты'].includes(how))) return;
    const name = clean(title) || clean(document.title) || host;
    const full = name.toLowerCase().includes(brand.toLowerCase()) ? name : `${brand} · ${name}`;
    const key = `${full.toLowerCase()}|${money.amount}|${money.currency}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({
      title: full.slice(0, 120), amount: money.amount, currency: money.currency, date: dateIso,
      yearly: yearly.test(context), context: clean(context).slice(0, 160), how,
      // A history row («Оплачен 300 $») is shown, but not checked: it is not what to pay next.
      done: how !== 'окно оплаты' && /оплачен|зачислен|успешн|исполнен|\bpaid\b|completed|succeeded/i.test(context),
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

  // Text of a block with its fields: «Сумма к оплате: 100», «Кошелек для оплаты: T…». Checkout dialogs
  // often show the amount and the address in read-only inputs, which innerText leaves out.
  const labelOf = (input) => clean(input.labels?.[0]?.innerText || input.getAttribute('aria-label') || input.placeholder
    || input.closest('label')?.innerText || input.previousElementSibling?.innerText || input.parentElement?.previousElementSibling?.innerText || '');
  const fullText = (el) => [el.innerText || '', ...[...el.querySelectorAll('input:not([type="hidden"]), textarea')]
    .filter((input) => input.value).map((input) => `${labelOf(input)}: ${input.value}`)].join('\n');

  // 1b. An open payment dialog («Платеж USDT (TRC20)», «Оплата заказа») is what the user is looking at:
  //     everything else on the page — balance, history tables — is the background.
  const payWordsRe = /оплат|к оплате|сумм|кошел|wallet|amount|pay|checkout|invoice|сч[её]т/i;
  const dialog = (() => {
    const marked = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog[open]')].filter(visible);
    // Without markup: the layer under the centre of the screen that is fixed over the page.
    const centre = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    for (let node = centre; node && node !== document.body; node = node.parentElement) {
      if (getComputedStyle(node).position === 'fixed') { marked.push(node); break; }
    }
    return marked.find((el) => payWordsRe.test(fullText(el)) && /\d/.test(fullText(el)));
  })();
  if (dialog && !candidates.length) {
    const text = fullText(dialog);
    let money = findMoney(text)[0];
    if (!money) {
      // «Сумма к оплате: 100» with the currency named elsewhere in the dialog («Платеж USDT»).
      const amount = text.match(/(?:сумм[аы]?(?:\s+к\s+оплате)?|к оплате|итого|amount|total)[^\d\n]{0,20}:?\s*(\d[\d\s\u00a0]*(?:[.,]\d{1,2})?)/i);
      const word = text.match(new RegExp(currencyWord, 'i'));
      const code = word && symbol[word[0].toLowerCase()];
      const value = amount && parseAmount(amount[1]);
      if (code && value) money = { amount: value, currency: code, index: amount.index };
    }
    const heading = clean(dialog.querySelector('h1, h2, h3, h4, [class*="title" i], [class*="header" i]')?.innerText || '').split('\n')[0];
    if (money) add(heading && heading.length <= 80 ? heading : titleFrom(text, money, []), money, findDates(text).pop()?.iso || '', text, 'окно оплаты');
  }
  const inDialog = candidates.some((c) => c.how === 'окно оплаты');

  // 2. Tables with a price column and a date column (billing pages, hosting panels).
  const priceHeader = /цена|стоимость|сумма|тариф.*руб|price|amount|cost|total/i;
  const dateHeader = /действует|оплачен|продлен|следующ|списани|окончан|истека|срок|renew|next|due|expir|until|billing date/i;
  const nameHeader = /имя|название|услуга|сервис|сервер|подписк|name|service|plan|product|item/i;
  const tables = [...document.querySelectorAll('table, [role="table"], [role="grid"]')];
  for (const table of inDialog ? [] : tables) {
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
  if (!inDialog && candidates.length < 30) {
    const blocks = [...document.body.querySelectorAll('li, article, section, div, p, tr')]
      .filter((el) => !el.closest('table') && visible(el))
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

  // 4. Nothing with a date: a lone price, such as a checkout total ("Итого 559 ₽", "К оплате") or a
  //    plan price ("12 $/мес"). Prices are scored by the words around them; struck-out old prices,
  //    navigation and footers are skipped. The date is taken from the same section when there is one.
  if (!candidates.length) {
    const totalWords = /итого|к оплате|сумма к оплате|к списанию|total|amount due|due today/i;
    const periodWords = /\/\s*(мес|месяц|month|mo)\b|в месяц|ежемесячно|per month|monthly|\d+\s*(дн|дней|days)|месяц|month/i;
    const priceWords = /цена|стоимость|тариф|подписк|price|plan|subscription/i;
    const payWords = /оплат|заказ|сч[её]т|платёж|платеж|invoice|payment|order|checkout|pay\b/i;
    const struck = (el) => {
      for (let node = el; node && node !== document.body; node = node.parentElement) {
        if (/^(S|DEL|STRIKE)$/.test(node.tagName) || getComputedStyle(node).textDecorationLine.includes('line-through')) return true;
      }
      return false;
    };
    const ancestor = (el, levels, limit) => {
      let box = el;
      for (let i = 0; i < levels && box.parentElement && box.parentElement !== document.body; i++) {
        if ((box.parentElement.innerText || '').length > limit) break;
        box = box.parentElement;
      }
      return box;
    };
    const prices = [];
    const struckOut = [];
    for (const el of document.body.querySelectorAll('*')) {
      const raw = el.textContent || '';
      if (raw.length > 80 || !/\d/.test(raw) || el.closest('nav, footer, script, style, noscript, select, option, button')) continue;
      const text = (el.innerText || '').trim();
      const money = text.length <= 40 && findMoney(text)[0];
      if (!money || !visible(el)) continue;
      (struck(el) ? struckOut : prices).push({ el, money });
    }
    // A wrapper of an old price ("16470 ₽ -84%") is not a price either.
    const live = prices.filter(({ el, money }) => !struckOut.some((old) => el.contains(old.el) && old.money.amount === money.amount));
    const smallest = live.filter(({ el }) => !live.some((other) => other.el !== el && el.contains(other.el)));
    // The amount and the ₽ are often separate spans, so the size is that of the largest digit inside.
    const fontOf = (el) => Math.max(...[el, ...el.querySelectorAll('*')]
      .filter((node) => /\d/.test(node.textContent || '')).map((node) => parseFloat(getComputedStyle(node).fontSize) || 0));
    const all = smallest.map(({ el, money }) => {
      const context = clean(ancestor(el, 2, 300).innerText || '').slice(0, 200);
      const font = fontOf(el);
      let score = 0;
      if (totalWords.test(context)) score += 5;
      if (payWords.test(context)) score += 4;
      if (periodWords.test(context)) score += 3;
      if (priceWords.test(context)) score += 2;
      if (font >= 20) score += 1;
      return { el, money, context, score, font };
    });
    let scored = all.filter((p) => p.score > 1).sort((a, b) => b.score - a.score || b.font - a.font);
    // No words at all: a payment form shows the sum as its biggest number.
    if (!scored.length) scored = all.filter((p) => p.font >= 24).sort((a, b) => b.font - a.font).slice(0, 1);

    // The card of a price: its largest ancestor that holds no other found price.
    const cardOf = (el) => {
      let box = el;
      while (box.parentElement && box.parentElement !== document.body && (box.parentElement.innerText || '').length < 3000
        && !scored.some((other) => other.el !== el && box.parentElement.contains(other.el))) box = box.parentElement;
      return box;
    };
    // Its name: a heading inside the card, otherwise the card's first line of words («Мобильные Shared»).
    const nameOf = (card) => {
      const usable = (text) => text && text.length >= 3 && text.length <= 80 && /\p{L}{3}/u.test(text) && !findMoney(text).length && !totalWords.test(text);
      const heading = clean(card.querySelector('h1, h2, h3, h4, [class*="title" i], [class*="name" i]')?.innerText || '');
      if (usable(heading)) return heading;
      const line = (card.innerText || '').split('\n').map(clean).find(usable);
      return line || clean(document.querySelector('h1')?.innerText || '') || clean(document.title.split(/\s[|—–-]\s/)[0]);
    };

    const amounts = new Set();
    for (const { el, money, context } of scored) {
      if (amounts.size >= 3) break;
      if (amounts.has(money.amount + money.currency)) continue;
      amounts.add(money.amount + money.currency);
      const card = cardOf(el);
      const text = card.innerText || '';
      // A payment form signs its sum right next to it («592.54 ₽ Оплата заказа»).
      const label = clean(context.replace(moneyRe, ' '));
      const name = payWords.test(label) && label.length <= 60 && !totalWords.test(label) ? label : nameOf(card);
      add(name, money, findDates(text).pop()?.iso || '', yearly.test(text) ? clean(text).slice(0, 160) : context, 'цена');
    }
  }

  // 5. Crypto checkout: a wallet address shown as text, in a read-only field or a copy button.
  //    The format is checked here only roughly; the server verifies the checksum and screens the address.
  const walletRes = [
    ['TRON', /\bT[1-9A-HJ-NP-Za-km-z]{33}\b/g],
    ['ETH', /\b0x[0-9a-fA-F]{40}\b/g],
    ['BTC', /\b(?:bc1[02-9ac-hj-np-z]{11,71}|[13][1-9A-HJ-NP-Za-km-z]{25,34})\b/g],
  ];
  const walletText = dialog ? fullText(dialog) : [
    document.body.innerText || '',
    ...[...document.querySelectorAll('input, textarea')].map((el) => el.value || ''),
    ...[...document.querySelectorAll('[data-clipboard-text], [data-copy], [data-address]')]
      .map((el) => el.dataset.clipboardText || el.dataset.copy || el.dataset.address || ''),
  ].join('\n');
  // Base58 strings also appear as order ids, so TRON and legacy BTC need the network named on the page.
  const named = { TRON: /tron|trc-?20|usdt/i, BTC: /bitcoin|btc/i, ETH: /./ };
  const wallets = [];
  for (const [network, re] of walletRes) {
    if (!named[network].test(walletText)) continue;
    for (const m of walletText.matchAll(re)) {
      // Transaction hashes are 64 hex digits; skip addresses that are part of a longer hex run.
      if (network === 'ETH' && /[0-9a-fA-F]/.test(walletText[m.index + m[0].length] || '')) continue;
      if (!wallets.some((w) => w.address === m[0])) wallets.push({ network, address: m[0] });
    }
  }

  candidates.sort((a, b) => a.done - b.done);
  return { host, url: location.href, pageTitle: document.title, blocked: false, candidates: candidates.slice(0, 30), wallets: wallets.slice(0, 3) };
})();
