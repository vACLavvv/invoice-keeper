import { useEffect, useState } from 'react';
import { api, type EmailStatus } from '@/lib/api';
import { t } from '@/lib/i18n';
import { useLoad, useSession } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { Modal, ModalForm } from './Modal';
import { Button, Field, Input, Muted, Notice, Row, Tile, TileTitle } from './ui';

export function EmailTile() {
  const { isAdmin, refresh } = useSession();
  const toast = useToast();
  const { data, error } = useLoad(() => api<EmailStatus>('/me/email'), []);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => { setCooldown(data?.resend_after ?? 0); }, [data]);
  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => setCooldown((v) => Math.max(0, v - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function action(path: string, body?: unknown) {
    setBusy(true);
    try {
      await api(path, { method: body ? 'PATCH' : 'POST', body });
      refresh();
      if (!body) toast(t('Письмо подтверждения поставлено в очередь'));
    } catch (e) { toast((e as Error).message, true); }
    finally { setBusy(false); }
  }
  return <Tile>
    <TileTitle>{t('напоминания по электронной почте')}</TileTitle>
    <Muted>{isAdmin ? t('На вашу почту придут напоминания по платежам без назначенного ответственного.') : t('На вашу почту придут напоминания по платежам, где вы назначены ответственным.')}</Muted>
    {error && <Notice $tone="error">{error}</Notice>}
    {!data ? <Muted>{t('Загружаем…')}</Muted> : <>
      {!data.available && <Notice $tone="warning">{t('Отправка писем пока не настроена. Адрес сохранится, но для получения письма потребуется помощь администратора.')}</Notice>}
      <Row $between $wrap>
        <div><b>{data.email || t('Почта не указана')}</b><br /><Muted>{data.email ? data.verified_at ? data.enabled ? t('Подтверждена · напоминания включены') : t('Подтверждена · напоминания выключены') : t('Ожидает подтверждения') : t('Добавьте адрес для напоминаний')}</Muted></div>
        <Button type="button" $small $variant="secondary" onClick={() => setEditing(true)}>{data.email ? t('Изменить почту') : t('Добавить почту')}</Button>
      </Row>
      {data.email && !data.verified_at && <>
        {data.delivery_error && <Notice $tone="warning">{data.delivery_error}</Notice>}
        {data.delivery_state === 'expired' ? <Muted>{t('Ссылка истекла. Запросите новое письмо.')}</Muted> : <Muted>{t('Нажмите «Подтвердить почту» в письме. Ссылка действует 24 часа. Проверьте также папку «Спам».')}</Muted>}
        <Row $wrap>
          <Button type="button" $small $variant="secondary" disabled={busy || cooldown > 0 || !data.available} onClick={() => action('/me/email/resend')}>{cooldown > 0 ? t('Повторить через {seconds} с', { seconds: cooldown }) : t('Повторить письмо')}</Button>
          <Button type="button" $small $variant="ghost" onClick={refresh}>{t('Я подтвердил — обновить')}</Button>
        </Row>
      </>}
      {data.email && data.verified_at && <Row><Button type="button" $small $variant="ghost" disabled={busy} onClick={() => action('/me/email', { enabled: !data.enabled })}>{data.enabled ? t('Выключить email-напоминания') : t('Включить email-напоминания')}</Button></Row>}
    </>}
    {editing && <Modal title={t('Электронная почта')} onClose={() => setEditing(false)}>
      <ModalForm onSubmit={async (form) => {
        await api('/me/email', { method: 'PATCH', body: { email: form.get('email') } });
        setEditing(false); refresh(); toast(t('Почта сохранена. Проверьте письмо подтверждения.'));
      }} actions={<><Button type="button" $variant="secondary" onClick={() => setEditing(false)}>{t('Отмена')}</Button><Button type="submit">{t('Сохранить почту')}</Button></>}>
        <Field>{t('Электронная почта')}<Input type="email" name="email" required maxLength={254} defaultValue={data?.email ?? ''} autoComplete="email" autoFocus /></Field>
        <Muted>{t('При смене адреса напоминания приостановятся до подтверждения новой почты.')}</Muted>
      </ModalForm>
    </Modal>}
  </Tile>;
}
