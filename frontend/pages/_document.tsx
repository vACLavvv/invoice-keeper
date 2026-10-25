import Document, { Head, Html, Main, NextScript, type DocumentContext, type DocumentInitialProps } from 'next/document';
import { ServerStyleSheet } from 'styled-components';

// Collects styled-components CSS into the exported HTML, so pages render styled before JS runs.
export default class AppDocument extends Document {
  static async getInitialProps(ctx: DocumentContext): Promise<DocumentInitialProps> {
    const sheet = new ServerStyleSheet();
    const renderPage = ctx.renderPage;
    try {
      ctx.renderPage = () => renderPage({ enhanceApp: (App) => (props) => sheet.collectStyles(<App {...props} />) });
      const initialProps = await Document.getInitialProps(ctx);
      return { ...initialProps, styles: [initialProps.styles, sheet.getStyleElement()] };
    } finally {
      sheet.seal();
    }
  }

  render() {
    return (
      <Html lang="ru">
        <Head>
          <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
          <link rel="manifest" href="/manifest.webmanifest" />
          <meta name="theme-color" content="#0b0b0f" />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
