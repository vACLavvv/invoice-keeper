import Link from 'next/link';
import { useState } from 'react';
import styled from 'styled-components';
import { Shell } from '@/components/Shell';
import { InfoBox, Modal, ModalForm } from '@/components/Modal';
import { Button, Card, Field, Input, Muted, Notice, Row } from '@/components/ui';
import { api, type DeletedPayment } from '@/lib/api';
import { date, moneyWith } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useLoad, useSession } from '@/lib/session';
import { useToast } from '@/lib/toast';

export default function Trash() {
  const { isAdmin, refresh } = useSession();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [restoring, setRestoring] = useState<DeletedPayment | null>(null);
  const { data, error } = useLoad(() => isAdmin ? api<DeletedPayment[]>('/deleted-payments') : Promise.resolve([]), [isAdmin]);
  const items = data?.filter((item) => item.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

  return <Shell title={t('Удалённые платежи')} heading={t('Удалённые платежи')} subtitle={t('Записи сохраняются здесь до восстановления. Даты оплаты и чеки не теряются.')}>
    {!isAdmin ? <Notice>{t('Доступно только администратору')}</Notice> : <>
      <Row><Link className="text-button" href="/history">{t('История')}</Link><Link className="text-button" href="/recurring">{t('Регулярные платежи')}</Link></Row>
      <Card>
        <p>{t('Архив прекращает повторения и сохраняет историю в отчётах. Удаление убирает ошибочную запись из календаря и итогов — её можно вернуть здесь.')}</p>
        <Field>{t('Найти платёж')}<Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Название платежа')} /></Field>
      </Card>
      {error && <Notice $tone="error" role="alert">{error}</Notice>}
      {!data ? <Card>{t('Загружаем…')}</Card> : items?.length === 0 ? <Card>{search ? t('Подходящих платежей нет') : t('Удалённых платежей нет')}</Card> : <List aria-label={t('Удалённые платежи')}>
        {items?.map((item) => <Item key={`${item.kind}-${item.recurring_payment_id}-${item.due_date ?? ''}`}>
          <div>
            <h2>{item.title}</h2>
            <p>{item.kind === 'payment' ? t('Весь платёж и повторения') : t('Период за {date}', { date: date(item.due_date!) })} · <b>{moneyWith(item.amount, item.currency)}</b></p>
            {item.paid_at && <p>{t('Дата оплаты')}: {date(item.paid_at)}</p>}
            <Muted>{t('Удалено {date}', { date: date(item.removed_at.slice(0, 10)) })}{!item.active && <> · {t('В архиве')}</>}</Muted>
          </div>
          <Button $variant="secondary" onClick={() => setRestoring(item)}>{t('Восстановить')}</Button>
        </Item>)}
      </List>}
      {restoring && <Modal title={t('Восстановить платёж?')} onClose={() => setRestoring(null)}>
        <ModalForm onSubmit={async () => {
          const base = `/recurring-payments/${restoring.recurring_payment_id}`;
          const target = restoring.kind === 'period' ? `${base}/periods/${restoring.due_date}` : base;
          await api(`${target}/restore`, { method: 'POST' });
          setRestoring(null);
          refresh();
          toast(t('Платёж восстановлен'));
        }} actions={<><Button type="button" $variant="secondary" onClick={() => setRestoring(null)}>{t('Отмена')}</Button><Button type="submit">{t('Восстановить')}</Button></>}>
          <InfoBox><b>{restoring.title}</b><br />{restoring.due_date ? date(restoring.due_date) : t('Весь платёж и повторения')}</InfoBox>
          <p>{t('Вернутся прежние даты оплаты и чеки. Архив и пауза сохранятся; для активных неоплаченных платежей напоминания возобновятся.')}</p>
          {restoring.kind === 'payment' && <Muted>{t('Периоды, удалённые отдельно, останутся удалёнными. После восстановления платежа они появятся в этом списке.')}</Muted>}
        </ModalForm>
      </Modal>}
    </>}
  </Shell>;
}

const List = styled.div`display: grid; gap: 12px; margin-top: 16px;`;
const Item = styled(Card)`
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  min-width: 0; margin: 0; padding: 20px;
  border: 1px solid var(--desk-border); border-radius: 16px; background: var(--desk-surface);
  > div { min-width: 0; overflow-wrap: anywhere; }
  h2 { font-size: 18px; margin: 0 0 8px; }
  p { margin: 4px 0; }
  > button { flex-shrink: 0; }
  @media (max-width: 600px) { align-items: stretch; flex-direction: column; }
`;
