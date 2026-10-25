import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { Shell } from '@/components/Shell';
import { SkeletonRows } from '@/components/Skeleton';
import { api } from '@/lib/api';
import { t } from '@/lib/i18n';
import { useLoad, useSession } from '@/lib/session';
import { useToast } from '@/lib/toast';

type Destination = 'custom' | 'configured' | 'health';
type Header = { name: string; value: string };
type EditorHeader = Header & { id: number };
type ConsoleSettings = { configured: boolean; target: string; signing_enabled: boolean; health_available: boolean; max_body_bytes: number; max_response_bytes: number; timeout_seconds: number };
type ConsoleResponse = { status: number; status_text: string; duration_ms: number; headers: Header[]; body: string; truncated: boolean; error: string };
type Exchange = { request: { method: string; destination: Destination; url: string }; response: ConsoleResponse };
const example = JSON.stringify({ event: 'webhook.test', message: 'Invoice Keeper webhook test' }, null, 2);

export default function Webhook() {
  const { isAdmin } = useSession();
  return <Shell title={t('Вебхук')} heading={t('Вебхук')} subtitle={t('Проверьте приёмник и посмотрите ответ на запрос.')} action={<></>}>
    {isAdmin ? <RequestConsole /> : <div className="notice notice-warning">{t('Раздел доступен администратору.')}</div>}
  </Shell>;
}

