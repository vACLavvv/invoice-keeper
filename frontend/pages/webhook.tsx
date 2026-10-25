import { useEffect, useRef, useState, type FormEvent } from 'react';
import styled from 'styled-components';
import { Shell } from '@/components/Shell';
import { Modal } from '@/components/Modal';
import { Pagination } from '@/components/Pagination';
import { SkeletonRows } from '@/components/Skeleton';
import { WebhookConsole } from '@/components/WebhookConsole';
import { WebhookResponse, type ConsoleResponse } from '@/components/WebhookResponse';
import { api, query } from '@/lib/api';
import { locale, t } from '@/lib/i18n';
import { useLoad, useSession } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { webhookDraft, webhookPayload, type WebhookDraft, type WebhookEndpoint, type WebhookPayload, type WebhookDeliveryState } from '@/lib/webhooks';

type EndpointList = { items: WebhookEndpoint[]; limit: number };
type TestResult = { endpoint: WebhookEndpoint; response: ConsoleResponse | null; error: string };
type DeliveryHistory = { items: { occurrence_id: number; kind: 'due' | 'overdue'; state: WebhookDeliveryState; attempts: number; attempted_at: number | null; sent_at: string | null; error: string; retry_after: number }[]; page: number; page_size: number; total: number; pages: number };

