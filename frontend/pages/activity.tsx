import { useState } from 'react';
import styled from 'styled-components';
import { Shell } from '@/components/Shell';
import { Button, Card, Empty, Input, Muted, Notice, Pill, Row, Select, SectionTitle as Title, TableWrap } from '@/components/ui';
import { ScreeningPill, walletNetworks } from '@/components/Wallet';
import { api, type AuditCheck, type AuditEntry, type Delivery, type Reminder, type SanctionsStatus, type Screening, type WalletNetwork } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { date } from '@/lib/format';
import { locale, t } from '@/lib/i18n';
import { useLoad, useSession } from '@/lib/session';

// Built on render, so the labels follow the current language.
const reminderStates = (): Record<Reminder['state'], [string, 'paid' | 'unpaid' | 'overdue' | 'archived']> => ({
  pending: [t('Ожидает'), 'unpaid'], sending: [t('Отправляется'), 'unpaid'], sent: [t('Отправлено'), 'paid'],
  uncertain: [t('Нужна проверка'), 'overdue'], cancelled: [t('Отменено'), 'archived'],
});

const deliveryStates = (): Record<Delivery['state'], [string, 'paid' | 'unpaid' | 'overdue' | 'archived']> => ({
  pending: [t('Ожидает'), 'unpaid'], sending: [t('Отправляется'), 'unpaid'], sent: [t('Отправлено'), 'paid'],
  uncertain: [t('Нужна проверка'), 'overdue'], failed: [t('Не доставлено'), 'overdue'], cancelled: [t('Отменено'), 'archived'],
});

const channelNames = (): Record<Delivery['channel'], string> => ({
  telegram: t('Telegram, общий чат'), telegram_personal: t('Telegram, личка'), max: 'MAX', email: 'Email', webhook: 'Webhook',
});

const actions = (): Record<string, string> => ({
  login: t('Вход в систему'), 'recurring.create': t('Добавлен регулярный платёж'), 'recurring.archive': t('Прекращён регулярный платёж'),
  'recurring.update': t('Изменён регулярный платёж'), 'recurring.pause': t('Платёж поставлен на паузу'), 'recurring.resume': t('Платёж снят с паузы'),
  'recurring.import': t('Импорт платежей из CSV'),
  'occurrence.paid': t('Отмечена или исправлена оплата'), 'occurrence.unpaid': t('Отменена оплата'),
  'occurrence.prepaid': t('Оплачен будущий период'), 'occurrence.create': t('Создан будущий период'),
  'receipt.add': t('Прикреплён чек'), 'receipt.delete': t('Удалён чек'),
  'user.create': t('Создан пользователь'), 'user.update': t('Изменён пользователь'), 'user.delete': t('Удалён пользователь'),
  'password.change': t('Сменён пароль'), '2fa.enable': t('Включён двухфакторный вход'), '2fa.disable': t('Выключен двухфакторный вход'),
  'telegram.link': t('Привязан Telegram'), 'telegram.unlink': t('Отвязан Telegram'),
  'api_key.create': t('Создан ключ API'), 'api_key.delete': t('Удалён ключ API'), 'api_key.expire': t('Отключены просроченные и неиспользуемые ключи'),
  'session.revoke': t('Завершена сессия'), 'session.revoke_others': t('Завершены остальные сессии'),
  'sanctions.update': t('Обновлён список санкций OFAC'), 'wallet.sanctioned': t('Сохранён кошелёк из списка санкций OFAC'),
  'suggestion.create': t('Расширение предложило платёж'), 'suggestion.accept': t('Предложение принято'), 'suggestion.reject': t('Предложение отклонено'),
});

