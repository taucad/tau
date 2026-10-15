#!/usr/bin/env node

/**
 * Purpose: Spike S26 (native dependency charter, I9/D8): two prepares of one closure give identical trees.
 * Why: Golden receipts, `closureIntegrity` compute reuse and the seed round trip all assume preparation is
 *   byte-deterministic across stores (the build123d wheel install plus the seal's `compileall -j 1`, ruling X22,
 *   and the PicoGK unpack). On a difference the writer is fixed, never the comparison.
 * Environment: Node 24+ on darwin-arm64; the built CLI; the build123d seed; network for the origins.
 * Usage: node --import @oxc-node/core/register scripts/spikes/native-deps/s26-determinism.mts --work <dir> --out <dir>
 * Exit codes: 0 when both prepares ran (the verdict is in the summary); 1 on a harness failure.
 */

/* oxlint-disable no-await-in-loop -- the two stores are prepared one after the other. */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

/* oxlint-disable no-restricted-imports -- spike-only siblings imported by relative path; deleted with W21. */
import { hostFacts, parseFlags, requiredFlag } from './spike-common.mts';
import { build123dSeed, kernels, receiptOf, repoRoot, runTau, Summary, tail } from './store-spike.mts';
import type { SealedReceipt } from './store-spike.mts';
/* oxlint-enable no-restricted-imports */

// Receipt fields that are documented as not part of any identity: where the closure lives, when it was sealed, which
// source served each payload and the host snapshot the variant was selected on.
const identity = (receipt: SealedReceipt): Record<string, unknown> => ({
  package: receipt.package,
  dependency: receipt.dependency,
  target: receipt['target'],
  closureIntegrity: receipt.closureIntegrity,
  treeIntegrity: receipt.treeIntegrity,
  tauVersion: receipt['tauVersion'],
  files: receipt.files.map(({ payload: _payload, ...row }) => row),
  payloads: receipt.payloads.map(({ name, integrity, sha256 }) => ({ name, integrity, sha256 })),
});

const main = async (): Promise<void> => {
  const flags = parseFlags(['work', 'out', 'label']);
  const work = requiredFlag(flags, 'work');
  const out = requiredFlag(flags, 'out');
  const label = flags.get('label') ?? 'runner';
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  mkdirSync(out, { recursive: true });
  const root = realpathSync(work);
  const summary = new Summary(join(out, 's26-summary.txt'));
  const host = hostFacts();
  summary.line(
    `S26 ${label}: ${host.cpuModel ?? '?'} x${String(host.parallelism)}, macOS ${host.productVersion ?? '?'}`,
  );

  // Store A: everything from the manifest's origins. Store B: a different, longer path; build123d offline from the
  // seed, PicoGK from its origins again. Same closure pins, different stores and acquisition sources.
  const stores = [
    { name: 'A', configDirectory: join(root, 'a'), seeded: false },
    { name: 'B', configDirectory: join(root, 'b', 'a-longer-and-different-config-path'), seeded: true },
  ];
  const prepares: Array<Record<string, unknown>> = [];
  for (const store of stores) {
    for (const { kernel } of kernels) {
      const seeded = store.seeded && kernel === 'build123d';
      const run = await runTau(['prepare', kernel, '--json', ...(seeded ? ['--offline'] : [])], {
        configDirectory: store.configDirectory,
        ...(seeded ? { seed: build123dSeed } : {}),
      });
      prepares.push({ store: store.name, kernel, seeded, exitCode: run.exitCode, milliseconds: run.milliseconds });
      summary.line(
        `store ${store.name} prepare ${kernel}${seeded ? ' (seed, offline)' : ' (origins)'}: exit ${String(run.exitCode)} in ${String(run.milliseconds)} ms`,
      );
      if (run.exitCode !== 0) {
        throw new Error(`prepare ${kernel} in store ${store.name} failed: ${tail(run.stderr)} ${tail(run.stdout)}`);
      }
    }
  }

  const golden = JSON.parse(
    readFileSync(join(repoRoot, 'packages/plugins/build123d/tau-plugin.golden.json'), 'utf8'),
  ) as Record<string, { closureIntegrity: string; treeIntegrity: string; fileCount: number }>;
  const comparisons: Array<Record<string, unknown>> = [];
  for (const { kernel, package: packageName, dependency } of kernels) {
    const [a, b] = stores.map((store) =>
      receiptOf(join(store.configDirectory, 'payloads'), packageName, dependency),
    ) as [SealedReceipt, SealedReceipt];
    // Byte comparison of the two trees; the receipts are compared by identity fields below.
    const diff = spawnSync('diff', ['-r', '-x', 'receipt.json', a.root, b.root], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    const differing = (diff.stdout + diff.stderr)
      .split('\n')
      .filter(
        (line) =>
          line.startsWith('Binary files') ||
          line.startsWith('Only in') ||
          line.startsWith('diff -r') ||
          line.startsWith('Symbolic links'),
      )
      .map((line) => line.replaceAll(a.root, '<A>').replaceAll(b.root, '<B>'));
    const sameIdentity = JSON.stringify(identity(a)) === JSON.stringify(identity(b));
    const goldenEntry = kernel === 'build123d' ? golden['darwin-arm64'] : undefined;
    const record = {
      kernel,
      diffExit: diff.status,
      differingCount: differing.length,
      differing: differing.slice(0, 60),
      sameIdentity,
      closureIntegrity: [a.closureIntegrity, b.closureIntegrity],
      treeIntegrity: [a.treeIntegrity, b.treeIntegrity],
      fileCount: [a.files.length, b.files.length],
      golden: goldenEntry,
      matchesGolden:
        goldenEntry === undefined
          ? undefined
          : goldenEntry.treeIntegrity === a.treeIntegrity && goldenEntry.closureIntegrity === a.closureIntegrity,
      acquiredFrom: [a.payloads[0]?.acquiredFrom, b.payloads[0]?.acquiredFrom],
    };
    comparisons.push(record);
    summary.line(
      `${kernel}: diff -r exit ${String(diff.status)} (${String(differing.length)} differing entries), receipt identity ${sameIdentity ? 'equal' : 'DIFFERENT'}, treeIntegrity A ${a.treeIntegrity} B ${b.treeIntegrity}, files ${String(a.files.length)}/${String(b.files.length)}${goldenEntry === undefined ? '' : `, golden darwin-arm64 ${record.matchesGolden === true ? 'match' : `MISMATCH (${goldenEntry.treeIntegrity})`}`}`,
    );
    for (const line of differing.slice(0, 20)) {
      summary.line(`  ${line}`);
    }
    // The tree identity of this runner, for the cross-machine comparison job.
    writeFileSync(
      join(out, `s26-${kernel}-tree.txt`),
      `${a.closureIntegrity} ${a.treeIntegrity} ${String(a.files.length)}\n`,
    );
  }
  writeFileSync(
    join(out, 's26-records.json'),
    `${JSON.stringify({ host, label, prepares, comparisons }, undefined, 2)}\n`,
  );
  const pass = comparisons.every((record) => record['diffExit'] === 0 && record['sameIdentity'] === true);
  summary.line(`S26 two-store verdict (${label}): ${pass ? 'PASS (identical trees and receipt identities)' : 'FAIL'}`);
  summary.line(
    'S26 seed round trip (--bundle on A, --seed on air-gapped B): blocked on W19 (tau prepare has neither flag on main).',
  );
};

await main();
process.exitCode = 0;
