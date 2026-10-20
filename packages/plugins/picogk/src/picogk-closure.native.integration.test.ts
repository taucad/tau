// @vitest-environment node
/*
 * The pinned PicoGK closure on darwin-arm64 and linux-x64 (charter D27, D30): under `TAU_PICOGK_CLOSURE=pinned` the
 * native fixture prepares the checked-in manifest's closure from its pinned origins, and this file proves the sealed
 * tree is the one the golden receipt records for the host's target, re-verifies it file by file and keeps every other
 * request off the network. The other native suites then run on the same closure.
 */
import { join, resolve } from 'node:path';

import { createPreparationHost, targetKey } from '@taucad/runtime/preparation/node';
import {
  appendGoldenSummary,
  compareWithGolden,
  installFetchTripwire,
  readGoldenReceipts,
} from '@taucad/runtime-testing/preparation';
import { beforeAll, describe, expect, it } from 'vitest';

import { picogkLaunchSet, picogkOptionsFromClosure } from '#picogk-closure.js';
import { pinnedDeployment, pinnedReceipt, pinnedStore } from '#picogk-native.fixture.js';

const golden = await readGoldenReceipts(resolve(import.meta.dirname, '../tau-plugin.golden.json'));

describe.runIf(pinnedReceipt !== undefined)('PicoGK pinned closure', () => {
  const sealed = pinnedReceipt!;

  beforeAll(() => installFetchTripwire());

  it("should seal the tree the golden receipt records for the host's target", async () => {
    const comparison = compareWithGolden(sealed, golden, targetKey(sealed.target));
    await appendGoldenSummary('@taucad/picogk runtime', comparison);

    // The message carries the observed entry, which is what a producer records when a pin moves.
    expect(comparison, JSON.stringify(comparison.observed)).toMatchObject({ status: 'match' });
  });

  it('should verify the sealed closure intact, file by file, with no request', async () => {
    const host = createPreparationHost({
      plugins: [{ package: '@taucad/picogk', deployment: pinnedDeployment, launchSet: picogkLaunchSet }],
      store: pinnedStore,
    });
    try {
      const results = await host.verify({ package: '@taucad/picogk', signal: AbortSignal.timeout(120_000) });
      expect(results.map(({ status, files }) => ({ status, files }))).toEqual([{ status: 'intact', files: [] }]);
    } finally {
      host.dispose();
    }
  });

  it('should launch the worker through the closure muxer', () => {
    const options = picogkOptionsFromClosure(sealed);

    expect(options.workerExecutable).toBe(join(sealed.root, 'dotnet/dotnet'));
    expect(options.workerArguments).toEqual([join(sealed.root, 'tau-worker/Tau.PicoGK.Worker.dll')]);
  });
});
