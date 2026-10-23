import Head from 'next/head';
import Link from 'next/link';
import styled from 'styled-components';

export default function NotFound() {
  return (
    <Page>
      <Head><title>Страница не найдена · Invoice Keeper</title></Head>
      <Ghost aria-hidden="true">404</Ghost>
      <h1>такой страницы нет</h1>
      <p>Возможно, ссылка устарела. Вернитесь к платежам.</p>
      <Link href="/">на главную →</Link>
    </Page>
  );
}

const Page = styled.main`
  min-height: 100vh;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 1.2rem;
  padding: 1.6rem;
  text-align: center;
  h1 { font-size: 2.6rem; font-weight: 600; color: ${({ theme }) => theme.color.strong}; }
  p { color: ${({ theme }) => theme.color.muted}; }
  a {
    margin-top: 1.2rem;
    padding: 1rem 2rem;
    border-radius: ${({ theme }) => theme.radius.md};
    background: ${({ theme }) => theme.color.accent};
    color: #fff;
    font-weight: 500;
  }
`;

const Ghost = styled.div`
  font-size: 16rem;
  line-height: 0.9;
  font-weight: 900;
  font-style: italic;
  color: ${({ theme }) => theme.color.ghost};
`;
