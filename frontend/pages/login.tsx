import Head from 'next/head';
import { useState, type FormEvent } from 'react';
import styled, { css } from 'styled-components';
import { Logo, Switches } from '@/components/Shell';
import { Button, Field, Input, Notice } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { t } from '@/lib/i18n';
import { globe } from '@/styles/theme';

// The sign-in page is the light "landing": glass globe hero, white sheet with the form.
// With admin two-factor sign-in the server answers code=two_factor_required and a code field appears.
export default function Login() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [needCode, setNeedCode] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, FormDataEntryValue | null> = { username: data.get('username'), password: data.get('password') };
      if (needCode) body.code = data.get('code');
      await api('/auth/login', { method: 'POST', body });
      window.location.assign('/');
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
    <Page>
      <Head><title>{t('Вход')} · Invoice Keeper</title></Head>
      <Hero>
        <Top>
          <Brand><Logo dark size={32} /> invoice keeper</Brand>
          <TopRight><Switches compact /><Pill href="#login">{t('Войти')}</Pill></TopRight>
        </Top>
        <HeroText>
          <Wordmark>invoice keeper</Wordmark>
          <Tagline>{t('Платежи нового поколения')}</Tagline>
          <Button as="a" href="#login">{t('Попробовать')} <span aria-hidden="true">→</span></Button>
        </HeroText>
      </Hero>
      <Sheet>
        <Stats>
          <Stat><b>{t('3 дня')}</b><span>{t('напоминание в Telegram до срока')}</span></Stat>
          <Stat><b>{t('2 роли')}</b><span>{t('администратор и команда')}</span></Stat>
          <Stat><b>{t('3 валюты')}</b><span>{t('RUB · USD · EUR, без конвертации')}</span></Stat>
        </Stats>
        <Frame id="login">
          <Card>
            <h1>{t('Вход в панель')}</h1>
            <Lead>{t('Все регулярные платежи команды — в одном месте.')}</Lead>
            <form onSubmit={submit}>
              <fieldset disabled={busy}>
                <LightField>{t('Логин')}<LightInput name="username" autoComplete="username" required maxLength={64} placeholder={t('Ваш логин')} autoFocus /></LightField>
                <LightField>
                  {t('Пароль')}
                  <Password>
                    <LightInput name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" required maxLength={128} placeholder={t('Введите пароль')} />
                    <Button type="button" $variant="ghost" onClick={() => setVisible((v) => !v)} aria-label={visible ? t('Скрыть пароль') : t('Показать пароль')}>
                      {visible ? t('скрыть') : t('показать')}
                    </Button>
                  </Password>
                </LightField>
                {needCode && (
                  <LightField>
                    {t('Код из приложения-аутентификатора')}
                    <LightInput name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus placeholder="123 456" />
                  </LightField>
                )}
                {error && <Notice $tone="error" role="alert">{error}</Notice>}
                <Dark type="submit">{busy ? t('Входим…') : needCode ? t('Подтвердить') : t('Войти')}</Dark>
              </fieldset>
            </form>
            <Help>{t('Нет доступа? Попросите администратора создать для вас учётную запись.')}</Help>
          </Card>
        </Frame>
      </Sheet>
      <Footer>
        <span>© {new Date().getFullYear()} Invoice Keeper</span>
        <span>{t('Меньше рутины — больше спокойствия')}</span>
      </Footer>
    </Page>
  );
}

const TopRight = styled.div`
  display: flex;
  align-items: center;
  gap: 1.2rem;
`;

const light = css`color: ${({ theme }) => theme.light.ink};`;

const Page = styled.main`
  min-height: 100vh;
  background: ${({ theme }) => theme.light.page};
  ${light}
  color-scheme: light;
`;

const Hero = styled.section`
  position: relative;
  overflow: hidden;
  min-height: 72rem;
  padding: 2.4rem 2.6rem 14rem;
  ${globe}
  ${({ theme }) => theme.mobile} { min-height: 56rem; padding: 1.6rem 1.6rem 10rem; }
`;

