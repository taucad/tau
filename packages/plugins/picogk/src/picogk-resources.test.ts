import { describe, expect, it } from 'vitest';

import { picogkRuntimeManifestSchema } from '#picogk-resources.js';
import { picogkProtocolVersion } from '#picogk.protocol.js';

const digest = 'a'.repeat(64);
const manifest = () => ({
  schemaVersion: 2,
  target: `${process.platform}-${process.arch}`,
  rid: 'test-rid',
  dotnetSdkVersion: '10.0.400',
  dotnetRuntimeVersion: '10.0.11',
  roslynVersion: '5.9.0',
  picoGkCommit: 'commit',
  picoGkArchiveSha256: digest,
  picoGkHostedPatchSha256: digest,
  hostApiVersion: 2,
  protocolVersion: picogkProtocolVersion,
  sceneArtifactVersion: 4,
  topologySchemaVersion: 1,
  sourceFilesSha256: digest,
  workerPath: 'Tau.PicoGK.Worker',
  workerSha256: digest,
  resourceFiles: [{ path: 'runtime/PicoGK.dll', sha256: digest, label: 'PicoGK' }],
});

describe('PicoGK prepared resource manifest', () => {
  it('accepts the manifest the desktop producer writes', () => {
    expect(picogkRuntimeManifestSchema.safeParse(manifest()).success).toBe(true);
  });

  it('pins protocol versions, digests, and confined relative resource paths', () => {
    expect(picogkRuntimeManifestSchema.safeParse({ ...manifest(), schemaVersion: 1 }).success).toBe(false);
    expect(
      picogkRuntimeManifestSchema.safeParse({
        ...manifest(),
        protocolVersion: picogkProtocolVersion - 1,
      }).success,
    ).toBe(false);
    expect(
      picogkRuntimeManifestSchema.safeParse({
        ...manifest(),
        workerSha256: 'invalid',
      }).success,
    ).toBe(false);
    expect(
      picogkRuntimeManifestSchema.safeParse({
        ...manifest(),
        workerPath: '/worker',
      }).success,
    ).toBe(false);
    expect(
      picogkRuntimeManifestSchema.safeParse({
        ...manifest(),
        workerPath: '../worker',
      }).success,
    ).toBe(false);
  });
});
