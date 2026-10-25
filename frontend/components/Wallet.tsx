import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { api, ApiError, type Screening, type Wallet, type WalletNetwork } from '@/lib/api';
import { t } from '@/lib/i18n';
import { Field, Input, Muted, Pill, Select } from './ui';

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

type WalletCheck =
  | { state: 'idle' | 'checking' | 'failed' }
  | { state: 'done'; screening: Screening }
  | { state: 'invalid'; message: string };

/** Screens the address while it is typed, half a second after the last keystroke; nothing is saved. */
function useWalletCheck(network: string, address: string): WalletCheck {
  const [check, setCheck] = useState<WalletCheck>({ state: 'idle' });
  useEffect(() => {
    const value = address.trim();
    if (!network || value.length < 25) {
      setCheck({ state: 'idle' });
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setCheck({ state: 'checking' });
      try {
        const answer = await api<{ screening: Screening }>('/sanctions/check', { method: 'POST', body: { network, address: value }, signal: controller.signal });
        setCheck({ state: 'done', screening: answer.screening });
      } catch (err) {
        if (controller.signal.aborted) return;
        // The field is named right above, so its «Адрес:» prefix is dropped.
        setCheck(err instanceof ApiError && err.status === 422 ? { state: 'invalid', message: err.message.replace(/^[^:]{1,20}:\s*/, '') } : { state: 'failed' });
      }
    }, 500);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [network, address]);
  return check;
}

function CheckResult({ check }: { check: WalletCheck }) {
  switch (check.state) {
    case 'checking':
      return <Muted role="status">{t('Проверяем по списку OFAC…')}</Muted>;
    case 'invalid':
      return <Invalid role="alert">{check.message}</Invalid>;
    case 'failed':
      return <Muted role="status">{t('Не удалось проверить сейчас — проверим при сохранении и в напоминаниях')}</Muted>;
    case 'done':
      if (check.screening.sanctioned === null) return <Muted role="status">{t('Список OFAC загружается — проверим при сохранении и в напоминаниях')}</Muted>;
      if (!check.screening.sanctioned) return <span role="status"><ScreeningPill wallet={check.screening} /></span>;
      return (
        <Warning role="alert">
          <b>{t('Кошелёк получателя в санкционном списке OFAC')}</b>
          {t('Совпадение: {name}. Не оплачивайте, пока не разберётесь: кнопки «Оплатить» в напоминаниях для этого платежа нет.', { name: check.screening.match_name ?? '—' })}
          <label><input type="checkbox" required /> {t('Понимаю риск — сохранить с этим кошельком')}</label>
        </Warning>
      );
    default:
      return null;
  }
}

/** Network and address of the payee wallet in the payment forms, screened while typing. */
export function WalletFields({ wallet, required = false }: { wallet?: Wallet | null; required?: boolean }) {
  const [network, setNetwork] = useState<string>(wallet?.network ?? (required ? 'TRON' : ''));
  const [address, setAddress] = useState(wallet?.address ?? '');
  const check = useWalletCheck(network, address);
  return (
    <>
      <WalletRow>
        <Field>
          {t('Сеть кошелька')}
          <Select name="wallet_network" value={network} onChange={(e) => setNetwork(e.target.value)} required={required}>
            {!required && <option value="">{t('Без кошелька')}</option>}
            {walletNetworks.map((n) => <option key={n} value={n} title={networkHint()[n]}>{n}</option>)}
          </Select>
        </Field>
        <Field>
          {t('Криптокошелёк получателя')}
          <Input name="wallet_address" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={100} spellCheck={false} autoComplete="off"
            placeholder={t('Адрес для оплаты в криптовалюте')} required={required} aria-invalid={check.state === 'invalid' || undefined} />
          <small>{t('Сверяется со списком санкций OFAC сразу при вводе, при каждом показе и в напоминаниях')}</small>
        </Field>
      </WalletRow>
      <CheckResult check={check} />
    </>
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
  grid-template-columns: minmax(160px, .4fr) minmax(0, 1fr);
  align-items: start;
  gap: 1.2rem;
  ${({ theme }) => theme.mobile} { grid-template-columns: 1fr; }
`;

const Invalid = styled.span`
  color: ${({ theme }) => theme.color.overdue};
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
  label { display: flex; align-items: center; gap: 0.8rem; font-weight: 500; }
`;
