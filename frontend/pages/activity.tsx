import { SkeletonRows } from '@/components/Skeleton';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import styled from 'styled-components';
import { Shell } from '@/components/Shell';
import { Button, Card, Field, Input, Muted, Notice, Row, Select } from '@/components/ui';
import { ScreeningPill, walletNetworks } from '@/components/Wallet';
import { api, query, type AuditCheck, type AuditEntry, type AuditPage, type Delivery, type Reminder, type SanctionsStatus, type Screening, type WalletNetwork } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { date } from '@/lib/format';
import { locale, t } from '@/lib/i18n';
import { useLoad, useSession } from '@/lib/session';

// Built on render, so the labels follow the current language.
const reminderStates = (): Record<Reminder['state'], [string, 'paid' | 'unpaid' | 'overdue' | 'archived']> => ({
  pending: [t('Ожидает'), 'unpaid'], sending: [t('Отправляется'), 'unpaid'], sent: [t('Отправлено'), 'paid'],
  failed: [t('Ошибка отправки'), 'overdue'], uncertain: [t('Нужна проверка'), 'overdue'], cancelled: [t('Отменено'), 'archived'],
});

const deliveryStates = (): Record<Delivery['state'], [string, 'paid' | 'unpaid' | 'overdue' | 'archived']> => ({
  pending: [t('Ожидает'), 'unpaid'], sending: [t('Отправляется'), 'unpaid'], sent: [t('Отправлено'), 'paid'],
  uncertain: [t('Нужна проверка'), 'overdue'], failed: [t('Не доставлено'), 'overdue'], cancelled: [t('Отменено'), 'archived'],
});

const channelNames = (): Record<Delivery['channel'], string> => ({
  telegram: t('Telegram, общий чат'), telegram_personal: t('Telegram, личка'), max: 'MAX', email: t('Email, общая рассылка'), email_personal: t('Email, лично'), webhook: 'Webhook',
});

const actions = (): Record<string, string> => ({
  login: t('Вход в систему'), 'recurring.create': t('Добавлен регулярный платёж'), 'recurring.archive': t('Прекращён регулярный платёж'),
  'recurring.update': t('Изменён регулярный платёж'), 'recurring.pause': t('Платёж поставлен на паузу'), 'recurring.resume': t('Платёж снят с паузы'),
  'recurring.delete': t('Удалён платёж со всеми периодами'), 'recurring.restore': t('Восстановлен платёж'),
  'occurrence.delete': t('Удалён период платежа'), 'occurrence.restore': t('Восстановлен период платежа'),
  'recurring.import': t('Импорт платежей из CSV'),
  'occurrence.paid': t('Отмечена или исправлена оплата'), 'occurrence.unpaid': t('Отменена оплата'),
  'occurrence.prepaid': t('Оплачен будущий период'), 'occurrence.create': t('Создан будущий период'),
  'receipt.add': t('Прикреплён чек'), 'receipt.delete': t('Удалён чек'),
  'email.request': t('Запрошено подтверждение почты'), 'email.confirm': t('Подтверждена почта'), 'email.settings': t('Изменены email-уведомления'),
  'user.create': t('Создан пользователь'), 'user.update': t('Изменён пользователь'), 'user.delete': t('Удалён пользователь'),
  'password.change': t('Сменён пароль'), '2fa.enable': t('Включён двухфакторный вход'), '2fa.disable': t('Выключен двухфакторный вход'),
  'telegram.link': t('Привязан Telegram'), 'telegram.unlink': t('Отвязан Telegram'),
  'api_key.create': t('Создан ключ API'), 'api_key.delete': t('Удалён ключ API'), 'api_key.expire': t('Отключены просроченные и неиспользуемые ключи'),
  'session.revoke': t('Завершена сессия'), 'session.revoke_others': t('Завершены остальные сессии'),
  'sanctions.update': t('Обновлён список санкций OFAC'), 'wallet.sanctioned': t('Сохранён кошелёк из списка санкций OFAC'),
  'suggestion.create': t('Расширение предложило платёж'), 'suggestion.accept': t('Предложение принято'), 'suggestion.reject': t('Предложение отклонено'),
});

const actorLabel = (actor: string) => actor === 'email-confirmation' ? t('Подтверждение почты') : actor;

