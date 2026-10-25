import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const swc=require('next/dist/build/swc');
await swc.loadBindings();
const source = fs.readFileSync(new URL('../lib/idempotent-client.ts', import.meta.url), 'utf8');
const {code:js}=await swc.transform(source,{filename:'idempotent-client.ts',jsc:{parser:{syntax:'typescript'},target:'es2022'},module:{type:'es6'}});
const store = new Map();
globalThis.sessionStorage = {getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
const {withPaymentKey,protectedPaymentMutation} = await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
let release;const gate = new Promise(r=>release=r);let calls=0;
const send=async key=>{calls++;await gate;return key};
const a=withPaymentKey('one','POST /payment same',send);const b=withPaymentKey('one','POST /payment same',send);
await new Promise(r=>setTimeout(r,10));assert.equal(calls,1);release();assert.equal(await a,await b);assert.equal(store.size,0);
let lost;
await assert.rejects(withPaymentKey('one','pending',async key=>{lost=key;throw Object.assign(new Error('network'),{status:0})}));
const reloaded=await import('data:text/javascript;base64,'+Buffer.from(js+'\n// reload').toString('base64'));
assert.equal(await reloaded.withPaymentKey('one','pending',async key=>key),lost);assert.equal(store.size,0);
assert.notEqual(await withPaymentKey('two','pending',async key=>key),lost);
assert.equal(protectedPaymentMutation('PATCH','/payment-occurrences/7'),true);
assert.equal(protectedPaymentMutation('POST','/recurring-payments/8/periods/2026-10-25/restore'),true);
assert.equal(protectedPaymentMutation('POST','/auth/login'),false);
assert.equal(protectedPaymentMutation('GET','/recurring-payments'),false);
console.log('Idempotency: concurrent click coalescing, durable uncertain retry, new intent and account scope pass');

// Exercise the actual API response parser: a lost 201 body must retain the key.
let apiSource=fs.readFileSync(new URL('../lib/api.ts',import.meta.url),'utf8');
apiSource=apiSource.replace("import { t } from './i18n';", "const t = (value: string) => value;")
 .replace("from './idempotent-client'", "from 'data:text/javascript;base64,"+Buffer.from(js).toString('base64')+"'");
const {code:apiJS}=await swc.transform(apiSource,{filename:'api.ts',jsc:{parser:{syntax:'typescript'},target:'es2022'},module:{type:'es6'}});
const {api,setCsrfToken}=await import('data:text/javascript;base64,'+Buffer.from(apiJS).toString('base64'));
setCsrfToken('parser-session');
const keys=[];let tries=0;
globalThis.fetch=async(_path,options)=>{keys.push(options.headers['X-Idempotency-Key']);return new Response(++tries===1?'interrupted-json':'{"id":17}',{status:201})};
await assert.rejects(api('/recurring-payments',{method:'POST',body:{title:'Example'}}),error=>error.status===0);
assert.equal((await api('/recurring-payments',{method:'POST',body:{title:'Example'}})).id,17);
assert.equal(keys[0],keys[1]);
console.log('Interrupted successful JSON body retains its recovery key');
