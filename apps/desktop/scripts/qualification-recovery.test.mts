#!/usr/bin/env node
/**
 * Purpose: T-B22.4 (desktop resilient startup blueprint, I2), the route-qualification recovery scenario. Version A
 * starts with a renderer that cannot load and must reach version B through the recovery window alone, by the guarded
 * automatic install (decision N1). These checks cover what the native row decides without a host: which rows run it,
 * which baselines can run it, how A's renderer is broken (the installed entry document, and a managed AppImage
 * rebuilt around it), what the app's own log and boot-health ledger must show, and what the receipts job admits.
 * Synthetic; nothing native runs.
 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
/* oxlint-disable no-restricted-imports -- Exercise the installed runner's own scenario module. */
import {
  assertBaselineShipsAutoInstall,
  assertRecoveryReceipts,
  assessRecovery,
  autoInstallModulePath,
  brokenRendererDocument,
  qualificationScenario,
  rebuildAppImageWithEntry,
  recoveryFailure,
  recoveryLedgerSummary,
  recoveryRows,
  recoveryTrail,
  rendererEntryPath,
  squashfsCompressor,
} from './qualification-recovery.mjs';
import type { RecoveryReceipt } from './qualification-recovery.mjs';
/* oxlint-enable no-restricted-imports */

const a = { tag: 'desktop-staging@0.9.0-staging.10', version: '0.9.0', sourceCommit: 'a'.repeat(40) };
const b = { tag: 'desktop-staging@0.9.1-staging.11', version: '0.9.1', sourceCommit: 'b'.repeat(40) };
const line = (event: string, detail?: unknown, level = 'INFO'): string =>
  `2026-11-17T10:00:00.000Z ${level} ${event}${detail === undefined ? '' : ` ${JSON.stringify(detail)}`}`;
/** Move a log line `seconds` after the fixture's clock start. */
const at = (seconds: number, text: string): string =>
  text.replace(
    '2026-11-17T10:00:00.000Z',
    new Date(Date.parse('2026-11-17T10:00:00.000Z') + seconds * 1000).toISOString(),
  );
/** N1's install starts when the 10 s countdown, and with it the Cancel, has run out. */
const startedAfter = (seconds: number): string =>
  at(seconds, line('updater.auto-install-started', { targetVersion: b.version }, 'WARN'));
const launchOf = (version: string, pid: number): string => line('main.ready', { packaged: true, version, pid });
const ledgerOf = (version: string, sourceCommit: string, stage: string) => ({
  schemaVersion: 1,
  build: `${version}+${sourceCommit}+packaged`,
  unhealthyCount: 0,
  last: { launchId: 'launch', mode: 'normal', stage, deadlinePassed: false },
});
/** A's broken launch, the countdown, the install, and B's healthy launch. */
const healthyRecovery = [
  launchOf(a.version, 4100),
  line('main.boot-stage', { stage: 'window-loaded' }),
  line('main.boot-deadline-passed', { stage: 'window-loaded' }, 'WARN'),
  line('main.recovery-opened', { trigger: 'shell-deadline' }, 'WARN'),
  line('main.recovery-shown', { trigger: 'shell-deadline' }, 'WARN'),
  line('updater.auto-install-countdown', { targetVersion: b.version, mode: 'normal' }, 'WARN'),
  startedAfter(10),
  at(14, launchOf(b.version, 5200)),
  at(15, line('main.boot-stage', { stage: 'shell-mounted' })),
  at(16, line('main.boot-stage', { stage: 'home-ready' })),
].join('\n');

