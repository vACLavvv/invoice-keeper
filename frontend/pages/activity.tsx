import { Shell } from '@/components/Shell';
import { Card, Empty, Muted, Notice, Pill, SectionTitle as Title, TableWrap } from '@/components/ui';
import { api, type AuditEntry, type Reminder } from '@/lib/api';
import { date } from '@/lib/format';
import { useLoad, useSession } from '@/lib/session';

const reminderStates: Record<Reminder['state'], [string, 'paid' | 'unpaid' | 'overdue' | 'archived']> = {
  pending: ['Ожидает', 'unpaid'], sending: ['Отправляется', 'unpaid'], sent: ['Отправлено', 'paid'],
  uncertain: ['Нужна проверка', 'overdue'], cancelled: ['Отменено', 'archived'],
};

const actions: Record<string, string> = {
  login: 'Вход в систему', 'recurring.create': 'Добавлен регулярный платёж', 'recurring.archive': 'Прекращён регулярный платёж',
  'occurrence.paid': 'Отмечена или исправлена оплата', 'occurrence.unpaid': 'Отменена оплата',
  'user.create': 'Создан пользователь', 'user.update': 'Изменён пользователь', 'user.delete': 'Удалён пользователь',
};

export default function Activity() {
  const { isAdmin, settings } = useSession();
  const reminders = useLoad(() => (isAdmin ? api<Reminder[]>('/reminders') : Promise.resolve([])), [isAdmin]);
  const audit = useLoad(() => (isAdmin ? api<AuditEntry[]>('/audit-log') : Promise.resolve([])), [isAdmin]);
  const time = new Intl.DateTimeFormat('ru-RU', { timeZone: settings.timezone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  if (!isAdmin) {
    return (
      <Shell title="Журнал" heading="история действий" subtitle="Раздел доступен администратору.">
        <Notice $tone="warning">Журнал может смотреть только администратор.</Notice>
      </Shell>
    );
  }
  return (
    <Shell title="Журнал" heading="история действий" subtitle="Состояние напоминаний и последние изменения в системе.">
      <Notice $tone={settings.telegram_enabled ? 'info' : 'warning'}>
        {settings.telegram_enabled
          ? 'Telegram включён, сроки проверяются автоматически. Если результат отправки неизвестен, запись помечается «Нужна проверка» и автоматически не повторяется — так в чат не придёт дубль.'
          : 'Telegram выключен. Для реальных напоминаний задайте TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID в .env, установите TELEGRAM_ENABLED=true и перезапустите приложение.'}
      </Notice>
      {(reminders.error || audit.error) && <Notice $tone="error" role="alert">{reminders.error || audit.error}</Notice>}
      <Title>напоминания в telegram</Title>
      <Card>
        {!reminders.data ? <Empty>Загружаем…</Empty> : reminders.data.length === 0 ? (
          <Empty>Отправок пока нет. Здесь появится состояние каждого напоминания.</Empty>
        ) : (
          <TableWrap>
            <table>
              <thead><tr><th>Платёж</th><th>Срок</th><th>Состояние</th><th>Примечание</th></tr></thead>
              <tbody>
                {reminders.data.map((r) => {
                  const [label, tone] = reminderStates[r.state];
                  return (
                    <tr key={r.occurrence_id}>
                      <td><b>{r.title}</b></td>
                      <td><Muted>{date(r.due_date)}</Muted></td>
                      <td><Pill $status={tone}>{label.toLowerCase()}</Pill></td>
                      <td><Muted>{r.error || (r.sent_at ? 'Отправлено ' + time.format(new Date(r.sent_at)) : '—')}</Muted></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
      <Title>последние действия</Title>
      <Card>
        {!audit.data ? <Empty>Загружаем…</Empty> : audit.data.length === 0 ? <Empty>Действий пока нет.</Empty> : (
          <TableWrap>
            <table>
              <thead><tr><th>Время</th><th>Кто</th><th>Действие</th><th>Запись</th></tr></thead>
              <tbody>
                {audit.data.map((a) => (
                  <tr key={a.id}>
                    <td><Muted>{time.format(new Date(a.created_at))}</Muted></td>
                    <td><b>{a.actor}</b></td>
                    <td>{actions[a.action] ?? a.action}</td>
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