const deliveryStates = (): Record<WebhookDeliveryState, [string, string]> => ({
  pending: [t('Ожидает'), 'unpaid'], sending: [t('Отправляется'), 'unpaid'], sent: [t('Отправлено'), 'paid'],
  failed: [t('Ошибка отправки'), 'overdue'], uncertain: [t('Результат неизвестен'), 'overdue'], cancelled: [t('Отменено'), 'archived'],
});
function DeliveryState({ state }: { state: WebhookDeliveryState }) {
  const [label, tone] = deliveryStates()[state] ?? [state, 'archived'];
  return <span className={`pill ${tone}`}>{label}</span>;
}
function useTimestamp() {
  const { settings } = useSession();
  return (value: number | string | null) => value ? new Intl.DateTimeFormat(locale(), { timeZone: settings.timezone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(typeof value === 'number' ? value * 1000 : value)) : '—';
}

export default function Webhook() {
  const { isAdmin } = useSession();
  return <Shell title={t('Вебхук')} heading={t('Вебхук')} subtitle={t('Отправляйте напоминания о платежах в свои сервисы автоматически.')} action={<></>}>
    {isAdmin ? <WebhookManager /> : <div className="notice notice-warning">{t('Раздел доступен администратору.')}</div>}
  </Shell>;
}

function WebhookManager() {
  const { refresh } = useSession();
  const toast = useToast();
  const timestamp = useTimestamp();
  const [reload, setReload] = useState(0);
  const { data, error: loadError } = useLoad(() => api<EndpointList>('/webhooks'), [reload]);
  // Drafts are snapshots opened by the user. Live list refreshes never replace them.
  const [editor, setEditor] = useState<{ endpoint: WebhookEndpoint | null } | null>(null);
  const [editorError, setEditorError] = useState('');
  const [deleting, setDeleting] = useState<WebhookEndpoint | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [history, setHistory] = useState<number | null>(null);
  const [test, setTest] = useState<TestResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => { active.current?.abort(); active.current = null; }, []);

  async function perform<T>(key: string, request: (signal: AbortSignal) => Promise<T>, done: (value: T) => void, failed: (message: string) => void) {
    if (active.current) return;
    const controller = new AbortController(); active.current = controller; setBusy(key);
    try {
      const value = await request(controller.signal);
      if (active.current === controller && !controller.signal.aborted) done(value);
    } catch (caught) {
      if (active.current === controller && !controller.signal.aborted) failed((caught as Error).message);
    } finally {
      if (active.current === controller) { active.current = null; setBusy(''); }
    }
  }
  function openEditor(endpoint: WebhookEndpoint | null) { if (active.current) return; setEditorError(''); setEditor({ endpoint }); }
  function save(payload: WebhookPayload) {
    if (!editor) return;
    const endpoint = editor.endpoint; setEditorError('');
    void perform('save', (signal) => api<WebhookEndpoint>(endpoint ? `/webhooks/${endpoint.id}` : '/webhooks', { method: endpoint ? 'PATCH' : 'POST', body: payload, signal }), () => {
      setEditor(null); refresh(); toast(endpoint ? t('Получатель обновлён') : t('Получатель добавлен'));
    }, setEditorError);
  }
  function toggle(endpoint: WebhookEndpoint) {
    setError('');
    void perform(`toggle:${endpoint.id}`, (signal) => api<WebhookEndpoint>(`/webhooks/${endpoint.id}`, { method: 'PATCH', body: { enabled: !endpoint.enabled }, signal }), () => {
      refresh(); toast(endpoint.enabled ? t('Получатель выключен') : t('Получатель включён'));
    }, setError);
  }
  function testEndpoint(endpoint: WebhookEndpoint) {
    if (active.current) return;
    setTest({ endpoint, response: null, error: '' });
    void perform(`test:${endpoint.id}`, (signal) => api<ConsoleResponse>(`/webhooks/${endpoint.id}/test`, { method: 'POST', signal }), (response) => {
      setTest({ endpoint, response, error: '' });
    }, (error) => setTest({ endpoint, response: null, error }));
  }
  function remove() {
    if (!deleting) return;
    const endpoint = deleting; setDeleteError('');
    void perform('delete', (signal) => api(`/webhooks/${endpoint.id}`, { method: 'DELETE', signal }), () => {
      setDeleting(null); setHistory((id) => id === endpoint.id ? null : id); setTest((current) => current?.endpoint.id === endpoint.id ? null : current); refresh(); toast(t('Получатель удалён. История сохранена.'));
    }, setDeleteError);
  }
  const full = !!data && data.items.length >= data.limit;
  return <Manager>
    <div className="manager-heading"><div><h2>{data ? t('Подключено получателей: {n}', { n: data.items.length }) : t('Получатели напоминаний')}</h2>
      <p>{t('Выберите, кому отправлять сообщения о сроках оплаты и просрочке.')}</p></div>
      <button className="button primary" type="button" onClick={() => openEditor(null)} disabled={!data || !!busy || full}>{t('Добавить получателя')}</button>
    </div>
    <p className="delivery-note">{t('Включение получателя запускает отправку выбранных напоминаний, в том числе по текущим платежам.')}</p>
    {full && <p className="hint">{t('Достигнут лимит: {n} получателей.', { n: data.limit })}</p>}
    {loadError && <div className="notice notice-error" role="alert">{loadError} <button type="button" className="text-button" onClick={() => setReload((value) => value + 1)}>{t('Повторить')}</button></div>}
    {error && <div className="notice notice-error" role="alert">{error}</div>}

    {!data ? (loadError ? null : <SkeletonRows rows={3} />) : data.items.length === 0 ? <EmptyState>
      <span aria-hidden="true">↗</span><h3>{t('Подключите первый сервис')}</h3><p>{t('Добавьте адрес приёмника. Invoice Keeper будет сам отправлять на него выбранные напоминания.')}</p>
    </EmptyState> : <ul className="endpoint-list">{data.items.map((endpoint) => <li key={endpoint.id}>
      <EndpointCard $selected={history === endpoint.id}>
        <div className="endpoint-main"><div className="endpoint-copy"><div className="endpoint-title"><h3>{endpoint.name}</h3><span className={`pill ${endpoint.enabled ? 'paid' : 'archived'}`}>{endpoint.enabled ? t('Включён') : t('Выключен')}</span></div><p className="endpoint-url">{endpoint.url}</p>
          <div className="endpoint-events"><span>{endpoint.notify_due ? t('До срока оплаты') : null}</span><span>{endpoint.notify_overdue ? t('Просрочка') : null}</span>{!endpoint.notify_due && !endpoint.notify_overdue && <span>{t('События не выбраны')}</span>}<span>{endpoint.has_secret ? t('С подписью') : t('Без подписи')}</span>{endpoint.legacy_source && <span>{t('Из настроек сервера')}</span>}</div>
        </div><div className="endpoint-last"><span className="hint">{t('Последнее напоминание')}</span>{endpoint.last_delivery ? <><DeliveryState state={endpoint.last_delivery.state} /><span className="time">{timestamp(endpoint.last_delivery.sent_at || endpoint.last_delivery.attempted_at)}</span></> : <span>{t('Пока не отправляли')}</span>}</div></div>
        {endpoint.last_delivery?.error && <p className="endpoint-error">{endpoint.last_delivery.error}</p>}
        <div className="endpoint-actions"><div><button type="button" className="button secondary small" onClick={() => openEditor(endpoint)} disabled={!!busy}>{t('Изменить')}</button>
          <button type="button" className="button secondary small" onClick={() => toggle(endpoint)} disabled={!!busy}>{busy === `toggle:${endpoint.id}` ? t('Подождите…') : endpoint.enabled ? t('Выключить') : t('Включить')}</button>
          <button type="button" className="button secondary small" onClick={() => testEndpoint(endpoint)} disabled={!!busy}>{busy === `test:${endpoint.id}` ? t('Отправляем…') : t('Отправить тест')}</button>
          <button type="button" className="text-button" aria-expanded={history === endpoint.id} aria-controls={`webhook-history-${endpoint.id}`} onClick={() => setHistory((id) => id === endpoint.id ? null : endpoint.id)}>{t('История доставки')}</button></div>
          <button type="button" className="text-button danger" disabled={!!busy} onClick={() => { setDeleteError(''); setDeleting(endpoint); }}>{t('Удалить')}</button>
        </div>
        {test?.endpoint.id === endpoint.id && <TestPanel aria-busy={busy.startsWith('test:')} aria-labelledby="webhook-test-title">
      <div className="panel-heading"><div><h2 id="webhook-test-title">{t('Тест получателя: {name}', { name: test.endpoint.name })}</h2><p>{t('Это разовая проверка. История ниже содержит только автоматические напоминания.')}</p></div>
        <button type="button" className="text-button" onClick={() => setTest(null)} disabled={busy.startsWith('test:')}>{t('Закрыть')}</button></div>
      {busy.startsWith('test:') ? <SkeletonRows compact rows={3} label={t('Ожидаем ответ приёмника…')} /> : test.response ? <WebhookResponse response={test.response} request={`POST ${test.endpoint.url}`} /> : <div className="notice notice-error" role="alert">{test.error}</div>}
    </TestPanel>}
        {history === endpoint.id && <HistoryPanel key={endpoint.id} endpoint={endpoint} />}
      </EndpointCard>
    </li>)}</ul>}
    <Advanced onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}>
      <summary><span><b>{t('Ручная проверка адреса')}</b><span>{t('Для разработчиков: разовый GET или POST с собственными заголовками.')}</span></span><span className="arrow" aria-hidden="true">⌄</span></summary>
      {advancedOpen && <div className="advanced-body"><WebhookConsole /></div>}
    </Advanced>
    {editor && <EndpointEditor endpoint={editor.endpoint} busy={busy === 'save'} serverError={editorError} onSave={save} onClose={() => { if (!active.current) setEditor(null); }} />}
    {deleting && <Modal title={t('Удалить получателя?')} onClose={() => { if (!active.current) setDeleting(null); }}>
      <DeleteBody><p><strong>{deleting.name}</strong></p><p>{t('Новые напоминания больше не будут отправляться этому получателю. История доставки сохранится в журнале.')}</p>
        {deleteError && <div className="notice notice-error" role="alert">{deleteError}</div>}
        <div className="modal-actions"><button type="button" className="button secondary" disabled={!!busy} onClick={() => setDeleting(null)}>{t('Отмена')}</button><button type="button" className="button primary danger" disabled={!!busy} onClick={remove}>{busy === 'delete' ? t('Подождите…') : t('Удалить получателя')}</button></div>
      </DeleteBody>
    </Modal>}
  </Manager>;
}

