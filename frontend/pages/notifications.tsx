import { DeliveryFailures } from '@/components/DeliveryFailures';
import { SkeletonRows, SkeletonBar } from '@/components/Skeleton';
import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { ws } from '@/components/icons';
import { PayModal } from '@/components/PaymentModals';
import { Shell } from '@/components/Shell';
import { api, type NotificationFeed, type Notification, type Occurrence } from '@/lib/api';
import { longDate, money, symbols } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useLoad, useSession } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { enableBrowserNotices, showBrowserNotice } from '@/lib/browser-notices';
import { useBrowserNoticeState } from '@/lib/use-browser-notices';

/** «Ничего не упустить»: personal feed with read marks and optional browser notifications. */
export default function Notifications() {
  const { user, refresh, isAdmin } = useSession();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const { data: loaded, error } = useLoad(async () => ({ page, feed: await api<NotificationFeed>(`/notifications?limit=50&page=${page}`) }), [page]);
  const data = loaded?.page === page ? loaded.feed : null;
  useEffect(() => {
    if (data && page > Math.max(1, data.pages ?? 1)) setPage(Math.max(1, data.pages ?? 1));
  }, [data, page]);
  const [paying, setPaying] = useState<Occurrence | null>(null);
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<'idle' | 'checking' | 'accepted' | 'seen' | 'missing' | 'failed'>('idle');
  const browser = useBrowserNoticeState(user);

  async function mark(body: object, done?: string) {
    try {
      await api('/notifications/read', { method: 'POST', body });
      refresh();
      if (done) toast(done);
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  async function toggleBrowser() {
    if (busy) return;
    setBusy(true);
    try { await enableBrowserNotices(browser.account, !browser.enabled || browser.permission !== 'granted'); }
    finally { setBusy(false); }
  }

  async function testBrowser() {
    if (busy) return;
    setBusy(true); setTest('checking');
    const accepted = await showBrowserNotice(browser.account, t('Проверка уведомлений Invoice Keeper'), t('Если вы видите это системное уведомление, напоминания настроены.'), `test:${Date.now()}`);
    setTest(accepted ? 'accepted' : 'failed'); setBusy(false);
  }

  async function open(n: Notification) {
    try {
      setPaying(await api<Occurrence>(`/payment-occurrences/${n.occurrence_id}`));
      if (!n.read) mark({ ids: [n.id] });
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  return (
    <Shell title={t('Уведомления')} heading={t('Ничего не упустить')} subtitle={t('Важные сроки, история напоминаний и личные отметки прочтения.')} action={<></>}>
      <div className="notification-toolbar">
        <p className="muted">{t('Напоминания команды. Отметки прочтения видны только вам.')}</p>
        <button type="button" className="button secondary" disabled={!data?.unread_count} onClick={() => mark({ all: true }, t('Все уведомления прочитаны'))}>{t('Прочитать все')}</button>
      </div>
      <div className="browser-notice">
        <div><b>{t('Напоминать в браузере')}</b><p>{t('Новые события приходят на любой странице открытой панели. Расширение для этого не требуется.')}</p>
          {browser.permission === 'denied' && <p>{t('Разрешите уведомления в настройках этого сайта в браузере, затем вернитесь сюда.')}</p>}
        </div>
        <BrowserActions>
          {browser.enabled && browser.permission === 'granted' && <button type="button" className="button secondary" onClick={() => void testBrowser()} disabled={busy}>{t('Проверить')}</button>}
          <button type="button" className="button secondary" onClick={toggleBrowser} disabled={busy || browser.permission === 'unsupported' || browser.permission === 'denied'}>
            {busy ? t('Подождите…') : browser.permission === 'unsupported' ? t('Недоступно в этом браузере') : browser.permission === 'denied' ? t('Заблокировано в браузере') : browser.enabled && browser.permission === 'granted' ? t('Выключить') : t('Включить')}
          </button>
        </BrowserActions>
      </div>
      {test !== 'idle' && <TestResult role="status" aria-live="polite">
        <b>{test === 'checking' ? t('Проверяем системные уведомления…') : test === 'seen' ? t('Системное уведомление появилось') : test === 'failed' ? t('Браузер отклонил запрос уведомления') : t('Браузер принял запрос уведомления')}</b>
        {test === 'checking' && <SkeletonBar $width="200px" aria-hidden="true" />}
        {(test === 'accepted' || test === 'missing') && <p>{t('Проверьте центр уведомлений устройства. Сайт не может определить, показала ли система баннер.')}</p>}
        {test === 'accepted' && <BrowserActions><button type="button" className="button secondary" onClick={() => setTest('seen')}>{t('Уведомление появилось')}</button><button type="button" className="text-button" onClick={() => setTest('missing')}>{t('Не появилось')}</button></BrowserActions>}
        {(test === 'missing' || test === 'failed') && <ol>
          <li>{t('Разрешите уведомления для этого сайта в браузере и для самого браузера в настройках устройства.')}</li>
          <li>{t('Проверьте режим «Не беспокоить» или «Фокусирование» и включите баннеры уведомлений.')}</li>
          <li>{t('На iPhone и iPad добавьте сайт на экран «Домой» и открывайте его оттуда. Разрешение запрашивается кнопкой «Включить».')}</li>
        </ol>}
      </TestResult>}
      {browser.error === 'delivery' && <div className="notice notice-error" role="alert">{t('Браузер не смог показать уведомление. Проверьте разрешения браузера и системы; для уведомлений при закрытой панели используйте Telegram или почту.')}</div>}
      {browser.error === 'storage' && <div className="notice" role="status">{t('Браузер не сохраняет настройку уведомлений. Она действует только в этой вкладке.')}</div>}
      {browser.permission === 'unsupported' && <div className="notice" role="status">{t('На iPhone и iPad добавьте сайт на экран «Домой» и открывайте его оттуда. Разрешение запрашивается кнопкой «Включить».')}</div>}
      {isAdmin && <DeliveryFailures />}
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      <div className="notification-list">
        {!data ? <div className="ledger"><SkeletonRows /></div> : data.items.length === 0 ? (
          <div className="ledger empty-state"><b>{t('Важное появится здесь')}</b>{t('Когда до срока останется 3 дня, добавим напоминание.')}</div>
        ) : data.items.map((n) => (
          <article key={n.id} className={`notification-card ${n.read ? 'read' : 'unread'} ${n.kind}`}>
            <span className={`payment-icon ${n.currency.toLowerCase()}`}>{n.kind === 'paid' ? ws.check : ws.clock}</span>
            <div>
              <h3>{n.title}</h3>
              <p>{money(n.amount)} {symbols[n.currency]} · {t('срок {date}', { date: longDate(n.due_date) })}</p>
              <small>{describe(n)}</small>
            </div>
            <div className="notification-actions">
              <button type="button" className="row-action" onClick={() => open(n)}>{n.kind === 'paid' ? t('Посмотреть') : t('Отметить оплату')}</button>
              <button type="button" className="text-button" onClick={() => mark({ ids: [n.id], read: !n.read })}>{n.read ? t('В непрочитанные') : t('Прочитать')}</button>
            </div>
          </article>
        ))}
      </div>
      {(data?.pages ?? 1) > 1 && <Pagination aria-label={t('Страницы уведомлений')}>
        <button type="button" className="button secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{t('Назад')}</button>
        <span>{t('Страница {page} из {pages}', { page: data?.page ?? page, pages: data?.pages ?? 1 })}</span>
        <button type="button" className="button secondary" disabled={page >= (data?.pages ?? 1)} onClick={() => setPage((p) => p + 1)}>{t('Далее')}</button>
      </Pagination>}
      {paying && <PayModal occurrence={paying} onClose={() => setPaying(null)} />}
    </Shell>
  );
}

function describe(n: Notification): string {
  if (n.kind === 'paid') return n.paid_by ? t('Оплачено {date} · {who}', { date: longDate(n.paid_at), who: n.paid_by }) : t('Оплачено {date}', { date: longDate(n.paid_at) });
  return n.kind === 'overdue' ? t('Просрочено — срок прошёл') : t('Ожидает оплаты');
}

const BrowserActions = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  flex-shrink: 0;
`;
const Pagination = styled.nav`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 22px;
  span { text-align: center; }
`;

const TestResult = styled.div`
  display: grid; gap: 12px; padding: 20px; margin-top: 14px;
  border: 1px solid var(--desk-border); border-radius: var(--desk-radius); background: var(--desk-surface);
  p { margin: 0; line-height: 1.55; max-width: 78ch; }
  ol { margin: 0; padding-left: 22px; } li { padding: 5px 0; line-height: 1.55; }
`;
