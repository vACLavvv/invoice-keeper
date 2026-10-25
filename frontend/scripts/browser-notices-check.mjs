// Execute the actual delivery controller with isolated browser-like realms.
// No real notifications, real browsers, external services or wall-clock waits.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { transformSync } = require('next/dist/build/swc');
const { code } = transformSync(readFileSync(new URL('../lib/browser-notices.ts', import.meta.url), 'utf8'), {
  filename: 'browser-notices.ts', jsc: { parser: { syntax: 'typescript' }, target: 'es2022' }, module: { type: 'commonjs' },
});
function lockManager() {
  const queues = new Map();
  return { request(name, action) {
    const task = (queues.get(name) ?? Promise.resolve()).then(action);
    queues.set(name, task.catch(() => {}));
    return task;
  } };
}
function environment(storage = new Map(), locks = lockManager(), blockedStorage = false) {
  const handlers = new Map(), documentHandlers = new Map(), timers = new Set(), timeouts = new Set(), calls = [];
  let failConstruct = false, failStorageWrites = false;
  const add = (where, key, fn) => { if (!where.has(key)) where.set(key, new Set()); where.get(key).add(fn); };
  const remove = (where, key, fn) => where.get(key)?.delete(fn);
  class CustomEvent { constructor(type, init) { this.type = type; this.detail = init.detail; } }
  class Notification {
    static permission = 'granted';
    static requested = 'granted';
    static async requestPermission() { Notification.permission = Notification.requested; return Notification.requested; }
    constructor(title, options) { if (failConstruct) throw new TypeError('constructor unavailable'); this.title=title;this.options=options; calls.push(this); }
    close() { this.closed = true; }
  }
  const window = {
    Notification,
    localStorage: {
      getItem(key) { if (blockedStorage) throw Error('blocked'); return storage.get(key) ?? null; },
      setItem(key, value) { if (blockedStorage || failStorageWrites) throw Error('blocked'); storage.set(key,value); },
      removeItem(key) { if (blockedStorage) throw Error('blocked'); storage.delete(key); },
    },
    addEventListener: (k,fn)=>add(handlers,k,fn),
    removeEventListener: (k,fn)=>remove(handlers,k,fn),
    dispatchEvent: (event)=>{ for(const fn of handlers.get(event.type) ?? []) fn(event); },
    focus() {}, location: { assign(path) { assert.equal(path,'/notifications'); } },
  };
  const document = {
    addEventListener:(k,fn)=>add(documentHandlers,k,fn),
    removeEventListener:(k,fn)=>remove(documentHandlers,k,fn),
  };
  const navigator = { locks };
  const exports = {};
  vm.runInNewContext(code, { exports, module:{exports}, window, document, navigator, CustomEvent, Date,
    setTimeout:(fn)=>{timeouts.add(fn);return fn;},clearTimeout:(fn)=>timeouts.delete(fn),
    setInterval: (fn)=>{timers.add(fn);return fn;},clearInterval:(fn)=>timers.delete(fn) });
  return { api:exports, storage, calls, timers, timeouts, window, navigator, Notification,
    fail(value=true){failConstruct=value;},
    failWrites(value=true){failStorageWrites=value;},
    storageEvent(key){window.dispatchEvent({type:'storage',key});},
    async tick(){for(const task of timers) await task();},
  };
}
const item = (id, read=false) => ({id,read,title:id,kind:'due',occurrence_id:1,amount:'10',currency:'RUB',due_date:'2026-10-25',paid_at:null,paid_by:null});
const feed = (...ids) => ({items:ids.map((id)=>item(id)),unread_count:ids.length});
const account = 'user:2:alice';
const e = environment();
await e.api.enableBrowserNotices(account,true);
const delivered=[];
let loaded=feed('a','b'),reads=0;
const c=e.api.startBrowserNotices(account,{load:async()=>{reads++;return loaded;},show:(items)=>{delivered.push(items.map((i)=>i.id).join(','));return true;}});
await c.offer(feed('a'));
assert.equal(delivered.length,0,'initial unread history is only a baseline');
await c.offer(feed('a','b'));
assert.deepEqual(delivered,['b'],'new item is delivered even when an older unread item remains');
await c.offer(feed('a','b'));
assert.equal(delivered.length,1,'repeat SSE refresh does not show the same notice');
await c.offer({...feed('a','b'),browser_items:[item('a'),item('b'),item('new-latest')]});
assert.equal(delivered.at(-1),'new-latest','bounded browser batch is independent of priority list page');
await c.offer(feed('a','b','c','d','e','f'));
assert.equal(delivered.at(-1),'c,d,e,f','burst is offered as one summary');
await c.offer({items:[item('read',true)],unread_count:0});
assert.notEqual(delivered.at(-1),'read');
loaded=feed('a','b','hidden');await e.tick();
assert.equal(delivered.at(-1),'hidden','background timer fetches without visible-only gating');
assert.equal(reads,1);
await e.api.enableBrowserNotices(account,false);
await c.offer(feed('off'));
const before=delivered.length;
await e.api.enableBrowserNotices(account,true);
// Setting change may have started a fresh fetch; offer the current state after it settles.
await Promise.resolve();await Promise.resolve();await c.offer(loaded);
assert.equal(delivered.length,before,'re-enabling starts a new baseline');
c.stop();await c.offer(feed('after-stop'));await e.tick();
assert.equal(delivered.length,before);assert.equal(e.timers.size,0);

