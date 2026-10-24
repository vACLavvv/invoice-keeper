import { monthLabel, shiftMonth } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';

/** «‹ Октябрь 2026 ›» — the period switcher of the workspace. */
export function MonthSwitcher() {
  const { month, setMonth } = useSession();
  return (
    <div className="period-switcher">
      <button type="button" className="icon-button" aria-label={t('Предыдущий месяц')} onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
      <h2 aria-live="polite">{monthLabel(month)}</h2>
      <button type="button" className="icon-button" aria-label={t('Следующий месяц')} onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
    </div>
  );
}
