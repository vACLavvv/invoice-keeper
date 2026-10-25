import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import styled from 'styled-components';
import { t } from './i18n';

type Action = { label: string; onClick: () => Promise<void> };
type Toast = { id: number; message: string; error: boolean; action?: Action; busy?: boolean };
const ToastContext = createContext<(message: string, error?: boolean, action?: Action) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const [actions, setActions] = useState<Toast[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const nextID = useRef(0);
  const running = useRef(new Set<number>());
  useEffect(() => () => clearTimeout(timer.current), []);
  const show = useCallback((message: string, error = false, action?: Action) => {
    const item = { id: ++nextID.current, message, error, action };
    if (action) {
      // Keep each undo available until used or dismissed, including after navigation.
      setActions((items) => [...items, item]);
    } else {
      clearTimeout(timer.current);
      setToast(item);
      timer.current = setTimeout(() => setToast(null), 4500);
    }
  }, []);
  const dismiss = (id: number) => setActions((items) => items.filter((item) => item.id !== id));
  async function run(item: Toast) {
    if (!item.action || running.current.has(item.id)) return;
    running.current.add(item.id);
    setActions((items) => items.map((entry) => entry.id === item.id ? { ...entry, busy: true } : entry));
    try {
      await item.action.onClick();
      dismiss(item.id);
    } catch (error) {
      // Preserve the action on failure so a network error can be retried.
      setActions((items) => items.map((entry) => entry.id === item.id
        ? { ...entry, busy: false, error: true, message: (error as Error).message } : entry));
    } finally {
      running.current.delete(item.id);
    }
  }
  return (
    <ToastContext.Provider value={show}>
      {children}
      <Stack aria-live="polite" aria-relevant="additions text">
        {[...actions, ...(toast ? [toast] : [])].map((item) => (
          <Bubble key={item.id} role="status" $error={item.error}>
            <span>{item.message}</span>
            {item.action && <div>
              <button type="button" disabled={item.busy} onClick={() => run(item)}>{item.busy ? t('Восстанавливаем…') : item.action.label}</button>
              <button type="button" disabled={item.busy} aria-label={t('Закрыть уведомление')} onClick={() => dismiss(item.id)}>×</button>
            </div>}
          </Bubble>
        ))}
      </Stack>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

const Stack = styled.div`
  position: fixed;
  right: 2.4rem;
  bottom: 2.4rem;
  z-index: 50;
  display: grid;
  gap: 0.8rem;
  max-width: min(46rem, calc(100vw - 3.2rem));
  max-height: 45vh;
  overflow: auto;
  ${({ theme }) => theme.mobile} { right: 1.6rem; bottom: calc(1.6rem + env(safe-area-inset-bottom)); }
`;
const Bubble = styled.div<{ $error: boolean }>`
  padding: 1.4rem 1.8rem;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.tile};
  color: ${({ theme }) => theme.color.strong};
  font-weight: 600;
  box-shadow: 0 1.2rem 3.2rem ${({ theme }) => theme.color.shadow};
  border-left: 0.4rem solid ${({ theme, $error }) => ($error ? theme.color.overdue : theme.color.accent)};
  overflow-wrap: anywhere;
  div { display: flex; justify-content: space-between; gap: 1rem; margin-top: 0.8rem; }
  button { background: transparent; color: ${({ theme }) => theme.color.accent}; border: 0; padding: 0.5rem; font: inherit; cursor: pointer; }
  button:disabled { opacity: 0.6; cursor: wait; }
`;
