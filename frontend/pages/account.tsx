import Link from 'next/link';
import { useEffect, useState } from 'react';
import styled from 'styled-components';
import QRCode from 'qrcode';
import { InfoBox, Modal, ModalForm } from '@/components/Modal';
import { Shell } from '@/components/Shell';
import { Button, Field, Input, Muted, Notice, Pill, Row, Tile, TileTitle } from '@/components/ui';
import { api, type TelegramLink } from '@/lib/api';
import { date } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useLoad, useSession } from '@/lib/session';
import { useToast } from '@/lib/toast';

export default function Account() {
  const { user, isAdmin } = useSession();
  return (
    <Shell title={t('Аккаунт')} heading={t('мой аккаунт')} subtitle={t('@{login} · {role}', { login: user.username, role: isAdmin ? t('администратор') : t('пользователь') })}>
      <Grid>
        <TelegramTile />
        {isAdmin ? <TwoFactorTile /> : <PasswordTile />}
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
  const { data } = useLoad(() => api<TelegramLink>('/me/telegram'), []);
  const [link, setLink] = useState<string | null>(null);

  async function createLink() {
    try {
      const answer = await api<{ url: string }>('/me/telegram/link', { method: 'POST' });
      setLink(answer.url);
      window.open(answer.url, '_blank', 'noopener');
    } catch (e) {
      toast((e as Error).message, true);
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
    <Tile>
      <TileTitle>{t('личные напоминания в Telegram')}</TileTitle>
      <Muted>{t('Привяжите свой Telegram: напоминания по платежам, где вы ответственный, придут в личку с кнопкой «Оплачено». Отметка запишется от вашего имени.')}</Muted>
      {!data ? <Muted>{t('Загружаем…')}</Muted> : !data.available ? (
        <Notice $tone="warning"><span>{t('На сервере не настроен Telegram-бот (TELEGRAM_BOT_TOKEN).')}</span></Notice>
      ) : data.linked ? (
        <Row $between $wrap>
          <Pill $status="active">{t('привязан')}{data.username ? ` · @${data.username}` : ''}{data.linked_at ? ` · ${date(data.linked_at)}` : ''}</Pill>
          <Button type="button" $small $variant="secondary" onClick={unlink}>{t('отвязать')}</Button>
        </Row>
      ) : (
        <>
          <Row $gap={1} $wrap>
            <Button type="button" onClick={createLink}>{t('Привязать Telegram')}</Button>
            {data.bot_username && <Muted>@{data.bot_username}</Muted>}
          </Row>
          {link && (
            <InfoBox>
              {t('Откройте ссылку и нажмите «Start» в боте. Ссылка одноразовая и действует 10 минут.')}<br />
              <a href={link} target="_blank" rel="noopener noreferrer">{link}</a>
              <br /><Button type="button" $small $variant="ghost" onClick={refresh}>{t('я нажал Start — обновить')}</Button>
            </InfoBox>
          )}
        </>
      )}
    </Tile>
  );
}

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

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.6rem;
  ${({ theme }) => theme.mobile} { grid-template-columns: 1fr; }
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
