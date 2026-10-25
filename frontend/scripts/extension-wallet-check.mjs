import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const popup = readFileSync(new URL('../../extension/popup.js', import.meta.url), 'utf8');
const walletA = { network: 'ETH', address: '0x1111111111111111111111111111111111111111' };
const walletB = { network: 'ETH', address: '0x2222222222222222222222222222222222222222' };
const invoice = (title) => ({ title, amount: '10.00', currency: 'USD', date: '2026-11-01', how: 'таблица' });

function element(initial = {}) {
  return { value: '', checked: false, hidden: false, textContent: '', className: '',
    addEventListener() {}, append() {}, classList: { toggle() {} }, ...initial };
}

// Exercise the real popup through its card renderer and sender, with only browser IO stubbed.
function popupFor(candidates, wallets) {
  const cards = [];
  const requests = [];
  function createCard() {
    const fields = new Map();
    for (const name of ['title', 'amount', 'currency', 'date', 'frequency', 'assignee', 'link', 'address']) {
      fields.set(`[name="${name}"]`, element());
    }
    fields.set('[name="network"]', element({ value: 'TRON' }));
    fields.set('[name="use"]', element({ checked: true }));
    for (const name of ['link-on', 'wallet-on']) fields.set(`[name="${name}"]`, element());
    for (const selector of ['.wallet', '.screening', '.title-text', '.context', '.status']) fields.set(selector, element());
    return { dataset: {}, querySelector(selector) {
      assert.ok(fields.has(selector), `unexpected card selector: ${selector}`);
      return fields.get(selector);
    } };
  }
  const elements = new Map([
    ['#card', { content: { firstElementChild: { cloneNode: createCard } } }],
    ['#list', element({ append: (card) => cards.push(card) })],
  ]);
  const document = {
    querySelector(selector) {
      if (selector === '.card [name="use"]:checked') return cards.find((card) => card.querySelector('[name="use"]').checked);
      if (!elements.has(selector)) elements.set(selector, element());
      return elements.get(selector);
    },
    querySelectorAll(selector) { assert.equal(selector, '.card'); return cards; },
  };
  const context = vm.createContext({
    document, setTimeout, clearTimeout,
    // Keep automatic browser initialization pending; each test supplies its own detected page.
    chrome: { storage: { local: { get: () => new Promise(() => {}), set() {} } } },
    fetch: async (url, options) => {
      requests.push({ url, headers: options.headers, body: JSON.parse(options.body) });
      return { ok: true, json: async () => url.endsWith('/sanctions/check')
        ? { screening: { sanctioned: false } }
        : { result: 'created', suggestion: { status: 'pending' } } };
    },
    scenario: { host: 'invoices.example.com', url: 'https://invoices.example.com/billing', candidates, wallets },
  });
  vm.runInContext(popup, context);
  vm.runInContext(`settings = { server: 'https://keeper.example.com', key: 'extension-test-token' };
    page = scenario; page.candidates.forEach(addCard);`, context);
  return { cards, requests, send: () => context.send(), addManual: () => context.addCard() };
}

for (const [label, candidates, wallets] of [
  ['two invoices and two wallets', [invoice('Invoice A'), invoice('Invoice B')], [walletA, walletB]],
  ['two invoices and one wallet', [invoice('Invoice A'), invoice('Invoice B')], [walletA]],
  ['one invoice and two wallets', [invoice('Invoice A')], [walletA, walletB]],
]) {
  test(`does not attach an ambiguous page wallet: ${label}`, async () => {
    const app = popupFor(candidates, wallets);
    for (const card of app.cards) {
      assert.equal(card.querySelector('[name="address"]').value, '');
      assert.equal(card.querySelector('[name="wallet-on"]').checked, false);
      assert.equal(card.querySelector('.wallet').hidden, true);
      assert.equal(card.querySelector('[name="link-on"]').checked, true);
    }
    await app.send();
    assert.equal(app.requests.length, candidates.length, 'ambiguous addresses must not be screened');
    for (const request of app.requests) {
      assert.ok(request.url.endsWith('/payment-suggestions'));
      assert.equal(Object.hasOwn(request.body, 'wallet_address'), false);
      assert.equal(Object.hasOwn(request.body, 'wallet_network'), false);
      assert.equal(request.body.payment_url, 'https://invoices.example.com/billing');
    }
  });
}

test('screens and submits the wallet when one invoice has exactly one wallet', async () => {
  const app = popupFor([invoice('Invoice A')], [{ ...walletA, token: 'untrusted-page-token' }]);
  const card = app.cards[0];
  assert.equal(card.querySelector('[name="address"]').value, walletA.address);
  assert.equal(card.querySelector('[name="wallet-on"]').checked, true);
  assert.equal(card.querySelector('[name="link-on"]').checked, false);
  await app.send();
  const screening = app.requests.find((request) => request.url.endsWith('/sanctions/check'));
  assert.deepEqual(screening.body, { network: walletA.network, address: walletA.address });
  const submission = app.requests.find((request) => request.url.endsWith('/payment-suggestions'));
  assert.equal(submission.body.wallet_network, walletA.network);
  assert.equal(submission.body.wallet_address, walletA.address);
  assert.equal(submission.body.payment_url, null);
  assert.equal(Object.hasOwn(submission.body, 'token'), false);
  for (const request of app.requests) assert.equal(request.headers.Authorization, 'Bearer extension-test-token');
});

test('manual cards do not inherit the detected invoice wallet', () => {
  const app = popupFor([invoice('Invoice A')], [walletA]);
  const manual = app.addManual();
  assert.equal(manual.querySelector('[name="address"]').value, '');
  assert.equal(manual.querySelector('[name="wallet-on"]').checked, false);
});
