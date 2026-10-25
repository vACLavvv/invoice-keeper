import type { Notification, NotificationFeed } from './api';

export type BrowserNoticeState = {
  enabled: boolean;
  permission: NotificationPermission | 'unsupported';
  error: 'storage' | 'delivery' | null;
};
type Seen = { version: 1; ids: [string, number][] };
const changed = 'ik-browser-notices-change';
const preferences = new Map<string, boolean>();
const errors = new Map<string, BrowserNoticeState['error']>();
const memorySeen = new Map<string, Seen>();
// A failed write may leave an older value readable; prefer the current tab's
// history until it can be persisted successfully again.
const unpersistedSeen = new Set<string>();
const preferenceKey = (account: string) => 'ik-browser-notices:v2:' + account;
const seenKey = (account: string) => 'ik-browser-notices-seen:v2:' + account;

export function browserNoticeAccount(user: { id: number; username: string; role: string }): string {
  return `${user.role}:${user.id}:${user.username.toLowerCase()}`;
}

function permission(): BrowserNoticeState['permission'] {
  return typeof window === 'undefined' || !('Notification' in window) ? 'unsupported' : window.Notification.permission;
}

export function browserNoticeState(account: string, login?: string): BrowserNoticeState {
  if (typeof window === 'undefined') return { enabled: false, permission: 'unsupported', error: null };
  try {
    let stored = window.localStorage.getItem(preferenceKey(account));
    // Retain the old opt-in, but bind all new preferences and delivery IDs to the account ID.
    if (stored === null && login) {
      stored = window.localStorage.getItem('ik-browser-notices:' + login);
      if (stored !== null) window.localStorage.setItem(preferenceKey(account), stored);
    }
    if (stored !== null) preferences.set(account, stored === 'true');
  } catch { errors.set(account, 'storage'); }
  return { enabled: preferences.get(account) ?? false, permission: permission(), error: errors.get(account) ?? null };
}

function announce(account: string) { window.dispatchEvent(new CustomEvent(changed, { detail: account })); }
function setEnabled(account: string, enabled: boolean) {
  preferences.set(account, enabled);
  try { window.localStorage.setItem(preferenceKey(account), String(enabled)); }
  catch { errors.set(account, 'storage'); }
  announce(account);
}

export async function enableBrowserNotices(account: string, enabled: boolean): Promise<void> {
  errors.delete(account);
  if (enabled) {
    if (permission() === 'unsupported') return;
    try {
      if (window.Notification.permission !== 'granted' && await window.Notification.requestPermission() !== 'granted') { setEnabled(account, false); return; }
    } catch { errors.set(account, 'delivery'); announce(account); return; }
    // Enabling starts from the current feed; it must not flood the desktop with old history.
    memorySeen.delete(account);
    unpersistedSeen.add(account);
    try { window.localStorage.removeItem(seenKey(account)); } catch { errors.set(account, 'storage'); }
  }
  setEnabled(account, enabled);
}

export function subscribeBrowserNotices(account: string, onChange: () => void): () => void {
  const local = (event: Event) => { if ((event as CustomEvent<string>).detail === account) onChange(); };
  const storage = (event: StorageEvent) => { if (event.key === null || event.key === preferenceKey(account)) onChange(); };
  window.addEventListener(changed, local);
  window.addEventListener('storage', storage);
  window.addEventListener('focus', onChange);
  document.addEventListener('visibilitychange', onChange);
  return () => {
    window.removeEventListener(changed, local);
    window.removeEventListener('storage', storage);
    window.removeEventListener('focus', onChange);
    document.removeEventListener('visibilitychange', onChange);
  };
}

let workerRegistration: Promise<ServiceWorkerRegistration> | null = null;

async function notificationWorker(): Promise<ServiceWorkerRegistration> {
  if (!workerRegistration) {
    let removeActivationListener = () => {};
    const activate = async () => {
      const registration = await navigator.serviceWorker.register('/notification-worker.js', { scope: '/', updateViaCache: 'none' });
      if (!registration.active) {
        const worker = registration.installing ?? registration.waiting;
        if (!worker) throw new Error('No notification worker');
        await new Promise<void>((resolve, reject) => {
          const changed = () => {
            if (worker.state === 'activated' || worker.state === 'redundant') {
              worker.removeEventListener('statechange', changed);
              if (worker.state === 'activated') resolve(); else reject(new Error('Notification worker unavailable'));
            }
          };
          removeActivationListener = () => worker.removeEventListener('statechange', changed);
          worker.addEventListener('statechange', changed);
          changed();
        });
      }
      return registration;
    };
    // Never hang the test button (or the cross-tab delivery lock) on a blocked worker.
    let timer: ReturnType<typeof setTimeout>;
    workerRegistration = Promise.race([
      activate(),
      new Promise<ServiceWorkerRegistration>((_, reject) => { timer = setTimeout(() => reject(new Error('Notification worker timeout')), 8000); }),
    ]).finally(() => { clearTimeout(timer); removeActivationListener(); })
      .catch((error) => { workerRegistration = null; throw error; });
  }
  return workerRegistration;
}

