/** One stream per visible panel. Invalidation signals are coalesced; open forms
 * keep their draft and receive the latest API data after the dialog closes. */
export function startLiveUpdates(refresh: () => void): () => void {
  let source: EventSource | null = null;
  let scheduled: ReturnType<typeof setTimeout> | null = null;
  let pending = false;
  let stopped = false;

  function flush() {
    scheduled = null;
    if (!pending || stopped || document.visibilityState !== 'visible' || document.querySelector('dialog[open]')) return;
    pending = false;
    refresh();
  }
  function schedule() {
    if (!stopped && scheduled === null) scheduled = setTimeout(flush, 250);
  }
  function invalidate() { pending = true; schedule(); }
  function connect() {
    if (stopped || source || document.visibilityState !== 'visible' || typeof EventSource === 'undefined') return;
    source = new EventSource('/api/v1/events');
    // ready also runs after reconnect/server restart, when changes may have been
    // missed. Always re-fetch; the stream is not a durable replay of every edit.
    source.addEventListener('ready', invalidate);
    source.addEventListener('changed', invalidate);
    source.addEventListener('error', () => {
      if (source?.readyState === EventSource.CLOSED) { source.close(); source = null; }
    });
    source.addEventListener('session-ended', () => {
      source?.close();
      source = null;
      window.location.assign('/login?next=' + encodeURIComponent(window.location.pathname + window.location.search));
    });
  }
  function visibility() {
    if (document.visibilityState !== 'visible') { source?.close(); source = null; return; }
    connect();
    invalidate();
  }
  // Existing minute refresh remains a recovery path for unsupported EventSource
  // or proxy/network failure and updates the server's "today" after midnight.
  const poll = setInterval(() => {
    if (document.visibilityState === 'visible') { connect(); invalidate(); }
  }, 60_000);
  const forms = new MutationObserver(() => { if (pending && !document.querySelector('dialog[open]')) schedule(); });
  forms.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
  document.addEventListener('visibilitychange', visibility);
  connect();
  return () => {
    stopped = true;
    source?.close();
    clearInterval(poll);
    if (scheduled !== null) clearTimeout(scheduled);
    forms.disconnect();
    document.removeEventListener('visibilitychange', visibility);
  };
}
