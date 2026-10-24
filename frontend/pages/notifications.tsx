import { useEffect, useState } from 'react';
import { ws } from '@/components/icons';
import { PayModal } from '@/components/PaymentModals';
import { Shell } from '@/components/Shell';
import { api, type NotificationFeed, type Notification, type Occurrence } from '@/lib/api';
import { longDate, money, symbols } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useLoad, useSession } from '@/lib/session';
import { useToast } from '@/lib/toast';

const browserKey = (login: string) => 'ik-browser-notices:' + login;

/** «Ничего не упустить»: personal feed with read marks and optional browser notifications. */
export default function Notifications() {
  const { user, refresh } = useSession();
  const toast = useToast();
  const { data, error } = useLoad(() => api<NotificationFeed>('/notifications'), []);
  const [paying, setPaying] = useState<Occurrence | null>(null);
  const [browser, setBrowser] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');

  useEffect(() => {
    if (!('Notification' in window)) { setPermission('unsupported'); return; }
    setPermission(window.Notification.permission);
    try { setBrowser(window.localStorage.getItem(browserKey(user.username)) === 'true'); } catch { /* storage blocked */ }
  }, [user.username]);

  // While the panel is open, unread items are shown once as system notifications.
  useEffect(() => {
    if (!browser || permission !== 'granted' || !data) return;
    for (const n of data.items.filter((x) => !x.read).slice(0, 3)) {
      new window.Notification(n.title, { body: describe(n), tag: n.id });
    }
  }, [browser, permission, data]);

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
    if (permission === 'unsupported') return;
    let next = !browser;
    if (next && window.Notification.permission !== 'granted') {
      const answer = await window.Notification.requestPermission();
      setPermission(answer);
      next = answer === 'granted';
    }
    setBrowser(next);
    try { window.localStorage.setItem(browserKey(user.username), String(next)); } catch { /* not remembered */ }
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
        <div><b>{t('Напоминать в браузере')}</b><p>{t('Работает при открытой панели. Вы сами разрешаете уведомления.')}</p></div>
        <button type="button" className="button secondary" onClick={toggleBrowser} disabled={permission === 'unsupported' || permission === 'denied'}>
          {permission === 'unsupported' ? t('Недоступно в этом браузере') : permission === 'denied' ? t('Заблокировано в браузере') : browser && permission === 'granted' ? t('Выключить') : t('Включить')}
        </button>
      </div>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      <div className="notification-list">
        {!data ? <div className="ledger empty-state">{t('Загружаем…')}</div> : data.items.length === 0 ? (
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
      {paying && <PayModal occurrence={paying} onClose={() => setPaying(null)} />}
    </Shell>
  );
}

function describe(n: Notification): string {
  if (n.kind === 'paid') return n.paid_by ? t('Оплачено {date} · {who}', { date: longDate(n.paid_at), who: n.paid_by }) : t('Оплачено {date}', { date: longDate(n.paid_at) });
  return n.kind === 'overdue' ? t('Просрочено — срок прошёл') : t('Ожидает оплаты');
}
