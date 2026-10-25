import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { SkeletonRows } from '@/components/Skeleton';
import { api } from '@/lib/api';
import { t } from '@/lib/i18n';
import { useLoad } from '@/lib/session';
import { WebhookResponse, type ConsoleResponse } from './WebhookResponse';

type Header = { name: string; value: string };
type EditorHeader = Header & { id: number };
type ConsoleSettings = { max_body_bytes: number; max_response_bytes: number; timeout_seconds: number };
type Exchange = { request: { method: string; url: string }; response: ConsoleResponse };
export function WebhookConsole() {
  const [reload, setReload] = useState(0);
  const { data: config, error: loadError } = useLoad(() => api<ConsoleSettings>('/webhook-console'), [reload]);
  const [method, setMethod] = useState<'GET' | 'POST'>('GET');
  const [url, setURL] = useState('');
  const [headers, setHeaders] = useState<EditorHeader[]>([]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [exchange, setExchange] = useState<Exchange | null>(null);
  const nextHeader = useRef(1);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => { active.current?.abort(); active.current = null; }, []);
  const bodyBytes = new TextEncoder().encode(body).length;
  function formatBody() {
    try { setBody(JSON.stringify(JSON.parse(body), null, 2)); setError(''); }
    catch { setError(t('Не удалось форматировать: проверьте синтаксис JSON.')); }
  }
  async function send() {
    if (!config || active.current) return;
    setError('');
    try { const parsed = new URL(url); if (!['https:', 'http:'].includes(parsed.protocol)) throw Error(); }
    catch { setError(t('Укажите полный адрес, начиная с https:// или http://.')); return; }
    if (method === 'POST' && bodyBytes > config.max_body_bytes) { setError(t('Тело запроса превышает лимит: {n} байт.', { n: config.max_body_bytes })); return; }
    const requestHeaders = headers.filter((item) => item.name.trim() || item.value).map(({ name, value }) => ({ name: name.trim(), value }));
    if (requestHeaders.some((item) => !item.name)) { setError(t('Укажите название каждого добавленного заголовка.')); return; }
    const controller = new AbortController(); active.current = controller; setBusy(true); setExchange(null);
    const request = { method, url: url.trim() };
    try {
      const response = await api<ConsoleResponse>('/webhook-console/requests', { method: 'POST', signal: controller.signal,
        body: { destination: 'custom', method, url: url.trim(), headers: requestHeaders, body: method === 'POST' ? body : '' } });
      if (active.current === controller && !controller.signal.aborted) setExchange({ request, response });
    } catch (caught) {
      if (active.current === controller && !controller.signal.aborted) setError((caught as Error).message);
    } finally {
      if (active.current === controller) { active.current = null; setBusy(false); }
    }
  }
  return <>
    {loadError && <div className="notice notice-error" role="alert"><span>{loadError}</span><button type="button" className="text-button" onClick={() => setReload((value) => value + 1)}>{t('Повторить')}</button></div>}
    <ConsoleGrid>
      <Panel aria-labelledby="webhook-request-title">
        <PanelHeading><h2 id="webhook-request-title">{t('Запрос')}</h2><span>{t('Отправляется с сервера')}</span></PanelHeading>
        {!config ? (loadError ? null : <SkeletonRows compact rows={4} />) : <fieldset disabled={busy}>
          <RequestAddress>
            <label className="form-field"><span>{t('Метод')}</span><select value={method} onChange={(event) => setMethod(event.target.value as 'GET' | 'POST')}><option>GET</option><option>POST</option></select></label>
            <label className="form-field"><span>{t('Адрес')}</span><input type="url" value={url} onChange={(event) => setURL(event.target.value)} placeholder="https://example.com/webhook" autoComplete="off" spellCheck={false} /></label>
          </RequestAddress>
          <div className="editor-heading"><h3>{t('Заголовки запроса')}</h3><button type="button" className="text-button" disabled={headers.length >= 16} onClick={() => setHeaders((items) => [...items, { id: nextHeader.current++, name: '', value: '' }])}>{t('Добавить заголовок')}</button></div>
          {headers.length === 0 ? <p className="hint">{t('Дополнительные заголовки не заданы.')}</p> : <HeaderRows>{headers.map((item) => <div className="header-row" key={item.id}>
            <label className="form-field"><span className="sr-only">{t('Название заголовка')}</span><input value={item.name} onChange={(event) => setHeaders((items) => items.map((row) => row.id === item.id ? { ...row, name: event.target.value } : row))} placeholder="Content-Type" autoComplete="off" spellCheck={false} /></label>
            <label className="form-field"><span className="sr-only">{t('Значение заголовка')}</span><input type={/authorization|token|key|cookie/i.test(item.name) ? 'password' : 'text'} value={item.value} onChange={(event) => setHeaders((items) => items.map((row) => row.id === item.id ? { ...row, value: event.target.value } : row))} placeholder="application/json" autoComplete="off" spellCheck={false} /></label>
            <button type="button" className="text-button" aria-label={t('Удалить заголовок')} onClick={() => setHeaders((items) => items.filter((row) => row.id !== item.id))}>×</button>
          </div>)}</HeaderRows>}
          <div className="editor-heading"><h3><label htmlFor="webhook-body">{t('Тело запроса')}</label></h3><button type="button" className="text-button" onClick={formatBody} disabled={method !== 'POST' || !body}>{t('Форматировать JSON')}</button></div>
          {method === 'POST' ? <BodyEditor id="webhook-body" value={body} onChange={(event) => setBody(event.target.value)} spellCheck={false} autoComplete="off" placeholder={'{\n  "event": "webhook.test"\n}'} /> : <p className="hint">{t('GET отправляется без тела запроса.')}</p>}
          <div className="request-footer"><span className="hint">{method === 'POST' ? t('{used} из {max} байт', { used: bodyBytes, max: config.max_body_bytes }) : t('Тайм-аут: {n} с', { n: config.timeout_seconds })}</span><button type="button" className="button primary" onClick={() => void send()}>{busy ? t('Отправляем…') : t('Отправить запрос')}</button></div>
          <p className="hint request-note">{t('Разовый запрос с сервера. Он не добавляет получателя в рассылку. POST может изменить данные получателя.')}</p>
        </fieldset>}
        {error && <div className="notice notice-error" role="alert">{error}</div>}
      </Panel>
      <Panel aria-labelledby="webhook-response-title" aria-busy={busy}>
        <PanelHeading><h2 id="webhook-response-title">{t('Ответ')}</h2></PanelHeading>
        {busy ? <SkeletonRows compact rows={5} label={t('Ожидаем ответ приёмника…')} /> : !exchange ? <ResponseEmpty><span aria-hidden="true">↔</span><b>{t('Здесь появится ответ')}</b><p>{t('Выберите адрес и отправьте запрос. Покажем HTTP-статус, время, заголовки и тело ответа.')}</p></ResponseEmpty> : <WebhookResponse response={exchange.response} request={`${exchange.request.method} ${exchange.request.url}`} />}
      </Panel>
    </ConsoleGrid>
  </>;
}

