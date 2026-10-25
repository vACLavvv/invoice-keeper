import type { ReactNode } from 'react';
import styled, { css } from 'styled-components';
import type { Status } from '@/lib/format';

// Building blocks in the workspace design of the main branch: each one renders the class names
// that styles/workspace already styles (button, pill, notice, ledger, form-field…), so light and
// dark themes come from those stylesheets. Only what they lack is added here.

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const buttonClass = (variant: Variant, small?: boolean) =>
  variant === 'ghost' ? 'text-button' : `button ${variant}${small ? ' small' : ''}`;

export const Button = styled.button.attrs<{ $variant?: Variant; $small?: boolean }>(({ $variant = 'primary', $small, className }) => ({
  className: [buttonClass($variant, $small), className].filter(Boolean).join(' '),
}))<{ $variant?: Variant; $small?: boolean }>``;

/** Arrow at the end of a clickable row. */
export const Chevron = styled.span.attrs({ className: 'work-item-arrow', children: '›' })``;

export const IconButton = styled.button.attrs({ className: 'icon-button' })``;

export const Card = styled.section`
  display: grid;
  gap: 12px;
  min-width: 0;
`;

/** A white panel with a thin border: the workspace card. */
export const Tile = styled.div<{ $interactive?: boolean }>`
  position: relative;
  display: grid;
  align-content: start;
  gap: 6px;
  min-width: 0;
  padding: 22px;
  border: 1px solid var(--line);
  border-radius: var(--desk-radius, 20px);
  background: var(--panel);
  color: var(--ink);
  overflow-wrap: anywhere;
  overflow: hidden;
  transition: border-color 0.16s;
  @media (max-width: 600px) { padding: 18px; }
  ${({ $interactive }) => $interactive && css`cursor: pointer; &:hover { border-color: #a8b9ce; }`}
`;

export const TileTitle = styled.div`
  display: block;
  font-size: var(--text-body);
  font-weight: 550;
  color: var(--ink);
  /* Section names were lowercase in the old design; the workspace capitalizes them. */
  &::first-letter { text-transform: uppercase; }
  & > * { float: right; margin-left: 12px; }
`;

/** Small label next to a title («разовый», «новое»). */
export const Sticker = styled.span<{ $tilt?: number }>`
  display: inline-block;
  padding: 3px 8px;
  border-radius: 7px;
  background: var(--cyan-soft);
  color: var(--apple-blue);
  font-size: var(--text-caption);
  font-weight: 550;
  white-space: nowrap;
`;

/** Status chip: paid, unpaid, overdue, archived (active looks like paid). */
export const Pill = styled.span.attrs<{ $status: Status | 'archived' | 'active' }>(({ $status }) => ({
  className: `pill ${$status === 'active' ? 'paid' : $status}`,
}))<{ $status: Status | 'archived' | 'active' }>``;

export const Notice = styled.div.attrs<{ $tone?: 'info' | 'error' | 'warning' }>(({ $tone = 'info' }) => ({
  className: `notice${$tone === 'info' ? '' : ' notice-' + $tone}`,
}))<{ $tone?: 'info' | 'error' | 'warning' }>`
  flex-wrap: wrap;
  margin-bottom: 0;
`;

export const Empty = styled.div.attrs({ className: 'empty-state' })``;

/** A table inside the white ledger panel; on phones rows become cards (see extras.css). */
export const TableWrap = styled.div.attrs({ className: 'ledger table-wrap' })``;

export const Muted = styled.span`
  color: var(--apple-secondary);
`;

export const Amount = styled.span.attrs({ className: 'amount' })`
  white-space: nowrap;
  font-weight: 550;
  font-variant-numeric: tabular-nums;
  small { margin-left: 3px; color: var(--apple-secondary); font-size: var(--text-caption); font-weight: 400; }
`;

/** Label with its control inside: «form-field» of the workspace forms. */
export const Field = styled.label.attrs({ className: 'form-field form-label' })``;

export const Input = styled.input``;
export const Select = styled.select``;
export const Textarea = styled.textarea`
  font-family: inherit;
  line-height: 1.5;
  resize: vertical;
`;

export const Row = styled.div<{ $gap?: number; $wrap?: boolean; $between?: boolean }>`
  display: flex;
  min-width: 0;
  align-items: center;
  gap: ${({ $gap = 1.2 }) => $gap * 10}px;
  flex-wrap: ${({ $wrap }) => ($wrap ? 'wrap' : 'nowrap')};
  justify-content: ${({ $between }) => ($between ? 'space-between' : 'flex-start')};
  > * { min-width: 0; }
  @media (max-width: 600px) { flex-wrap: wrap; }
`;

/** Payment title with a muted second line, as in the ledger. */
export const PaymentName = styled.div.attrs({ className: 'payment-name' })``;

export const CurrencyBadge = styled.span.attrs({ className: 'payment-icon' })``;

export const SectionTitle = styled.h2.attrs({ className: 'section-title' })``;

/** Kept for pages that still draw a frame around an illustration. */
export function Wire({ children, height = 14 }: { children: ReactNode; height?: number }) {
  return <WireBox style={{ height: `${height * 10}px` }}>{children}</WireBox>;
}

const WireBox = styled.div`
  position: relative;
  margin-top: 16px;
  border: 1px solid var(--line);
  border-bottom: 0;
  border-radius: 12px 12px 0 0;
  color: var(--apple-secondary);
  overflow: hidden;
`;
