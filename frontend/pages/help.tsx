import Link from 'next/link';
import styled from 'styled-components';
import { Shell } from '@/components/Shell';
import { Chevron, Muted, SectionTitle, Tile, TileTitle } from '@/components/ui';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';

export default function Help() {
  const { settings, isAdmin } = useSession();
  const sections = [
    { href: '/', title: t('Платежи'), text: t('Периоды месяца, итоги по валютам, отметка оплаты, чеки и выгрузка в CSV.') },
    { href: '/recurring', title: t('Регулярные'), text: t('Платежи с повтором: месяц, квартал или год. Изменение, пауза, импорт из CSV.') },
    { href: '/calendar', title: t('Календарь'), text: t('Сроки месяца по дням; клик по платежу открывает отметку оплаты.') },
    { href: '/budget', title: t('Бюджет'), text: t('План на год по месяцам и категориям, оплачено и остаток в каждой валюте.') },
    { href: '/extension', title: t('Расширение'), text: t('Подтягивает платежи из кабинетов сервисов в один клик.') },
    { href: '/account', title: t('Аккаунт'), text: t('Привязка Telegram, пароль или двухфакторный вход, активные сессии и токены API.') },
    ...(isAdmin ? [
      { href: '/team', title: t('Команда'), text: t('Обычные пользователи: создать, изменить, удалить.') },
      { href: '/suggestions', title: t('Предложения'), text: t('Платежи, найденные расширением: принять или отклонить.') },
      { href: '/activity', title: t('Журнал'), text: t('Отправка напоминаний и все действия в системе.') },
    ] : []),
  ];
  const faq = [
    [t('Когда приходит напоминание?'), t('За {days} дня до срока, один раз на каждый период. Если платёж добавлен позже, напоминание уходит сразу. Оплаченные периоды и платежи на паузе не напоминают.', { days: settings.reminder_days })],
    [t('Когда платёж считается просроченным?'), t('Со следующего дня после срока. Оплата в сам день срока — вовремя. Если исправить фактическую дату оплаты, просрочка пересчитается, а срок не изменится.')],
    [t('Что если в месяце нет нужного числа?'), t('Срок переносится на последний день месяца: 31 января → 28 февраля → 31 марта. Годовой платёж от 29 февраля в обычный год придёт 28 февраля.')],
    [t('Как отметить оплату из Telegram?'), t('Нажмите «✅ Оплачено» под напоминанием. Период отметится сегодняшней датой, кнопка исчезнет, а в журнале будет видно, кто отметил.')],
    [t('Что если срок прошёл, а оплату не отметили?'), settings.overdue_reminders
      ? t('На следующий день после срока приходит одно повторное напоминание «Платёж просрочен» — в те же каналы, что и обычное.')
      : t('Повторные напоминания о просрочке на этом сервере выключены (OVERDUE_REMINDERS=false). Просроченные платежи видны в панели и по команде /overdue.')],
    [t('Где оплатить?'), t('Если у платежа указана ссылка на оплату, в напоминании есть кнопка «💳 Оплатить», а в списке платежей — значок 💳. Реквизиты показываются в напоминании и в окне оплаты.')],
    [t('Что делает пауза?'), t('С сегодняшнего дня до выбранной даты или до возобновления новых периодов и напоминаний нет. Пропущенные месяцы не становятся долгом, прошлые оплаты остаются.')],
    [t('Почему суммы не складываются в одну?'), t('Рубли, доллары и евро считаются отдельно: курсы и конвертация не используются, чтобы итоги всегда совпадали со счетами.')],
  ];
  const tz = settings.timezone;
  const channels = (['telegram', 'max', 'email', 'webhook'] as const).filter((c) => settings.channels?.[c])
    .map((c) => ({ telegram: 'Telegram', max: 'MAX', email: 'Email', webhook: 'Webhook' })[c]);
  return (
    <Shell title={t('Помощь')} heading={t('помощь')} subtitle={t('Как устроен Invoice Keeper и что делать, если что-то не так.')}>
      <SectionTitle>{t('разделы')}</SectionTitle>
      <Grid>
        {sections.map((s) => (
          <Card key={s.href} href={s.href}>
            <TileTitle>{s.title}<Chevron aria-hidden="true">›</Chevron></TileTitle>
            <Muted>{s.text}</Muted>
          </Card>
        ))}
      </Grid>
      <SectionTitle>{t('правила этого сервера')}</SectionTitle>
      <Rules>
        <Tile><Big>{settings.reminder_days}</Big><Muted>{t('дня до срока — напоминание')}</Muted></Tile>
        <Tile><Big>{tz}</Big><Muted>{t('часовой пояс: от него зависит «сегодня»')}</Muted></Tile>
        <Tile>
          <Big>{channels.length ? channels.join(' · ') : '—'}</Big>
          <Muted>{!channels.length ? t('напоминания пока не отправляются')
            : settings.telegram_enabled ? (settings.team_chat ? t('Telegram: общий чат и личные сообщения') : t('Telegram: личные сообщения привязанным пользователям'))
            : t('каналы напоминаний')}</Muted>
          {settings.bot_username && <Muted>@{settings.bot_username}</Muted>}
        </Tile>
      </Rules>
      <SectionTitle>{t('частые вопросы')}</SectionTitle>
      <Faq>
        {faq.map(([q, a]) => (
          <details key={q}><summary>{q}</summary><p>{a}</p></details>
        ))}
      </Faq>
      <SectionTitle>{t('безопасность')}</SectionTitle>
      <Tile>
        <List>
          <li>{t('Без входа недоступны ни панель, ни данные API. Права проверяет сервер: пользователь не выполнит действия администратора даже через API.')}</li>
          <li>{t('Пароли хранятся как scrypt-хеши, сессии — как SHA-256 токенов. Смена пароля завершает остальные сессии.')}</li>
          <li>{t('Администратор может включить вход по коду из приложения-аутентификатора (раздел «Аккаунт»).')}</li>
          <li>{t('Кнопку «Оплачено» принимает только чат команды и личные чаты привязанных пользователей.')}</li>
          <li>{t('Токены API хранятся как SHA-256 и показываются один раз. По токену нельзя сменить пароль, второй фактор, создать новый токен или завершить сессии.')}</li>
          <li>{t('Чеки проверяются по содержимому файла, а не по имени, и скачиваются как вложения.')}</li>
        </List>
      </Tile>
      {(settings.support_telegram || settings.support_email) && (
        <>
          <SectionTitle>{t('поддержка')}</SectionTitle>
          <Tile>
            {settings.support_telegram && <a href={`https://t.me/${settings.support_telegram.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer">{settings.support_telegram}</a>}
            {settings.support_email && <a href={`mailto:${settings.support_email}`}>{settings.support_email}</a>}
          </Tile>
        </>
      )}
    </Shell>
  );
}

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(26rem, 1fr));
  gap: 1.2rem;
`;

const Card = styled(Link)`
  display: grid;
  gap: 0.6rem;
  padding: 1.6rem;
  border-radius: ${({ theme }) => theme.radius.lg};
  background: ${({ theme }) => theme.color.tile};
  transition: background 0.15s;
  &:hover { background: ${({ theme }) => theme.color.tileHover}; }
`;

const Rules = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1.2rem;
  ${({ theme }) => theme.mobile} { grid-template-columns: 1fr; }
`;

const Big = styled.div`
  font-size: 2.6rem;
  font-weight: 500;
  color: ${({ theme }) => theme.color.strong};
  word-break: break-word;
`;

const Faq = styled.div`
  display: grid;
  gap: 0.8rem;
  details {
    padding: 1.4rem 1.6rem;
    border-radius: ${({ theme }) => theme.radius.lg};
    background: ${({ theme }) => theme.color.tile};
  }
  summary { cursor: pointer; color: ${({ theme }) => theme.color.strong}; font-weight: 500; }
  p { margin-top: 1rem; color: ${({ theme }) => theme.color.muted}; line-height: 1.6; }
`;

const List = styled.ul`
  margin: 0;
  padding-left: 2rem;
  display: grid;
  gap: 0.8rem;
  color: ${({ theme }) => theme.color.text};
`;
