import type { ReactNode } from 'react';
import styled, { css } from 'styled-components';
import type { Status } from '@/lib/format';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

export const Button = styled.button<{ $variant?: Variant; $small?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.8rem;
  min-height: ${({ $small }) => ($small ? '3.2rem' : '4.4rem')};
  padding: ${({ $small }) => ($small ? '0.5rem 1.4rem' : '1rem 2rem')};
  border-radius: ${({ theme }) => theme.radius.md};
  font-size: ${({ $small }) => ($small ? '1.3rem' : '1.4rem')};
  font-weight: 500;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s;
  ${({ theme, $variant = 'primary' }) => ({
    primary: css`
      background: ${theme.color.accent}; color: #fff;
      &:hover:not(:disabled) { background: ${theme.color.accentDeep}; }
    `,
    secondary: css`
      background: ${theme.color.tile}; color: ${theme.color.strong};
      &:hover:not(:disabled) { background: ${theme.color.tileHover}; }
    `,
    danger: css`
      background: ${theme.color.overdue}; color: #fff;
      &:hover:not(:disabled) { filter: brightness(0.92); }
    `,
    ghost: css`
      background: none; color: ${theme.color.accent}; padding-inline: 0.2rem; min-height: auto;
      &:hover:not(:disabled) { text-decoration: underline; }
    `,
  })[$variant]}
`;

/** Round chevron in a tile corner. */
export const Chevron = styled.span`
  width: 2.2rem;
  height: 2.2rem;
  flex-shrink: 0;
  display: inline-grid;
  place-items: center;
  border-radius: 50%;
  background: ${({ theme }) => theme.color.chevron};
  color: ${({ theme }) => theme.color.chevronText};
  font-size: 1.2rem;
  line-height: 1;
`;

export const IconButton = styled.button`
  width: 3.2rem;
  height: 3.2rem;
  display: inline-grid;
  place-items: center;
  border-radius: 50%;
  color: ${({ theme }) => theme.color.muted};
  font-size: 2.2rem;
  line-height: 1;
  &:hover { color: ${({ theme }) => theme.color.strong}; background: ${({ theme }) => theme.color.tile}; }
`;

/** Plain block; tables sit straight on the dark surface. */
export const Card = styled.section`
  display: grid;
  gap: 1.2rem;
  min-width: 0;
`;

export const Tile = styled.div<{ $interactive?: boolean }>`
  position: relative;
  display: grid;
  align-content: start;
  gap: 0.4rem;
  min-width: 0;
  padding: 1.6rem;
  border-radius: ${({ theme }) => theme.radius.lg};
  background: ${({ theme }) => theme.color.tile};
  overflow: hidden;
  transition: background 0.15s;
  ${({ $interactive, theme }) => $interactive && css`cursor: pointer; &:hover { background: ${theme.color.tileHover}; }`}
`;

export const TileTitle = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1.2rem;
  color: ${({ theme }) => theme.color.strong};
  font-weight: 500;
`;

/** The tilted turquoise sticker («free!», «-40% off»). */
export const Sticker = styled.span<{ $tilt?: number }>`
  display: inline-block;
  padding: 0.4rem 1rem;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.accent};
  color: #fff;
  font-style: italic;
  font-weight: 600;
  white-space: nowrap;
  transform: rotate(${({ $tilt = -6 }) => $tilt}deg);
  box-shadow: 0 0 0 0.2rem ${({ theme }) => theme.color.page};
`;

const statusColor = (status: Status | 'archived' | 'active') => css`
  ${({ theme }) => ({ paid: theme.color.paid, active: theme.color.paid, unpaid: theme.color.unpaid, overdue: theme.color.overdue, archived: theme.color.faint })[status]}
`;

/** Status as a dot and a word, like «● работает». */
export const Pill = styled.span<{ $status: Status | 'archived' | 'active' }>`
  display: inline-flex;
  align-items: center;
  gap: 0.8rem;
  white-space: nowrap;
  color: ${({ theme }) => theme.color.text};
  &::before { content: ''; flex-shrink: 0; width: 1rem; height: 1rem; border-radius: 50%; background: ${({ $status }) => statusColor($status)}; }
`;

export const Notice = styled.div<{ $tone?: 'info' | 'error' | 'warning' }>`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 1.2rem;
  padding: 1.4rem 1.8rem;
  border-radius: ${({ theme }) => theme.radius.md};
  line-height: 1.5;
  ${({ theme, $tone = 'info' }) => ({
    info: css`background: ${theme.color.tile}; color: ${theme.color.text}; box-shadow: inset 0.3rem 0 0 ${theme.color.accent};`,
    warning: css`background: ${theme.color.unpaidSoft}; color: ${theme.color.unpaid};`,
    error: css`background: ${theme.color.overdueSoft}; color: ${theme.color.overdue};`,
  })[$tone]}
`;

export const Empty = styled.div`
  padding: 4.8rem 2.4rem;
  text-align: center;
  color: ${({ theme }) => theme.color.muted};
  display: grid;
  justify-items: center;
  gap: 0.8rem;
  border-radius: ${({ theme }) => theme.radius.lg};
  border: 1px dashed ${({ theme }) => theme.color.line};
  b { color: ${({ theme }) => theme.color.strong}; font-size: 1.6rem; font-weight: 500; }
`;

export const TableWrap = styled.div`
  overflow-x: auto;
  table { width: 100%; border-collapse: collapse; min-width: 76rem; }
  th {
    text-align: left;
    font-size: 1.6rem;
    font-weight: 500;
    color: ${({ theme }) => theme.color.strong};
    padding: 1.2rem 1.4rem;
    border-bottom: 1px solid ${({ theme }) => theme.color.line};
  }
  td {
    padding: 1.1rem 1.4rem;
    font-size: 1.5rem;
    border-bottom: 1px solid ${({ theme }) => theme.color.line};
    vertical-align: middle;
  }
  tbody tr { transition: background 0.15s; }
  tbody tr:hover { background: ${({ theme }) => theme.color.hover}; }
`;

export const Muted = styled.span`
  color: ${({ theme }) => theme.color.muted};
`;

export const Amount = styled.span`
  white-space: nowrap;
  color: ${({ theme }) => theme.color.strong};
  small { margin-left: 0.4rem; color: ${({ theme }) => theme.color.muted}; font-size: inherit; }
`;

export const Field = styled.label`
  display: grid;
  gap: 0.6rem;
  font-size: 1.3rem;
  font-weight: 500;
  color: ${({ theme }) => theme.color.strong};
  small { font-weight: 400; color: ${({ theme }) => theme.color.muted}; }
`;

const control = css`
  width: 100%;
  min-height: 4.6rem;
  padding: 1rem 1.4rem;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme }) => theme.color.line};
  background: ${({ theme }) => theme.color.tile};
  color: ${({ theme }) => theme.color.strong};
  font-size: 1.5rem;
  outline: none;
  transition: border-color 0.15s;
  &::placeholder { color: ${({ theme }) => theme.color.faint}; }
  &:focus { border-color: ${({ theme }) => theme.color.accent}; }
`;

export const Input = styled.input`${control}`;
export const Select = styled.select`${control}`;
export const Textarea = styled.textarea`
  ${control}
  font-family: inherit;
  line-height: 1.5;
  resize: vertical;
`;

export const Row = styled.div<{ $gap?: number; $wrap?: boolean; $between?: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ $gap = 1.2 }) => $gap}rem;
  flex-wrap: ${({ $wrap }) => ($wrap ? 'wrap' : 'nowrap')};
  justify-content: ${({ $between }) => ($between ? 'space-between' : 'flex-start')};
