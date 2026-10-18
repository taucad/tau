import { describe, expect, it } from 'vitest';

import { nativeCompositionSchema } from '#composition.schema.js';

const sha256 = (digit: string): string => digit.repeat(64);

const build123dRow = {
  package: '@taucad/build123d',
  kernel: 'build123d',
  closureRoot: '/store/closures/sha256/abc',
  options: {
    pythonExecutable: '/store/closures/sha256/abc/python/bin/python3',
    pythonSha256: sha256('a'),
    workerPath: '/store/closures/sha256/abc/tau-worker/worker.py',
    workerSha256: sha256('b'),
    supportFiles: [
      'native_materials.py',
      'mechanisms.py',
      'tau_kernel/analyzer.py',
      'tau_kernel/glb.py',
      'tau_kernel/model.py',
      'tau_kernel/protocol.py',
    ].map((name, index) => ({
      path: `/store/closures/sha256/abc/tau-worker/${name}`,
      sha256: sha256(String(index)),
    })),
    runtimePath: '/store/closures/sha256/abc',
  },
};

const picogkRow = {
  package: '@taucad/picogk',
  kernel: 'picogk',
  closureRoot: '/store/closures/sha256/def',
  options: {
    workerExecutable: '/store/closures/sha256/def/dotnet/dotnet',
    workerSha256: sha256('c'),
    resourceFiles: [{ path: '/store/closures/sha256/def/tau-worker/PicoGK.dll', sha256: sha256('d'), label: 'PicoGK' }],
    runtimePath: '/store/closures/sha256/def',
    workerArguments: ['/store/closures/sha256/def/tau-worker/Tau.PicoGK.Worker.dll'],
  },
};

const unavailable = {
  kernel: 'picogk',
  package: '@taucad/picogk',
  extensions: ['cs'],
  reason: 'unsupported-target',
  byteLength: 0,
  detail: 'no variant for linux-x64-glibc',
};

describe('nativeCompositionSchema', () => {
  it("should parse each composed row with its own adopter's options schema, applying its defaults", () => {
    const parsed = nativeCompositionSchema.parse({
      kernels: [build123dRow, picogkRow],
      unavailable: [unavailable],
      closureRoots: [build123dRow.closureRoot, picogkRow.closureRoot],
    });

    expect(parsed.kernels).toEqual([
      {
        ...build123dRow,
        options: { ...build123dRow.options, requestTimeout: 0, maxArtifactBytes: Number.MAX_SAFE_INTEGER },
      },
      { ...picogkRow, options: { ...picogkRow.options, requestTimeout: 0, maxArtifactBytes: Number.MAX_SAFE_INTEGER } },
    ]);
    expect(parsed.unavailable).toEqual([unavailable]);
  });

  it('should refuse options that belong to another package', () => {
    const swapped = { ...build123dRow, options: picogkRow.options };

    expect(nativeCompositionSchema.safeParse({ kernels: [swapped], unavailable: [], closureRoots: [] }).success).toBe(
      false,
    );
  });

  it('should refuse a package outside the roster and a malformed unavailable row', () => {
    expect(
      nativeCompositionSchema.safeParse({
        kernels: [{ ...picogkRow, package: '@acme/other' }],
        unavailable: [],
        closureRoots: [],
      }).success,
    ).toBe(false);
    expect(
      nativeCompositionSchema.safeParse({
        kernels: [],
        unavailable: [{ ...unavailable, reason: 'broken' }],
        closureRoots: [],
      }).success,
    ).toBe(false);
  });
});