const tests: Array<[string, () => Promise<void> | void]> = [
  [
    'the scenario switch defaults to the A-B-C chain and admits only the recovery scenario besides it',
    () => {
      assert.equal(qualificationScenario(undefined), 'chain');
      assert.equal(qualificationScenario(''), 'chain');
      assert.equal(qualificationScenario('chain'), 'chain');
      assert.equal(qualificationScenario('recovery'), 'recovery');
      assert.throws(() => qualificationScenario('recovery-v2'), /Unknown qualification scenario/u);
    },
  ],
  [
    'one recovery row each for windows-nsis, linux-appimage and linux-apt, and none for a Mac scope',
    () => {
      assert.deepEqual(
        recoveryRows('all').map((row) => row.route),
        ['windows-nsis', 'linux-apt', 'linux-appimage'],
      );
      assert.deepEqual(
        recoveryRows('windows').map((row) => row.id),
        ['windows-nsis-recovery-x64'],
      );
      assert.deepEqual(
        recoveryRows('linux').map((row) => row.id),
        ['ubuntu-apt-recovery-x11', 'ubuntu-appimage-recovery-x11'],
      );
      assert.deepEqual(recoveryRows('macos'), []);
    },
  ],
  [
    'a baseline built before the guarded automatic install cannot qualify the recovery path',
    () => {
      const seen: string[] = [];
      assertBaselineShipsAutoInstall(a.sourceCommit, (commit, path) => {
        seen.push(`${commit}:${path}`);
        return true;
      });
      assert.deepEqual(seen, [`${a.sourceCommit}:${autoInstallModulePath}`]);
      assert.throws(() => {
        assertBaselineShipsAutoInstall(a.sourceCommit, () => false);
      }, /predates the guarded automatic install/u);
      assert.throws(() => {
        assertBaselineShipsAutoInstall('main', () => true);
      }, /full source commit/u);
    },
  ],
  [
    'the broken entry document loads but can never mount the app',
    () => {
      assert.match(brokenRendererDocument, /^<!doctype html>/u);
      assert.doesNotMatch(brokenRendererDocument, /<script|<link|src=|href=/iu);
      assert.equal(
        rendererEntryPath('C:/Users/runner/AppData/Local/Programs/tau-q/resources'),
        'C:/Users/runner/AppData/Local/Programs/tau-q/resources/ui/client/index.html',
      );
    },
  ],
  [
    'the managed AppImage is rebuilt with its own squashfs compressor and refuses anything else',
    () => {
      const superblock = (magic: string, compression: number): Uint8Array<ArrayBuffer> => {
        const bytes = new Uint8Array(96);
        bytes.set(Buffer.from(magic, 'latin1'), 0);
        new DataView(bytes.buffer).setUint16(20, compression, true);
        return bytes;
      };
      assert.equal(squashfsCompressor(superblock('hsqs', 1)), 'gzip');
      assert.equal(squashfsCompressor(superblock('hsqs', 4)), 'xz');
      assert.equal(squashfsCompressor(superblock('hsqs', 6)), 'zstd');
      assert.throws(() => squashfsCompressor(superblock('sqsh', 1)), /not a little-endian squashfs/u);
      assert.throws(() => squashfsCompressor(superblock('hsqs', 9)), /Unknown squashfs compressor/u);
    },
  ],
  [
    'rebuilding an AppImage keeps its runtime, replaces only the entry document and installs it root-owned',
    async () => {
      const work = await mkdtemp(join(tmpdir(), 'tau-recovery-appimage-'));
      try {
        const runtime = Buffer.from('ELF-runtime-bytes');
        const superblock = new Uint8Array(96);
        superblock.set(Buffer.from('hsqs', 'latin1'), 0);
        new DataView(superblock.buffer).setUint16(20, 6, true);
        const image = join(work, 'Tau.AppImage');
        await writeFile(image, Buffer.concat([runtime, superblock, Buffer.from('original-payload')]));
        const calls: string[][] = [];
        await rebuildAppImageWithEntry({
          image,
          document: brokenRendererDocument,
          workDirectory: join(work, 'rebuild'),
          run: async (file, args, options) => {
            calls.push([file, ...args]);
            if (args[0] === '--appimage-offset') {
              return `${runtime.length}\n`;
            }
            if (args[0] === '--appimage-extract') {
              const entry = join(options!.cwd!, 'squashfs-root/resources/ui/client/index.html');
              await mkdir(join(entry, '..'), { recursive: true });
              await writeFile(entry, '<!doctype html><script src="/app.js"></script>');
              return '';
            }
            if (file === 'mksquashfs') {
              const root = args[0]!;
              assert.equal(
                await readFile(join(root, 'resources/ui/client/index.html'), 'utf8'),
                brokenRendererDocument,
              );
              await writeFile(args[1]!, 'rebuilt-payload');
              return '';
            }
            if (file === 'sudo') {
              await writeFile(args.at(-1)!, await readFile(args.at(-2)!));
              return '';
            }
            throw new Error(`unexpected ${file}`);
          },
        });
        assert.deepEqual(
          calls.map((call) => call.slice(0, 2)),
          [
            [image, '--appimage-offset'],
            [image, '--appimage-extract'],
            ['mksquashfs', join(work, 'rebuild/squashfs-root')],
            ['sudo', '-n'],
          ],
        );
        const mksquashfs = calls.find(([file]) => file === 'mksquashfs')!;
        assert.ok(mksquashfs.includes('-root-owned') && mksquashfs.includes('-noappend'));
        assert.equal(mksquashfs[mksquashfs.indexOf('-comp') + 1], 'zstd');
        const install = calls.find(([file]) => file === 'sudo')!;
        assert.deepEqual(install.slice(2, 9), ['install', '-o', 'root', '-g', 'root', '-m', '0755']);
        const rebuilt = await readFile(image);
        assert.equal(rebuilt.toString('latin1'), `${runtime.toString('latin1')}rebuilt-payload`);
        await assert.rejects(stat(join(work, 'rebuild')), /ENOENT/u);
      } finally {
        await rm(work, { recursive: true, force: true });
      }
    },
  ],
  [
    'an extracted image without the entry document is refused rather than rebuilt',
    async () => {
      const work = await mkdtemp(join(tmpdir(), 'tau-recovery-appimage-'));
      try {
        const superblock = new Uint8Array(96);
        superblock.set(Buffer.from('hsqs', 'latin1'), 0);
        new DataView(superblock.buffer).setUint16(20, 1, true);
        const image = join(work, 'Tau.AppImage');
        await writeFile(image, Buffer.concat([Buffer.from('rt'), superblock]));
        await assert.rejects(
          rebuildAppImageWithEntry({
            image,
            document: brokenRendererDocument,
            workDirectory: join(work, 'rebuild'),
            run: async (_file, args, options) => {
              if (args[0] === '--appimage-offset') {
                return '2';
              }
              await mkdir(join(options!.cwd!, 'squashfs-root'), { recursive: true });
              return '';
            },
          }),
          /has no renderer entry/u,
        );
      } finally {
        await rm(work, { recursive: true, force: true });
      }
    },
  ],
  [
    "A's broken launch counts down, installs B by itself, and B reaches home-ready",
    () => {
      const assessed = assessRecovery({
        log: healthyRecovery,
        ledger: ledgerOf(b.version, b.sourceCommit, 'home-ready'),
        a,
        b,
      });
      assert.deepEqual(assessed, {
        a: {
          pid: 4100,
          recoveryTriggers: ['shell-deadline'],
          countdown: true,
          started: true,
          furthestStage: 'window-loaded',
        },
        b: { pid: 5200, build: `${b.version}+${b.sourceCommit}+packaged`, stage: 'home-ready' },
      });
    },
  ],
  [
    'every way the recovery can fall short is named, so a waiting row keeps polling and a timed-out row says why',
    () => {
      const without = (event: string): string =>
        healthyRecovery
          .split('\n')
          .filter((entry) => !entry.includes(` ${event} `) && !entry.endsWith(` ${event}`))
          .join('\n');
      const ledger = ledgerOf(b.version, b.sourceCommit, 'home-ready');
      assert.throws(() => assessRecovery({ log: '', ledger, a, b }), /never started version 0\.9\.0/u);
      assert.throws(
        () =>
          assessRecovery({
            log: without('main.recovery-opened').replace(/.*main\.recovery-shown.*\n/u, ''),
            ledger,
            a,
            b,
          }),
        /without the recovery window/u,
      );
      assert.throws(
        () => assessRecovery({ log: without('updater.auto-install-countdown'), ledger, a, b }),
        /no automatic-install countdown for 0\.9\.1/u,
      );
      for (const early of [0, 2, 9.9]) {
        assert.throws(
          () => assessRecovery({ log: healthyRecovery.replace(startedAfter(10), startedAfter(early)), ledger, a, b }),
          /started the automatic install \d+ ms after its countdown, before the 10 s Cancel window ran out/u,
        );
      }
      assert.throws(
        () => assessRecovery({ log: without('updater.auto-install-started'), ledger, a, b }),
        /did not start the automatic install of 0\.9\.1/u,
      );
      assert.throws(
        () =>
          assessRecovery({
            log: healthyRecovery.replace(
              line('main.boot-stage', { stage: 'window-loaded' }),
              [
                line('main.boot-stage', { stage: 'window-loaded' }),
                line('main.boot-stage', { stage: 'home-ready' }),
              ].join('\n'),
            ),
            ledger,
            a,
            b,
          }),
        /reached home-ready, so its renderer was not broken/u,
      );
      assert.throws(
        () =>
          assessRecovery({
            log: healthyRecovery.replace(
              startedAfter(10),
              [
                at(4, line('updater.auto-install-stopped', { reason: 'cancelled', targetVersion: b.version })),
                startedAfter(10),
              ].join('\n'),
            ),
            ledger,
            a,
            b,
          }),
        /countdown was stopped \(cancelled\)/u,
      );
      assert.throws(
        () => assessRecovery({ log: healthyRecovery.split('\n').slice(0, 7).join('\n'), ledger, a, b }),
        /Version 0\.9\.1 has not started/u,
      );
      assert.throws(
        () =>
          assessRecovery({ log: healthyRecovery, ledger: ledgerOf(b.version, b.sourceCommit, 'shell-mounted'), a, b }),
        /has not reached home-ready/u,
      );
      assert.throws(
        () => assessRecovery({ log: healthyRecovery, ledger: ledgerOf(a.version, a.sourceCommit, 'home-ready'), a, b }),
        /ledger belongs to 0\.9\.0\+/u,
      );
      assert.throws(() => assessRecovery({ log: healthyRecovery, ledger: undefined, a, b }), /no boot-health ledger/u);
    },
  ],
  [
    "a failed row keeps A's launch, recovery and updater events and the ledger's stage, with no path or other event",
    () => {
      const log = [
        launchOf(a.version, 4100),
        line('main.app-protocol-registered', {
          clientRoot: String.raw`C:\Users\runner\AppData\Local\Programs\t\resources\ui\client`,
        }),
        line('renderer.console', { message: 'secret-free but noisy' }, 'DEBUG'),
        line('kernel.broker', { message: 'pooled spare exited' }, 'ERROR'),
        line('main.recovery-offered', { trigger: 'shell-timeout' }, 'WARN'),
        line(
          'updater.error',
          {
            message: String.raw`Update failed: ENOENT \\?\C:\Users\runner\AppData\Local\tau-staging-updater\pending\x.exe and /home/runner/x`,
            stack: 'at C:\\x',
          },
          'WARN',
        ),
        line('updater.blocked', { reason: 'clock', nested: { phase: 'error' } }, 'WARN'),
        'a stack line without a record',
      ].join('\n');
      const trail = recoveryTrail(log);
      assert.deepEqual(
        trail.map(({ event }) => event),
        ['main.ready', 'main.app-protocol-registered', 'main.recovery-offered', 'updater.error', 'updater.blocked'],
      );
      assert.deepEqual(trail[0]!.detail, { version: a.version, pid: 4100 });
      assert.deepEqual(trail[1]!.detail, {});
      assert.deepEqual(trail[2]!.detail, { trigger: 'shell-timeout' });
      assert.deepEqual(trail[3]!.detail, { message: 'Update failed: ENOENT <path> and <path>' });
      assert.deepEqual(trail[4]!.detail, { reason: 'clock' });
      assert.equal(trail[0]!.at, '2026-11-17T10:00:00.000Z');
      assert.doesNotMatch(JSON.stringify(trail), /Users|runner|home/u);
      const many = Array.from({ length: 250 }, (_, index) => line('main.boot-stage', { stage: String(index) })).join(
        '\n',
      );
      assert.equal(recoveryTrail(many).length, 200);
      assert.equal(recoveryTrail(many).at(-1)!.detail['stage'], '249');

      assert.deepEqual(
        recoveryLedgerSummary({
          ...ledgerOf(a.version, a.sourceCommit, 'updater-started'),
          autoInstall: { fromBuild: 'x', targetVersion: b.version },
        }),
        {
          build: `${a.version}+${a.sourceCommit}+packaged`,
          unhealthyCount: 0,
          last: { mode: 'normal', stage: 'updater-started', deadlinePassed: false },
          autoInstall: { targetVersion: b.version },
        },
      );
      assert.equal(recoveryLedgerSummary(undefined), undefined);
      assert.equal(recoveryLedgerSummary('not a ledger'), undefined);

      const failure = recoveryFailure({
        reason: `Version ${a.version} logged no automatic-install countdown for ${b.version}`,
        log,
        ledgerText: JSON.stringify(ledgerOf(a.version, a.sourceCommit, 'updater-started')),
        aAlive: true,
        mirrorRequests: [],
      });
      assert.equal(
        failure.error.message,
        `T-B22.4 recovery did not complete: Version ${a.version} logged no automatic-install countdown for ${b.version} (A alive: true; ledger stage: updater-started; mirror requests: 0; last updater events: updater.error {"message":"Update failed: ENOENT <path> and <path>"}; updater.blocked {"reason":"clock"})`,
      );
      assert.deepEqual(failure.record['trail'], trail);
      assert.match(
        recoveryFailure({ reason: 'r', log: '', ledgerText: '{', aAlive: false, mirrorRequests: [] }).error.message,
        /A alive: false; ledger stage: none; mirror requests: 0; last updater events: none/u,
      );
    },
  ],
  [
    'the receipts job admits exactly the scope rows, each passed, all on one A and B',
    () => {
      const receipt = (
        id: string,
        route: RecoveryReceipt['route'],
        target: RecoveryReceipt['target'],
      ): RecoveryReceipt => ({
        schemaVersion: 1,
        scenario: 'T-B22.4',
        id,
        status: 'passed',
        route,
        target,
        channel: 'staging',
        a,
        b,
        evidence: {
          a: {
            pid: 1,
            recoveryTriggers: ['shell-deadline'],
            countdown: true,
            started: true,
            furthestStage: 'window-loaded',
          },
          b: { pid: 2, build: `${b.version}+${b.sourceCommit}+packaged`, stage: 'home-ready' },
          installed: { executableSha256: 'c'.repeat(64), asarSha256: 'd'.repeat(64) },
        },
        logs: 'https://github.com/taucad/tau/actions/runs/1',
      });
      const linux = [
        receipt('ubuntu-apt-recovery-x11', 'linux-apt', 'linux-x64'),
        receipt('ubuntu-appimage-recovery-x11', 'linux-appimage', 'linux-x64'),
      ];
      assert.deepEqual(
        assertRecoveryReceipts('linux', linux).map((item) => item.id),
        ['ubuntu-apt-recovery-x11', 'ubuntu-appimage-recovery-x11'],
      );
      assert.deepEqual(assertRecoveryReceipts('macos', []), []);
      assert.throws(() => assertRecoveryReceipts('linux', linux.slice(0, 1)), /missing ubuntu-appimage-recovery-x11/u);
      assert.throws(
        () =>
          assertRecoveryReceipts('linux', [
            ...linux,
            receipt('windows-nsis-recovery-x64', 'windows-nsis', 'win32-x64'),
          ]),
        /not a linux recovery row/u,
      );
      assert.throws(
        () => assertRecoveryReceipts('linux', [linux[0]!, { ...linux[1]!, status: 'failed' as 'passed' }]),
        /Invalid recovery receipt/u,
      );
      assert.throws(
        () => assertRecoveryReceipts('linux', [linux[0]!, { ...linux[1]!, b: { ...b, version: '0.9.2' } }]),
        /different A or B/u,
      );
      assert.throws(
        () => assertRecoveryReceipts('linux', [linux[0]!, { ...linux[1]!, route: 'linux-apt' }]),
        /runs another route/u,
      );
      assert.throws(() => assertRecoveryReceipts('linux', [linux[0]!, { ...linux[1]!, b: a }]), /distinct versions/u);
    },
  ],
];

let failed = 0;
for (const [name, run] of tests) {
  try {
    // oxlint-disable-next-line no-await-in-loop -- The cases share nothing, but their output reads in order.
    await run();
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}`);
    console.error(error);
  }
}
if (failed > 0) {
  process.exitCode = 1;
}
