import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { api, query } from '@/lib/api';
import { locale, t } from '@/lib/i18n';
import { useLoad, useSession } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { Pagination } from './Pagination';
import { SkeletonRows } from './Skeleton';

type Failure = {
  queue: 'reminders' | 'deliveries' | 'email_verification'; occurrence_id: number;
  kind: 'due' | 'overdue' | 'verification'; channel: string; title: string; due_date: string;
  state: 'failed' | 'uncertain'; error: string; attempts: number; attempted_at: number | null;
  retry_after: number; can_retry: boolean; contact_id?: number; failure_token: string;
};
type FailurePage = { items: Failure[]; counts: { failed: number; uncertain: number }; page: number; pages: number; page_size: number; total: number };

/** Only mounted for administrators. No optimistic send: the server must confirm the queue change. */
export function DeliveryFailures() {
  const { refresh, settings } = useSession();
  const toast = useToast();
  const [state, setState] = useState('');
  const [page, setPage] = useState(1);
  const key = `${state}:${page}`;
  const { data: loaded, error } = useLoad(async () => ({ key, data: await api<FailurePage>('/delivery-failures' + query({ state, page: String(page), page_size: '25' })) }), [state, page]);
  const data = loaded?.key === key ? loaded.data : null;
  const [busy, setBusy] = useState<string | null>(null);
  const [retryError, setRetryError] = useState('');
  useEffect(() => { if (data && page > Math.max(1, data.pages)) setPage(Math.max(1, data.pages)); }, [data, page]);
  const identity = (item: Failure) => [item.queue, item.occurrence_id, item.kind, item.channel, item.contact_id].join(':');
  async function retry(item: Failure) {
    if (busy !== null) return;
    setBusy(identity(item)); setRetryError('');
    try {
      await api('/delivery-failures/retry', { method: 'POST', body: { queue: item.queue, occurrence_id: item.occurrence_id, kind: item.kind, channel: item.channel, failure_token: item.failure_token } });
      refresh(); toast(t('Уведомление снова поставлено в очередь.'));
    } catch (error) { setRetryError((error as Error).message); }
    finally { setBusy(null); }
  }
  const timestamp = (value: number | null) => value ? new Intl.DateTimeFormat(locale(), { timeZone: settings.timezone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value * 1000)) : '—';
  const channel = (value: string) => value.startsWith('telegram') ? 'Telegram' : value.startsWith('email') ? 'Email' : value === 'max' ? 'MAX' : value === 'webhook' ? 'Webhook' : value;
  return <Panel aria-labelledby="delivery-errors-title">
    <div className="delivery-errors-heading"><div><h2 id="delivery-errors-title">{t('Ошибки отправки')}</h2><p>{t('Неудачные отправки сохранены. Повтор доступен, когда сообщение точно не доставлено.')}</p></div>
      <label className="form-field"><span className="sr-only">{t('Состояние отправки')}</span><select value={state} onChange={(event) => { setState(event.target.value); setPage(1); }}>
        <option value="">{t('Все ошибки')}</option><option value="failed">{t('Ошибка отправки')}</option><option value="uncertain">{t('Результат неизвестен')}</option>
      </select></label>
    </div>
    {data && <div className="delivery-errors-counts"><span>{t('Ошибка отправки')}: <b>{data.counts.failed}</b></span><span>{t('Результат неизвестен')}: <b>{data.counts.uncertain}</b></span></div>}
    {(error || retryError) && <div className="notice notice-error" role="alert">{error || retryError}</div>}
    {!data ? (error ? null : <SkeletonRows rows={2} />) : !data.items.length ? <p className="delivery-errors-empty">{t('В этой очереди ошибок нет.')}</p> : <ul>
      {data.items.map((item) => <li key={identity(item)}>
        <div className="delivery-failure-copy"><div className="delivery-failure-title"><b>{item.title || t('Уведомление')}</b><span className={`pill ${item.state === 'failed' ? 'overdue' : 'unpaid'}`}>{item.state === 'failed' ? t('Ошибка отправки') : t('Результат неизвестен')}</span></div>
          <p>{channel(item.channel)} · {t('Попыток: {n}', { n: item.attempts })} · {timestamp(item.attempted_at)}</p>
          {item.error && <p className="delivery-failure-error">{item.error}</p>}
          {item.state === 'uncertain' && <p>{t('Ответ сервиса потерян: сообщение могло дойти. Проверьте у получателя — автоматический повтор может создать дубль.')}</p>}
          {item.queue === 'email_verification' && <p>{t('Новое письмо подтверждения можно отправить из аккаунта или карточки пользователя в разделе «Команда».')}</p>}
        </div>
        {item.can_retry && <button className="button secondary" type="button" disabled={busy !== null} onClick={() => void retry(item)}>{busy === identity(item) ? t('Подождите…') : t('Повторить отправку')}</button>}
      </li>)}
    </ul>}
    {data && <Pagination data={data} onChange={setPage} />}
  </Panel>;
}

const Panel = styled.section`
  margin: 24px 0; padding: 22px; background: var(--desk-surface); border: 1px solid var(--desk-border); border-radius: var(--desk-radius);
  .delivery-errors-heading { display: flex; align-items: start; justify-content: space-between; gap: 18px; flex-wrap: wrap; }
  h2 { margin: 0 0 8px; font-size: 20px; }
  p { margin: 6px 0 0; line-height: 1.55; max-width: 78ch; }
  .delivery-errors-heading > div { flex: 1; min-width: min(100%, 240px); }
  .delivery-errors-heading select { min-width: 190px; }
  .delivery-errors-counts { display: flex; gap: 24px; flex-wrap: wrap; margin-top: 18px; }
  .delivery-errors-empty { margin: 18px 0 0; }
  ul { list-style: none; padding: 0; margin: 18px 0 0; }
  li { display: flex; align-items: center; gap: 20px; padding: 18px 0; border-top: 1px solid var(--desk-border); }
  .delivery-failure-copy { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .delivery-failure-title { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .delivery-failure-error { color: var(--desk-danger, #a53529); }
  li > button { flex-shrink: 0; }
  @media (max-width: 640px) { padding: 18px; li { align-items: stretch; flex-direction: column; gap: 14px; } li > button { align-self: start; } }
`;
