// Deterministic browser-independent checks of EventSource lifecycle and form
// preservation. No network, real browser, timers or extra dependencies needed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { transformSync } = require('next/dist/build/swc');
const { code } = transformSync(readFileSync(new URL('../lib/live-updates.ts', import.meta.url), 'utf8'), {
  filename: 'live-updates.ts', jsc: { parser: { syntax: 'typescript' }, target: 'es2022' }, module: { type: 'commonjs' },
});

function environment(withEvents = true) {
  let time = 0, sequence = 0, refreshes = 0, dialog = false;
  const tasks = new Map(), listeners = new Map(), sources = [], observers = [];
  const addTimer = (fn, delay, interval = 0) => { const id = ++sequence; tasks.set(id, { fn, at: time + delay, interval }); return id; };
  const document = {
    visibilityState: 'visible', body: {},
    querySelector: () => dialog ? {} : null,
    addEventListener: (kind, fn) => listeners.set(kind, fn),
    removeEventListener: (kind) => listeners.delete(kind),
  };
  class EventSource {
    static CLOSED = 2;
    readyState = 0; callbacks = new Map();
    constructor(url) { assert.equal(url, '/api/v1/events'); sources.push(this); }
    addEventListener(kind, fn) { this.callbacks.set(kind, fn); }
    emit(kind) { if (kind === 'ready') this.readyState = 1; this.callbacks.get(kind)?.(); }
    close() { this.readyState = EventSource.CLOSED; }
  }
  class MutationObserver {
    constructor(fn) { this.fn = fn; observers.push(this); }
    observe() { this.active = true; }
    disconnect() { this.active = false; }
  }
  const location = { pathname: '/calendar', search: '?month=2026-10', redirected: '', assign(url) { this.redirected = url; } };
  const exports = {};
  const context = {
    exports, module: { exports }, document, window: { location }, MutationObserver,
    setTimeout: (fn, delay) => addTimer(fn, delay), setInterval: (fn, delay) => addTimer(fn, delay, delay),
    clearTimeout: (id) => tasks.delete(id), clearInterval: (id) => tasks.delete(id),
    ...(withEvents ? { EventSource } : {}),
  };
  vm.runInNewContext(code, context);
  const stop = exports.startLiveUpdates(() => refreshes++);
  function advance(ms) {
    const until = time + ms;
    for (let count = 0; count < 10000; count++) {
      const due = [...tasks].filter(([, task]) => task.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) { time = until; return; }
      const [id, task] = due; time = task.at;
      if (!task.interval) tasks.delete(id); else task.at += task.interval;
      task.fn();
    }
    assert.fail('timer loop');
  }
  return {
    sources, observers, tasks, listeners, location, stop, advance, get refreshes() { return refreshes; },
    setDialog(value) { dialog = value; for (const o of observers) if (o.active) o.fn(); },
    visibility(value) { document.visibilityState = value; listeners.get('visibilitychange')?.(); },
  };
}

const e = environment();
assert.equal(e.sources.length, 1);
e.sources[0].emit('ready');
for (let i = 0; i < 100; i++) e.sources[0].emit('changed');
e.advance(1000);
assert.equal(e.refreshes, 1, 'burst coalesces into one API refresh');
e.setDialog(true); e.sources[0].emit('changed'); e.advance(500);
assert.equal(e.refreshes, 1, 'open payment form keeps its draft');
e.setDialog(false); e.advance(1000);
assert.equal(e.refreshes, 2, 'closing form fetches the deferred change');
e.sources[0].emit('ready'); e.advance(1000);
assert.equal(e.refreshes, 3, 'reconnect resynchronizes missed events');
e.visibility('hidden');
assert.equal(e.sources[0].readyState, 2, 'hidden tab releases connection');
e.advance(60000); assert.equal(e.refreshes, 3);
e.visibility('visible');
assert.equal(e.sources.length, 2);
e.sources[1].emit('ready'); e.advance(1000); assert.equal(e.refreshes, 4);
e.sources[1].emit('session-ended');
assert.equal(e.location.redirected, '/login?next=%2Fcalendar%3Fmonth%3D2026-10');
e.stop(); const previous = e.refreshes; e.advance(120000);
assert.equal(e.refreshes, previous);
assert.equal(e.tasks.size, 0); assert.equal(e.listeners.size, 0);
assert.equal(e.observers.some((o) => o.active), false);

const fallback = environment(false);
fallback.advance(61000); assert.equal(fallback.refreshes, 1, 'polling works without EventSource');
fallback.stop();

const failed = environment();
failed.sources[0].close(); failed.sources[0].emit('error');
failed.advance(61000);
assert.equal(failed.sources.length, 2, 'closed connection can recover on fallback tick');
assert.equal(failed.refreshes, 1);
failed.stop();
console.log('live updates: ready/change bursts, reconnect, dialog drafts, visibility, revocation, cleanup and fallback pass');

const burst = environment();
for (let i = 0; i < 100; i++) { burst.sources[0].emit('changed'); burst.advance(20); }
assert.equal(burst.refreshes, 2, 'continuous queue updates refresh at most once per second');
burst.stop();
