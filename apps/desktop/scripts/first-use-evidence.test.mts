/** Regression checks for signed-addon selection, structured reports and scoped policy evidence. */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
// oxlint-disable-next-line no-restricted-imports -- Operational scripts are outside the app's source alias.
import { appendCell, policyEvidence, summarize } from './first-use-evidence.mjs';

const scratch = () => mkdtempSync(join(tmpdir(), 'tau-first-use-test-'));
const sample = '10:00:00 pid 42 parent 41 (/test/Tau.app/Contents/MacOS/Tau): python3';
const policy = (log: string) => policyEvidence({ log, samples: sample, app: '/test/Tau.app', store: '/test/payloads' });

await test('should preserve multiline and tabbed failures as one JSON cell and one Markdown row', () => {
  const directory = scratch();
  try {
    const detail = 'Export failed:\n  Python exited (SIGKILL).\nPicoGK\tfailed | again';
    appendCell(join(directory, 'cells.jsonl'), { name: 'negative', verdict: 'PASS', detail });
    const cells = summarize(directory);
    assert.equal(cells.length, 7);
    assert.deepEqual(
      cells.find(({ name }) => name === 'negative'),
      { name: 'negative', verdict: 'PASS', detail },
    );
    assert.equal(cells.filter(({ verdict }) => verdict === 'FAIL').length, 6);
    const markdown = readFileSync(join(directory, 'summary.md'), 'utf8');
    assert.equal(markdown.trim().split('\n').length, 9);
    assert.ok(markdown.includes('Export failed:<br>'));
    assert.ok(markdown.includes(String.raw`failed \| again`));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

await test('should emit a failing complete report when the run aborts before preparation', () => {
  const directory = scratch();
  try {
    appendCell(join(directory, 'cells.jsonl'), { name: 'facts', verdict: 'PASS', detail: 'notarized' });
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL('first-use-evidence.mts', import.meta.url)), 'summary', directory],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 1, result.stderr);
    const cells = JSON.parse(readFileSync(join(directory, 'cells.json'), 'utf8')) as Array<{
      name: string;
      verdict: string;
    }>;
    assert.deepEqual(
      cells.map(({ name }) => name),
      ['facts', 'download', 'quarantine', 'ready', 'syspolicy', 'negative', 'golden'],
    );
    assert.equal(cells.filter(({ verdict }) => verdict === 'FAIL').length, 6);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

await test('should ignore quarantine XPC plumbing rather than report it as a displayed alert', () => {
  const evidence = policy(
    '2026-10-24 CoreServicesUIAgent[7:abc] [com.apple.xpc:connection] activating connection: name=com.apple.coreservices.quarantine-resolver.peer[42].abc',
  );
  assert.equal(evidence.relevant.length, 1);
  assert.deepEqual(evidence.failures, []);
  assert.deepEqual(evidence.uiAlerts, []);
});

await test('should detect attributed refusal without matching a PID prefix or launchd', () => {
  const evidence = policy(
    'syspolicyd[8:abc] pid 42 denied\nsyspolicyd[8:abc] pid 420 rejected\nsyspolicyd[8:abc] pid 1 blocked',
  );
  assert.deepEqual(evidence.pids, ['42', '41']);
  assert.deepEqual(evidence.failures, ['syspolicyd[8:abc] pid 42 denied']);
});

await test('should retain both attributed alerts and unattributed UI alerts for fail-closed assessment', () => {
  const evidence = policy(
    'CoreServicesUIAgent[7:abc] Window <_NSAlertPanel: 0x1> ordered front\nsyspolicyd[8:abc] /test/payloads/python rejected',
  );
  assert.equal(evidence.uiAlerts.length, 1);
  assert.deepEqual(evidence.failures, ['syspolicyd[8:abc] /test/payloads/python rejected']);
});

await test('should not accept a policy log command failure as an empty successful window', () => {
  const directory = scratch();
  try {
    writeFileSync(join(directory, 'cells.jsonl'), '');
    writeFileSync(join(directory, 'syspolicy-log.txt'), 'log: permission denied');
    for (const kernel of ['build123d', 'picogk']) {
      writeFileSync(join(directory, `ps-${kernel}.txt`), sample);
    }
    execFileSync(process.execPath, [
      fileURLToPath(new URL('first-use-evidence.mts', import.meta.url)),
      'policy',
      directory,
      '/test/Tau.app',
      '/test/payloads',
      '1',
    ]);
    const cell = JSON.parse(readFileSync(join(directory, 'cells.jsonl'), 'utf8')) as {
      verdict: string;
      detail: string;
    };
    assert.equal(cell.verdict, 'FAIL');
    assert.match(cell.detail, /log exit 1/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

const addonFixture = (directory: string) => {
  const executable = join(directory, 'Tau.app/Contents/MacOS/Tau');
  const unpacked = join(directory, 'Tau.app/Contents/Resources/app.asar.unpacked');
  const local = join(directory, 'project/node_modules/@img/sharp-darwin-arm64');
  const filename = 'sharp-darwin-arm64-0.35.5.node';
  mkdirSync(dirname(executable), { recursive: true });
  writeFileSync(executable, 'fixture');
  mkdirSync(unpacked, { recursive: true });
  mkdirSync(join(local, 'lib'), { recursive: true });
  writeFileSync(join(local, 'package.json'), JSON.stringify({ exports: { './sharp.node': './index.cjs' } }));
  writeFileSync(join(local, 'index.cjs'), `module.exports = require.resolve('./lib/${filename}');`);
  writeFileSync(join(local, 'lib', filename), 'unsigned fixture');
  return { executable, unpacked, filename, local };
};

const resolveAddon = (directory: string, executable: string) =>
  spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `
  import { createRequire } from 'node:module';
  Object.defineProperty(process, 'execPath', { value: ${JSON.stringify(executable)} });
  await import(${JSON.stringify(new URL('first-use-native-addons.mts', import.meta.url).href)});
  const require = createRequire(${JSON.stringify(join(directory, 'project/entry.cjs'))});
  console.log(require('@img/sharp-darwin-arm64/sharp.node'));
`,
    ],
    { encoding: 'utf8' },
  );

await test('should select only the matching addon inside the release app without changing the checkout addon', () => {
  const directory = scratch();
  try {
    const fixture = addonFixture(directory);
    const signed = join(fixture.unpacked, fixture.filename);
    writeFileSync(signed, 'signed fixture');
    const result = resolveAddon(directory, fixture.executable);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), realpathSync(signed));
    assert.equal(readFileSync(join(fixture.local, 'lib', fixture.filename), 'utf8'), 'unsigned fixture');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

await test('should refuse a missing exact addon version instead of using another version', () => {
  const directory = scratch();
  try {
    const fixture = addonFixture(directory);
    writeFileSync(join(fixture.unpacked, 'sharp-darwin-arm64-0.35.4.node'), 'wrong version');
    const result = resolveAddon(directory, fixture.executable);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Expected one release-signed sharp-darwin-arm64-0\.35\.5\.node.*found 0/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

await test('should refuse an addon symlink that escapes the signed app', () => {
  const directory = scratch();
  try {
    const fixture = addonFixture(directory);
    symlinkSync(join(fixture.local, 'lib', fixture.filename), join(fixture.unpacked, fixture.filename));
    const result = resolveAddon(directory, fixture.executable);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Release addon escapes the signed app/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
