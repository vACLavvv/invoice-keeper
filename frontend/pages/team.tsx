import { useState } from 'react';
import { InfoBox, Modal, ModalForm } from '@/components/Modal';
import { Shell } from '@/components/Shell';
import { ws } from '@/components/icons';
import { Button, Field, Input, Notice } from '@/components/ui';
import { api, type TeamUser } from '@/lib/api';
import { date } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useLoad, useSession } from '@/lib/session';
import { useToast } from '@/lib/toast';

export default function Team() {
  const { isAdmin } = useSession();
  const toast = useToast();
  const [sending, setSending] = useState<number | null>(null);
  const [editing, setEditing] = useState<TeamUser | 'new' | null>(null);
  const [deleting, setDeleting] = useState<TeamUser | null>(null);
  const { data, error } = useLoad(() => (isAdmin ? api<TeamUser[]>('/users') : Promise.resolve([])), [isAdmin]);
  if (!isAdmin) {
    return (
      <Shell title={t('Команда')} heading={t('Ваша команда')} subtitle={t('Раздел доступен администратору.')} action={<></>}>
        <Notice $tone="warning">{t('Управлять участниками может только администратор.')}</Notice>
      </Shell>
    );
  }
  return (
    <Shell
      title={t('Команда')}
      heading={t('Ваша команда')}
      subtitle={t('Дайте коллегам доступ к платежам и истории оплат.')}
      action={<button type="button" className="button primary" onClick={() => setEditing('new')}><span className="button-icon" aria-hidden="true">{ws.plus}</span> {t('Добавить участника')}</button>}
    >
      {error && <Notice $tone="error" role="alert">{error}</Notice>}
      <Notice>{t('Администратор задаётся в .env и здесь не отображается. Участники видят платежи, отмечают оплату и исправляют даты.')}</Notice>
      <div id="users-table" className="ledger table-wrap cards">
        {!data ? <div className="empty-state">{t('Загружаем…')}</div> : data.length === 0 ? (
          <div className="empty-state"><b>{t('Пригласите команду')}</b>{t('Создайте учётную запись для коллеги.')}<br />{t('Администратор не отображается в этом списке.')}</div>
        ) : (
          <table>
            <thead><tr><th>{t('ИМЯ')}</th><th>{t('ЛОГИН')}</th><th>{t('ЭЛЕКТРОННАЯ ПОЧТА')}</th><th>{t('РОЛЬ')}</th><th>{t('СОЗДАН')}</th><th /></tr></thead>
            <tbody>
              {data.map((u) => (
                <tr key={u.id}>
                  <td><b>{u.display_name}</b></td>
                  <td className="date-cell" data-label={t('Логин')}>{u.username}</td>
                  <td data-label={t('Электронная почта')}>
                    <div>{u.email || t('Не указана')}</div>
                    {u.email && <small className="muted">{u.email_verified_at ? t('Подтверждена') : t('Ожидает подтверждения')}</small>}
                  </td>
                  <td data-label={t('Роль')}><span className="pill paid">{t('Пользователь')}</span></td>
                  <td className="date-cell" data-label={t('Создан')}>{date(u.created_at)}</td>
                  <td>
                    <div className="row-action-group">
                      <button type="button" className="row-action" onClick={() => setEditing(u)}>{t('Изменить ↗')}</button>
                      {u.email && !u.email_verified_at && <button type="button" className="row-action" disabled={sending === u.id} onClick={async () => {
                        setSending(u.id);
                        try { await api(`/users/${u.id}/email/resend`, { method: 'POST' }); toast(t('Письмо подтверждения поставлено в очередь')); }
                        catch (e) { toast((e as Error).message, true); }
                        finally { setSending(null); }
                      }}>{sending === u.id ? t('Отправляем…') : t('Повторить письмо')}</button>}
                      <button type="button" className="row-action delete" onClick={() => setDeleting(u)}>{t('Удалить')}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {editing && <UserModal user={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {deleting && <DeleteModal user={deleting} onClose={() => setDeleting(null)} />}
    </Shell>
  );
}

function UserModal({ user, onClose }: { user: TeamUser | null; onClose: () => void }) {
  const { refresh } = useSession();
  const toast = useToast();
  return (
    <Modal title={user ? t('Изменить участника') : t('Добавить участника')} onClose={onClose}>
      <ModalForm
        onSubmit={async (data) => {
          const body: Record<string, FormDataEntryValue> = Object.fromEntries(data);
          if (user && !body.password) delete body.password;
          if (user && !body.email) delete body.email;
          await api(user ? `/users/${user.id}` : '/users', { method: user ? 'PATCH' : 'POST', body });
          onClose();
          refresh();
          toast(user ? t('Участник обновлён') : t('Участник добавлен'));
        }}
        actions={<>
          <Button type="button" $variant="secondary" onClick={onClose}>{t('Отмена')}</Button>
          <Button type="submit">{user ? t('Сохранить') : t('Создать участника')}</Button>
        </>}
      >
        <Field>{t('Имя')}<Input name="display_name" defaultValue={user?.display_name} required maxLength={80} placeholder={t('Алексей Иванов')} autoFocus /></Field>
        <Field>
          {t('Электронная почта')}
          <Input name="email" type="email" defaultValue={user?.email ?? ''} required={!user || !!user.email} maxLength={254} autoComplete="email" placeholder="alexey@example.com" />
          <small>{t('Придёт письмо с кнопкой подтверждения. После нажатия включатся напоминания по назначенным платежам.')}</small>
        </Field>
        <Field>
          {t('Логин')}
          <Input name="username" defaultValue={user?.username} required minLength={3} maxLength={64} pattern="[A-Za-z0-9_.\-]+" autoComplete="off" placeholder="alexey" />
          <small>{t('Латинские буквы, цифры, точка, дефис, подчёркивание.')}</small>
        </Field>
        <Field>
          {user ? t('Новый пароль') : t('Пароль')}
          <Input name="password" type="password" minLength={12} maxLength={128} required={!user} autoComplete="new-password" placeholder={t('Минимум 12 символов')} />
          <small>{user ? t('Оставьте пустым, чтобы не менять. Смена пароля завершит все сессии участника.') : t('Передайте пароль коллеге лично.')}</small>
        </Field>
      </ModalForm>
    </Modal>
  );
}

function DeleteModal({ user, onClose }: { user: TeamUser; onClose: () => void }) {
  const { refresh } = useSession();
  const toast = useToast();
  return (
    <Modal title={t('Удалить участника?')} onClose={onClose}>
      <ModalForm
        onSubmit={async () => {
          await api(`/users/${user.id}`, { method: 'DELETE' });
          onClose();
          refresh();
          toast(t('Участник удалён'));
        }}
        actions={<>
          <Button type="button" $variant="secondary" onClick={onClose}>{t('Отмена')}</Button>
          <Button type="submit" $variant="danger">{t('Удалить участника')}</Button>
        </>}
      >
        <InfoBox><b>{user.display_name}</b> {t('потеряет доступ к системе. Его действия и история оплат сохранятся.')}</InfoBox>
      </ModalForm>
    </Modal>
  );
}
