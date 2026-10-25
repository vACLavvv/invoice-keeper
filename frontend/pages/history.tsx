import { Ledger } from '@/components/Ledger';
import { Shell } from '@/components/Shell';
import { t } from '@/lib/i18n';
import Link from 'next/link';
import { useSession } from '@/lib/session';

export default function History() {
  const { isAdmin } = useSession();
  return (
    <Shell title={t('История')} heading={t('История')} subtitle={t('Оплаченные и архивные задачи. Фактические даты и чеки сохранены.')}>
      {isAdmin && <p><Link className="text-button" href="/trash">{t('Удалённые платежи')} ↗</Link></p>}
      <Ledger mode="history" />
    </Shell>
  );
}
