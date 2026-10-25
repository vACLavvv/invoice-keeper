import styled from 'styled-components';
import { t } from '@/lib/i18n';
import type { Page } from '@/lib/pagination';

export function Pagination({ data, onChange }: { data: Page<unknown> | null; onChange: (page: number) => void }) {
  if (!data) return null;
  return <Controls aria-label={t('Страница {page} из {pages}', { page: data.page, pages: Math.max(1, data.pages) })}>
    <span>{t('{from}–{to} из {total}', { from: data.total ? (data.page - 1) * data.page_size + 1 : 0, to: Math.min(data.page * data.page_size, data.total), total: data.total })}</span>
    {data.pages > 1 && <div>
      <button type="button" className="button secondary" disabled={data.page <= 1} onClick={() => onChange(data.page - 1)}>← {t('Назад')}</button>
      <span>{data.page} / {data.pages}</span>
      <button type="button" className="button secondary" disabled={data.page >= data.pages} onClick={() => onChange(data.page + 1)}>{t('Далее')} →</button>
    </div>}
  </Controls>;
}

const Controls = styled.nav`
  display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap;
  gap: 12px; padding: 16px 20px; border-top: 1px solid var(--desk-border);
  > div { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  @media (max-width: 480px) { padding: 14px; > div { width: 100%; justify-content: space-between; gap: 8px; } }
`;
