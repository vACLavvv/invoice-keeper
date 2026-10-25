import Link from 'next/link';
import { useEffect, useState } from 'react';
import styled from 'styled-components';
import QRCode from 'qrcode';
import { InfoBox, Modal, ModalForm } from '@/components/Modal';
import { Shell } from '@/components/Shell';
import { Button, Field, Input, Muted, Notice, Pill, Row, Select, Tile, TileTitle } from '@/components/ui';
import { api, type ApiKey, type Session, type TelegramLink } from '@/lib/api';
import { date } from '@/lib/format';
import { locale, t } from '@/lib/i18n';
import { useLoad, useSession } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { EmailTile } from '@/components/EmailTile';

export default function Account() {
  const { user, isAdmin } = useSession();
  return (
    <Shell title={t('Аккаунт')} heading={t('Мой аккаунт')} subtitle={t('@{login} · {role}', { login: user.username, role: isAdmin ? t('администратор') : t('пользователь') })}>
      <Grid>
        <EmailTile />
        <TelegramTile />
        {isAdmin ? <TwoFactorTile /> : <PasswordTile />}
        <SessionsTile />
        <TokensTile />
      </Grid>
      {isAdmin && (
        <Notice><span>{t('Логин и пароль администратора задаются в .env на сервере и через панель не меняются. Защитите вход вторым фактором.')}</span></Notice>
      )}
    </Shell>
  );
}

