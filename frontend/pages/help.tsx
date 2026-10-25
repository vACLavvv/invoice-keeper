import Link from 'next/link';
import styled from 'styled-components';
import { Shell } from '@/components/Shell';
import { Chevron, Muted, SectionTitle, Tile, TileTitle } from '@/components/ui';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';

export default function Help() {
  const { settings, isAdmin } = useSession();
  const sections = [
    { href: '/payments', title: t('Платежи'), text: t('Периоды месяца, итоги по валютам, отметка оплаты, чеки и выгрузка в CSV.') },
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
    [t('Что значит «санкционный список OFAC» у кошелька?'), t('Если у платежа указан криптокошелёк получателя, он сверяется со списком санкций Минфина США (SDN). При совпадении платёж помечается ⛔, в напоминаниях появляется предупреждение и пропадает кнопка «Оплатить». Это проверка только по опубликованным адресам, а не оценка риска кошелька.')],
    [t('Где оплатить?'), t('Если у платежа указана ссылка на оплату, в напоминании есть кнопка «💳 Оплатить», а в списке платежей — значок 💳. Реквизиты показываются в напоминании и в окне оплаты.')],
    [t('Что делает пауза?'), t('С сегодняшнего дня до выбранной даты или до возобновления новых периодов и напоминаний нет. Пропущенные месяцы не становятся долгом, прошлые оплаты остаются.')],
    [t('Почему суммы не складываются в одну?'), t('Рубли, доллары и евро считаются отдельно: курсы и конвертация не используются, чтобы итоги всегда совпадали со счетами.')],
  ];
  const security = [
    [t('Доступ и права'), [
      t('Без входа недоступны ни панель, ни данные API. Права проверяет сервер: пользователь не выполнит действия администратора даже через API.'),
      t('Токены API хранятся как SHA-256 и показываются один раз. По токену нельзя сменить пароль, второй фактор, создать новый токен или завершить сессии.'),
    ]],
    [t('Пароли и защита входа'), [
      t('Пароли хешируются Argon2id; пароли из списков утечек, с логином внутри и простые последовательности не принимаются.'),
      t('Смена пароля завершает остальные сессии.'),
      t('Администратор может включить вход по коду из приложения-аутентификатора (раздел «Аккаунт»).'),
      ...(settings.security?.login_alerts ? [t('О каждом входе и о подборе пароля приходит сообщение в привязанный Telegram.')] : []),
    ]],
    [t('Оплата через Telegram'), [
      t('Кнопку «Оплачено» принимает только чат команды и личные чаты привязанных пользователей.'),
      ...(settings.security?.paid_linked_only ? [t('«Оплачено» в Telegram могут нажать только участники, привязавшие аккаунт в панели.')] : []),
    ]],
    [t('Чеки и хранение данных'), [
      settings.security?.encryption
        ? t('Секрет второго фактора, чеки и реквизиты хранятся зашифрованными (XChaCha20-Poly1305): копия базы без ключа их не раскрывает.')
        : t('Шифрование данных в базе выключено: задайте DATA_ENCRYPTION_KEY (invoice-keeper keygen).'),
      t('Чеки проверяются по содержимому файла, а не по имени, и скачиваются как вложения.'),
    ]],
    [t('Целостность журнала'), [t('Журнал защищён от подмены: каждая запись подписана вместе с предыдущей, проверка — во вкладке «Журнал».')]],
  ] as [string, string[]][];
  const tz = settings.timezone;
  const channels = (['telegram', 'max', 'email', 'webhook'] as const).filter((c) => settings.channels?.[c])
    .map((c) => ({ telegram: 'Telegram', max: 'MAX', email: 'Email', webhook: 'Webhook' })[c]);
  return (
    <Shell title={t('Помощь')} heading={t('Помощь')} subtitle={t('Как устроен Invoice Keeper и что делать, если что-то не так.')} action={<></>}>
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
      <DocsLink href="/api/v1/docs" target="_blank" rel="noopener noreferrer">
        <span><b>{t('Документация API')}</b><span>{t('Методы, параметры и примеры запросов для интеграций.')}</span></span>
        <span aria-hidden="true">↗</span>
      </DocsLink>
      <SectionTitle id="help-faq">{t('частые вопросы')}</SectionTitle>
      <DisclosureList aria-labelledby="help-faq">
        {faq.map(([q, a]) => (
          <details key={q}><summary>{q}</summary><p>{a}</p></details>
        ))}
      </DisclosureList>
      <SectionTitle id="help-security">{t('безопасность')}</SectionTitle>
      <DisclosureList aria-labelledby="help-security">
        {security.map(([title, paragraphs]) => (
          <details key={title}>
            <summary>{title}</summary>
            <div>{paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
          </details>
        ))}
      </DisclosureList>
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
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 26rem), 1fr));
  gap: 1.2rem;
`;

const Card = styled(Link)`
  display: grid;
  gap: 0.6rem;
  padding: 1.6rem;
  border-radius: ${({ theme }) => theme.radius.lg};
  background: var(--desk-surface);
  border: 1px solid var(--desk-border);
  color: var(--desk-ink);
  font-size: 15px;
  line-height: 1.55;
  transition: background 0.15s;
  &:hover { background: var(--desk-raised); }
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

const DisclosureList = styled.div`
  border: 1px solid var(--desk-border);
  border-radius: var(--desk-radius);
  background: var(--desk-surface);
  overflow: hidden;
  details + details { border-top: 1px solid var(--desk-border); }
  summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    min-height: 58px;
    padding: 16px 20px;
    cursor: pointer;
    list-style: none;
    color: var(--desk-ink);
    font-size: 16px;
    font-weight: 550;
    line-height: 1.5;
  }
  summary::-webkit-details-marker { display: none; }
  summary::after {
    content: '';
    flex: 0 0 8px;
    width: 8px;
    height: 8px;
    margin: -4px 3px 0;
    border-right: 1.5px solid currentColor;
    border-bottom: 1.5px solid currentColor;
    transform: rotate(45deg);
  }
  details[open] > summary::after { transform: rotate(225deg); margin-top: 4px; }
  summary:hover { background: var(--desk-raised); }
  summary:focus-visible { outline-offset: -3px; }
  p {
    max-width: 78ch;
    margin: 0;
    padding: 0 20px 18px;
    color: var(--desk-ink);
    font-size: 15px;
    line-height: 1.7;
  }
  @media (max-width: 480px) {
    summary { padding: 15px 16px; }
    p { padding: 0 16px 16px; }
  }
`;

const DocsLink = styled.a`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 20px;
  margin-top: 24px;
  border: 1px solid var(--desk-border);
  border-radius: var(--desk-radius);
  background: var(--desk-surface);
  color: var(--desk-ink);
  > span:first-child { display: grid; gap: 4px; }
  b { font-size: 16px; font-weight: 550; }
  > span:first-child > span { font-size: 15px; line-height: 1.5; color: var(--desk-muted); }
  > span:last-child { font-size: 22px; }
  &:hover { border-color: var(--desk-control); background: var(--desk-raised); }
`;
