#!/usr/bin/env node

/**
 * Purpose: Spike S30 (native dependency charter, D10/E6): first-use unpack of a desktop-style seed of archives
 *   (`Contents/Resources/payloads`, seed layout) into an empty store, cold and warm, with the disk delta with and
 *   without APFS clones of the seed blobs.
 * Why: D10 phase 1 seeds the store from archives in the app bundle through the ordinary verify-before-write path,
 *   cloning by `/bin/cp -c -R` where the volume allows. W6 has not built that layout yet, so this harness assembles
 *   the closest equivalent from the build123d seed and PicoGK's verified origin blobs.
 * Environment: Node 24+ on darwin-arm64 (APFS); the built CLI; the build123d seed; network once for PicoGK's
 *   origins; passwordless `sudo purge` for the cold legs.
 * Usage: node --import @oxc-node/core/register scripts/spikes/native-deps/s30-desktop-seed.mts --work <dir> --out <dir>
 * Exit codes: 0 when every leg ran (the verdict is in the summary); 1 on a harness failure.
 */

/* oxlint-disable no-await-in-loop -- legs run one after another on one volume. */
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

/* oxlint-disable no-restricted-imports -- spike-only siblings imported by relative path; deleted with W6. */
import { hostFacts, median, parseFlags, requiredFlag } from './spike-common.mts';
import {
  build123dSeed,
  duBytes,
  freeBytes,
  kernels,
  purgePageCache,
  receiptOf,
  round1,
  runTau,
  sealedReceipts,
  Summary,
  tail,
} from './store-spike.mts';
/* oxlint-enable no-restricted-imports */

/** E6's budget on an M-series Mac, and the charter's runner allowance (S13: 15 s → 30 s on `macos-15`). */
const m2ProBudgetSeconds = 20;
const runnerSlack = 2;
const repeats = 2;