function TelegramTile() {
  const { refresh } = useSession();
  const toast = useToast();
  const { data, error: loadError } = useLoad(() => api<TelegramLink>('/me/telegram'), []);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createLink() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const answer = await api<{ url: string }>('/me/telegram/link', { method: 'POST' });
      setLink(answer.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function unlink() {
    try {
      await api('/me/telegram', { method: 'DELETE' });
      setLink(null);
      refresh();
      toast(t('Telegram отвязан'));
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  return (
    <Tile id="telegram">
      <TileTitle>{t('Привязка Telegram')}</TileTitle>
      <Muted>{t('Привяжите Telegram, чтобы отмечать оплату от своего имени — в группе и в личном чате. Сюда же придут личные напоминания и сообщения о входе в аккаунт.')}</Muted>
      {(error || loadError) && <Notice $tone="error" role="alert"><span>{error || loadError}</span></Notice>}
      {!data ? (loadError ? <Button type="button" $variant="secondary" onClick={refresh}>{t('Повторить')}</Button> : <Muted>{t('Загружаем…')}</Muted>) : !data.available ? (
        <Notice $tone="warning"><span>{t('На сервере не настроен Telegram-бот (TELEGRAM_BOT_TOKEN).')}</span></Notice>
      ) : data.linked ? (
        <Row $between $wrap>
          <Pill $status="active">{t('привязан')}{data.username ? ` · @${data.username}` : ''}{data.linked_at ? ` · ${date(data.linked_at)}` : ''}</Pill>
          <Button type="button" $small $variant="secondary" onClick={unlink}>{t('отвязать')}</Button>
        </Row>
      ) : (
        <>
          {!link && <Row $gap={1} $wrap>
            <Button type="button" disabled={busy} onClick={createLink}>{busy ? t('Создаём ссылку…') : t('Привязать Telegram')}</Button>
            {data.bot_username && <Muted>@{data.bot_username}</Muted>}
          </Row>}
          {link && (
            <TelegramLinkSteps>
              <p>{t('Ссылка готова. Откройте бота кнопкой ниже и нажмите «Start / Запустить». Обычный запуск бота через поиск не привязывает аккаунт.')}</p>
              <a className="button primary" href={link} target="_blank" rel="noopener noreferrer">{t('Открыть Telegram и привязать')}</a>
              <p>{t('Дождитесь ответа «Готово: Telegram привязан…». После этого кнопка «Оплачено» заработает и в группе.')}</p>
              <Row $wrap>
                <Button type="button" $variant="secondary" onClick={refresh}>{t('Проверить привязку')}</Button>
                <Button type="button" $variant="ghost" disabled={busy} onClick={createLink}>{t('Создать новую ссылку')}</Button>
              </Row>
              <small>{t('Ссылка одноразовая и действует 10 минут.')}</small>
              <details>
                <summary>{t('Бот снова показал только справку?')}</summary>
                <p>{t('Отправьте команду целиком в личный чат с @{bot}. В ней уже есть код привязки.', { bot: data.bot_username })}</p>
                <code>{'/start ' + new URL(link).searchParams.get('start')}</code>
              </details>
            </TelegramLinkSteps>
          )}
        </>
      )}
    </Tile>
  );
}

const TelegramLinkSteps = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 14px;
  min-width: 0;
  margin-top: 10px;
  font-size: 15px;
  line-height: 1.5;
  > a { justify-self: start; max-width: 100%; white-space: normal; text-align: center; }
  small { color: var(--desk-muted); font-size: 13px; }
  details { border-top: 1px solid var(--line); padding-top: 14px; }
  summary { cursor: pointer; font-weight: 500; }
  details p { margin: 12px 0; }
  code { display: block; padding: 12px; background: var(--desk-raised); border-radius: 8px; overflow-wrap: anywhere; user-select: all; -webkit-user-select: all; }
`;

function PasswordTile() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  return (
    <Tile>
      <TileTitle>{t('пароль')}</TileTitle>
      <Muted>{t('После смены пароля остальные ваши сессии завершатся, эта останется.')}</Muted>
      <Row><Button type="button" onClick={() => setOpen(true)}>{t('Сменить пароль')}</Button></Row>
      {open && (
        <Modal title={t('Смена пароля')} onClose={() => setOpen(false)}>
          <ModalForm
            onSubmit={async (data) => {
              if (data.get('new_password') !== data.get('repeat')) throw new Error(t('Новые пароли не совпадают'));
              await api('/auth/password', { method: 'POST', body: { current_password: data.get('current_password'), new_password: data.get('new_password') } });
              setOpen(false);
              toast(t('Пароль изменён. Остальные сессии завершены'));
            }}
            actions={<>
              <Button type="button" $variant="secondary" onClick={() => setOpen(false)}>{t('Отмена')}</Button>
              <Button type="submit">{t('Сменить')}</Button>
            </>}
          >
            <Field>{t('Текущий пароль')}<Input name="current_password" type="password" autoComplete="current-password" required autoFocus /></Field>
            <Field>{t('Новый пароль')}<Input name="new_password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /><small>{t('Минимум 12 символов')}</small></Field>
            <Field>{t('Повторите новый пароль')}<Input name="repeat" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></Field>
          </ModalForm>
        </Modal>
      )}
    </Tile>
  );
}

function TwoFactorTile() {
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const { data } = useLoad(() => api<{ enabled: boolean }>('/auth/2fa'), [version]);
  const [setup, setSetup] = useState<{ secret: string; otpauth_url: string } | null>(null);
  const [disabling, setDisabling] = useState(false);
  const [qr, setQr] = useState('');

  useEffect(() => {
    if (!setup) return;
    QRCode.toDataURL(setup.otpauth_url, { margin: 1, width: 220 }).then(setQr, () => setQr(''));
  }, [setup]);

  async function start() {
    try {
      setSetup(await api('/auth/2fa/setup', { method: 'POST' }));
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  return (
    <Tile>
      <TileTitle>{t('двухфакторный вход')}</TileTitle>
      <Muted>{t('Кроме пароля при входе потребуется код из приложения-аутентификатора: Google Authenticator, Яндекс Ключ, 1Password, Bitwarden.')}</Muted>
      {!data ? <Muted>{t('Загружаем…')}</Muted> : data.enabled ? (
        <Row $between $wrap>
          <Pill $status="active">{t('включён')}</Pill>
          <Button type="button" $small $variant="secondary" onClick={() => setDisabling(true)}>{t('выключить')}</Button>
        </Row>
      ) : (
        <Row><Button type="button" onClick={start}>{t('Включить')}</Button></Row>
      )}
      {setup && (
        <Modal title={t('Двухфакторный вход')} onClose={() => setSetup(null)}>
          <ModalForm
            onSubmit={async (form) => {
              await api('/auth/2fa/enable', { method: 'POST', body: { code: form.get('code') } });
              setSetup(null);
              setVersion((v) => v + 1);
              toast(t('Двухфакторный вход включён. Другие сессии администратора завершены'));
            }}
            actions={<>
              <Button type="button" $variant="secondary" onClick={() => setSetup(null)}>{t('Отмена')}</Button>
              <Button type="submit">{t('Подтвердить')}</Button>
            </>}
          >
            <InfoBox>{t('1. Отсканируйте QR-код приложением-аутентификатором. 2. Введите 6-значный код из приложения.')}</InfoBox>
            <QrBox>{qr ? <img src={qr} alt={t('QR-код для приложения-аутентификатора')} width={220} height={220} /> : <Muted>QR…</Muted>}</QrBox>
            <Muted>{t('Не сканируется? Введите ключ вручную:')} <Secret>{setup.secret}</Secret></Muted>
            <Field>{t('Код из приложения')}<Input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus /></Field>
          </ModalForm>
        </Modal>
      )}
      {disabling && (
        <Modal title={t('Выключить двухфакторный вход')} onClose={() => setDisabling(false)}>
          <ModalForm
            onSubmit={async (form) => {
              await api('/auth/2fa/disable', { method: 'POST', body: { password: form.get('password'), code: form.get('code') } });
              setDisabling(false);
              setVersion((v) => v + 1);
              toast(t('Двухфакторный вход выключен'));
            }}
            actions={<>
              <Button type="button" $variant="secondary" onClick={() => setDisabling(false)}>{t('Отмена')}</Button>
              <Button type="submit" $variant="danger">{t('Выключить')}</Button>
            </>}
          >
            <Field>{t('Пароль администратора')}<Input name="password" type="password" autoComplete="current-password" required autoFocus /></Field>
            <Field>{t('Код из приложения')}<Input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required /></Field>
            <Muted>{t('Потеряли телефон? На сервере выполните invoice-keeper 2fa-off.')}</Muted>
          </ModalForm>
        </Modal>
      )}
      <Muted><Link href="/help">{t('Подробнее о безопасности →')}</Link></Muted>
    </Tile>
  );
}

/** «Chrome · macOS» from a User-Agent; the raw string stays in the tooltip. */
function device(agent: string | null) {
  if (!agent) return t('Неизвестное устройство');
  const browser = [['Edg/', 'Edge'], ['YaBrowser/', t('Яндекс Браузер')], ['OPR/', 'Opera'], ['Firefox/', 'Firefox'], ['Chrome/', 'Chrome'], ['Safari/', 'Safari']]
    .find(([marker]) => agent.includes(marker))?.[1];
  const system = [['iPhone', 'iPhone'], ['iPad', 'iPad'], ['Android', 'Android'], ['Windows', 'Windows'], ['Mac OS X', 'macOS'], ['Linux', 'Linux']]
    .find(([marker]) => agent.includes(marker))?.[1];
  return [browser, system].filter(Boolean).join(' · ') || agent.slice(0, 40);
}

function SessionsTile() {
  const toast = useToast();
  const { settings } = useSession();
  const time = new Intl.DateTimeFormat(locale(), { timeZone: settings.timezone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const [version, setVersion] = useState(0);
  const { data } = useLoad(() => api<Session[]>('/me/sessions'), [version]);
  async function run(action: () => Promise<unknown>, done: string) {
    try {
      await action();
      setVersion((v) => v + 1);
      toast(done);
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  const others = (data ?? []).filter((s) => !s.current).length;
  return (
    <Tile>
      <TileTitle>{t('активные сессии')}</TileTitle>
      <Muted>{t('Где выполнен вход в вашу учётную запись. Незнакомое устройство — завершите сессию и смените пароль.')}</Muted>
      {!data ? <Muted>{t('Загружаем…')}</Muted> : (
        <List>
          {data.map((s) => (
            <Item key={s.id}>
              <span>
                <b title={s.user_agent ?? undefined}>{device(s.user_agent)}</b>
                <small>
                  {[s.ip, s.last_seen_at && t('активность {date}', { date: time.format(new Date(s.last_seen_at)) })].filter(Boolean).join(' · ')}
                </small>
              </span>
              {s.current ? <Pill $status="active">{t('это устройство')}</Pill> : (
                <Button type="button" $small $variant="ghost" onClick={() => run(() => api(`/me/sessions/${s.id}`, { method: 'DELETE' }), t('Сессия завершена'))}>
                  {t('завершить')}
                </Button>
              )}
            </Item>
          ))}
        </List>
      )}
      {others > 0 && (
        <Row>
          <Button type="button" $variant="secondary" onClick={() => run(() => api('/me/sessions', { method: 'DELETE' }), t('Остальные сессии завершены'))}>
            {t('Завершить все, кроме этой')}
          </Button>
        </Row>
      )}
    </Tile>
  );
}

const accessName = (access: ApiKey['access']) => ({ extension: t('расширение'), read: t('только чтение'), write: t('чтение и запись') })[access];

function TokensTile() {
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const { data } = useLoad(() => api<ApiKey[]>('/api-keys'), [version]);
  const tokens = (data ?? []).filter((k) => k.access !== 'extension');
  const origin = typeof window === 'undefined' ? '' : window.location.origin;

  async function revoke(key: ApiKey) {
    try {
      await api(`/api-keys/${key.id}`, { method: 'DELETE' });
      setVersion((v) => v + 1);
      toast(t('Токен удалён'));
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  return (
    <Tile>
      <TokenDetails>
        <summary><span>{t('Интеграции и API')}<small>{t('Для подключения внешних сервисов. В обычной работе не требуется.')}</small></span></summary>
        <div className="token-content">
      <TileTitle>{t('токены API')}</TileTitle>
      <Muted>{t('Для скриптов и интеграций вместо пароля: заголовок Authorization: Bearer ik_… Токен действует с вашими правами; пароль, вход и токены по нему не изменить.')}</Muted>
      {!data ? <Muted>{t('Загружаем…')}</Muted> : tokens.length === 0 ? <Muted>{t('Токенов пока нет.')}</Muted> : (
        <List>
          {tokens.map((k) => (
            <Item key={k.id}>
              <span>
                <b>{k.name}</b>
                <small>
                  {[`${k.prefix}…`, accessName(k.access),
                    k.expires_at ? t('до {date}', { date: date(k.expires_at) }) : t('бессрочно'),
                    k.last_used_at ? t('использован {date}', { date: date(k.last_used_at) }) : t('не использовался')].join(' · ')}
                </small>
              </span>
              <Button type="button" $small $variant="ghost" onClick={() => revoke(k)}>{t('удалить')}</Button>
            </Item>
          ))}
        </List>
      )}
      <Row><Button type="button" onClick={() => setCreating(true)}>{t('Создать токен')}</Button></Row>
      <Muted><a href="/api/v1/docs">{t('Описание API (Swagger) →')}</a></Muted>
      {creating && (
        <Modal title={t('Новый токен API')} onClose={() => { setCreating(false); setCreated(null); }}>
          {created ? (
            <>
              <InfoBox>{t('Скопируйте токен сейчас: он показывается один раз, на сервере хранится только его хеш.')}</InfoBox>
              <Secret>{created}</Secret>
              <Muted>{t('Пример:')} <Secret>{`curl -H "Authorization: Bearer ${created}" ${origin}/api/v1/payments/summary`}</Secret></Muted>
              <Row $between>
                <Button type="button" $variant="secondary" onClick={() => navigator.clipboard?.writeText(created).then(() => toast(t('Скопировано')))}>{t('Скопировать')}</Button>
                <Button type="button" onClick={() => { setCreating(false); setCreated(null); }}>{t('Готово')}</Button>
              </Row>
            </>
          ) : (
            <ModalForm
              onSubmit={async (form) => {
                const days = String(form.get('expires_in_days') ?? '');
                const answer = await api<{ token: string }>('/api-keys', {
                  method: 'POST', body: { name: form.get('name'), access: form.get('access'), expires_in_days: days ? Number(days) : null },
                });
                setCreated(answer.token);
                setVersion((v) => v + 1);
              }}
              actions={<>
                <Button type="button" $variant="secondary" onClick={() => setCreating(false)}>{t('Отмена')}</Button>
                <Button type="submit">{t('Создать')}</Button>
              </>}
            >
              <Field>{t('Название')}<Input name="name" maxLength={60} required autoFocus placeholder={t('Например, отчёт в Google Таблицы')} /></Field>
              <Field>
                {t('Доступ')}
                <Select name="access" defaultValue="read">
                  <option value="read">{t('Только чтение')}</option>
                  <option value="write">{t('Чтение и запись')}</option>
                </Select>
              </Field>
              <Field>
                {t('Срок действия')}
                <Select name="expires_in_days" defaultValue="90">
                  <option value="30">{t('30 дней')}</option>
                  <option value="90">{t('90 дней')}</option>
                  <option value="365">{t('1 год')}</option>
                  <option value="">{t('Бессрочно')}</option>
                </Select>
              </Field>
            </ModalForm>
          )}
        </Modal>
      )}
        </div>
      </TokenDetails>
    </Tile>
  );
}

const List = styled.div`
  display: grid;
  gap: 0.6rem;
`;

const Item = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 0.8rem 1.2rem;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.tile};
  min-width: 0;
  > div, > span { min-width: 0; overflow-wrap: anywhere; }
  button { flex-shrink: 0; }
  @media (max-width: 480px) { flex-wrap: wrap; padding: 12px; }
  b { color: ${({ theme }) => theme.color.strong}; font-weight: 500; }
  small { display: block; color: ${({ theme }) => theme.color.muted}; word-break: break-all; }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.6rem;
  @media (max-width: 1000px) { grid-template-columns: 1fr; }
  > * { gap: 1.2rem; }
`;

const QrBox = styled.div`
  display: grid;
  place-items: center;
  padding: 1.2rem;
  border-radius: ${({ theme }) => theme.radius.md};
  background: #fff;
`;

const Secret = styled.code`
  color: ${({ theme }) => theme.color.strong};
  word-break: break-all;
  user-select: all;
`;

const TokenDetails = styled.details`
  min-width: 0;
  summary { display: flex; align-items: center; justify-content: space-between; gap: 20px; list-style: none; cursor: pointer; font-size: var(--text-body); font-weight: 550; }
  summary::-webkit-details-marker { display: none; }
  summary small { display: block; margin-top: 8px; color: var(--desk-muted); font-size: 14px; line-height: 1.6; font-weight: 400; }
  summary::after { content: ''; width: 9px; height: 9px; flex: 0 0 9px; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: rotate(45deg); margin: 0 4px 5px; }
  &[open] summary::after { transform: rotate(225deg); margin-top: 8px; }
  .token-content { display: grid; gap: 18px; padding-top: 24px; }
`;
