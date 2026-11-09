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
import { uploadDesktopSourceMaps, uploadRendererSourceMaps } from './desktop-sourcemaps.mjs';

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

await test('renderer chunks gain debug ids from a private copy while verbatim hosts and the build stay untouched', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tau-renderer-maps-test-'));
  const previous = process.env['SENTRY_AUTH_TOKEN'];
  try {
    const client = join(root, 'client');
    const packaged = join(root, 'packaged');
    await mkdir(join(client, 'assets'), { recursive: true });
    await mkdir(join(client, 'csharp-language/abc'), { recursive: true });
    await writeFile(join(client, 'assets/root.js'), 'chunk');
    await writeFile(join(client, 'assets/root.js.map'), '{}');
    await writeFile(join(client, 'csharp-language/abc/dotnet.js'), 'verbatim');
    await writeFile(join(client, 'csharp-language/abc/dotnet.js.map'), '{}');
    await cp(client, packaged, { recursive: true });
    await rm(join(packaged, 'assets/root.js.map'));
    await rm(join(packaged, 'csharp-language/abc/dotnet.js.map'));
    const uploads = join(root, 'uploads');
    const cli = join(root, 'sentry-cli');
    await writeFile(
      cli,
      `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const stage = process.argv.at(-1);
const chunk = path.join(stage, 'assets/root.js');
if (fs.existsSync(path.join(stage, 'csharp-language'))) process.exit(3);
if (process.argv[3] === 'inject') fs.appendFileSync(chunk, '\\n// debugId fixture');
else {
  if (!fs.readFileSync(chunk, 'utf8').includes('debugId fixture') || !fs.existsSync(chunk + '.map')) process.exit(2);
  fs.writeFileSync(${JSON.stringify(uploads)}, stage);
}
`,
    );
    await chmod(cli, 0o700);
    delete process.env['SENTRY_AUTH_TOKEN'];
    await assert.rejects(uploadRendererSourceMaps(client, packaged, cli), /SENTRY_AUTH_TOKEN is required/u);
    process.env['SENTRY_AUTH_TOKEN'] = 'test-only';
    await uploadRendererSourceMaps(client, packaged, cli);
    const stage = await readFile(uploads, 'utf8');
    await assert.rejects(readFile(join(stage, 'assets/root.js')), { code: 'ENOENT' });
    assert.match(await readFile(join(packaged, 'assets/root.js'), 'utf8'), /debugId fixture/u);
    assert.equal(await readFile(join(client, 'assets/root.js'), 'utf8'), 'chunk');
    assert.equal(await readFile(join(packaged, 'csharp-language/abc/dotnet.js'), 'utf8'), 'verbatim');
    await assert.rejects(readFile(join(packaged, 'assets/root.js.map')), { code: 'ENOENT' });
    await rm(join(client, 'assets/root.js.map'));
    await assert.rejects(uploadRendererSourceMaps(client, packaged, cli), /renderer source maps are missing/u);
  } finally {
    if (previous === undefined) {
      delete process.env['SENTRY_AUTH_TOKEN'];
    } else {
      process.env['SENTRY_AUTH_TOKEN'] = previous;
    }
    await rm(root, { recursive: true, force: true });
  }
});