export default function Activity() {
  const { isAdmin, settings } = useSession();
  const reminders = useLoad(() => (isAdmin ? api<Reminder[]>('/reminders') : Promise.resolve([])), [isAdmin]);
  const audit = useLoad(() => (isAdmin ? api<AuditEntry[]>('/audit-log') : Promise.resolve([])), [isAdmin]);
  const deliveries = useLoad(() => (isAdmin ? api<Delivery[]>('/deliveries') : Promise.resolve([])), [isAdmin]);
  const integrity = useLoad(() => (isAdmin ? api<AuditCheck>('/audit-log/verify') : Promise.resolve(null)), [isAdmin]);
  const time = new Intl.DateTimeFormat(locale(), { timeZone: settings.timezone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  if (!isAdmin) {
    return (
      <Shell title={t('Журнал')} heading={t('история действий')} subtitle={t('Раздел доступен администратору.')}>
        <Notice $tone="warning">{t('Журнал может смотреть только администратор.')}</Notice>
      </Shell>
    );
  }
  return (
    <Shell title={t('Журнал')} heading={t('история действий')} subtitle={t('Состояние напоминаний и последние изменения в системе.')}>
      <Notice $tone={settings.telegram_enabled ? 'info' : 'warning'}>
        {settings.telegram_enabled
          ? t('Telegram включён, сроки проверяются автоматически. Если результат отправки неизвестен, запись помечается «Нужна проверка» и автоматически не повторяется — так в чат не придёт дубль.')
          : t('Telegram выключен. Для реальных напоминаний задайте TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID в .env, установите TELEGRAM_ENABLED=true и перезапустите приложение.')}
      </Notice>
      {(reminders.error || audit.error || deliveries.error) && <Notice $tone="error" role="alert">{reminders.error || audit.error || deliveries.error}</Notice>}
      <Title>{t('напоминания в telegram')}</Title>
      <Card>
        {!reminders.data ? <Empty>{t('Загружаем…')}</Empty> : reminders.data.length === 0 ? (
          <Empty>{t('Отправок пока нет. Здесь появится состояние каждого напоминания.')}</Empty>
        ) : (
          <TableWrap>
            <table>
              <thead><tr><th>{t('Платёж')}</th><th>{t('Срок')}</th><th>{t('Состояние')}</th><th>{t('Примечание')}</th></tr></thead>
              <tbody>
                {reminders.data.map((r) => {
                  const [label, tone] = reminderStates()[r.state];
                  return (
                    <tr key={r.occurrence_id}>
                      <td><b>{r.title}</b></td>
                      <td><Muted>{date(r.due_date)}</Muted></td>
                      <td><Pill $status={tone}>{label.toLowerCase()}</Pill></td>
                      <td><Muted>{r.error || (r.sent_at ? t('Отправлено') + ' ' + time.format(new Date(r.sent_at)) : '—')}</Muted></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
      <Title>{t('другие каналы и просрочка')}</Title>
      <Card>
        {!deliveries.data ? <Empty>{t('Загружаем…')}</Empty> : deliveries.data.length === 0 ? (
          <Empty>{t('Здесь появятся повторные напоминания о просрочке и отправки в MAX, на почту и в webhook.')}</Empty>
        ) : (
          <TableWrap>
            <table>
              <thead><tr><th>{t('Платёж')}</th><th>{t('Срок')}</th><th>{t('Канал')}</th><th>{t('Состояние')}</th><th>{t('Примечание')}</th></tr></thead>
              <tbody>
                {deliveries.data.map((d, i) => {
                  const [label, tone] = deliveryStates()[d.state];
                  return (
                    <tr key={i}>
                      <td><b>{d.title}</b>{d.kind === 'overdue' && <Muted> · {t('просрочка')}</Muted>}</td>
                      <td><Muted>{date(d.due_date)}</Muted></td>
                      <td>{channelNames()[d.channel]}</td>
                      <td><Pill $status={tone}>{label.toLowerCase()}</Pill></td>
                      <td><Muted>{d.error || (d.sent_at ? t('Отправлено') + ' ' + time.format(new Date(d.sent_at)) : '—')}</Muted></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
      <Title>{t('санкционный список OFAC')}</Title>
      <SanctionsCard />
      <Title>{t('последние действия')}</Title>
      {integrity.data && (integrity.data.ok ? (
        <Notice>
          <span>
            {t('Журнал цел: проверено записей — {n}. Каждая запись подписана вместе с предыдущей, правка или удаление будут видны.', { n: integrity.data.checked })}
            {' '}{integrity.data.keyed ? t('Подпись — ключом вне базы.') : t('Задайте DATA_ENCRYPTION_KEY, чтобы подпись нельзя было пересчитать, имея доступ к базе.')}
          </span>
        </Notice>
      ) : (
        <Notice $tone="error" role="alert">
          <b>{t('Журнал нарушен с записи #{id}', { id: integrity.data.broken_id ?? '—' })}</b>
          <span>{integrity.data.reason}</span>
        </Notice>
      ))}
      <Card>
        {!audit.data ? <Empty>{t('Загружаем…')}</Empty> : audit.data.length === 0 ? <Empty>{t('Действий пока нет.')}</Empty> : (
          <TableWrap>
            <table>
              <thead><tr><th>{t('Время')}</th><th>{t('Кто')}</th><th>{t('Действие')}</th><th>{t('Запись')}</th></tr></thead>
              <tbody>
                {audit.data.map((a) => (
                  <tr key={a.id}>
                    <td><Muted>{time.format(new Date(a.created_at))}</Muted></td>
                    <td><b>{a.actor}</b></td>
                    <td>{actions()[a.action] ?? a.action}</td>
                    <td><Muted>{a.entity}</Muted></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </Shell>
  );
}

/** State of the OFAC list, manual refresh and an ad-hoc wallet check. */
function SanctionsCard() {
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
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
        {!data ? <Muted>{t('Загружаем…')}</Muted> : (
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
          try {
            const answer = await api<{ address: string; screening: Screening }>('/sanctions/check', {
              method: 'POST', body: { network: form.get('network') as WalletNetwork, address: String(form.get('address') ?? '').trim() },
            });
            setResult(answer);
          } catch (err) {
            setResult(null);
            toast((err as Error).message, true);
          }
        }}>
          <Select name="network" defaultValue="TRON" aria-label={t('Сеть')}>{walletNetworks.map((n) => <option key={n}>{n}</option>)}</Select>
          <Input name="address" required maxLength={100} spellCheck={false} placeholder={t('Проверить адрес кошелька')} aria-label={t('Адрес кошелька')} />
          <Button type="submit" $variant="secondary">{t('Проверить')}</Button>
        </CheckForm>
        {result && (
          <Row $gap={1} $wrap>
            <ScreeningPill wallet={result.screening} />
            {result.screening.match_name && <Muted>{t('Совпадение: {name}', { name: result.screening.match_name })}</Muted>}
          </Row>
        )}
      </Box>
    </Card>
  );
}

const Box = styled.div`
  display: grid;
  gap: 1.2rem;
  padding: 1.6rem;
`;

const CheckForm = styled.form`
  display: grid;
  grid-template-columns: 10rem 1fr auto;
  gap: 0.8rem;
  ${({ theme }) => theme.mobile} { grid-template-columns: 1fr; }
`;
