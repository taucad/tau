#!/usr/bin/env node
/**
 * Purpose: Execute APT enrollment and refusal paths against real GPG keyrings and APT configuration.
 * Environment: Disposable Linux root container with gpg, apt-config and bash; TAU_APT_DISPOSABLE_CONTAINER=1.
 * Optional: TAU_APT_ENROLLMENT_SCRIPT overrides the mounted script path.
 * Usage: pnpm nx run desktop:test-linux-apt-enrollment
 * Exit: nonzero on trust, scheduler gating, administrator ownership or removal preservation regressions.
 * Scheduler probes and repository refresh are controlled fixtures; this does not qualify distro timers or a public repository.
 */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const main = async (): Promise<void> => {
  assert.equal(process.platform, 'linux');
  assert.equal(process.getuid?.(), 0);
  assert.equal(process.env['TAU_APT_DISPOSABLE_CONTAINER'], '1', 'Explicit disposable-container guard required');
  const root = await mkdtemp('/tmp/tau-enrollment-');
  const bin = join(root, 'bin');
  const keyHome = join(root, 'gnupg');
  await mkdir(bin);
  await mkdir(keyHome, { mode: 0o700 });
  const command = (name: string, args: string[]): string => execFileSync(name, args, { encoding: 'utf8' });
  command('gpg', [
    '--batch',
    '--homedir',
    keyHome,
    '--passphrase',
    '',
    '--quick-generate-key',
    'Fixture <fixture@example.invalid>',
    'ed25519',
    'sign',
    '1d',
  ]);
  const info = command('gpg', ['--batch', '--homedir', keyHome, '--with-colons', '--list-keys']);
  const fingerprint = info
    .split('\n')
    .find((line) => line.startsWith('fpr:'))
    ?.split(':')[9];
  assert.ok(fingerprint);
  const publicKey = join(root, 'public.asc');
  await writeFile(publicKey, command('gpg', ['--batch', '--homedir', keyHome, '--armor', '--export', fingerprint]));
  const calls = join(root, 'calls');
  await writeFile(
    join(bin, 'systemctl'),
    '#!/bin/sh\nprintf "%s\\n" "$*" >> "$TAU_TEST_CALLS"\n[ "$*" != "$TAU_TEST_DENIED_PROBE" ]\n',
    { mode: 0o755 },
  );
  await writeFile(join(bin, 'unattended-upgrade'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  await writeFile(
    join(bin, 'apt-get'),
    '#!/bin/sh\nprintf "%s\\n" "$*" >> "$TAU_TEST_CALLS"\n[ "$*" = "update --error-on=any" ]\n',
    { mode: 0o755 },
  );
  const script = process.env['TAU_APT_ENROLLMENT_SCRIPT'] ?? join(import.meta.dirname, 'configure-linux-apt.sh');
  const run = (operation: string, options: { fingerprint?: string; deniedProbe?: string } = {}) =>
    spawnSync(
      'bash',
      [
        script,
        'staging',
        operation,
        ...(['--manual', '--automatic'].includes(operation) ? [publicKey, options.fingerprint ?? fingerprint] : []),
      ],
      {
        env: {
          ...process.env,
          ...Object.fromEntries([
            ['PATH', `${bin}:${process.env['PATH']}`],
            ['TAU_TEST_CALLS', calls],
            ['TAU_TEST_DENIED_PROBE', options.deniedProbe ?? ''],
          ]),
        },
        encoding: 'utf8',
        timeout: 15_000,
      },
    );
  const source = '/etc/apt/sources.list.d/tau-staging.sources';
  const keyring = '/etc/apt/keyrings/tau-staging.gpg';
  const automatic = '/etc/apt/apt.conf.d/52tau-staging-unattended';
  const paths = [source, keyring, automatic];
  const snapshot = async () =>
    Promise.all(
      paths.map(async (path) => {
        try {
          const bytes = await readFile(path);
          return bytes.toString('base64');
        } catch (error) {
          if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
            return null;
          }
          throw error;
        }
      }),
    );
  const empty = await snapshot();
  assert.deepEqual(empty, [null, null, null], 'Fixture requires no existing Tau enrollment');
  const refuse = async (
    operation: string,
    options: { fingerprint?: string; deniedProbe?: string } = {},
  ): Promise<void> => {
    const before = await snapshot();
    const result = run(operation, options);
    assert.notEqual(result.status, 0, result.stdout);
    assert.deepEqual(await snapshot(), before, 'Refusal must not mutate enrollment');
  };
  await refuse('--manual', { fingerprint: '0'.repeat(40) });
  const refuseUnowned = async (path: string): Promise<void> => {
    await writeFile(path, '# Administrator-owned\n');
    await refuse('--manual');
    await rm(path);
  };
  await refuseUnowned(source);
  await refuseUnowned(automatic);
  await mkdir('/etc/apt/keyrings', { recursive: true });
  await writeFile(keyring, 'administrator keyring');
  await refuse('--manual');
  await rm(keyring);
  const periodic = '/etc/apt/apt.conf.d/20fixture-periodic';
  await writeFile(periodic, 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n');
  await Promise.all(
    ['apt-daily.timer', 'apt-daily-upgrade.timer'].flatMap((timer) =>
      ['is-enabled', 'is-active'].map(async (probe) =>
        refuse('--automatic', { deniedProbe: `${probe} --quiet ${timer}` }),
      ),
    ),
  );
  await writeFile(periodic, 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "0";\n');
  await refuse('--automatic');
  await writeFile(periodic, 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n');
  const other = '/etc/apt/apt.conf.d/51fixture-other-origin';
  const otherPolicy = 'Unattended-Upgrade::Origins-Pattern { "origin=FixtureOther,label=Keep"; };\n';
  await writeFile(other, otherPolicy);
  const enrolled = run('--automatic');
  assert.equal(enrolled.status, 0, enrolled.stderr);
  const enrolledInfo = command('gpg', ['--batch', '--homedir', keyHome, '--with-colons', '--show-keys', keyring]);
  assert.ok(
    enrolledInfo.split('\n').some((line) => line.split(':')[0] === 'fpr' && line.split(':')[9] === fingerprint),
  );
  const parsedSource = command('apt-get', [
    'indextargets',
    '--no-release-info',
    '--format',
    '$(SOURCESENTRY)',
    '-o',
    `Dir::Etc::sourcelist=${source}`,
    '-o',
    'Dir::Etc::sourceparts=-',
  ]);
  assert.equal(typeof parsedSource, 'string', 'Real APT accepts the deb822 source');
  const policy = command('apt-config', ['dump']);
  assert.match(policy, /origin=Tau,label=TauStaging,codename=staging,component=main/u);
  assert.match(policy, /origin=FixtureOther,label=Keep/u);
  assert.doesNotMatch(policy, /TauProduction/u);
  assert.match(await readFile(source, 'utf8'), /Signed-By: \/etc\/apt\/keyrings\/tau-staging.gpg/u);
  const manual = run('--manual');
  assert.equal(manual.status, 0, manual.stderr);
  const manualState = await snapshot();
  assert.equal(manualState[2], null);
  assert.match(command('apt-config', ['dump']), /origin=FixtureOther,label=Keep/u);
  assert.doesNotMatch(command('apt-config', ['dump']), /TauStaging/u);
  assert.equal(run('--automatic').status, 0);
  assert.equal(run('--disable-automatic').status, 0);
  const disabledState = await snapshot();
  assert.ok(disabledState[0]);
  assert.equal(disabledState[2], null);
  assert.equal(run('--automatic').status, 0);
  const originalSource = await readFile(source, 'utf8');
  await writeFile(source, '# Administrator-owned\n');
  await refuse('--remove-repository');
  await writeFile(source, originalSource);
  const runtime = '/opt/tau-staging/releases/fixture/runtime';
  const profile = '/root/tau-enrollment-fixture-profile/project.json';
  await mkdir('/opt/tau-staging/releases/fixture', { recursive: true });
  await mkdir('/root/tau-enrollment-fixture-profile');
  await writeFile(runtime, 'retained runtime');
  await writeFile(profile, 'retained project');
  const keyBeforeRemoval = await readFile(keyring);
  assert.equal(run('--remove-repository').status, 0);
  assert.equal(run('--remove-repository').status, 0, 'Removal is idempotent');
  const removedState = await snapshot();
  assert.equal(removedState[0], null);
  assert.equal(removedState[2], null);
  assert.deepEqual(await readFile(keyring), keyBeforeRemoval);
  assert.equal(await readFile(runtime, 'utf8'), 'retained runtime');
  assert.equal(await readFile(profile, 'utf8'), 'retained project');
  assert.equal(await readFile(other, 'utf8'), otherPolicy);
  assert.match(await readFile(calls, 'utf8'), /update --error-on=any/u);
  console.log(
    'PASS real enrollment script/GPG/APT parsing; controlled scheduler refusals, scoped opt-in and preservation. Public repository and live timers not qualified.',
  );
};
try {
  await main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
