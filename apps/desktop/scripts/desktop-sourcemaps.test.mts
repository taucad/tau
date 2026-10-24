/**
 * Purpose: Verify map upload precedes packaging and cannot mutate cached build output.
 * Environment: Node 24+, temporary fixture files; no network or real credentials.
 * Usage: pnpm nx run desktop:test-sourcemaps
 * Exit codes: 0 on success; nonzero on regression.
 */
import assert from 'node:assert/strict';
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { test } from 'node:test';

// oxlint-disable-next-line no-restricted-imports -- Operational script under test.
import { uploadDesktopSourceMaps } from './desktop-sourcemaps.mjs';

await test('staged debug IDs and maps upload together without altering cached bundles', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tau-desktop-maps-'));
  const previous = process.env['SENTRY_AUTH_TOKEN'];
  try {
    const source = join(root, 'source');
    const staged = join(root, 'staged');
    await mkdir(join(source, 'main'), { recursive: true });
    await writeFile(join(source, 'main/index.js'), 'original');
    await writeFile(join(source, 'main/index.js.map'), '{}');
    await cp(source, staged, { recursive: true });
    await rm(join(staged, 'main/index.js.map'));
    const cli = join(root, 'sentry-cli');
    await writeFile(
      cli,
      `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const stage = process.argv.at(-1);
const bundle = path.join(stage, 'main/index.js');
if (process.argv[3] === 'inject') fs.appendFileSync(bundle, '\\n// debugId fixture');
else {
  if (!fs.readFileSync(bundle, 'utf8').includes('debugId fixture') || !fs.existsSync(bundle + '.map')) process.exit(2);
  fs.writeFileSync(path.join(stage, 'uploaded'), 'true');
}
`,
    );
    await chmod(cli, 0o700);
    delete process.env['SENTRY_AUTH_TOKEN'];
    await assert.rejects(uploadDesktopSourceMaps(source, staged, cli), /SENTRY_AUTH_TOKEN is required/u);
    assert.equal(await readFile(join(staged, 'main/index.js'), 'utf8'), 'original');
    process.env['SENTRY_AUTH_TOKEN'] = 'test-only';
    await uploadDesktopSourceMaps(source, staged, cli);
    assert.equal(await readFile(join(staged, 'uploaded'), 'utf8'), 'true');
    assert.match(await readFile(join(staged, 'main/index.js'), 'utf8'), /debugId fixture/u);
    assert.equal(await readFile(join(source, 'main/index.js'), 'utf8'), 'original');
    await assert.rejects(readFile(join(staged, 'main/index.js.map')), { code: 'ENOENT' });
    await writeFile(cli, `#!${process.execPath}\nprocess.exit(1);\n`);
    await assert.rejects(uploadDesktopSourceMaps(source, staged, cli));
    await assert.rejects(readFile(join(staged, 'main/index.js.map')), { code: 'ENOENT' });
  } finally {
    if (previous === undefined) {
      delete process.env['SENTRY_AUTH_TOKEN'];
    } else {
      process.env['SENTRY_AUTH_TOKEN'] = previous;
    }
    await rm(root, { recursive: true, force: true });
  }
});