const ConsoleGrid = styled.div`
  display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); gap: 20px; align-items: start;
  @media (max-width: 1100px) { grid-template-columns: minmax(0, 1fr); }
`;
const Panel = styled.section`
  min-width: 0; padding: 24px; border: 1px solid var(--desk-border); border-radius: var(--desk-radius); background: var(--desk-surface); color: var(--desk-ink);
  h2 { font-size: 22px; margin: 0; } h3 { font-size: 15px; font-weight: 600; margin: 0; }
  fieldset { min-width: 0; margin: 0; padding: 0; border: 0; } fieldset:disabled { opacity: .7; }
  .hint { color: var(--desk-muted); font-size: 13px; line-height: 1.6; margin: 8px 0; }
  .editor-heading { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-top: 25px; margin-bottom: 10px; flex-wrap: wrap; }
  .request-footer { display: flex; justify-content: space-between; align-items: center; gap: 14px; flex-wrap: wrap; margin-top: 18px; }
  .request-note { margin-top: 16px; }
  .response-request { font-size: 13px; margin: 0 0 16px; overflow-wrap: anywhere; line-height: 1.6; }
  .notice { margin-top: 16px; }
  input, select { width: 100%; }
  @media (max-width: 600px) { padding: 18px; input, select, textarea { font-size: 16px; } .request-footer > button { width: 100%; } }
`;
const PanelHeading = styled.div`display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 24px; flex-wrap: wrap; > span { color: var(--desk-muted); font-size: 13px; }`;
const RequestAddress = styled.div`display: grid; grid-template-columns: 105px minmax(0, 1fr); gap: 12px; margin-top: 20px; @media(max-width: 480px) { grid-template-columns: minmax(0, 1fr); }`;
const HeaderRows = styled.div`
  display: grid; gap: 10px;
  .header-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr) 28px; gap: 8px; align-items: center; }
  .header-row > button { font-size: 24px; line-height: 1; }
  @media(max-width: 600px) { .header-row { grid-template-columns: minmax(0, 1fr) 28px; } .header-row > label:first-child { grid-column: 1; } .header-row > label:nth-child(2) { grid-row: 2; grid-column: 1; } .header-row > button { grid-column: 2; grid-row: 1 / 3; } }
`;
const BodyEditor = styled.textarea`display: block; width: 100%; min-height: 220px; resize: vertical; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 14px; line-height: 1.7; tab-size: 2;`;
const ResponseEmpty = styled.div`min-height: 280px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 12px; padding: 24px; > span { font-size: 32px; color: var(--desk-muted); } > p { margin: 0; max-width: 36ch; line-height: 1.6; color: var(--desk-muted); }`;
