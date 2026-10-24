import { useState } from 'react';
import { InfoBox, Modal, ModalForm } from '@/components/Modal';
import { Shell } from '@/components/Shell';
import { Button, Card, Empty, Field, Input, Muted, Notice, Pill, Row, TableWrap } from '@/components/ui';
import { api, type TeamUser } from '@/lib/api';
import { date } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useLoad, useSession } from '@/lib/session';
import { useToast } from '@/lib/toast';

export default function Team() {
  const { isAdmin } = useSession();
  const [editing, setEditing] = useState<TeamUser | 'new' | null>(null);
  const [deleting, setDeleting] = useState<TeamUser | null>(null);
  const { data, error } = useLoad(() => (isAdmin ? api<TeamUser[]>('/users') : Promise.resolve([])), [isAdmin]);
  if (!isAdmin) {
    return (
      <Shell title={t('Команда')} heading={t('ваша команда')} subtitle={t('Раздел доступен администратору.')}>
        <Notice $tone="warning">{t('Управлять участниками может только администратор.')}</Notice>
      </Shell>
    );
  }
  return (
    <Shell
      title={t('Команда')}
      heading={t('ваша команда')}
      subtitle={t('Дайте коллегам доступ к платежам и истории оплат.')}
      action={<Button type="button" onClick={() => setEditing('new')}>{t('Добавить участника +')}</Button>}
    >
      {error && <Notice $tone="error" role="alert">{error}</Notice>}
      <Notice>{t('Администратор задаётся в .env и здесь не отображается. Участники видят платежи, отмечают оплату и исправляют даты.')}</Notice>
      <Card>
        {!data ? <Empty>{t('Загружаем…')}</Empty> : data.length === 0 ? (
          <Empty><b>{t('Пригласите команду')}</b>{t('Создайте учётную запись для коллеги.')}</Empty>
        ) : (
          <TableWrap>
            <table>
              <thead><tr><th>{t('Имя')}</th><th>{t('Логин')}</th><th>{t('Роль')}</th><th>{t('Создан')}</th><th /></tr></thead>
              <tbody>
                {data.map((u) => (
                  <tr key={u.id}>
                    <td><b>{u.display_name}</b></td>
                    <td><Muted>{u.username}</Muted></td>
                    <td><Pill $status="active">{t('пользователь')}</Pill></td>
                    <td><Muted>{date(u.created_at)}</Muted></td>
                    <td>
                      <Row $gap={0.8}>
                        <Button type="button" $small $variant="secondary" onClick={() => setEditing(u)}>{t('изменить')}</Button>
                        <Button type="button" $small $variant="ghost" onClick={() => setDeleting(u)}>{t('удалить')}</Button>
                      </Row>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
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
