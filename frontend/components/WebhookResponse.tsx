import styled from 'styled-components';
import { t } from '@/lib/i18n';
import { useToast } from '@/lib/toast';

export type ConsoleResponse = { status: number; status_text: string; duration_ms: number; headers: { name: string; value: string }[]; body: string; truncated: boolean; error: string };

/** Receiver output is deliberately rendered as text, never as HTML. */
export function WebhookResponse({ response, request }: { response: ConsoleResponse; request: string }) {
  const toast = useToast();
  async function copy() {
    try { await navigator.clipboard.writeText(response.body); toast(t('Ответ скопирован')); }
    catch { toast(t('Не удалось скопировать. Выделите текст ответа вручную.'), true); }
  }
  return <Response>
    <p className="request">{request}</p>
    <div className="meta" role="status"><span className={`pill ${response.status >= 200 && response.status < 300 ? 'paid' : 'overdue'}`}>{response.status ? `${response.status} ${response.status_text}` : t('Нет ответа')}</span><span>{t('{n} мс', { n: Math.round(response.duration_ms) })}</span></div>
    {response.error && <div className="notice notice-error" role="alert">{response.error}</div>}
    {response.truncated && <div className="notice">{t('Ответ сокращён до разрешённого размера.')}</div>}
    <details><summary>{t('Заголовки ответа')} <span>{response.headers.length}</span></summary><dl>{response.headers.map((item, index) => <div key={index}><dt>{item.name}</dt><dd>{item.value}</dd></div>)}</dl></details>
    <div className="body-heading"><h3>{t('Тело ответа')}</h3><button type="button" className="text-button" onClick={() => void copy()}>{t('Скопировать')}</button></div>
    <pre tabIndex={0} aria-label={t('Тело ответа')}>{response.body || t('Пустой ответ')}</pre>
  </Response>;
}

const Response = styled.div`
  min-width: 0;
  .request { font-size: 14px; margin: 0 0 16px; overflow-wrap: anywhere; line-height: 1.6; }
  .meta { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 18px; font-size: 14px; font-variant-numeric: tabular-nums; }
  .body-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; } h3 { margin: 0; font-size: 15px; }
  details { margin: 20px 0; border-top: 1px solid var(--desk-border); border-bottom: 1px solid var(--desk-border); }
  summary { cursor: pointer; padding: 14px 0; font-size: 15px; font-weight: 550; } summary span { margin-left: 8px; font-weight: 400; color: var(--desk-muted); }
  dl { margin: 0 0 14px; } dl > div { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr); gap: 16px; padding: 8px 0; font-size: 13px; line-height: 1.6; }
  dt { font-weight: 550; overflow-wrap: anywhere; } dd { margin: 0; overflow-wrap: anywhere; }
  pre { padding: 16px; margin: 12px 0 0; max-height: 440px; overflow: auto; border-radius: 10px; background: var(--desk-raised); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 13px; line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; }
`;
