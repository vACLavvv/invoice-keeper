import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { InfoBox, Modal, ModalForm } from '@/components/Modal';
import { Shell } from '@/components/Shell';
import { Button, Empty, Field, Input, Muted, Notice, Row, SectionTitle, Select, Sticker, TableWrap, Tile, TileTitle } from '@/components/ui';
import { api, type ApiKey } from '@/lib/api';
import { date } from '@/lib/format';
import { locale, t } from '@/lib/i18n';
import { useLoad, useSession } from '@/lib/session';
import { useToast } from '@/lib/toast';

export default function Extension() {
  const { refresh, settings } = useSession();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [pairing, setPairing] = useState<{ code: string; device: string } | null>(null);

  // The extension opened this page with ?connect=<code>: ask to confirm, and drop the code from
  // the address bar and history right away.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('connect');
    if (!code) return;
    setPairing({ code, device: (params.get('device') ?? '').slice(0, 40) });
    window.history.replaceState(null, '', window.location.pathname);
  }, []);
  // Script tokens live in «Аккаунт»; this page manages only the extension keys.
  const { data: all, error } = useLoad(() => api<ApiKey[]>('/api-keys'), []);
  const keys = all?.filter((k) => k.access === 'extension');
  const server = typeof window === 'undefined' ? '' : window.location.origin;
  const time = new Intl.DateTimeFormat(locale(), { timeZone: settings.timezone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  async function remove(key: ApiKey) {
    try {
      await api(`/api-keys/${key.id}`, { method: 'DELETE' });
      refresh();
      toast(t('Ключ удалён и больше не работает'));
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  return (
    <Shell
      title={t('Расширение')}
      heading={t('Расширение для браузера')}
      subtitle={t('Подтягивает платежи из кабинетов сервисов: aeza, хостинги, подписки.')}
      action={<Button as="a" href="/extension.zip" download>{t('Скачать расширение ↓')}</Button>}
    >
      {error && <Notice $tone="error" role="alert">{error}</Notice>}
      <Steps>
        <Tile>
          <TileTitle>{t('1 · установите')}</TileTitle>
          <Muted>{t('Скачайте архив и распакуйте. Откройте')} <code>chrome://extensions</code> {t('(или')} <code>edge://extensions</code>{t('), включите «Режим разработчика» и нажмите «Загрузить распакованное» — выберите папку')} <code>invoice-keeper-extension</code>.</Muted>
        </Tile>
        <Tile>
          <TileTitle>{t('2 · подключите')}</TileTitle>
          <Muted>{t('В окне расширения укажите адрес сервера')} <b>{server}</b> {t('и нажмите «Подключить» — откроется эта страница, подтвердите, и ключ придёт сам.')}</Muted>
        </Tile>
        <Tile>
          <TileTitle>{t('3 · нажмите на иконку')}</TileTitle>
          <Muted>{t('На странице с услугами нажмите на иконку Invoice Keeper: расширение найдёт суммы и даты оплаты, вы поправите и отправите. Администратор подтвердит в «Предложениях».')}</Muted>
          <Corner><Sticker $tilt={-7}>{t('1 клик')}</Sticker></Corner>
        </Tile>
      </Steps>
      <Notice>
        <span>
          {t('Расширение читает только открытую вкладку и только когда вы нажали на иконку (разрешение')} <code>activeTab</code>{t('). Банки и почта в стоп-листе. На сервер уходят только название, сумма, валюта, дата и адрес страницы — не её текст. Ключ умеет только отправлять предложения.')}
        </span>
      </Notice>
      <Row $between $wrap>
        <SectionTitle>{t('мои ключи')}</SectionTitle>
        <Button type="button" $variant="secondary" onClick={() => setCreating(true)}>{t('Создать ключ +')}</Button>
      </Row>
      {!keys ? <Empty>{t('Загружаем…')}</Empty> : keys.length === 0 ? (
        <Empty><b>{t('Ключей пока нет')}</b>{t('Создайте ключ, чтобы подключить расширение.')}</Empty>
      ) : (
        <TableWrap className="cards">
          <table>
            <thead><tr><th>{t('Название')}</th><th>{t('Ключ')}</th><th>{t('Создан')}</th><th>{t('Действует до')}</th><th>{t('Последнее использование')}</th><th /></tr></thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id}>
                  <td>{k.name}</td>
                  <td data-label={t('Ключ')}><Muted><code>{k.prefix}…</code></Muted></td>
                  <td data-label={t('Создан')}><Muted>{date(k.created_at)}</Muted></td>
                  <td data-label={t('Действует до')}><Muted>{k.expires_at ? date(k.expires_at, { day: 'numeric', month: 'short', year: 'numeric' }) : t('бессрочно')}</Muted></td>
                  <td data-label={t('Последнее использование')}><Muted>{k.last_used_at ? time.format(new Date(k.last_used_at)) : t('ещё не использовался')}</Muted></td>
                  <td><Button type="button" $small $variant="secondary" onClick={() => remove(k)}>{t('удалить')}</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      {creating && (
        <Modal title={t('Новый ключ')} onClose={() => setCreating(false)}>
          <ModalForm
            onSubmit={async (data) => {
              const days = String(data.get('expires_in_days') ?? '');
              const answer = await api<ApiKey & { token: string }>('/api-keys', {
                method: 'POST', body: { name: data.get('name'), expires_in_days: days ? Number(days) : null },
              });
              setCreating(false);
              setCreated(answer.token);
              refresh();
            }}
            actions={<>
              <Button type="button" $variant="secondary" onClick={() => setCreating(false)}>{t('Отмена')}</Button>
              <Button type="submit">{t('Создать')}</Button>
            </>}
          >
            <Field>{t('Где будет работать')}<Input name="name" maxLength={60} required placeholder={t('Chrome на рабочем ноутбуке')} autoFocus /></Field>
            <Field>
              {t('Срок действия')}
              <Select name="expires_in_days" defaultValue="365">
                <option value="30">{t('30 дней')}</option>
                <option value="90">{t('90 дней')}</option>
                <option value="365">{t('1 год')}</option>
                <option value="">{t('Бессрочно')}</option>
              </Select>
              {settings.key_idle_days > 0 && <small>{t('Ключ, которым не пользовались {n} дней, отключается сам.', { n: settings.key_idle_days })}</small>}
            </Field>
          </ModalForm>
        </Modal>
      )}
      {created && <TokenModal token={created} onClose={() => setCreated(null)} />}
      {pairing && <ConnectModal pairing={pairing} onClose={() => setPairing(null)} onDone={refresh} />}
    </Shell>
  );
}

/** Confirming a connection the extension started; the key goes straight to it. */
function ConnectModal({ pairing, onClose, onDone }: { pairing: { code: string; device: string }; onClose: () => void; onDone: () => void }) {
  const { user } = useSession();
  const [done, setDone] = useState(false);
  return (
    <Modal title={done ? t('Расширение подключено') : t('Подключить расширение?')} onClose={onClose}>
      {done ? (
        <>
          <InfoBox>{t('Вернитесь в браузер и нажмите на значок Invoice Keeper — расширение заберёт ключ и будет готово. Ключ действует год.')}</InfoBox>
          <Row><Button type="button" onClick={onClose}>{t('Готово')}</Button></Row>
        </>
      ) : (
        <ModalForm
          onSubmit={async () => {
            await api('/extension/pairings', { method: 'POST', body: { code: pairing.code, device: pairing.device || null } });
            setDone(true);
            onDone();
          }}
          actions={<>
            <Button type="button" $variant="secondary" onClick={onClose}>{t('Отмена')}</Button>
            <Button type="submit">{t('Подключить')}</Button>
          </>}
        >
          <InfoBox>
            <b>{pairing.device || t('Расширение Invoice Keeper')}</b><br />
            {t('Будет отправлять найденные платежи в «Предложения» от имени @{login}. Других прав у ключа нет.', { login: user.username })}
          </InfoBox>
          <Notice $tone="warning">
            <span>{t('Подтверждайте, только если вы сами только что нажали «Подключить» в расширении. Если ссылку прислал кто-то другой — нажмите «Отмена».')}</span>
          </Notice>
        </ModalForm>
      )}
    </Modal>
  );
}

function TokenModal({ token, onClose }: { token: string; onClose: () => void }) {
  const toast = useToast();
  return (
    <Modal title={t('Ключ создан')} onClose={onClose}>
      <InfoBox>{t('Скопируйте ключ сейчас — больше он показан не будет. Хранится только его хеш.')}</InfoBox>
      <Token>{token}</Token>
      <Row $between>
        <Button type="button" $variant="secondary" onClick={onClose}>{t('Готово')}</Button>
        <Button type="button" onClick={() => navigator.clipboard.writeText(token).then(() => toast(t('Ключ скопирован')), () => toast(t('Скопируйте вручную'), true))}>{t('Скопировать')}</Button>
      </Row>
    </Modal>
  );
}

const Steps = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
  gap: 1.6rem;
  ${Tile} { min-height: 18rem; gap: 1rem; }
  code { color: ${({ theme }) => theme.color.strong}; }
  b { color: ${({ theme }) => theme.color.strong}; font-weight: 500; }
  ${({ theme }) => theme.mobile} { grid-template-columns: 1fr; }
`;

const Corner = styled.div`
  justify-self: start;
  margin-top: 0.8rem;
`;

const Token = styled.code`
  display: block;
  margin: 1.6rem 0;
  padding: 1.4rem;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.inset};
  color: ${({ theme }) => theme.color.accent};
  font-size: 1.4rem;
  word-break: break-all;
  user-select: all;
`;
