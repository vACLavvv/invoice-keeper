// Exercise the actual date-only UI helpers under different device timezones.
// This checks Node/Intl behaviour; it is not a browser or Safari visual test.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { transform, loadBindings } = require('next/dist/build/swc');
await loadBindings();
const source = await readFile(new URL('../lib/format.ts', import.meta.url), 'utf8');
const { code } = await transform(source, {
  filename: 'format.ts',
  jsc: { parser: { syntax: 'typescript' }, target: 'es2020' },
  module: { type: 'commonjs' },
});

const probe = `
  const assert = require('node:assert/strict');
  const vm = require('node:vm');
  const fs = require('node:fs');
  const exported = {};
  vm.runInNewContext(fs.readFileSync(0, 'utf8'), {
    exports: exported, Date, Intl,
    require: (name) => {
      assert.equal(name, './i18n');
      return { locale: () => 'en-GB', t: (s) => s, tp: () => '' };
    },
  });
  for (const iso of ['2026-01-31', '2024-02-29', '2026-03-29', '2026-10-25', '2026-12-31']) {
    const [year, month, day] = iso.split('-');
    assert.equal(exported.numericDate(iso), day + '/' + month + '/' + year, iso);
  }
  assert.equal(exported.date(null), '—');
  assert.equal(exported.shiftMonth('2026-12', 1), '2027-01');
  assert.equal(exported.shiftMonth('2026-01', -1), '2025-12');
  assert.equal(exported.monthRange('2024-02').to_date, '2024-02-29');
  assert.equal(exported.monthRange('2026-02').to_date, '2026-02-28');
  assert.equal(exported.monthRange('2026-03').to_date, '2026-03-31');
`;

for (const zone of ['UTC', 'Europe/Moscow', 'Europe/Berlin', 'Europe/Belgrade', 'Asia/Vladivostok', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
  test(`calendar days stay unchanged on a device in ${zone}`, () => {
    const result = spawnSync(process.execPath, ['-e', probe], {
      env: { ...process.env, TZ: zone }, input: code, encoding: 'utf8', timeout: 10_000,
    });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
  });
}
