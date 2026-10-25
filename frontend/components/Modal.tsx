import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import { t } from '@/lib/i18n';

type Props = { title: string; eyebrow?: string; wide?: boolean; onClose: () => void; children: ReactNode };

/** Native <dialog> in the workspace style: focus trap, Esc and the backdrop come from the browser. */
export function Modal({ title, eyebrow = 'INVOICE KEEPER', wide = false, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <dialog
      ref={ref}
      className={`workspace-dialog${wide ? ' wide' : ''}`}
      aria-labelledby="modal-title"
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
    >
      <div className="modal-content">
        <div className="modal-header">
          <div>
            <span className="eyebrow">{eyebrow}</span>
            <h2 id="modal-title">{title}</h2>
          </div>
          <button type="button" className="icon-button" aria-label={t('Закрыть')} onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </dialog>,
    document.body,
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
    <form onSubmit={submit}>
      <fieldset className="modal-fieldset" disabled={busy}>
        <div className="modal-form">
          {children}
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="modal-actions">{actions}</div>
        </div>
      </fieldset>
    </form>
  );
}

/** Kept for callers that show a caption above a title. */
export const Eyebrow = styled.span.attrs({ className: 'eyebrow' })``;

export const FormRow = styled.div.attrs({ className: 'form-row' })``;

export const InfoBox = styled.div.attrs({ className: 'form-info' })`
  a { color: var(--apple-blue); word-break: break-all; }
`;
