// Checks translations: every t('…') key must exist in lib/en.ts, and no Russian text may stay
// outside t(). Usage: node scripts/i18n-check.mjs [--keys]  (--keys prints missing keys as JSON).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const files = ['pages', 'components', 'lib'].flatMap((dir) =>
  readdirSync(join(root, dir)).filter((f) => /\.tsx?$/.test(f) && f !== 'en.ts').map((f) => join(root, dir, f)));

const cyrillic = /[А-Яа-яЁё]/;
const key = /\bt\('((?:[^'\\]|\\.)*)'/g;
const pluralForms = /\btp\([^,]+,\s*\[([^\]]*)\]/g;
const enSource = readFileSync(join(root, 'lib', 'en.ts'), 'utf8');
const known = new Set([...enSource.matchAll(/^\s*'((?:[^'\\]|\\.)*)':/gm)].map((m) => m[1]));

const missing = new Set();
const loose = [];
for (const file of files) {
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    const code = line.trim();
    if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*') || code.startsWith('{/*') || code.includes('i18n-ignore')) return;
    for (const m of line.matchAll(key)) if (!known.has(m[1])) missing.add(m[1]);
    const rest = line.replace(key, '').replace(pluralForms, '').replace(/\/\*.*?\*\//g, '').replace(/\/\/.*$/, '');
    if (cyrillic.test(rest)) loose.push(`${file.slice(root.length)}:${i + 1}: ${code.slice(0, 140)}`);
  });
}

if (process.argv.includes('--keys')) {
  console.log(JSON.stringify([...missing], null, 1));
} else {
  if (loose.length) console.log('Русский текст вне t():\n' + loose.join('\n'));
  if (missing.size) console.log(`Нет перевода (${missing.size}):\n` + [...missing].join('\n'));
  if (!loose.length && !missing.size) console.log('i18n: ok');
  process.exitCode = loose.length || missing.size ? 1 : 0;
}