function AuditPayment({ entry }: { entry: AuditEntry }) {
  if (!entry.payment_title) return null;
  const href = entry.payment_state === 'deleted' ? '/trash'
    : entry.occurrence_id ? `/history?occurrence=${entry.occurrence_id}`
    : entry.recurring_payment_id ? `/recurring?payment=${entry.recurring_payment_id}` : null;
  const state = entry.payment_state === 'deleted' ? t('Удалено') : entry.payment_state === 'archived' ? t('В архиве') : '';
  return (
    <div className="audit-payment">
      {href ? <Link href={href}>{entry.payment_title}</Link> : <span>{entry.payment_title}</span>}
      {(entry.due_date || state) && <small>
        {entry.due_date && <time dateTime={entry.due_date}>{t('срок {date}', { date: date(entry.due_date) })}</time>}
        {entry.due_date && state && ' · '}{state}
      </small>}
    </div>
  );
}

type Tab = 'actions' | 'delivery' | 'sanctions';
type Filters = { from_date?: string; to_date?: string; actor?: string; action?: string; search?: string };

export default function Activity() {
  const { isAdmin } = useSession();
  const [tab, setTab] = useState<Tab>('actions');
  if (!isAdmin) {
    return (
      <Shell title={t('Журнал')} heading={t('Журнал')} subtitle={t('Раздел доступен администратору.')} action={<></>}>
        <Notice $tone="warning">{t('Журнал может смотреть только администратор.')}</Notice>
      </Shell>
    );
  }
  const tabs: [Tab, string][] = [['actions', t('Действия')], ['delivery', t('Доставка')], ['sanctions', t('Санкции OFAC')]];
  return (
    <Shell title={t('Журнал')} heading={t('Журнал')} subtitle={t('Действия команды, доставка уведомлений и состояние сервиса.')} action={<></>}>
      <div className="log-tabs" role="tablist" aria-label={t('Журналы')} onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const current = tabs.findIndex(([key]) => key === tab);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
          : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        setTab(tabs[next][0]);
        event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
      }}>
        {tabs.map(([key, label]) => (
          <button key={key} type="button" role="tab" id={`log-tab-${key}`} aria-controls={`log-panel-${key}`} aria-selected={tab === key} tabIndex={tab === key ? 0 : -1} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>
      {tab === 'actions' && <div role="tabpanel" id="log-panel-actions" aria-labelledby="log-tab-actions"><AuditLog /></div>}
      {tab === 'delivery' && <div role="tabpanel" id="log-panel-delivery" aria-labelledby="log-tab-delivery"><DeliveryLog /></div>}
      {tab === 'sanctions' && (
        <section role="tabpanel" id="log-panel-sanctions" aria-labelledby="log-tab-sanctions">
          <div className="section-heading audit-heading"><div><h2 className="section-title">{t('Санкционный список OFAC')}</h2><p className="muted">{t('Сверка криптокошельков получателей и ручная проверка адреса.')}</p></div></div>
          <SanctionsCard />
        </section>
      )}
    </Shell>
  );
}

/** «Журнал действий» with date, user and action filters, pages and the chain check. */
function AuditLog() {
  const { settings } = useSession();
  const [filters, setFilters] = useState<Filters>({});
  const [page, setPage] = useState(1);
  const [snapshot, setSnapshot] = useState(0);
  const [reload, setReload] = useState(0);
  const { data, error } = useLoad(() => api<AuditPage>('/audit-log/page' + query({ ...filters, page: String(page), page_size: '25', snapshot_id: page > 1 && snapshot ? String(snapshot) : '' })), [filters, page, reload]);
  const integrity = useLoad(() => api<AuditCheck>('/audit-log/verify'), [reload]);
  const time = new Intl.DateTimeFormat(locale(), { timeZone: settings.timezone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  useEffect(() => { if (data && page === 1) setSnapshot(data.snapshot_id); }, [data, page]);
  const first = data?.total ? (data.page - 1) * data.page_size + 1 : 0;

  return (
    <AuditSection>
      <div className="section-heading audit-heading">
        <div><h2 className="section-title">{t('Журнал действий')}</h2><p className="muted">{t('Кто изменил данные и что произошло. История сохраняется после перезапуска.')}</p></div>
        <button type="button" className="button secondary" onClick={() => { setPage(1); setReload((n) => n + 1); }}>{t('Обновить')}</button>
      </div>
      {integrity.data && (integrity.data.ok ? (
        <div className="notice">
          {t('Журнал цел: проверено записей — {n}. Каждая запись подписана вместе с предыдущей, правка или удаление будут видны.', { n: integrity.data.checked })}
          {' '}{integrity.data.keyed ? t('Подпись — ключом вне базы.') : t('Задайте DATA_ENCRYPTION_KEY, чтобы подпись нельзя было пересчитать, имея доступ к базе.')}
        </div>
      ) : (
        <div className="notice notice-error" role="alert">
          <b>{t('Журнал нарушен с записи #{id}', { id: integrity.data.broken_id ?? '—' })}</b> {integrity.data.reason}
        </div>
      ))}
      <form className="audit-filters" onSubmit={(e) => {
        e.preventDefault();
        const form = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
        setFilters(Object.fromEntries(Object.entries(form).filter(([, v]) => v)));
        setPage(1);
      }}>
        <label>{t('С даты')}<input name="from_date" type="date" min="2000-01-01" max="2100-12-31" /></label>
        <label>{t('По дату')}<input name="to_date" type="date" min="2000-01-01" max="2100-12-31" /></label>
        <label>{t('Пользователь')}
          <select name="actor"><option value="">{t('Все пользователи')}</option>{data?.actors.map((a) => <option key={a} value={a}>{actorLabel(a)}</option>)}</select>
        </label>
        <label>{t('Действие')}
          <select name="action"><option value="">{t('Все действия')}</option>{data?.actions.map((a) => <option key={a} value={a}>{actions()[a] ?? a}</option>)}</select>
        </label>
        <label className="audit-search-label">{t('Поиск')}<input name="search" type="search" maxLength={200} placeholder={t('Платёж, пользователь или событие')} /></label>
        <div className="audit-filter-actions">
          <button type="submit" className="button primary">{t('Применить')}</button>
          <button type="reset" className="button secondary" onClick={() => { setFilters({}); setPage(1); }}>{t('Сбросить')}</button>
        </div>
      </form>
      <div className="audit-caption"><span>{t('Время событий: {tz}', { tz: settings.timezone })}</span><span>{t('Доступно только администратору')}</span></div>
      <p className="audit-context-note">{t('Названия и состояние платежей показаны на текущий момент.')}</p>
      {error && <div className="notice notice-error" role="alert">{error} · {t('Список не обновлён.')}</div>}
      <div className="ledger table-wrap cards" aria-live="polite">
        {!data ? <SkeletonRows label={t('Загружаем историю…')} /> : data.items.length === 0 ? (
          <div className="empty-state"><b>{t('Записей нет')}</b>{t('Измените даты или фильтры.')}</div>
        ) : (
          <table>
            <thead><tr><th>{t('ВРЕМЯ')}</th><th>{t('ПОЛЬЗОВАТЕЛЬ')}</th><th>{t('Действие')}</th><th>{t('РЕЗУЛЬТАТ')}</th></tr></thead>
            <tbody>
              {data.items.map((a) => (
                <tr key={a.id}>
                  <td className="date-cell">{time.format(new Date(a.created_at))}</td>
                  <td className="audit-actor" data-label={t('Кто')}>{actorLabel(a.actor)}</td>
                  <td className="audit-detail" data-label={t('Действие')}><b>{actions()[a.action] ?? a.action}</b><AuditPayment entry={a} /></td>
                  <td data-label={t('Результат')}><span className={`pill ${a.action === 'wallet.sanctioned' ? 'overdue' : 'paid'}`}>{a.action === 'wallet.sanctioned' ? t('Внимание') : t('Успешно')}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="audit-pagination" aria-label={t('Страницы журнала')}>
        <span aria-live="polite">{data ? t('{from}–{to} из {total}', { from: first, to: Math.min(data.page * data.page_size, data.total), total: data.total }) : '—'}</span>
        <div>
          <button type="button" className="button secondary" disabled={!data || page <= 1} onClick={() => setPage((p) => p - 1)}>{t('Назад')}</button>
          <span>{t('Страница {page} из {pages}', { page: data?.page ?? page, pages: data?.pages ?? 1 })}</span>
          <button type="button" className="button secondary" disabled={!data || page >= data.pages} onClick={() => setPage((p) => p + 1)}>{t('Далее')}</button>
        </div>
      </div>
    </AuditSection>
  );
}

/** Reminders in Telegram and the other channels. */
function DeliveryLog() {
  const { settings } = useSession();
  const reminders = useLoad(() => api<Reminder[]>('/reminders'), []);
  const deliveries = useLoad(() => api<Delivery[]>('/deliveries'), []);
  const time = new Intl.DateTimeFormat(locale(), { timeZone: settings.timezone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return (
    <section>
      <div className="section-heading audit-heading"><div><h2 className="section-title">{t('Доставка напоминаний')}</h2><p className="muted">{t('Результаты отправки по каждому периоду и каналу.')}</p></div></div>
      <div className={`notice${settings.telegram_enabled ? '' : ' notice-warning'}`}>
        {settings.telegram_enabled
          ? t('Telegram включён, сроки проверяются автоматически. Если результат отправки неизвестен, запись помечается «Нужна проверка» и автоматически не повторяется — так в чат не придёт дубль.')
          : t('Telegram выключен. Для реальных напоминаний задайте TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID в .env, установите TELEGRAM_ENABLED=true и перезапустите приложение.')}
      </div>
      {(reminders.error || deliveries.error) && <div className="notice notice-error" role="alert">{reminders.error || deliveries.error}</div>}
      <h2 className="section-title">{t('Напоминания в Telegram')}</h2>
      <div className="ledger table-wrap cards">
        {!reminders.data ? <SkeletonRows /> : reminders.data.length === 0 ? (
          <div className="empty-state">{t('Отправок пока нет. Здесь появится состояние каждого напоминания.')}</div>
        ) : (
          <table>
            <thead><tr><th>{t('ПЛАТЁЖ')}</th><th>{t('СРОК')}</th><th>{t('СОСТОЯНИЕ')}</th><th>{t('ПРИМЕЧАНИЕ')}</th></tr></thead>
            <tbody>
              {reminders.data.map((r) => {
                const [label, tone] = reminderStates()[r.state];
                return (
                  <tr key={r.occurrence_id}>
                    <td><b>{r.title}</b></td>
                    <td className="date-cell" data-label={t('Срок')}>{date(r.due_date)}</td>
                    <td data-label={t('Состояние')}><span className={`pill ${tone}`}>{label}</span></td>
                    <td className="date-cell" data-label={t('Примечание')}>{r.error || (r.sent_at ? t('Отправлено') + ' ' + time.format(new Date(r.sent_at)) : '—')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <h2 className="section-title">{t('Доставка через другие каналы')}</h2>
      <div className="ledger table-wrap cards">
        {!deliveries.data ? <SkeletonRows /> : deliveries.data.length === 0 ? (
          <div className="empty-state">{t('Здесь появятся повторные напоминания о просрочке и отправки в MAX, на почту и в webhook.')}</div>
        ) : (
          <table>
            <thead><tr><th>{t('ПЛАТЁЖ')}</th><th>{t('СРОК')}</th><th>{t('КАНАЛ')}</th><th>{t('СОСТОЯНИЕ')}</th><th>{t('ПРИМЕЧАНИЕ')}</th></tr></thead>
            <tbody>
              {deliveries.data.map((d, i) => {
                const [label, tone] = deliveryStates()[d.state];
                return (
                  <tr key={i}>
                    <td><b>{d.title}</b>{d.kind === 'overdue' && <span className="muted"> · {t('просрочка')}</span>}</td>
                    <td className="date-cell" data-label={t('Срок')}>{date(d.due_date)}</td>
                    <td data-label={t('Канал')}>{channelNames()[d.channel]}{d.recipient && <><br /><small className="muted">{d.recipient}</small></>}</td>
                    <td data-label={t('Состояние')}><span className={`pill ${tone}`}>{label}</span></td>
                    <td className="date-cell" data-label={t('Примечание')}>{d.error || (d.sent_at ? t('Отправлено') + ' ' + time.format(new Date(d.sent_at)) : '—')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

/** State of the OFAC list, manual refresh and an ad-hoc wallet check. */
function SanctionsCard() {
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{ address: string; screening: Screening } | null>(null);
  const { data } = useLoad(() => api<SanctionsStatus>('/sanctions'), [version]);

  async function refresh() {
    setBusy(true);
    try {
      const status = await api<SanctionsStatus>('/sanctions/refresh', { method: 'POST' });
      setVersion((v) => v + 1);
      toast(t('Список OFAC обновлён: {n} адресов', { n: status.addresses }));
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Box>
        <Muted>
          {t('Кошельки получателей сверяются со списком SDN Минфина США. Ловятся только адреса, которые опубликовал OFAC; это не оценка риска по истории транзакций. Список скачивается раз в сутки и только пока хотя бы у одного платежа указан кошелёк.')}
        </Muted>
        {!data ? <SkeletonRows compact rows={2} /> : (
          <Row $between $wrap>
            <span>
              {data.addresses > 0
                ? t('{n} криптоадресов · публикация OFAC {published} · загружен {date}', {
                  n: data.addresses, published: data.publish_date ?? '—', date: data.updated_at ? date(data.updated_at) : '—',
                })
                : t('Список ещё не загружен')}
              {!data.enabled && <Muted> · {t('сверка выключена (OFAC_ENABLED=false)')}</Muted>}
            </span>
            <Button type="button" $variant="secondary" disabled={busy} onClick={refresh}>{busy ? t('Скачиваем…') : t('Обновить список')}</Button>
          </Row>
        )}
        {data?.error && <Notice $tone="warning"><span>{t('Последняя загрузка не удалась: {error}. Используется прежний список.', { error: data.error })}</span></Notice>}
        <CheckForm onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          setChecking(true);
          setResult(null);
          try {
            const answer = await api<{ address: string; screening: Screening }>('/sanctions/check', {
              method: 'POST', body: { network: form.get('network') as WalletNetwork, address: String(form.get('address') ?? '').trim() },
            });
            setResult(answer);
          } catch (err) {
            setResult(null);
            toast((err as Error).message, true);
          } finally {
            setChecking(false);
          }
        }}>
          <Field>{t('Сеть')}<Select name="network" defaultValue="TRON" aria-label={t('Сеть')}>{walletNetworks.map((n) => <option key={n}>{n}</option>)}</Select></Field>
          <Field>{t('Адрес кошелька')}<Input name="address" required maxLength={100} spellCheck={false} placeholder={t('Проверить адрес кошелька')} /></Field>
          <Button type="submit" $variant="secondary" disabled={checking}>{checking ? t('Проверяем…') : t('Проверить')}</Button>
        </CheckForm>
        {result && (
          <Row $gap={1} $wrap role="status">
            <ScreeningPill wallet={result.screening} />
            {result.screening.match_name && <Muted>{t('Совпадение: {name}', { name: result.screening.match_name })}</Muted>}
          </Row>
        )}
      </Box>
    </Card>
  );
}

const Box = styled.div.attrs({ className: 'work-panel' })`
  display: grid;
  gap: 12px;
  padding: 22px;
`;

const CheckForm = styled.form`
  display: grid;
  grid-template-columns: minmax(140px, 170px) minmax(0, 1fr) auto;
  align-items: end;
  gap: 12px;
  margin-top: 8px;
  label { min-width: 0; }
  select, input { width: 100%; min-width: 0; }
  button { min-height: 44px; }
  @media (max-width: 900px) {
    grid-template-columns: minmax(120px, 150px) minmax(0, 1fr);
    button { grid-column: 1 / -1; justify-self: end; }
  }
  @media (max-width: 480px) {
    grid-template-columns: minmax(0, 1fr);
    button { width: 100%; }
  }
`;

const AuditSection = styled.section`
  .audit-detail, .audit-actor, .date-cell {
    color: var(--desk-ink);
    font-size: 15px;
    line-height: 1.55;
  }
  .audit-detail > b { font-weight: 550; }
  .audit-detail { max-width: 420px; }
  .audit-payment { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; margin-top: 6px; overflow-wrap: anywhere; }
  .audit-payment a { font-weight: 600; text-decoration: underline; text-underline-offset: 3px; }
  .audit-payment small { font-size: 14px; color: var(--desk-muted); }
  .audit-context-note { margin: 0 0 14px; font-size: 14px; color: var(--desk-muted); }
  .audit-filters label { color: var(--desk-ink); font-size: 14px; }
  .audit-filters input, .audit-filters select { font-size: 15px; }
  .audit-caption, .audit-pagination { font-size: 14px; color: var(--desk-muted); }
  .audit-pagination .button { min-height: 42px; font-size: 14px; }
  .audit-heading p { font-size: 15px; line-height: 1.6; }
  @media (max-width: 600px) {
    .audit-filters { grid-template-columns: minmax(0, 1fr); }
    .audit-filters input, .audit-filters select { font-size: 16px; }
    .audit-search-label, .audit-filter-actions { grid-column: auto; }
    .audit-pagination > div { width: 100%; justify-content: space-between; gap: 8px; }
    .audit-pagination > div > span { font-size: 13px; text-align: center; }
  }
`;
