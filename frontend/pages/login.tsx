import Head from 'next/head';
import { useEffect, useState, type FormEvent } from 'react';
import { Switches } from '@/components/Shell';
import { api, ApiError } from '@/lib/api';
import { t } from '@/lib/i18n';

// The sign-in page of the main branch: form on the left, illustration on the right.
// With admin two-factor sign-in the server answers code=two_factor_required and a code field appears.

/** Where to go after signing in: a page of this site from ?next=, otherwise the overview. */
function nextPage() {
  const next = new URLSearchParams(window.location.search).get('next') ?? '';
  return next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/';
}

export default function Login() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [needCode, setNeedCode] = useState(false);

  useEffect(() => {
    document.body.classList.add('login-page');
    return () => document.body.classList.remove('login-page');
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, FormDataEntryValue | null> = { username: data.get('username'), password: data.get('password') };
      if (needCode) body.code = data.get('code');
      await api('/auth/login', { method: 'POST', body });
      window.location.assign(nextPage());
    } catch (e) {
      const err = e as ApiError;
      if (err.code === 'two_factor_required') {
        setError(needCode ? err.message : null);
        setNeedCode(true);
      } else {
        setError(err.status === 401 ? t('Проверьте логин и пароль') : err.message);
      }
      setBusy(false);
    }
  }

  return (
    <main className="login-layout">
      <Head><title>{`${t('Вход')} · Invoice Keeper`}</title></Head>
      <section className="login-form-side">
        <div className="login-topbar">
          <a className="brand brand-dark" href="/login"><img src="/favicon.svg" alt="" width={37} height={37} /><span>invoice<span className="brand-light">keeper</span></span></a>
          <Switches />
        </div>
        <div className="login-content">
          <span className="eyebrow">{t('ВАШ ФИНАНСОВЫЙ ПОРЯДОК')}</span>
          <h1>{t('С возвращением.')}</h1>
          <p className="muted login-intro">{t('Разовые и регулярные платежи — в одном месте.')}<br />{t('Войдите, чтобы держать их под контролем.')}</p>
          <form id="login-form" onSubmit={submit}>
            <label htmlFor="username">{t('Логин')}</label>
            <input id="username" name="username" autoComplete="username" required maxLength={64} placeholder={t('Ваш логин')} autoFocus />
            <label htmlFor="password">{t('Пароль')}</label>
            <div className="password-wrap">
              <input id="password" name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" required maxLength={128} placeholder={t('Введите пароль')} />
              <button type="button" className="text-button" onClick={() => setVisible((v) => !v)} aria-label={visible ? t('Скрыть пароль') : t('Показать пароль')}>
                {visible ? t('Скрыть') : t('Показать')}
              </button>
            </div>
            {needCode && (
              <>
                <label htmlFor="code">{t('Код из приложения-аутентификатора')}</label>
                <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus placeholder="123 456" />
              </>
            )}
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button primary login-submit" type="submit" disabled={busy}>{busy ? t('Входим…') : t('Войти в панель')} <span aria-hidden="true">↗</span></button>
          </form>
          <p className="login-help">{t('Нет доступа? Попросите администратора')}<br />{t('создать для вас учётную запись.')}</p>
        </div>
        <p className="login-footer">Invoice Keeper <span>{t('Меньше рутины. Больше спокойствия.')}</span></p>
      </section>
      <section className="login-art" aria-label={t('Invoice Keeper напоминает о сроках и сохраняет историю оплат')}>
        <div className="art-top"><span className="small-dot" /> {t('ОДНИМ ДЕЛОМ МЕНЬШЕ')}</div>
        <h2>{t('Помним о платежах.')}<br /><em>{t('Вы — о главном.')}</em></h2>
        <div className="art-calendar">
          <div className="art-card-header"><span>{t('ПЛАТЕЖИ НА МЕСЯЦ')}</span><span>↗</span></div>
          <div className="art-amount">{t('Всё под контролем')}<span className="art-check">✓</span></div>
          <div className="art-pay">
            <span className="art-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7" /></svg></span>
            <span>{t('Аренда офиса')}<small>{t('Напомним за 3 дня')}</small></span><b>45 000 ₽</b>
          </div>
          <div className="art-pay">
            <span className="art-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 19a5 5 0 0 1-1-9.9A7 7 0 0 1 19 8a5.5 5.5 0 0 1-1 11H7Z" /></svg></span>
            <span>{t('Хостинг в USDT')}<small>{t('Кошелёк сверен со списком OFAC')}</small></span><b>24 $</b>
          </div>
          <div className="art-pay">
            <span className="art-icon">✓</span>
            <span>{t('Командная подписка')}<small>{t('История оплаты сохранена')}</small></span><span className="pill paid">{t('Оплачено')}</span>
          </div>
        </div>
        <div className="art-bottom"><span>01 /</span><p>{t('Сроки, статусы и напоминания.')}<br />{t('Одна понятная система для всей команды.')}</p></div>
      </section>
    </main>
  );
}
