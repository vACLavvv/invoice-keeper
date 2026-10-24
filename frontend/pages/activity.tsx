import { Shell } from '@/components/Shell';
import { Card, Empty, Muted, Notice, Pill, SectionTitle as Title, TableWrap } from '@/components/ui';
import { api, type AuditEntry, type Reminder } from '@/lib/api';
import { date } from '@/lib/format';
import { locale, t } from '@/lib/i18n';
import { useLoad, useSession } from '@/lib/session';

// Built on render, so the labels follow the current language.
const reminderStates = (): Record<Reminder['state'], [string, 'paid' | 'unpaid' | 'overdue' | 'archived']> => ({
  pending: [t('Ожидает'), 'unpaid'], sending: [t('Отправляется'), 'unpaid'], sent: [t('Отправлено'), 'paid'],
  uncertain: [t('Нужна проверка'), 'overdue'], cancelled: [t('Отменено'), 'archived'],
});

const actions = (): Record<string, string> => ({
  login: t('Вход в систему'), 'recurring.create': t('Добавлен регулярный платёж'), 'recurring.archive': t('Прекращён регулярный платёж'),
  'recurring.update': t('Изменён регулярный платёж'), 'recurring.pause': t('Платёж поставлен на паузу'), 'recurring.resume': t('Платёж снят с паузы'),
  'recurring.import': t('Импорт платежей из CSV'),
  'occurrence.paid': t('Отмечена или исправлена оплата'), 'occurrence.unpaid': t('Отменена оплата'),
  'receipt.add': t('Прикреплён чек'), 'receipt.delete': t('Удалён чек'),
  'user.create': t('Создан пользователь'), 'user.update': t('Изменён пользователь'), 'user.delete': t('Удалён пользователь'),
  'password.change': t('Сменён пароль'), '2fa.enable': t('Включён двухфакторный вход'), '2fa.disable': t('Выключен двухфакторный вход'),
  'telegram.link': t('Привязан Telegram'), 'telegram.unlink': t('Отвязан Telegram'),
  'api_key.create': t('Создан ключ API'), 'api_key.delete': t('Удалён ключ API'),
  'suggestion.create': t('Расширение предложило платёж'), 'suggestion.accept': t('Предложение принято'), 'suggestion.reject': t('Предложение отклонено'),
});

export default function Activity() {
  const { isAdmin, settings } = useSession();
  const reminders = useLoad(() => (isAdmin ? api<Reminder[]>('/reminders') : Promise.resolve([])), [isAdmin]);
  const audit = useLoad(() => (isAdmin ? api<AuditEntry[]>('/audit-log') : Promise.resolve([])), [isAdmin]);
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
      {(reminders.error || audit.error) && <Notice $tone="error" role="alert">{reminders.error || audit.error}</Notice>}
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
      <Title>{t('последние действия')}</Title>
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
