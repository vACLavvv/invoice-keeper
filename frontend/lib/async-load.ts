/** One request at a time. Live signals coalesce into one follow-up without
 * discarding a successful in-flight response. Dispose when query filters change. */
export function createLatestLoader<T>(load: () => Promise<T>, accept: (value: T) => void, reject: (error: Error) => void) {
  let active = true, running = false, queued = false;
  async function request() {
    if (!active) return;
    if (running) { queued = true; return; }
    running = true;
    try { const value = await load(); if (active) accept(value); }
    catch (error) { if (active) reject(error instanceof Error ? error : new Error(String(error))); }
    finally {
      running = false;
      if (active && queued) { queued = false; void request(); }
    }
  }
  return { request, dispose() { active = false; queued = false; } };
}