function EndpointEditor({ endpoint, busy, serverError, onSave, onClose }: { endpoint: WebhookEndpoint | null; busy: boolean; serverError: string; onSave: (payload: WebhookPayload) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<WebhookDraft>(() => webhookDraft(endpoint));
  const [error, setError] = useState('');
  const change = <K extends keyof WebhookDraft>(field: K, value: WebhookDraft[K]) => setDraft((current) => ({ ...current, [field]: value }));
  function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return; setError('');
    if (draft.url.trim()) {
      try { const url = new URL(draft.url); if (!['https:', 'http:'].includes(url.protocol)) throw Error(); }
      catch { setError(t('Укажите полный адрес, начиная с https:// или http://.')); return; }
    }
    onSave(webhookPayload(draft, endpoint));
  }
  return <Modal title={endpoint ? t('Изменить получателя') : t('Добавить получателя')} onClose={onClose}>
    <EditorForm onSubmit={submit} autoComplete="off"><fieldset disabled={busy}>
      <label className="form-field"><span>{t('Название')}</span><input required autoFocus maxLength={120} value={draft.name} onChange={(event) => change('name', event.target.value)} placeholder={t('Например, CRM команды')} /></label>
      {endpoint?.url_readonly && <div className="existing-url"><span>{t('Текущий адрес')}</span><p>{endpoint.url}</p><small>{t('Адрес из настроек сервера показан без секретов. Оставьте поле ниже пустым, чтобы сохранить его.')}</small></div>}
      <label className="form-field"><span>{endpoint?.url_readonly ? t('Новый адрес, если нужно заменить') : t('Адрес приёмника')}</span><input type="url" required={!endpoint?.url_readonly} value={draft.url} onChange={(event) => change('url', event.target.value)} placeholder="https://example.com/webhook" maxLength={4096} autoComplete="off" spellCheck={false} /></label>
      <p className="hint">{t('Используйте публичный адрес HTTP или HTTPS, который принимает POST-запросы.')}</p>
      <fieldset className="events"><legend>{t('Какие напоминания отправлять')}</legend><label><input type="checkbox" checked={draft.notify_due} onChange={(event) => change('notify_due', event.target.checked)} /><span>{t('До срока оплаты')}</span></label><label><input type="checkbox" checked={draft.notify_overdue} onChange={(event) => change('notify_overdue', event.target.checked)} /><span>{t('О просрочке платежа')}</span></label></fieldset>
      {!draft.notify_due && !draft.notify_overdue && <p className="hint">{t('События не выбраны: автоматических отправок не будет.')}</p>}
      <label className="check"><input type="checkbox" checked={draft.enabled} onChange={(event) => change('enabled', event.target.checked)} /><span>{t('Включить автоматическую отправку')}</span></label>
      {draft.enabled && <p className="notice">{t('После сохранения включённый получатель начнёт получать напоминания, в том числе по текущим платежам, для которых уже подошёл срок уведомления.')}</p>}
      <label className="form-field"><span>{endpoint?.has_secret ? t('Новый секрет подписи') : t('Секрет подписи (необязательно)')}</span><input type="password" value={draft.secret} disabled={draft.removeSecret} onChange={(event) => change('secret', event.target.value)} autoComplete="new-password" maxLength={4096} spellCheck={false} placeholder={endpoint?.has_secret ? t('Пустое поле — сохранить текущий') : ''} /></label>
      <p className="hint">{t('Приёмник сможет проверить, что сообщение отправил Invoice Keeper. Используйте одинаковый секрет с обеих сторон.')}</p>
      {endpoint?.has_secret && <label className="check"><input type="checkbox" checked={draft.removeSecret} onChange={(event) => { change('removeSecret', event.target.checked); if (event.target.checked) change('secret', ''); }} /><span>{t('Убрать текущую подпись')}</span></label>}
      {(error || serverError) && <div className="notice notice-error" role="alert">{error || serverError}</div>}
      <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>{t('Отмена')}</button><button type="submit" className="button primary">{busy ? t('Подождите…') : t('Сохранить')}</button></div>
    </fieldset></EditorForm>
  </Modal>;
}

