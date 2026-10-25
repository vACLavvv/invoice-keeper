/** One key per pending user intent. Keep it after transport/5xx failure so a
 * manual retry can recover the response even after this tab reloads. */
type StoredKey = { key: string; created: number };
const pending = new Map<string, Promise<unknown>>();
const memory = new Map<string, StoredKey>();
const lifetime = 24 * 60 * 60 * 1000;

export function protectedPaymentMutation(method: string, path: string): boolean {
  if (method === 'POST' && path === '/recurring-payments') return true;
  if (method === 'PATCH' && /^\/payment-occurrences\/\d+$/.test(path)) return true;
  if (/^(PATCH|DELETE)$/.test(method) && /^\/recurring-payments\/\d+(\?mode=(archive|delete))?$/.test(path)) return true;
  return method === 'POST' && /^\/recurring-payments\/\d+\/(pause|resume|restore|periods)(\/\d{4}-\d{2}-\d{2}\/restore)?$/.test(path)
    || method === 'DELETE' && /^\/recurring-payments\/\d+\/periods\/\d{4}-\d{2}-\d{2}$/.test(path);
}

export function withPaymentKey<T>(scope: string, signature: string, send: (key: string) => Promise<T>): Promise<T> {
  const intent = scope + '\n' + signature;
  const running = pending.get(intent);
  if (running) return running as Promise<T>;
  const task = (async () => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(intent));
    const name = 'ik-idempotency:' + [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, '0')).join('');
    let entry = memory.get(name);
    if (!entry) { try { entry = JSON.parse(sessionStorage.getItem(name) ?? 'null') ?? undefined; } catch { /* private mode */ } }
    const now = Date.now();
    if (!entry || typeof entry.key !== 'string' || typeof entry.created !== 'number' || entry.created + lifetime <= now) {
      entry = { key: crypto.randomUUID(), created: now };
    }
    memory.set(name, entry);
    try { sessionStorage.setItem(name, JSON.stringify(entry)); } catch { /* memory still retains the pending intent */ }
    const clear = () => { memory.delete(name); try { sessionStorage.removeItem(name); } catch { /* unavailable storage */ } };
    try {
      const result = await send(entry.key);
      clear(); // The next completed user intent can deliberately repeat the same payment.
      return result;
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429) clear();
      throw error;
    }
  })();
  pending.set(intent, task);
  void task.finally(() => { if (pending.get(intent) === task) pending.delete(intent); }).catch(() => {});
  return task;
}