const main = async (): Promise<void> => {
  const flags = parseFlags(['work', 'out']);
  const work = requiredFlag(flags, 'work');
  const out = requiredFlag(flags, 'out');
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  mkdirSync(out, { recursive: true });
  const root = realpathSync(work);
  const summary = new Summary(join(out, 's30-summary.txt'));
  const host = hostFacts();
  summary.line(`S30 host: ${host.cpuModel ?? '?'} x${String(host.parallelism)}, macOS ${host.productVersion ?? '?'}`);

  // 1. The desktop-style seed: `Tau.app/Contents/Resources/payloads/{blobs/sha256/<hex>, tau-seed.json}`.
  const producer = join(root, 'producer');
  const picogkRun = await runTau(['prepare', 'picogk', '--json'], { configDirectory: producer });
  if (picogkRun.exitCode !== 0) {
    throw new Error(`producing PicoGK's blobs failed: ${tail(picogkRun.stderr)}`);
  }
  const picogk = receiptOf(join(producer, 'payloads'), '@taucad/picogk', 'runtime');
  const payloads = join(root, 'Tau.app', 'Contents', 'Resources', 'payloads');
  const blobs = join(payloads, 'blobs', 'sha256');
  mkdirSync(blobs, { recursive: true });
  for (const name of readdirSync(join(build123dSeed, 'blobs', 'sha256'))) {
    copyFileSync(join(build123dSeed, 'blobs', 'sha256', name), join(blobs, name));
  }
  for (const payload of picogk.payloads) {
    copyFileSync(join(producer, 'payloads', 'blobs', 'sha256', payload.sha256), join(blobs, payload.sha256));
  }
  writeFileSync(
    join(payloads, 'tau-seed.json'),
    `${JSON.stringify(
      {
        closures: [
          {
            package: picogk.package,
            dependency: picogk.dependency,
            payloads: picogk.payloads.map(({ integrity, sha256 }) => ({ integrity, blob: `blobs/sha256/${sha256}` })),
          },
        ],
      },
      undefined,
      2,
    )}\n`,
  );
  rmSync(producer, { recursive: true, force: true });
  const seedBytes = duBytes(payloads);
  const seedBlobs = readdirSync(blobs).length;
  summary.line(
    `seed: ${String(seedBlobs)} blobs, ${String(Math.round(seedBytes / 1e6))} MB at ${payloads.slice(root.length)}`,
  );

  // 2. Legs: an empty store each time, both kernels prepared offline from the seed.
  type Leg = Record<string, unknown> & { readonly mode: string; readonly totalMilliseconds: number };
  const legs: Leg[] = [];
  for (const mode of ['cold', 'warm', 'clone-cold', 'clone-warm'] as const) {
    for (let index = 0; index < repeats; index += 1) {
      const configDirectory = join(root, `store-${mode}-${String(index)}`);
      const store = join(configDirectory, 'payloads');
      mkdirSync(store, { recursive: true });
      const purged = mode.endsWith('cold') ? purgePageCache() : undefined;
      const freeBefore = freeBytes(root);
      const started = performance.now();
      let cloneMilliseconds: number | undefined;
      if (mode.startsWith('clone')) {
        const cloneStarted = performance.now();
        mkdirSync(join(store, 'blobs'), { recursive: true });
        execFileSync('/bin/cp', ['-c', '-R', blobs, join(store, 'blobs', 'sha256')]);
        cloneMilliseconds = Math.round(performance.now() - cloneStarted);
      }
      const runs: Record<string, number | undefined> = {};
      for (const { kernel } of kernels) {
        const run = await runTau(['prepare', kernel, '--offline', '--json'], { configDirectory, seed: payloads });
        runs[`${kernel}Milliseconds`] = run.milliseconds;
        runs[`${kernel}Exit`] = run.exitCode;
        if (run.exitCode !== 0) {
          summary.line(`leg ${mode} ${kernel} failed: ${tail(run.stderr, 600)} ${tail(run.stdout, 600)}`);
        }
      }
      const totalMilliseconds = Math.round(performance.now() - started);
      const freeAfter = freeBytes(root);
      const sources = sealedReceipts(store).flatMap((receipt) =>
        receipt.payloads.map(({ acquiredFrom }) => (acquiredFrom as { kind?: string } | undefined)?.kind ?? '?'),
      );
      const leg: Leg = {
        mode,
        index,
        purged,
        totalMilliseconds,
        cloneMilliseconds,
        ...runs,
        diskDeltaBytes: freeBefore - freeAfter,
        storeDuBytes: duBytes(store),
        blobsDuBytes: duBytes(join(store, 'blobs')),
        acquiredFrom: Object.fromEntries(
          [...new Set(sources)].map((kind) => [kind, sources.filter((entry) => entry === kind).length]),
        ),
      };
      // Quarantine: any `com.apple.quarantine` attribute on the unpacked closures (Gatekeeper's trigger).
      if (index === 0 && mode === 'cold') {
        const xattr = spawnSync(
          'sh',
          ['-c', `xattr -r -l "${join(store, 'closures')}" 2>/dev/null | grep -c com.apple.quarantine`],
          { encoding: 'utf8' },
        );
        leg['quarantinedFiles'] = Number(xattr.stdout.trim() || '0');
        leg['spctlStatus'] = spawnSync('spctl', ['--status'], { encoding: 'utf8' }).stdout.trim();
      }
      legs.push(leg);
      summary.line(`leg ${mode} #${String(index)}: ${JSON.stringify(leg)}`);
      rmSync(configDirectory, { recursive: true, force: true });
    }
  }
  writeFileSync(
    join(out, 's30-records.json'),
    `${JSON.stringify({ host, seedBytes, seedBlobs, legs }, undefined, 2)}\n`,
  );
  const medianOf = (mode: string, field: string): number =>
    median(legs.filter((leg) => leg.mode === mode).map((leg) => Number(leg[field])));
  const line = m2ProBudgetSeconds * runnerSlack;
  for (const mode of ['cold', 'warm', 'clone-cold', 'clone-warm']) {
    summary.line(
      `S30 ${mode}: total ${String(round1(medianOf(mode, 'totalMilliseconds') / 1000))} s (build123d ${String(round1(medianOf(mode, 'build123dMilliseconds') / 1000))} s, picogk ${String(round1(medianOf(mode, 'picogkMilliseconds') / 1000))} s), disk delta ${String(Math.round(medianOf(mode, 'diskDeltaBytes') / 1e6))} MB (df), store du ${String(Math.round(medianOf(mode, 'storeDuBytes') / 1e6))} MB`,
    );
  }
  const cold = medianOf('cold', 'totalMilliseconds') / 1000;
  summary.line(
    `S30 verdict: cold ${String(round1(cold))} s against ${String(line)} s runner line (${String(m2ProBudgetSeconds)} s M-series): ${cold <= line ? 'within' : 'OVER'}; quarantined files ${JSON.stringify(legs[0]?.['quarantinedFiles'] ?? '?')}`,
  );
};

await main();
process.exitCode = 0;