const shared=new Map(),locks=lockManager(),left=environment(shared,locks),right=environment(shared,locks);
await left.api.enableBrowserNotices(account,true);
const sent=[];
const ca=left.api.startBrowserNotices(account,{load:async()=>feed(),show:()=>{sent.push('left');return true;}});
const cb=right.api.startBrowserNotices(account,{load:async()=>feed(),show:()=>{sent.push('right');return true;}});
await Promise.all([ca.offer(feed('baseline')),cb.offer(feed('baseline'))]);
await Promise.all([ca.offer(feed('baseline','shared-new')),cb.offer(feed('baseline','shared-new'))]);
assert.equal(sent.length,1,'Web Lock + persisted IDs prevents duplicate delivery across tabs');
ca.stop();cb.stop();

const second='user:3:bob';await left.api.enableBrowserNotices(second,true);
const other=[];const cc=left.api.startBrowserNotices(second,{load:async()=>feed(),show:(items)=>{other.push(items[0].id);return true;}});
await cc.offer(feed('baseline'));await cc.offer(feed('baseline','shared-new'));assert.deepEqual(other,['shared-new'],'different accounts have independent history');cc.stop();

const blocked=environment(new Map(),undefined,true);await blocked.api.enableBrowserNotices(account,true);
let count=0;const cd=blocked.api.startBrowserNotices(account,{load:async()=>feed(),show:()=>{count++;return true;}});
await cd.offer(feed('a'));await cd.offer(feed('a','b'));await cd.offer(feed('a','b'));
assert.equal(count,1);assert.equal(blocked.api.browserNoticeState(account).error,'storage');cd.stop();

// Quota exhaustion still allows reads: both a missing value and a stale
// persisted baseline must fall back to the latest in-memory delivery history.
for (const existingBaseline of [false, true]) {
  const quota=environment(); await quota.api.enableBrowserNotices(account,true);
  const delivered=[];
  const controller=quota.api.startBrowserNotices(account,{load:async()=>feed(),show:(items)=>{delivered.push(items[0].id);return true;}});
  if(existingBaseline) await controller.offer(feed('base'));
  quota.failWrites();
  if(!existingBaseline) await controller.offer(feed('base'));
  await controller.offer(feed('base','new'));
  await controller.offer(feed('base','new'));
  assert.deepEqual(delivered,['new'],`readable ${existingBaseline ? 'stale' : 'missing'} storage must not reset delivery history`);
  quota.failWrites(false);
  await controller.offer(feed('base','new','recovered'));
  await controller.offer(feed('base','new','recovered'));
  assert.deepEqual(delivered,['new','recovered']);
  const peer=environment(quota.storage);
  const peerController=peer.api.startBrowserNotices(account,{load:async()=>feed(),show:()=>{assert.fail('recovered persistence must deduplicate across tabs');}});
  await peerController.offer(feed('base','new','recovered'));
  controller.stop();peerController.stop();
}

