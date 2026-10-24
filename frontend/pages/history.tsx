import { Ledger } from '@/components/Ledger';
import { Shell } from '@/components/Shell';
import { t } from '@/lib/i18n';

export default function History() {
  return (
    <Shell title={t('История')} heading={t('История')} subtitle={t('Оплаченные и архивные задачи. Фактические даты и чеки сохранены.')}>
      <Ledger mode="history" />
    </Shell>
  );
}