`;

/** «🇩🇪 single-red  вирт. сервер»: name, then a muted kind. */
export const PaymentName = styled.div`
  display: flex;
  align-items: baseline;
  gap: 0.8rem;
  flex-wrap: wrap;
  b { color: ${({ theme }) => theme.color.strong}; font-weight: 400; }
  small { color: ${({ theme }) => theme.color.muted}; font-size: inherit; }
`;

export const CurrencyBadge = styled.span`
  align-self: center;
  flex-shrink: 0;
  width: 2.2rem;
  height: 1.6rem;
  display: inline-grid;
  place-items: center;
  border-radius: 0.3rem;
  background: ${({ theme }) => theme.color.tile};
  color: ${({ theme }) => theme.color.accent};
  font-size: 1.1rem;
  font-weight: 600;
`;

export const SectionTitle = styled.h2`
  font-size: 2.2rem;
  font-weight: 600;
  color: ${({ theme }) => theme.color.strong};
  text-transform: lowercase;
`;

/** Thin line drawings for tile illustrations, as in the service cards. */
export function Wire({ children, height = 14 }: { children: ReactNode; height?: number }) {
  return <WireBox style={{ height: `${height}rem` }}>{children}</WireBox>;
}

const WireBox = styled.div`
  position: relative;
  margin-top: 1.6rem;
  border: 1px solid ${({ theme }) => theme.color.faint};
  border-bottom: 0;
  border-radius: ${({ theme }) => theme.radius.sm} ${({ theme }) => theme.radius.sm} 0 0;
  color: ${({ theme }) => theme.color.muted};
  overflow: hidden;
`;
