import styled, { keyframes } from 'styled-components';
import { t } from '@/lib/i18n';

const breathe = keyframes`from { opacity: .45; } to { opacity: 1; }`;

/** Shapes follow the ledger: payment title, supporting line and amount. */
export function SkeletonRows({ rows = 4, compact = false, label }: { rows?: number; compact?: boolean; label?: string }) {
  return <Rows role="status" aria-label={label ?? t('Загружаем…')} aria-busy="true" $compact={compact}>
    <span className="sr-only">{label ?? t('Загружаем…')}</span>
    <div aria-hidden="true">{Array.from({ length: rows }, (_, i) => <div className="skeleton-row" key={i}>
      {!compact && <SkeletonBar $width="42px" $height="42px" />}
      <div className="skeleton-copy"><SkeletonBar $width={i % 2 ? '58%' : '76%'} /><SkeletonBar $width={i % 2 ? '35%' : '46%'} $height="11px" /></div>
      <SkeletonBar $width="72px" $height="20px" />
    </div>)}</div>
  </Rows>;
}

export const SkeletonBar = styled.span<{ $width?: string; $height?: string }>`
  display: inline-block; flex-shrink: 0; max-width: 100%;
  width: ${({ $width = '100%' }) => $width}; height: ${({ $height = '16px' }) => $height};
  border-radius: 6px; vertical-align: middle;
  background: #e7e9ed;
  background: color-mix(in srgb, var(--desk-ink, #202126) 11%, var(--desk-surface, #fff));
  animation: ${breathe} 1.7s ease-in-out infinite alternate;
  @media (prefers-reduced-motion: reduce) { animation: none; }
`;

const Rows = styled.div<{ $compact: boolean }>`
  min-width: 0; width: 100%;
  .skeleton-row { display: grid; align-items: center; gap: 16px; grid-template-columns: ${({ $compact }) => $compact ? 'minmax(0, 1fr) auto' : '42px minmax(0, 1fr) auto'}; padding: ${({ $compact }) => $compact ? '17px 0' : '22px'}; min-height: ${({ $compact }) => $compact ? '64px' : '88px'}; }
  .skeleton-row + .skeleton-row { border-top: 1px solid var(--desk-border); }
  .skeleton-copy { min-width: 0; display: grid; gap: 11px; }
  @media (max-width: 600px) { .skeleton-row { gap: 12px; padding: ${({ $compact }) => $compact ? '16px 0' : '18px'}; } }
`;