const failing=environment();await failing.api.enableBrowserNotices(account,true);failing.fail();
assert.equal(await failing.api.showBrowserNotice(account,'Title','Body','id'),false);
assert.equal(failing.api.browserNoticeState(account).enabled,false);
assert.equal(failing.api.browserNoticeState(account).error,'delivery');
failing.fail(false);await failing.api.enableBrowserNotices(account,true);
assert.equal(await failing.api.showBrowserNotice(account,'Title','Body','id'),true);
assert.equal(failing.calls[0].options.tag,`invoice-keeper:${account}:id`);
failing.calls[0].onclick();assert.equal(failing.calls[0].closed,true);
failing.Notification.permission='default';failing.Notification.requested='denied';
await failing.api.enableBrowserNotices(account,true);assert.equal(failing.api.browserNoticeState(account).permission,'denied');
const legacy=environment(new Map([['ik-browser-notices:alice','true']]));
assert.equal(legacy.api.browserNoticeState(account,'alice').enabled,true,'previous opt-in is migrated');
assert.equal(legacy.storage.get('ik-browser-notices:v2:'+account),'true');

const network=environment();await network.api.enableBrowserNotices(account,true);
let rejectFetch=true,fetchCount=0;const recovered=[];
const ce=network.api.startBrowserNotices(account,{load:async()=>{fetchCount++;if(rejectFetch)throw Error('offline');return feed('base','network-new');},show:(items)=>{recovered.push(items[0].id);return true;}});
await ce.offer(feed('base'));await network.tick();assert.equal(recovered.length,0);
rejectFetch=false;await network.tick();assert.deepEqual(recovered,['network-new'],'network error does not mark new items seen');
ce.stop();
const fallback=environment(new Map(),{request:async()=>{throw Error('lock unavailable');}});await fallback.api.enableBrowserNotices(account,true);
let fallbackCount=0;const cf=fallback.api.startBrowserNotices(account,{load:async()=>feed(),show:()=>{fallbackCount++;return true;}});
await cf.offer(feed('old'));await cf.offer(feed('old','new'));await cf.offer(feed('old','new'));assert.equal(fallbackCount,1,'lock failure keeps delivery usable and tags/IDs prevent repeat refresh');cf.stop();
console.log('browser reminders: baseline, fresh events, burst summary, cross-tab/account dedup, background polling, permission/storage failure and cleanup pass');

// Service workers support mobile presentation and acceptance is asynchronous.
const worker=environment(); await worker.api.enableBrowserNotices(account,true);
let workerCalls=0, registrations=0, finish;
worker.navigator.serviceWorker={register:async(path,options)=>{
  assert.equal(path,'/notification-worker.js');assert.equal(options.scope,'/');registrations++;
  return {active:{state:'activated'},showNotification:async(title,options)=>{
    assert.equal(options.renotify,true);assert.equal(options.data.url,'/notifications');workerCalls++;
    await new Promise((resolve)=>{finish=resolve;});
  }};
}};
let completed=false;
const presentation=worker.api.showBrowserNotice(account,'Title','Body','new').then((ok)=>{completed=true;return ok;});
for(let i=0;i<10;i++)await Promise.resolve();
assert.equal(completed,false,'must wait for showNotification acceptance');
assert.equal(worker.calls.length,0,'mobile-compatible worker is preferred over constructor');
finish();assert.equal(await presentation,true);assert.equal(workerCalls,1);assert.equal(worker.timeouts.size,0);
const secondPresentation=worker.api.showBrowserNotice(account,'Title','Body','next');
for(let i=0;i<10;i++)await Promise.resolve();finish();await secondPresentation;
assert.equal(registrations,1,'registration is shared across notifications');

