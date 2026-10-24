import styled from 'styled-components';
import type { Screening, Wallet, WalletNetwork } from '@/lib/api';
import { t } from '@/lib/i18n';
import { Field, Input, Pill, Select } from './ui';

export const walletNetworks: WalletNetwork[] = ['BTC', 'ETH', 'TRON'];

const networkHint = (): Record<WalletNetwork, string> => ({
  BTC: t('Bitcoin: адреса 1…, 3… и bc1…'),
  ETH: t('Ethereum и совместимые сети, в том числе USDT и USDC (ERC-20): 0x…'),
  TRON: t('TRON, в том числе USDT (TRC-20): T…'),
});

/** 0x252a…3bce: enough to recognize, short enough for a table. */
export const shortAddress = (address: string) => (address.length > 14 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address);

/** The OFAC screening result: on the list, not on it, or not checked while the list is not loaded.
 * compact fits a tile line next to the address. */
export function ScreeningPill({ wallet, compact = false }: { wallet: Screening; compact?: boolean }) {
  if (wallet.sanctioned === null) return <Pill $status="archived" title={t('Список OFAC ещё не загружен')}>{t('не проверен')}</Pill>;
  if (wallet.sanctioned) {
    return <Pill $status="overdue" title={wallet.match_name ?? undefined}>{compact ? t('⛔ санкции OFAC') : t('⛔ санкционный список OFAC')}</Pill>;
  }
  return <Pill $status="paid">{compact ? t('OFAC: чисто') : t('нет в списке OFAC')}</Pill>;
}

/** A warning for a payee wallet from the OFAC list; nothing for other wallets. */
export function SanctionsWarning({ wallet }: { wallet: Wallet | null }) {
  if (!wallet?.sanctioned) return null;
  return (
    <Warning role="alert">
      <b>{t('Кошелёк получателя в санкционном списке OFAC')}</b>
      {t('Совпадение: {name}. Не оплачивайте, пока не разберётесь: кнопки «Оплатить» в напоминаниях для этого платежа нет.', { name: wallet.match_name ?? '—' })}
    </Warning>
  );
}

/** Network and address of the payee wallet in the payment forms. */
export function WalletFields({ wallet, required = false }: { wallet?: Wallet | null; required?: boolean }) {
  return (
    <WalletRow>
      <Field>
        {t('Сеть кошелька')}
        <Select name="wallet_network" defaultValue={wallet?.network ?? (required ? 'TRON' : '')} required={required}>
          {!required && <option value="">{t('Без кошелька')}</option>}
          {walletNetworks.map((n) => <option key={n} value={n} title={networkHint()[n]}>{n}</option>)}
        </Select>
      </Field>
      <Field>
        {t('Криптокошелёк получателя')}
        <Input name="wallet_address" defaultValue={wallet?.address ?? ''} maxLength={100} spellCheck={false} autoComplete="off"
          placeholder={t('Адрес для оплаты в криптовалюте')} required={required} />
        <small>{t('Сверяется со списком санкций OFAC при каждом показе и в напоминаниях')}</small>
      </Field>
    </WalletRow>
  );
}

/** Form values → request fields: both null clears the wallet. */
export function walletBody(data: FormData) {
  const network = String(data.get('wallet_network') ?? '').trim();
  const address = String(data.get('wallet_address') ?? '').trim();
  return { wallet_network: network || null, wallet_address: address || null };
}

const WalletRow = styled.div`
  display: grid;
  grid-template-columns: 12rem 1fr;
  align-items: start;
  gap: 1.2rem;
  ${({ theme }) => theme.mobile} { grid-template-columns: 1fr; }
`;

const Warning = styled.div`
  display: grid;
  gap: 0.4rem;
  padding: 1.2rem 1.4rem;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.overdueSoft};
  color: ${({ theme }) => theme.color.text};
  line-height: 1.5;
  b { color: ${({ theme }) => theme.color.overdue}; font-weight: 600; }
`;
