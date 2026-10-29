#!/usr/bin/env node
/** Purpose: Admit the real package producer's metadata in all native qualification observers. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
/* oxlint-disable no-restricted-imports -- Cross-driver package producer contract. */
import { assertQualificationConsumerScope, assertQualificationSource } from './qualification-candidates.mjs';
import { desktopManifestFields } from './runtime-stage.mjs';
import { windowsQualificationPackageSchema } from './qualification-windows.mjs';
import { linuxQualificationPackageSchema } from './qualification-linux.mjs';
import { macosQualificationPackageSchema } from './qualification-macos.mjs';
/* oxlint-enable no-restricted-imports */
const priorSource = process.env['TAU_DESKTOP_SOURCE_SHA'];
const priorTag = process.env['TAU_DESKTOP_RELEASE_TAG'];
try {
  process.env['TAU_DESKTOP_SOURCE_SHA'] = 'a'.repeat(40);
  process.env['TAU_DESKTOP_RELEASE_TAG'] = 'desktop@0.1.0';
  for (const channel of ['production', 'staging'] as const) {
    const metadata = { version: '0.1.0', ...desktopManifestFields({ channel, environmentOverrides: false }) };
    for (const schema of [
      windowsQualificationPackageSchema,
      linuxQualificationPackageSchema,
      macosQualificationPackageSchema,
    ]) {
      assert.equal(schema.parse(metadata).tauDesktop.channel, channel);
      assert.throws(() => {
        schema.parse({ version: '0.1.0', ...desktopManifestFields({ channel, environmentOverrides: true }) });
      });
    }
  }
  console.log(
    'PASS actual desktopManifestFields production/staging admission and environment override refusal across all drivers',
  );
} finally {
  if (priorSource === undefined) {
    delete process.env['TAU_DESKTOP_SOURCE_SHA'];
  } else {
    process.env['TAU_DESKTOP_SOURCE_SHA'] = priorSource;
  }
  if (priorTag === undefined) {
    delete process.env['TAU_DESKTOP_RELEASE_TAG'];
  } else {
    process.env['TAU_DESKTOP_RELEASE_TAG'] = priorTag;
  }
}

const current = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
for (const route of ['windows-nsis', 'macos-zip', 'macos-dmg']) {
  const input = {
    kind: 'vm',
    route,
    scope: route === 'windows-nsis' ? 'windows' : 'macos',
    channel: 'staging',
  } as const;
  assertQualificationConsumerScope(input);
  for (const change of [{ channel: 'production' }, { scope: 'all' }, { scope: undefined }, { route: 'linux-apt' }]) {
    assert.throws(() => {
      assertQualificationConsumerScope({ ...input, ...change });
    }, /staging platform scope/u);
  }
  assertQualificationConsumerScope({ ...input, kind: 'ci', scope: 'all', channel: 'production' });
}
assertQualificationSource({
  sourceCommit: current,
  workflowCommit: current,
  scope: 'windows',
  channel: 'staging',
  kind: 'vm',
});
for (const change of [{ channel: 'production' }, { sourceCommit: 'a'.repeat(40) }, { scope: 'windows-ci' }]) {
  assert.throws(() => {
    assertQualificationSource({
      sourceCommit: current,
      workflowCommit: current,
      scope: 'windows',
      channel: 'staging',
      kind: 'vm',
      ...change,
    });
  });
}
