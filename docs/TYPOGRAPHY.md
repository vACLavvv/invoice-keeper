# Workspace typography

The workspace uses the self-hosted Inter variable font already bundled with the application. `frontend/styles/workspace/typography.css` is imported last and owns the shared text scale; the 10px rem base remains for existing styled-component geometry.

- Body: 15px, rising to 16px on screens at least 1600px wide. Navigation: 14px, rising to 15px.
- Descriptions and metadata have explicit sizes and line heights; payment amounts and dates use tabular numerals. Other text uses standard Inter glyphs.
- Form inputs use 16px on touch devices and smaller viewports. Focus rings remain visible, and mobile primary controls have 44px targets.
- The sidebar menu scrolls independently on short screens. The existing tablet icon navigation and mobile horizontal navigation remain available.
- Long monetary values retain their existing reduced-size variants. Both themes use the same scale.

## Validation

TypeScript, translation validation, Next.js static export, and all 99 Go tests with the race detector passed. The overview was checked at 1366×768, 1920×1080, 2560×1440, 1024×768, 768×1024, 390×844, and 320×740. Payment cards, the new-payment dialog, account, help, recurring payments, calendar, budget, and activity were also checked at 320px without document overflow. Mobile form text is 16px. The dark theme was checked at 1280×800 without browser warnings or errors.

The static export retains the preceding release’s immutable assets so tabs already open during deployment can still load their original chunks. The next frontend export normally replaces `web/app`; preserve the preceding release’s missing `_next/static` assets again when preparing another rolling update.

No backend, database schema, API, environment, or runtime dependencies changed.
