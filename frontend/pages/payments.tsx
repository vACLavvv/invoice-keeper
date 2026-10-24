import { Ledger } from '@/components/Ledger';
import { Shell } from '@/components/Shell';
import { t } from '@/lib/i18n';

export default function Payments() {
  return (
    <Shell title={t('К оплате')} heading={t('К оплате')} subtitle={t('Неоплаченные задачи команды. Регулярные и разовые — в одном списке.')}>
      <Ledger mode="payments" />
    </Shell>
  );
}
