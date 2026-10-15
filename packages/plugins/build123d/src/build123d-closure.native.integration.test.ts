// @vitest-environment node
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { integrityToHex } from '@taucad/archive-core';
import { runInNativeSandbox } from '@taucad/native-process-core';
import { createPreparationHost, targetKey } from '@taucad/runtime/preparation/node';
import { describe, expect, it } from 'vitest';

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
import { build123dOptionsSchema } from '#build123d.schemas.js';

type GoldenEntry = { readonly closureIntegrity: string; readonly treeIntegrity: string; readonly fileCount: number };

const golden = JSON.parse(readFileSync(join(packageRoot, 'tau-plugin.golden.json'), 'utf8')) as Readonly<
  Record<string, GoldenEntry>
>;
const hostKey = hostVariant === undefined ? undefined : targetKey(hostVariant.target);
const receipt = seedPresent ? await prepareFromSeed() : undefined;

describe.runIf(seedPresent)('Build123d sealed closure', () => {
  const sealed = receipt!;

  it.runIf(hostKey !== undefined && golden[hostKey] !== undefined)(
    'should seal the tree the golden receipt records for this target',
    () => {
      const entry = golden[hostKey!]!;
      expect({
        closureIntegrity: sealed.closureIntegrity,
        treeIntegrity: sealed.treeIntegrity,
        fileCount: sealed.files.length,
      }).toEqual({
        closureIntegrity: entry.closureIntegrity,
        treeIntegrity: entry.treeIntegrity,
        fileCount: entry.fileCount,
      });
    },
  );

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

  it('should import OCP and build123d inside the sandbox', async () => {
    const options = build123dOptionsSchema.parse(build123dOptionsFromClosure(sealed));
    const scratch = mkdtempSync(join(realpathSync(tmpdir()), 'tau-build123d-self-test-'));
    try {
      const result = await runInNativeSandbox({
        executablePath: options.pythonExecutable,
        arguments: ['-I', '-B', '-c', 'import OCP, build123d'],
        readablePaths: [sealed.root],
        writablePath: scratch,
        workingDirectory: scratch,
        commandId: 'Build123d closure self-test',
      });
      expect(result.exitCode, result.stderr).toBe(0);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

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