const Top = styled.header`
  position: relative;
  z-index: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const Brand = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 1rem;
  font-size: 1.6rem;
  font-weight: 500;
`;

const Pill = styled.a`
  padding: 0.9rem 1.6rem;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.light.ink};
  color: #fff;
  font-weight: 600;
  &:hover { background: #2a2c30; }
`;

const HeroText = styled.div`
  position: relative;
  z-index: 1;
  display: grid;
  justify-items: center;
  gap: 2.4rem;
  margin-top: 20rem;
  text-align: center;
  ${({ theme }) => theme.mobile} { margin-top: 14rem; gap: 1.6rem; }
`;

const Wordmark = styled.div`
  font-size: 10rem;
  line-height: 0.9;
  font-weight: 800;
  letter-spacing: -0.06em;
  ${({ theme }) => theme.mobile} { font-size: 5.2rem; }
`;

const Tagline = styled.p`
  font-size: 3.8rem;
  font-weight: 400;
  letter-spacing: 0.01em;
  ${({ theme }) => theme.mobile} { font-size: 2.2rem; }
`;

const Sheet = styled.section`
  position: relative;
  z-index: 1;
  margin-top: -8rem;
  padding: 7.2rem 2.4rem 9.6rem;
  border-radius: ${({ theme }) => theme.radius.sheet} ${({ theme }) => theme.radius.sheet} 0 0;
  background: ${({ theme }) => theme.light.panel};
  ${({ theme }) => theme.mobile} { padding: 4.8rem 1.6rem 6.4rem; border-radius: 3.2rem 3.2rem 0 0; }
`;

const Stats = styled.div`
  max-width: 96rem;
  margin: 0 auto 6.4rem;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 2.4rem;
  text-align: center;
  ${({ theme }) => theme.mobile} { grid-template-columns: 1fr; margin-bottom: 4rem; }
`;

const Stat = styled.div`
  display: grid;
  gap: 0.4rem;
  b { font-size: 2.4rem; font-weight: 500; }
  span { color: ${({ theme }) => theme.light.muted}; }
`;

const Frame = styled.div`
  max-width: 52rem;
  margin: 0 auto;
  padding: 1.2rem;
  border-radius: 3.2rem;
  background: ${({ theme }) => theme.light.tile};
  scroll-margin-top: 4rem;
`;

const Card = styled.div`
  padding: 4rem;
  border-radius: 2.4rem;
  background: ${({ theme }) => theme.light.panel};
  h1 { font-size: 3.2rem; font-weight: 600; letter-spacing: -0.02em; }
  fieldset { border: 0; margin: 2.8rem 0 0; padding: 0; display: grid; gap: 1.6rem; }
  ${({ theme }) => theme.mobile} { padding: 2.4rem; }
`;

const Lead = styled.p`
  margin-top: 0.8rem;
  color: ${({ theme }) => theme.light.muted};
`;

const LightField = styled(Field)`${light}`;

const LightInput = styled(Input)`
  background: ${({ theme }) => theme.light.tile};
  border-color: transparent;
  ${light}
  &::placeholder { color: #a9adb3; }
  &:focus { background: ${({ theme }) => theme.light.panel}; }
`;

const Password = styled.div`
  position: relative;
  input { padding-right: 10rem; }
  button { position: absolute; right: 1.4rem; top: 50%; transform: translateY(-50%); }
`;

const Dark = styled(Button)`
  margin-top: 0.4rem;
  background: ${({ theme }) => theme.light.ink};
  &:hover:not(:disabled) { background: #2a2c30; }
`;

const Help = styled.p`
  margin-top: 2rem;
  font-size: 1.3rem;
  color: ${({ theme }) => theme.light.muted};
`;

const Footer = styled.footer`
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1.2rem;
  padding: 1.8rem 2.6rem;
  background: ${({ theme }) => theme.light.ink};
  color: #9a9ea6;
  font-size: 1.3rem;
`;
