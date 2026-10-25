import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { api, ApiError } from '@/lib/api';
import { t } from '@/lib/i18n';
import { Button, Muted, Notice } from '@/components/ui';

export default function ConfirmEmail() {
  const token = useRef('');
  const started = useRef(false);
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(false);
  async function confirm() {
    setStatus('loading'); setRetry(false);
    try {
      await api('/email/confirm', { method: 'POST', body: { token: token.current } });
      token.current = ''; setStatus('success');
    } catch (e) {
      setError((e as Error).message); setStatus('error');
      setRetry(e instanceof ApiError && (e.status === 0 || e.status >= 500 || e.status === 429));
    }
  }
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    token.current = new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '';
    window.history.replaceState(null, '', '/confirm-email');
    if (!token.current) { setError(t('Откройте эту страницу кнопкой «Подтвердить почту» из письма.')); setStatus('error'); return; }
    void confirm();
  }, []);
  return <Page><Head><title>{t('Подтверждение почты')} · Invoice Keeper</title><meta name="referrer" content="no-referrer" /><meta name="robots" content="noindex" /></Head>
    <Card>
      <Brand href="/login"><img src="/favicon.svg" width={32} height={32} alt="" />Invoice Keeper</Brand>
      <h1>{status === 'success' ? t('Почта подтверждена') : status === 'loading' ? t('Подтверждаем почту…') : t('Не удалось подтвердить почту')}</h1>
      {status === 'success' ? <p role="status">{t('Теперь сюда будут приходить напоминания по назначенным вам платежам. Настройки доступны в разделе «Аккаунт».')}</p> : status === 'error' ? <Notice $tone="error" role="alert">{error}</Notice> : <Muted role="status">{t('Это займёт несколько секунд.')}</Muted>}
      {retry && <Button type="button" onClick={confirm}>{t('Повторить подтверждение')}</Button>}
      {status !== 'loading' && <Link href="/account" className="button primary">{t('Перейти в аккаунт')} ↗</Link>}
    </Card>
  </Page>;
}

const Page = styled.main`min-height:100vh;display:grid;place-items:center;padding:24px;background:var(--bg);`;
const Card = styled.section`width:min(100%,520px);padding:40px;border:1px solid var(--line);border-radius:20px;background:var(--panel);display:grid;gap:22px;h1{font-size:clamp(24px,4vw,32px);line-height:1.2;margin:8px 0 0;}p{line-height:1.6;margin:0;}.button{justify-self:start;}@media(max-width:540px){padding:26px;}`;
const Brand = styled.a`display:flex;align-items:center;gap:10px;font-size:18px;font-weight:700;color:inherit;text-decoration:none;`;
