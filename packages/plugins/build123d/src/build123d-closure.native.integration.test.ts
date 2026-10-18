// @vitest-environment node
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { integrityToHex } from '@taucad/archive-core';
import { runInNativeSandbox } from '@taucad/native-process-core';
import { createPreparationHost, targetKey } from '@taucad/runtime/preparation/node';
import {
  appendGoldenSummary,
  compareWithGolden,
  installFetchTripwire,
  readGoldenReceipts,
} from '@taucad/runtime-testing/preparation';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  deployment,
  hostVariant,
  packageRoot,
  prepareFromSeed,
  seedDirectory,
  seedPresent,
  storeDirectory,
} from '#build123d-closure.fixture.js';
import { build123dLaunchSet, build123dOptionsFromClosure } from '#index.js';
import { build123dClosureSchema } from '#build123d.schemas.js';

const golden = await readGoldenReceipts(join(packageRoot, 'tau-plugin.golden.json'));
const hostKey = hostVariant === undefined ? undefined : targetKey(hostVariant.target);
const receipt = seedPresent ? await prepareFromSeed() : undefined;

describe.runIf(seedPresent)('Build123d sealed closure', () => {
  const sealed = receipt!;

  // The closure is prepared from the seed, offline: nothing in this file may reach for the network.
  beforeAll(() => installFetchTripwire());

  // Every host that prepares a declared target compares with the producer's golden entry (charter R3, D27); the
  // comparison also lands in the CI job summary when `TAU_GOLDEN_SUMMARY_FILE` names one.
  it('should seal the tree the golden receipt records for this target', async () => {
    const comparison = compareWithGolden(sealed, golden, hostKey!);
    await appendGoldenSummary('@taucad/build123d engine', comparison);

    // The message carries the observed entry, which is what a producer records when a pin moves.
    expect(comparison, JSON.stringify(comparison.observed)).toMatchObject({ status: 'match' });
  });

  // Re-hashing every file of a ~900 MB closure takes seconds; the per-launch check never does this.
  it('should verify the sealed closure intact, file by file', async () => {
    const host = createPreparationHost({
      plugins: [{ package: '@taucad/build123d', deployment, directory: packageRoot, launchSet: build123dLaunchSet }],
      store: storeDirectory,
      seed: seedDirectory,
    });
    try {
      const results = await host.verify({ package: '@taucad/build123d', signal: AbortSignal.timeout(300_000) });
      expect(results.map(({ status, files }) => ({ status, files }))).toEqual([{ status: 'intact', files: [] }]);
    } finally {
      host.dispose();
    }
  }, 300_000);

  // A cold first import of OCP loads hundreds of MB of native libraries; with the PicoGK row alongside it, this
  // overruns vitest's 5 s default on macos-26 runners.
  it('should import OCP and build123d inside the sandbox', async () => {
    const options = build123dClosureSchema.parse(build123dOptionsFromClosure(sealed));
    const scratch = mkdtempSync(join(realpathSync(tmpdir()), 'tau-build123d-self-test-'));
    try {
      const result = await runInNativeSandbox({
        executablePath: options.pythonExecutable,
        arguments: ['-I', '-B', '-c', 'import OCP, build123d'],
        readablePaths: [sealed.root],
        writablePath: scratch,
        workingDirectory: scratch,
        commandId: 'Build123d closure self-test',
        signal: AbortSignal.timeout(60_000),
      });
      expect(result.exitCode, result.stderr).toBe(0);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }, 120_000);

  it('should install only wheels the host target lock pins', () => {
    const lock = readFileSync(join(packageRoot, 'python', `pylock.${hostKey!}.toml`), 'utf8');
    const wheels = hostVariant!.payloads.filter(({ format }) => format === 'wheel');
    const installed = new Set(sealed.files.flatMap(({ payload }) => (payload === undefined ? [] : [payload])));
    expect(wheels.length).toBeGreaterThan(0);
    for (const wheel of wheels) {
      expect(installed.has(wheel.name), wheel.name).toBe(true);
      expect(lock).toContain(`sha256 = "${integrityToHex(wheel.integrity).hex}"`);
    }
  });
});