function HistoryPanel({ endpoint }: { endpoint: WebhookEndpoint }) {
  const timestamp = useTimestamp();
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const { data: loaded, error } = useLoad(async () => ({ page, data: await api<DeliveryHistory>(`/webhooks/${endpoint.id}/deliveries` + query({ page: String(page), page_size: '10' })) }), [endpoint.id, page, reload]);
  const data = loaded?.page === page ? loaded.data : null;
  useEffect(() => { if (data && page > Math.max(1, data.pages)) setPage(Math.max(1, data.pages)); }, [data, page]);
  return <History id={`webhook-history-${endpoint.id}`} aria-label={t('История доставки')}>
    <div className="history-heading"><h4>{t('Автоматические напоминания')}</h4><p>{t('Ручные тесты отображаются отдельно и записываются в журнал действий.')}</p></div>
    {error && <div className="notice notice-error" role="alert">{error} <button type="button" className="text-button" onClick={() => setReload((value) => value + 1)}>{t('Повторить')}</button></div>}
    {!data ? (error ? null : <SkeletonRows compact rows={2} />) : !data.items.length ? <p className="history-empty">{t('Автоматических отправок пока нет.')}</p> : <ol>{data.items.map((item) => <li key={`${item.occurrence_id}:${item.kind}`}>
      <div className="history-row"><div><b>{item.kind === 'due' ? t('До срока оплаты') : t('О просрочке платежа')}</b><p>{t('Период #{id}', { id: item.occurrence_id })} · {t('Попыток: {n}', { n: item.attempts })}</p></div><div className="history-result"><DeliveryState state={item.state} /><time>{timestamp(item.sent_at || item.attempted_at)}</time></div></div>
      {item.error && <p className="delivery-error">{item.error}</p>}{item.state === 'pending' && item.retry_after > 0 && <p>{t('Следующая попытка: {time}', { time: timestamp(item.retry_after) })}</p>}
    </li>)}</ol>}
    {data && <Pagination data={data} onChange={setPage} />}
  </History>;
}

