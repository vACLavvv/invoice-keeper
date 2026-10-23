// Copies the static export into ../web/app, which the Go binary embeds.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../out', import.meta.url));
const target = fileURLToPath(new URL('../../web/app', import.meta.url));
if (!existsSync(source)) throw new Error('Нет папки out: сначала выполните next build');
rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
console.log('Панель скопирована в web/app');
