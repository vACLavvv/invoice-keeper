import { useState } from 'react';
import { InfoBox, Modal, ModalForm } from '@/components/Modal';
import { Shell } from '@/components/Shell';
import { Button, Card, Empty, Field, Input, Muted, Notice, Pill, Row, TableWrap } from '@/components/ui';
import { api, type TeamUser } from '@/lib/api';
import { date } from '@/lib/format';
import { useLoad, useSession } from '@/lib/session';
import { useToast } from '@/lib/toast';

export default function Team() {
  const { isAdmin } = useSession();
  const [editing, setEditing] = useState<TeamUser | 'new' | null>(null);
  const [deleting, setDeleting] = useState<TeamUser | null>(null);
  const { data, error } = useLoad(() => (isAdmin ? api<TeamUser[]>('/users') : Promise.resolve([])), [isAdmin]);
  if (!isAdmin) {
    return (
      <Shell title="Команда" heading="ваша команда" subtitle="Раздел доступен администратору.">
        <Notice $tone="warning">Управлять участниками может только администратор.</Notice>
      </Shell>
    );
  }
  return (
    <Shell
      title="Команда"
      heading="ваша команда"
      subtitle="Дайте коллегам доступ к платежам и истории оплат."
      action={<Button type="button" onClick={() => setEditing('new')}>Добавить участника +</Button>}
    >
      {error && <Notice $tone="error" role="alert">{error}</Notice>}
      <Notice>Администратор задаётся в .env и здесь не отображается. Участники видят платежи, отмечают оплату и исправляют даты.</Notice>
      <Card>
        {!data ? <Empty>Загружаем…</Empty> : data.length === 0 ? (
          <Empty><b>Пригласите команду</b>Создайте учётную запись для коллеги.</Empty>
        ) : (
          <TableWrap>
            <table>
              <thead><tr><th>Имя</th><th>Логин</th><th>Роль</th><th>Создан</th><th /></tr></thead>
              <tbody>
                {data.map((u) => (
                  <tr key={u.id}>
                    <td><b>{u.display_name}</b></td>
                    <td><Muted>{u.username}</Muted></td>
                    <td><Pill $status="active">пользователь</Pill></td>
                    <td><Muted>{date(u.created_at)}</Muted></td>
                    <td>
                      <Row $gap={0.8}>
                        <Button type="button" $small $variant="secondary" onClick={() => setEditing(u)}>изменить</Button>
                        <Button type="button" $small $variant="ghost" onClick={() => setDeleting(u)}>удалить</Button>
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
    <Modal title={user ? 'Изменить участника' : 'Добавить участника'} onClose={onClose}>
      <ModalForm
        onSubmit={async (data) => {
          const body: Record<string, FormDataEntryValue> = Object.fromEntries(data);
          if (user && !body.password) delete body.password;
          await api(user ? `/users/${user.id}` : '/users', { method: user ? 'PATCH' : 'POST', body });
          onClose();
          refresh();
          toast(user ? 'Участник обновлён' : 'Участник добавлен');
        }}
        actions={<>
          <Button type="button" $variant="secondary" onClick={onClose}>Отмена</Button>
          <Button type="submit">{user ? 'Сохранить' : 'Создать участника'}</Button>
        </>}
      >
        <Field>Имя<Input name="display_name" defaultValue={user?.display_name} required maxLength={80} placeholder="Алексей Иванов" autoFocus /></Field>
        <Field>
          Логин
          <Input name="username" defaultValue={user?.username} required minLength={3} maxLength={64} pattern="[A-Za-z0-9_.\-]+" autoComplete="off" placeholder="alexey" />
          <small>Латинские буквы, цифры, точка, дефис, подчёркивание.</small>
        </Field>
        <Field>
          {user ? 'Новый пароль' : 'Пароль'}
          <Input name="password" type="password" minLength={12} maxLength={128} required={!user} autoComplete="new-password" placeholder="Минимум 12 символов" />
          <small>{user ? 'Оставьте пустым, чтобы не менять. Смена пароля завершит все сессии участника.' : 'Передайте пароль коллеге лично.'}</small>
        </Field>
      </ModalForm>
    </Modal>
  );
}

function DeleteModal({ user, onClose }: { user: TeamUser; onClose: () => void }) {
  const { refresh } = useSession();
  const toast = useToast();
  return (
    <Modal title="Удалить участника?" onClose={onClose}>
      <ModalForm
        onSubmit={async () => {
          await api(`/users/${user.id}`, { method: 'DELETE' });
          onClose();
          refresh();
          toast('Участник удалён');
        }}
        actions={<>
          <Button type="button" $variant="secondary" onClick={onClose}>Отмена</Button>
          <Button type="submit" $variant="danger">Удалить участника</Button>
        </>}
      >
        <InfoBox><b>{user.display_name}</b> потеряет доступ к системе. Его действия и история оплат сохранятся.</InfoBox>
      </ModalForm>
    </Modal>
  );
}