const Manager = styled.div`
  .manager-heading, .panel-heading { display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap; margin-bottom: 24px; }
  .manager-heading > div, .panel-heading > div { flex: 1; min-width: min(100%, 240px); } h2 { margin: 0 0 8px; font-size: 22px; line-height: 1.3; }
  .manager-heading p, .panel-heading p { margin: 0; color: var(--desk-muted); line-height: 1.6; }
  .manager-heading > button { flex-shrink: 0; min-height: 46px; } .hint { color: var(--desk-muted); font-size: 14px; line-height: 1.5; }
  .endpoint-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 16px; }
  .delivery-note { color: var(--desk-muted); font-size: 14px; line-height: 1.6; margin: -8px 0 24px; }
  .notice { margin: 16px 0; } .danger { color: var(--desk-danger, #a53529); }
  @media(max-width: 600px) { .manager-heading > button { width: 100%; } }
`;
const EndpointCard = styled.article<{ $selected: boolean }>`
  min-width: 0; border: 1px solid ${p => p.$selected ? 'var(--apple-blue)' : 'var(--desk-border)'}; border-radius: var(--desk-radius); background: var(--desk-surface); padding: 22px;
  .endpoint-main { display: grid; grid-template-columns: minmax(0, 1fr) 210px; align-items: start; gap: 28px; }
  .endpoint-copy { min-width: 0; } .endpoint-title { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  h3 { font-size: 19px; margin: 0; line-height: 1.4; overflow-wrap: anywhere; } .endpoint-url { font-size: 15px; line-height: 1.5; overflow-wrap: anywhere; margin: 10px 0 14px; }
  .endpoint-events { display: flex; gap: 6px 14px; flex-wrap: wrap; color: var(--desk-muted); font-size: 13px; line-height: 1.5; } .endpoint-events > span:empty { display: none; }
  .endpoint-last { display: flex; flex-direction: column; align-items: start; gap: 8px; font-size: 14px; } .time { font-variant-numeric: tabular-nums; color: var(--desk-muted); }
  .endpoint-error { color: var(--desk-danger, #a53529); margin: 16px 0 0; font-size: 14px; line-height: 1.6; overflow-wrap: anywhere; }
  .endpoint-actions { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-top: 20px; padding-top: 18px; border-top: 1px solid var(--desk-border); }
  .endpoint-actions > div { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; } .endpoint-actions button { min-height: 40px; }
  .endpoint-actions button[aria-expanded='true'] { color: var(--apple-blue); }
  @media(max-width: 750px) { .endpoint-main { grid-template-columns: minmax(0, 1fr); gap: 16px; } .endpoint-last { flex-direction: row; flex-wrap: wrap; align-items: center; gap: 8px 12px; } }
  @media(max-width: 480px) { padding: 18px; .endpoint-actions { align-items: stretch; } .endpoint-actions > div { width: 100%; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } .endpoint-actions button { min-width: 0; white-space: normal; } }
`;
const TestPanel = styled.section`padding: 24px; margin-top: 24px; border: 1px solid var(--desk-border); border-radius: var(--desk-radius); background: var(--desk-surface); min-width: 0; h2 { overflow-wrap: anywhere; } @media(max-width: 600px) { padding: 18px; }`;
const EmptyState = styled.div`padding: 48px 24px; text-align: center; border: 1px dashed var(--desk-border); border-radius: var(--desk-radius); background: var(--desk-surface); > span { display: block; font-size: 32px; color: var(--apple-blue); } h3 { font-size: 21px; margin: 12px 0; } p { max-width: 55ch; margin: 0 auto; line-height: 1.65; color: var(--desk-muted); }`;
const Advanced = styled.details`
  margin-top: 32px; border-top: 1px solid var(--desk-border); padding-top: 8px;
  > summary { cursor: pointer; list-style: none; display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 20px 0; }
  > summary::-webkit-details-marker { display: none; } > summary > span:first-child { display: grid; gap: 8px; } summary b { font-size: 18px; } summary span span { font-size: 14px; color: var(--desk-muted); line-height: 1.6; }
  .arrow { font-size: 25px; } &[open] .arrow { transform: rotate(180deg); } .advanced-body { padding-top: 8px; }
`;
const EditorForm = styled.form`
  fieldset { min-width: 0; border: 0; padding: 0; margin: 0; } fieldset:disabled { opacity: .7; }
  .form-field { display: grid; gap: 8px; margin-bottom: 18px; } input:not([type='checkbox']) { width: 100%; min-width: 0; font-size: 16px; }
  .hint, .existing-url small { color: var(--desk-muted); font-size: 14px; line-height: 1.6; margin: -6px 0 20px; }
  .existing-url { border-radius: 10px; background: var(--desk-raised); padding: 16px; margin-bottom: 18px; } .existing-url > span { font-size: 14px; font-weight: 600; } .existing-url p { overflow-wrap: anywhere; font-size: 14px; line-height: 1.6; margin: 8px 0; }
  .events { border-top: 1px solid var(--desk-border); margin-top: 24px; padding-top: 16px; padding-bottom: 22px; } legend { padding: 0 10px 0 0; font-weight: 600; }
  .events label, .check { display: flex; gap: 12px; align-items: start; line-height: 1.5; cursor: pointer; } .events label + label { margin-top: 14px; } input[type='checkbox'] { width: 18px; height: 18px; flex-shrink: 0; margin-top: 3px; }
  .notice { font-size: 14px; line-height: 1.6; margin: 14px 0 22px; } .modal-actions { margin-top: 24px; }
`;
const DeleteBody = styled.div`p { line-height: 1.65; overflow-wrap: anywhere; } .modal-actions { margin-top: 24px; } button.danger { background: var(--desk-danger, #a53529); color: #fff; }`;
const History = styled.section`
  margin-top: 20px; border-top: 1px solid var(--desk-border); padding-top: 20px;
  .history-heading { margin-bottom: 18px; } h4 { margin: 0 0 8px; font-size: 17px; } p { margin: 8px 0 0; color: var(--desk-muted); font-size: 14px; line-height: 1.6; }
  ol { margin: 0; padding: 0; list-style: none; } li { padding: 16px 0; border-top: 1px solid var(--desk-border); } .history-row { display: flex; align-items: start; justify-content: space-between; gap: 20px; }
  .history-result { display: flex; align-items: end; flex-direction: column; gap: 8px; } time { font-size: 13px; white-space: nowrap; color: var(--desk-muted); }
  .history-empty { margin: 18px 0; } .delivery-error { color: var(--desk-danger, #a53529); overflow-wrap: anywhere; }
  @media(max-width: 480px) { .history-row { flex-direction: column; gap: 12px; } .history-result { flex-direction: row; flex-wrap: wrap; align-items: center; } }
`;
