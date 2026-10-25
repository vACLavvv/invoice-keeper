import { useState } from 'react';
import styled from 'styled-components';
import { FormRow, InfoBox, Modal, ModalForm } from '@/components/Modal';
import { Shell } from '@/components/Shell';
import { Amount, Button, Empty, Field, Input, Muted, Notice, Pill, Row, Select, Sticker, TableWrap, Tile, TileTitle } from '@/components/ui';
import { SanctionsWarning, ScreeningPill, shortAddress } from '@/components/Wallet';
import { api, type Suggestion, type TeamUser } from '@/lib/api';
import { currencies, date, frequencies, frequencyName, money, perPeriod, symbols, type Frequency } from '@/lib/format';
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
              <Big>{symbols[s.currency]} {money(s.amount)} <Muted>{perPeriod(s.frequency)}</Muted></Big>
              <Muted>{(s.frequency === 'once' ? t('срок оплаты {date}', { date: longDay(s.next_due_date) }) : t('следующая оплата {date}', { date: longDay(s.next_due_date) }))}</Muted>
              <Muted>{s.assignee ? t('ответственный: {name}', { name: s.assignee.display_name }) : t('без ответственного')}</Muted>
              {s.wallet && <Row $gap={0.6}><Muted>{s.wallet.network} {shortAddress(s.wallet.address)}</Muted><ScreeningPill wallet={s.wallet} compact /></Row>}
              {s.payment_url && <Source href={s.payment_url} target="_blank" rel="noopener noreferrer">{t('ссылка на оплату: {host}', { host: hostOf(s.payment_url) })} ↗</Source>}
              {s.source_url && s.source_url !== s.payment_url && <Source href={s.source_url} target="_blank" rel="noopener noreferrer">{hostOf(s.source_url)} ↗</Source>}
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

const longDay = (value: string) => date(value, { day: 'numeric', month: 'long', year: 'numeric' });

function hostOf(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function AcceptModal({ suggestion: s, onClose }: { suggestion: Suggestion; onClose: () => void }) {
  const { refresh } = useSession();
  const toast = useToast();
  const users = useLoad(() => api<TeamUser[]>('/users'), []).data ?? [];
  const [frequency, setFrequency] = useState<Frequency>(s.frequency);
  const [assignee, setAssignee] = useState(s.assignee ? String(s.assignee.id) : '');
  return (
    <Modal title={t('Добавить платёж')} onClose={onClose}>
      <ModalForm
        onSubmit={async (data) => {
          await api(`/payment-suggestions/${s.id}/accept`, {
            method: 'POST',
            body: {
              title: data.get('title'), amount: data.get('amount'), currency: data.get('currency'), first_due_date: data.get('first_due_date'),
              frequency, assignee_id: assignee ? Number(assignee) : null,
              payment_url: String(data.get('payment_url') ?? '').trim() || null,
              ...(s.wallet && !data.get('keep_wallet') ? { wallet_network: null, wallet_address: null } : {}),
            },
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
        <InfoBox>{frequency === 'once'
          ? t('Проверьте, что расширение распознало всё верно. Это разовый платёж без повтора.')
          : t('Проверьте, что расширение распознало всё верно. Платёж будет повторяться {period} с этой даты.', { period: frequencyName(frequency) })}</InfoBox>
        <SanctionsWarning wallet={s.wallet} />
        <Field>{t('Название')}<Input name="title" defaultValue={s.title} maxLength={120} required autoFocus /></Field>
        <FormRow>
          <Field>{t('Сумма')}<Input name="amount" type="number" step="0.01" min="0.01" defaultValue={s.amount} required /></Field>
          <Field>{t('Валюта')}<Select name="currency" defaultValue={s.currency}>{currencies.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        </FormRow>
        <FormRow>
          <Field>{t('Следующая оплата')}<Input name="first_due_date" type="date" defaultValue={s.next_due_date} min="2000-01-01" max="2100-12-31" required /></Field>
          <Field>{t('Периодичность')}
            <Select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
              {[...frequencies, 'once' as Frequency].map((f) => <option key={f} value={f}>{frequencyName(f)}</option>)}
            </Select>
          </Field>
        </FormRow>
        <Field>{t('Ответственный')}
          <Select name="assignee_id" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">{t('Не назначен')}</option>
            {s.assignee && !users.some((u) => u.id === s.assignee?.id) && (
              <option value={s.assignee.id}>{s.assignee.display_name} · @{s.assignee.username}</option>
            )}
            {users.map((u) => <option key={u.id} value={u.id}>{u.display_name} · @{u.username}</option>)}
          </Select>
        </Field>
        <Field>{t('Ссылка на оплату')} <Muted>{t('необязательно')}</Muted>
          <Input name="payment_url" type="url" defaultValue={s.payment_url ?? ''} maxLength={500} placeholder="https://" />
        </Field>
        {s.wallet && (
          <label><input type="checkbox" name="keep_wallet" defaultChecked={!s.wallet.sanctioned} /> {t('Сохранить кошелёк {network} {address}', { network: s.wallet.network, address: shortAddress(s.wallet.address) })}</label>
        )}
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
