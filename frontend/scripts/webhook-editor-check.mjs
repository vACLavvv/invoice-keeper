import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const swc = require('next/dist/build/swc');
await swc.loadBindings();
const source = readFileSync(new URL('../lib/webhooks.ts', import.meta.url), 'utf8');
const { code } = await swc.transform(source, { filename: 'webhooks.ts', jsc: { parser: { syntax: 'typescript' }, target: 'es2022' }, module: { type: 'es6' } });
const { webhookDraft, webhookPayload } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

const endpoint = { id: 7, name: 'CRM', url: 'https://example.com/hook?key=original', url_readonly: false, enabled: true, notify_due: true, notify_overdue: true, has_secret: true };
const draft = webhookDraft(endpoint);
assert.equal(draft.secret, '', 'the API never exposes a saved signing secret to the editor');
const renamed = webhookPayload({ ...draft, name: '  Team CRM  ' }, endpoint);
assert.equal(renamed.name, 'Team CRM');
assert.equal(Object.hasOwn(renamed, 'url'), false, 'an unrelated edit must not rewrite a URL');
assert.equal(Object.hasOwn(renamed, 'secret'), false, 'an empty edit field must retain the saved secret');
assert.equal(webhookPayload({ ...draft, secret: 'new exact secret ' }, endpoint).secret, 'new exact secret ', 'signing bytes must not be silently trimmed');
assert.equal(webhookPayload({ ...draft, removeSecret: true }, endpoint).secret, '', 'only an explicit removal clears a secret');
assert.equal(webhookPayload({ ...draft, url: 'https://example.org/new' }, endpoint).url, 'https://example.org/new');

const legacy = { ...endpoint, url: 'https://example.com/hook', url_readonly: true, legacy_source: true };
const legacyDraft = webhookDraft(legacy);
assert.equal(legacyDraft.url, '', 'redacted imported URLs must never become editable originals');
assert.equal(Object.hasOwn(webhookPayload(legacyDraft, legacy), 'url'), false, 'saving an imported receiver must preserve hidden query and authentication');
assert.equal(webhookPayload({ ...legacyDraft, url: legacy.url }, legacy).url, legacy.url, 'an explicit replacement with the displayed URL is still a replacement');

const fresh = webhookDraft(null);
assert.equal(fresh.enabled && fresh.notify_due && fresh.notify_overdue, true);
assert.equal(Object.hasOwn(webhookPayload({ ...fresh, name: 'New', url: 'https://example.net/hook' }, null), 'secret'), false);
console.log('Webhook editor: hidden secret preservation, explicit rotation/removal, legacy URL safety and create defaults pass');
