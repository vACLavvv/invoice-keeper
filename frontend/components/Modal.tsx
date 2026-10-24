import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import styled from 'styled-components';
import { t } from '@/lib/i18n';
import { IconButton, Notice, Row } from './ui';

type Props = { title: string; eyebrow?: string; wide?: boolean; onClose: () => void; children: ReactNode };

/** Native <dialog>: focus trap, Esc and the backdrop come from the browser. */
export function Modal({ title, eyebrow = 'INVOICE KEEPER', wide = false, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <Dialog
      ref={ref}
      $wide={wide}
      aria-labelledby="modal-title"
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
    >
      <Header>
        <div>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2 id="modal-title">{title}</h2>
        </div>
        <IconButton type="button" aria-label={t('Закрыть')} onClick={onClose}>×</IconButton>
      </Header>
      {children}
    </Dialog>
  );
}

type FormProps = {
  onSubmit: (data: FormData, submitter: HTMLButtonElement | null) => Promise<void>;
  actions: ReactNode;
  children?: ReactNode;
};

/** A form that disables itself while saving and shows the API error inline. */
export function ModalForm({ onSubmit, actions, children }: FormProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(new FormData(event.currentTarget), submitter);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <Form onSubmit={submit}>
      <fieldset disabled={busy}>
        {children}
        {error && <Notice $tone="error" role="alert">{error}</Notice>}
        <Row $gap={1} $wrap $between>{actions}</Row>
      </fieldset>
    </Form>
  );
}

const Dialog = styled.dialog<{ $wide: boolean }>`
  width: min(${({ $wide }) => ($wide ? "88rem" : "52rem")}, calc(100vw - 3.2rem));
  max-height: calc(100dvh - 3.2rem);
  overflow-y: auto;
  padding: 2.8rem;
  border: 1px solid ${({ theme }) => theme.color.line};
  border-radius: ${({ theme }) => theme.radius.xl};
  background: ${({ theme }) => theme.color.surface};
  color: ${({ theme }) => theme.color.text};
  box-shadow: 0 2.4rem 6.4rem ${({ theme }) => theme.color.shadow};
  &::backdrop { background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(0.3rem); }
  h2 { font-size: 2.4rem; font-weight: 600; text-transform: lowercase; color: ${({ theme }) => theme.color.strong}; }
  ${({ theme }) => theme.mobile} { padding: 2rem; }
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1.6rem;
  margin-bottom: 2.4rem;
`;

/** Faded italic caption, the small sibling of the page's ghost title. */
export const Eyebrow = styled.div`
  font-size: 1.6rem;
  font-weight: 900;
  font-style: italic;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.ghost};
  margin-bottom: 0.2rem;
`;

const Form = styled.form`
  fieldset { border: 0; margin: 0; padding: 0; min-width: 0; display: grid; gap: 1.8rem; }
`;

export const FormRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 14rem;
  gap: 1.2rem;
  ${({ theme }) => theme.mobile} { grid-template-columns: 1fr; }
`;

export const InfoBox = styled.div`
  padding: 1.4rem 1.6rem;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.tile};
  color: ${({ theme }) => theme.color.muted};
  line-height: 1.6;
  b { color: ${({ theme }) => theme.color.strong}; font-weight: 500; }
`;
