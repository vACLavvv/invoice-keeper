import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import styled, { css } from 'styled-components';

type Toast = { message: string; error: boolean } | null;
const ToastContext = createContext<(message: string, error?: boolean) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((message: string, error = false) => {
    clearTimeout(timer.current);
    setToast({ message, error });
    timer.current = setTimeout(() => setToast(null), 4500);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <Bubble role="status" aria-live="polite" $visible={!!toast} $error={!!toast?.error}>{toast?.message}</Bubble>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

const Bubble = styled.div<{ $visible: boolean; $error: boolean }>`
  position: fixed;
  right: 2.4rem;
  bottom: 2.4rem;
  z-index: 50;
  max-width: min(42rem, calc(100vw - 3.2rem));
  padding: 1.4rem 1.8rem;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.tile};
  color: #fff;
  font-weight: 600;
  box-shadow: 0 1.2rem 3.2rem rgba(0, 0, 0, 0.5);
  border-left: 0.4rem solid ${({ theme, $error }) => ($error ? theme.color.overdue : theme.color.accent)};
  transition: opacity 0.2s, transform 0.2s;
  ${({ $visible }) => ($visible ? css`opacity: 1; transform: none;` : css`opacity: 0; transform: translateY(1rem); pointer-events: none;`)}
  ${({ theme }) => theme.mobile} { right: 1.6rem; bottom: 1.6rem; }
`;
