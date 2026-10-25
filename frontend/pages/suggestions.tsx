import { useState } from 'react';
import styled from 'styled-components';
import { FormRow, InfoBox, Modal, ModalForm } from '@/components/Modal';
import { Shell } from '@/components/Shell';
import { Amount, Button, Empty, Field, Input, Muted, Notice, Pill, Row, Select, Sticker, TableWrap, Tile, TileTitle } from '@/components/ui';
import { api, type Suggestion } from '@/lib/api';
import { currencies, date, money, plural, symbols } from '@/lib/format';
import { t, tp } from '@/lib/i18n';
import { useLoad, useSession } from '@/lib/session';
import { useToast } from '@/lib/toast';

export default function Suggestions() {
  const { isAdmin, refresh } = useSession();
  const toast = useToast();
  const [accepting, setAccepting] = useState<Suggestion | null>(null);
  const { data, error } = useLoad(() => (isAdmin ? api<Suggestion[]>('/payment-suggestions') : Promise.resolve([])), [isAdmin]);

  if (!isAdmin) {
    return (
      <Shell title={t('Предложения')} heading={t('Предложения платежей')} subtitle={t('Раздел доступен администратору.')}>
        <Notice $tone="warning">{t('Разбирать предложения может только администратор.')}</Notice>
      </Shell>
    );
  }
  const pending = (data ?? []).filter((s) => s.status === 'pending');
  const decided = (data ?? []).filter((s) => s.status !== 'pending');

  async function reject(s: Suggestion) {
    try {
      await api(`/payment-suggestions/${s.id}/reject`, { method: 'POST' });
      refresh();
      toast(t('Предложение отклонено. Расширение больше не предложит этот платёж'));
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  return (
    <Shell title={t('Предложения')} heading={t('Предложения платежей')} subtitle={t('Расширение находит платежи в кабинетах сервисов, вы решаете, что добавить.')}>
      {error && <Notice $tone="error" role="alert">{error}</Notice>}
      {!data ? <Empty>{t('Загружаем…')}</Empty> : pending.length === 0 ? (
        <Empty>
          <b>{t('Новых предложений нет')}</b>
          {t('Откройте кабинет сервиса, нажмите на иконку Invoice Keeper в браузере — найденные платежи появятся здесь.')}
        </Empty>
      ) : (
        <Grid>
          {pending.map((s) => (
            <Tile key={s.id}>
              <TileTitle>{s.title}<Sticker $tilt={-6}>new</Sticker></TileTitle>
              <Muted>{t('от @{user} · {date}', { user: s.submitted_by, date: date(s.updated_at, { day: 'numeric', month: 'short' }) })}</Muted>
              <Big>{symbols[s.currency]} {money(s.amount)} <Muted>{t('/ месяц')}</Muted></Big>
              <Muted>{t('следующая оплата {date}', { date: date(s.next_due_date, { day: 'numeric', month: 'long', year: 'numeric' }) })}</Muted>
              {s.source_url && <Source href={s.source_url} target="_blank" rel="noopener noreferrer">{hostOf(s.source_url)} ↗</Source>}
              <Row $gap={0.8}>
                <Button type="button" $small onClick={() => setAccepting(s)}>{t('принять')}</Button>
                <Button type="button" $small $variant="secondary" onClick={() => reject(s)}>{t('отклонить')}</Button>
              </Row>
            </Tile>
          ))}
        </Grid>
      )}
      {decided.length > 0 && (
        <TableWrap className="cards">
          <table>
            <thead><tr><th>{t('Разобрано')}</th><th>{t('Сумма')}</th><th>{t('Следующая оплата')}</th><th>{t('Решение')}</th><th>{t('Источник')}</th></tr></thead>
            <tbody>
              {decided.map((s) => (
                <tr key={s.id}>
                  <td>{s.title}</td>
                  <td data-label={t('Сумма')}><Amount>{symbols[s.currency]} {money(s.amount)}</Amount></td>
                  <td data-label={t('Следующая оплата')}><Muted>{date(s.next_due_date, { day: '2-digit', month: '2-digit', year: 'numeric' })}</Muted></td>
                  <td data-label={t('Решение')}><Pill $status={s.status === 'accepted' ? 'active' : 'archived'}>{s.status === 'accepted' ? t('добавлено') : t('отклонено')}</Pill></td>
                  <td data-label={t('Источник')}><Muted>{s.source_key.split(':')[0]}</Muted></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      {pending.length > 0 && <Muted>{pending.length} {tp(pending.length, ['предложение ждёт решения', 'предложения ждут решения', 'предложений ждут решения'], ['suggestion awaits a decision', 'suggestions await a decision'])}</Muted>}
      {accepting && <AcceptModal suggestion={accepting} onClose={() => setAccepting(null)} />}
    </Shell>
  );
}

function hostOf(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function AcceptModal({ suggestion: s, onClose }: { suggestion: Suggestion; onClose: () => void }) {
  const { refresh } = useSession();
  const toast = useToast();
  return (
    <Modal title={t('Добавить платёж')} onClose={onClose}>
      <ModalForm
        onSubmit={async (data) => {
          await api(`/payment-suggestions/${s.id}/accept`, {
            method: 'POST',
            body: { title: data.get('title'), amount: data.get('amount'), currency: data.get('currency'), first_due_date: data.get('first_due_date') },
          });
          onClose();
          refresh();
          toast(t('Платёж добавлен. Напомним за 3 дня до срока'));
        }}
        actions={<>
          <Button type="button" $variant="secondary" onClick={onClose}>{t('Отмена')}</Button>
          <Button type="submit">{t('Добавить платёж')}</Button>
        </>}
      >
        <InfoBox>{t('Проверьте, что расширение распознало всё верно. Платёж будет повторяться каждый месяц с этой даты.')}</InfoBox>
        <Field>{t('Название')}<Input name="title" defaultValue={s.title} maxLength={120} required autoFocus /></Field>
        <FormRow>
          <Field>{t('Сумма')}<Input name="amount" type="number" step="0.01" min="0.01" defaultValue={s.amount} required /></Field>
          <Field>{t('Валюта')}<Select name="currency" defaultValue={s.currency}>{currencies.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        </FormRow>
        <Field>{t('Следующая оплата')}<Input name="first_due_date" type="date" defaultValue={s.next_due_date} min="2000-01-01" max="2100-12-31" required /></Field>
      </ModalForm>
    </Modal>
  );
}

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 28rem), 1fr));
  gap: 1.6rem;
  ${Tile} { gap: 0.6rem; }
  ${Row} { margin-top: 1.2rem; }
`;

const Big = styled.div`
  margin-top: 0.8rem;
  font-size: 2.8rem;
  font-weight: 500;
  color: ${({ theme }) => theme.color.strong};
  span { font-size: 1.4rem; }
`;

const Source = styled.a`
  color: ${({ theme }) => theme.color.accent};
  &:hover { text-decoration: underline; }
`;