const rejected=environment();await rejected.api.enableBrowserNotices(account,true);
rejected.navigator.serviceWorker={register:async()=>({active:{},showNotification:async()=>{throw Error('permission revoked');}})};
assert.equal(await rejected.api.showBrowserNotice(account,'Title','Body','new'),false);
assert.equal(rejected.api.browserNoticeState(account).error,'delivery');
assert.equal(rejected.calls.length,0,'a rejected worker request must not retry with a constructor and risk duplicate delivery');

const waiting=environment();await waiting.api.enableBrowserNotices(account,true);
let listener;
waiting.navigator.serviceWorker={register:async()=>({installing:{state:'installing',addEventListener:(_,fn)=>{listener=fn;},removeEventListener:()=>{listener=null;}}})};
const timed=waiting.api.showBrowserNotice(account,'Title','Body','id');
for(let i=0;i<5;i++)await Promise.resolve();
for(const timeout of waiting.timeouts)timeout();
assert.equal(await timed,false,'blocked activation has a bounded timeout');
assert.equal(listener,null,'activation listener is removed after timeout');
assert.equal(waiting.timeouts.size,0);

// Failed asynchronous presentation is not marked as seen and is eligible later.
const asyncNotices=environment();await asyncNotices.api.enableBrowserNotices(account,true);
let accepted=false, attempts=0;
const asyncController=asyncNotices.api.startBrowserNotices(account,{load:async()=>feed(),show:async()=>{attempts++;return accepted;}});
await asyncController.offer(feed('baseline'));await asyncController.offer(feed('baseline','new'));accepted=true;
await asyncController.offer(feed('baseline','new'));await asyncController.offer(feed('baseline','new'));
assert.equal(attempts,2);asyncController.stop();
console.log('notification worker: asynchronous acceptance, reuse, no constructor retry, activation timeout and unseen failures pass');

const clickHandlers = new Map();
let navigated = '', focused = false, opened = '';
let windows = [{url:'https://keeper.example/payments',navigate:async(url)=>{navigated=url;},focus:async()=>{focused=true;}}];
const self = {location:{origin:'https://keeper.example'},addEventListener:(name,handler)=>clickHandlers.set(name,handler),skipWaiting:async()=>{},clients:{claim:async()=>{},matchAll:async()=>windows,openWindow:async(url)=>{opened=url;}}};
vm.runInNewContext(readFileSync(new URL('../public/notification-worker.js',import.meta.url),'utf8'),{self,URL});
let clickTask, closed=false;
clickHandlers.get('notificationclick')({notification:{close:()=>{closed=true;},data:{url:'https://evil.example'}},waitUntil:(task)=>{clickTask=task;}});
await clickTask;assert.equal(navigated,'https://keeper.example/notifications');assert.equal(focused,true);assert.equal(closed,true);
windows=[];clickHandlers.get('notificationclick')({notification:{close(){}},waitUntil:(task)=>{clickTask=task;}});await clickTask;
assert.equal(opened,'https://keeper.example/notifications','click target is fixed to this origin and never notification-controlled');
assert.equal(clickHandlers.has('fetch'),false,'worker must not cache or intercept financial requests');
assert.equal(clickHandlers.has('push'),false,'no promise of notifications while the panel is closed');
console.log('notification worker click routing and network isolation pass');

const stopped=environment();await stopped.api.enableBrowserNotices(account,true);
let finishRegistration, presentedAfterStop=0;
stopped.navigator.serviceWorker={register:()=>new Promise((resolve)=>{finishRegistration=()=>resolve({active:{},showNotification:async()=>{presentedAfterStop++;}});})};
const stoppingController=stopped.api.startBrowserNotices(account,{load:async()=>feed(),show:(items,current)=>stopped.api.showBrowserNotice(account,'Title','Body',items[0].id,current)});
await stoppingController.offer(feed('base'));const offerDuringActivation=stoppingController.offer(feed('base','new'));
for(let i=0;i<5;i++)await Promise.resolve();stoppingController.stop();finishRegistration();await offerDuringActivation;
assert.equal(presentedAfterStop,0,'logout/unmount while worker activates must prevent stale financial notification');
console.log('notification delivery cancels after unmount while worker activates');