/** Resolves only after the browser accepts the request. OS banner visibility
 * cannot be verified by a website: Focus modes and system settings still apply. */
export async function showBrowserNotice(account: string, title: string, body: string, id: string, isCurrent: () => boolean = () => true): Promise<boolean> {
  if (permission() !== 'granted' || !isCurrent()) return false;
  const failed = () => { errors.set(account, 'delivery'); setEnabled(account, false); };
  try {
    const options = { body, tag: `invoice-keeper:${account}:${id}`, icon: '/favicon.svg', renotify: true, data: { url: '/notifications' } };
    if ('serviceWorker' in navigator) {
      const registration = await notificationWorker();
      if (permission() !== 'granted' || !isCurrent()) return false;
      await registration.showNotification(title, options);
    } else {
      const notice = new window.Notification(title, options);
      notice.onclick = () => { window.focus(); window.location.assign('/notifications'); notice.close(); };
      notice.onerror = failed;
    }
    return true;
  } catch {
    failed();
    return false;
  }
}

function readSeen(account: string): Seen | null {
  if (unpersistedSeen.has(account)) return memorySeen.get(account) ?? null;
  try {
    const raw = window.localStorage.getItem(seenKey(account));
    if (raw) {
      const parsed = JSON.parse(raw) as Seen;
      if (parsed.version === 1 && Array.isArray(parsed.ids) && parsed.ids.every((x) => Array.isArray(x) && typeof x[0] === 'string' && typeof x[1] === 'number')) return parsed;
    }
    return null;
  } catch { return memorySeen.get(account) ?? null; }
}
function writeSeen(account: string, ids: Map<string, number>) {
  const data: Seen = { version: 1, ids: [...ids].sort((a, b) => b[1] - a[1]).slice(0, 2000) };
  memorySeen.set(account, data);
  try { window.localStorage.setItem(seenKey(account), JSON.stringify(data)); unpersistedSeen.delete(account); }
  catch { unpersistedSeen.add(account); errors.set(account, 'storage'); }
}

type DeliveryOptions = {
  load: () => Promise<NotificationFeed>;
  show: (items: Notification[], isCurrent: () => boolean) => boolean | Promise<boolean>;
};

/** Runs across the whole open panel; the worker presents notifications, not background polling.
 * Shared IDs are protected by Web Locks where available; stable Notification tags
 * also coalesce the same item in browsers without Web Locks. No financial data is stored. */
export function startBrowserNotices(account: string, options: DeliveryOptions) {
  let stopped = false;
  let pending: NotificationFeed | null = null;
  let draining = false;
  let loading = false;
  const enabled = () => {
    const state = browserNoticeState(account);
    return !stopped && state.enabled && state.permission === 'granted';
  };
  async function offer(feed: NotificationFeed) {
    pending = feed;
    if (draining) return;
    draining = true;
    try {
      while (pending && !stopped) {
        const current = pending;
        pending = null;
        const deliver = async () => {
          if (!enabled()) return;
          const items = current.browser_items ?? current.items;
          const previous = readSeen(account);
          const ids = new Map(previous?.ids ?? []);
          const now = Date.now();
          if (previous === null) {
            for (const item of items) ids.set(item.id, now);
            writeSeen(account, ids);
            return;
          }
          const fresh = items.filter((item) => !item.read && !ids.has(item.id));
          // A burst becomes one summary; never create hundreds of system windows.
          if (fresh.length > 3) {
            if (await options.show(fresh, enabled)) for (const item of fresh) ids.set(item.id, now);
          } else {
            for (const item of fresh) {
              if (!enabled() || !await options.show([item], enabled)) break;
              ids.set(item.id, now);
            }
          }
          for (const item of items) if (item.read || ids.has(item.id)) ids.set(item.id, now);
          writeSeen(account, ids);
        };
        if (navigator.locks?.request) {
          try { await navigator.locks.request('invoice-keeper:notices:' + account, deliver); }
          catch { if (!stopped) await deliver(); } // Private browsing may reject Web Locks.
        } else await deliver();
      }
    } finally { draining = false; }
  }
  async function load() {
    if (!enabled() || loading) return;
    loading = true;
    try { const feed = await options.load(); if (!stopped) await offer(feed); }
    catch { /* Transient API/network failures retry on the next update; do not mark anything seen. */ }
    finally { loading = false; }
  }
  // Live panel changes offer their existing feed. Polling also works in hidden
  // tabs, where the UI deliberately closes SSE; the browser may throttle timers.
  const timer = setInterval(load, 60_000);
  const unsubscribe = subscribeBrowserNotices(account, () => { void load(); });
  return {
    offer,
    stop() { stopped = true; pending = null; clearInterval(timer); unsubscribe(); },
  };
}