function RequestConsole() {
  const toast = useToast();
  const [reload, setReload] = useState(0);
  const { data: config, error: loadError } = useLoad(() => api<ConsoleSettings>('/webhook-console'), [reload]);
  const [destination, setDestination] = useState<Destination>('custom');
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
  const displayedURL = destination === 'custom' ? url : destination === 'configured' ? config?.target ?? '' : t('Проверка доступности приёмника');

  function preset(next: Destination) {
    if (active.current) return;
    setDestination(next); setError('');
    if (next === 'health') { setMethod('GET'); setHeaders([]); setBody(''); }
    if (next === 'configured') { setMethod('POST'); setHeaders([]); setBody(example); }
  }
  function formatBody() {
    try { setBody(JSON.stringify(JSON.parse(body), null, 2)); setError(''); }
    catch { setError(t('Не удалось форматировать: проверьте синтаксис JSON.')); }
  }
  async function send() {
    if (!config || active.current) return;
    setError('');
    if (destination === 'custom') {
      try { const parsed = new URL(url); if (!['https:', 'http:'].includes(parsed.protocol)) throw Error(); }
      catch { setError(t('Укажите полный адрес, начиная с https:// или http://.')); return; }
    }
    if (method === 'POST' && bodyBytes > config.max_body_bytes) { setError(t('Тело запроса превышает лимит: {n} байт.', { n: config.max_body_bytes })); return; }
    const requestHeaders = headers.filter((item) => item.name.trim() || item.value).map(({ name, value }) => ({ name: name.trim(), value }));
    if (requestHeaders.some((item) => !item.name)) { setError(t('Укажите название каждого добавленного заголовка.')); return; }
    const controller = new AbortController(); active.current = controller; setBusy(true);
    const request = { method, destination, url: displayedURL };
    try {
      const response = await api<ConsoleResponse>('/webhook-console/requests', { method: 'POST', signal: controller.signal,
        body: { destination, method, ...(destination === 'custom' ? { url: url.trim() } : {}), headers: requestHeaders, body: method === 'POST' ? body : '' } });
      if (active.current === controller && !controller.signal.aborted) setExchange({ request, response });
    } catch (caught) {
      if (active.current === controller && !controller.signal.aborted) setError((caught as Error).message);
    } finally {
      if (active.current === controller) { active.current = null; setBusy(false); }
    }
  }
  async function copyResponse() {
    if (!exchange) return;
    try { await navigator.clipboard.writeText(exchange.response.body); toast(t('Ответ скопирован')); }
    catch { toast(t('Не удалось скопировать. Выделите текст ответа вручную.'), true); }
  }
  return <>
    {loadError && <div className="notice notice-error" role="alert"><span>{loadError}</span><button type="button" className="text-button" onClick={() => setReload((value) => value + 1)}>{t('Повторить')}</button></div>}
    <ConsoleGrid>
      <Panel aria-labelledby="webhook-request-title">
        <PanelHeading><h2 id="webhook-request-title">{t('Запрос')}</h2><span>{t('Отправляется с сервера')}</span></PanelHeading>
        {!config ? (loadError ? null : <SkeletonRows compact rows={4} />) : <fieldset disabled={busy}>
          <Presets aria-label={t('Шаблоны запроса')}>
            <button type="button" className="button secondary small" onClick={() => preset('custom')} aria-pressed={destination === 'custom'}>{t('Свой адрес')}</button>
            <button type="button" className="button secondary small" onClick={() => preset('health')} disabled={!config.health_available} aria-pressed={destination === 'health'}>{t('Проверить приёмник')}</button>
            <button type="button" className="button secondary small" onClick={() => preset('configured')} disabled={!config.configured} aria-pressed={destination === 'configured'}>{t('Тестовый POST')}</button>
          </Presets>
          {!config.configured && <p className="hint">{t('Приёмник на сервере не настроен. Можно проверить свой публичный адрес.')}</p>}
          {destination === 'configured' && <p className="hint">{config.signing_enabled ? t('Сервер добавит подпись настроенного вебхука автоматически.') : t('Подпись для этого приёмника не настроена.')}</p>}
          <RequestAddress>
            <label className="form-field"><span>{t('Метод')}</span><select value={method} onChange={(event) => setMethod(event.target.value as 'GET' | 'POST')} disabled={destination !== 'custom'}><option>GET</option><option>POST</option></select></label>
            <label className="form-field"><span>{t('Адрес')}</span><input type={destination === 'custom' ? 'url' : 'text'} value={displayedURL} onChange={(event) => setURL(event.target.value)} readOnly={destination !== 'custom'} placeholder="https://example.com/webhook" autoComplete="off" spellCheck={false} /></label>
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
          <p className="hint request-note">{t('POST может изменить данные получателя. Шаблоны только заполняют форму — запрос уйдёт после нажатия «Отправить запрос».')}</p>
        </fieldset>}
        {error && <div className="notice notice-error" role="alert">{error}</div>}
      </Panel>
      <Panel aria-labelledby="webhook-response-title" aria-busy={busy}>
        <PanelHeading><h2 id="webhook-response-title">{t('Ответ')}</h2>{exchange && !busy && <button type="button" className="text-button" onClick={() => void copyResponse()}>{t('Скопировать')}</button>}</PanelHeading>
        {busy ? <SkeletonRows compact rows={5} label={t('Ожидаем ответ приёмника…')} /> : !exchange ? <ResponseEmpty><span aria-hidden="true">↔</span><b>{t('Здесь появится ответ')}</b><p>{t('Выберите адрес и отправьте запрос. Покажем HTTP-статус, время, заголовки и тело ответа.')}</p></ResponseEmpty> : <>
          <p className="response-request"><b>{exchange.request.method}</b> {exchange.request.url}</p>
          <ResponseMeta><span className={`pill ${exchange.response.status >= 200 && exchange.response.status < 300 ? 'paid' : 'overdue'}`}>{exchange.response.status ? `${exchange.response.status} ${exchange.response.status_text}` : t('Нет ответа')}</span><span>{t('{n} мс', { n: Math.round(exchange.response.duration_ms) })}</span></ResponseMeta>
          {exchange.response.error && <div className="notice notice-error" role="alert">{exchange.response.error}</div>}
          {exchange.response.truncated && <div className="notice">{t('Ответ сокращён до разрешённого размера.')}</div>}
          <ResponseHeaders><summary>{t('Заголовки ответа')} <span>{exchange.response.headers.length}</span></summary><dl>{exchange.response.headers.map((item, index) => <div key={index}><dt>{item.name}</dt><dd>{item.value}</dd></div>)}</dl></ResponseHeaders>
          <h3>{t('Тело ответа')}</h3><ResponseBody tabIndex={0} aria-label={t('Тело ответа')}>{exchange.response.body || t('Пустой ответ')}</ResponseBody>
        </>}
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
const Presets = styled.div`display: flex; gap: 8px; flex-wrap: wrap; button[aria-pressed='true'] { border-color: var(--apple-blue); color: var(--apple-blue); background: var(--cyan-soft); }`;
const RequestAddress = styled.div`display: grid; grid-template-columns: 105px minmax(0, 1fr); gap: 12px; margin-top: 20px; @media(max-width: 480px) { grid-template-columns: minmax(0, 1fr); }`;
const HeaderRows = styled.div`
  display: grid; gap: 10px;
  .header-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr) 28px; gap: 8px; align-items: center; }
  .header-row > button { font-size: 24px; line-height: 1; }
  @media(max-width: 600px) { .header-row { grid-template-columns: minmax(0, 1fr) 28px; } .header-row > label:first-child { grid-column: 1; } .header-row > label:nth-child(2) { grid-row: 2; grid-column: 1; } .header-row > button { grid-column: 2; grid-row: 1 / 3; } }
`;
const BodyEditor = styled.textarea`display: block; width: 100%; min-height: 220px; resize: vertical; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 14px; line-height: 1.7; tab-size: 2;`;
const ResponseEmpty = styled.div`min-height: 280px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 12px; padding: 24px; > span { font-size: 32px; color: var(--desk-muted); } > p { margin: 0; max-width: 36ch; line-height: 1.6; color: var(--desk-muted); }`;
const ResponseMeta = styled.div`display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 18px; > span:last-child { font-size: 13px; font-variant-numeric: tabular-nums; }`;
const ResponseHeaders = styled.details`
  margin: 20px 0; border-top: 1px solid var(--desk-border); border-bottom: 1px solid var(--desk-border);
  summary { cursor: pointer; padding: 14px 0; font-size: 15px; font-weight: 550; } summary span { margin-left: 8px; font-weight: 400; color: var(--desk-muted); }
  dl { margin: 0 0 14px; } dl > div { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr); gap: 16px; padding: 8px 0; font-size: 13px; line-height: 1.6; }
  dt { font-weight: 550; overflow-wrap: anywhere; } dd { margin: 0; overflow-wrap: anywhere; }
`;
const ResponseBody = styled.pre`padding: 16px; margin: 12px 0 0; max-height: 540px; overflow: auto; border-radius: 10px; background: var(--desk-raised); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 13px; line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere;`;
