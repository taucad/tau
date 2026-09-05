import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { loadPicogkKernelOptions, picogkRuntimeManifestSchema } from '#picogk-resources.js';

const digest = 'a'.repeat(64);
const hostTarget = `${process.platform}-${process.arch}`;
const manifest = (target = hostTarget) => ({
  schemaVersion: 2,
  target,
  rid: 'test-rid',
  dotnetSdkVersion: '10.0.400',
  dotnetRuntimeVersion: '10.0.11',
  roslynVersion: '5.9.0',
  picoGkCommit: 'commit',
  picoGkArchiveSha256: digest,
  picoGkHostedPatchSha256: digest,
  hostApiVersion: 1,
  protocolVersion: 3,
  sceneArtifactVersion: 3,
  topologySchemaVersion: 1,
  sourceFilesSha256: digest,
  workerPath: 'Tau.PicoGK.Worker',
  workerSha256: digest,
  resourceFiles: [{ path: 'runtime/PicoGK.dll', sha256: digest, label: 'PicoGK' }],
});

describe('PicoGK prepared resources', () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  const fixture = (target = hostTarget): { readonly resourceRoot: string; readonly trustFile: string } => {
    const resourceRoot = mkdtempSync(join(tmpdir(), 'tau-picogk-resources-'));
    roots.push(resourceRoot);
    const targetRoot = join(resourceRoot, target);
    mkdirSync(targetRoot, { recursive: true });
    writeFileSync(join(targetRoot, 'tau-runtime-manifest.json'), JSON.stringify(manifest(target)));
    return { resourceRoot, trustFile: join(resourceRoot, 'trust.json') };
  };

  it('resolves the current host target into absolute, integrity-pinned kernel options', () => {
    const paths = fixture();
    const options = loadPicogkKernelOptions(paths);

    expect(options.workerExecutable.endsWith(`${hostTarget}/Tau.PicoGK.Worker`)).toBe(true);
    expect(options.workerSha256).toBe(digest);
    expect(options.resourceFiles).toEqual([
      {
        path: join(paths.resourceRoot, hostTarget, 'runtime/PicoGK.dll'),
        sha256: digest,
        label: 'PicoGK',
      },
    ]);
    expect(options.requestTimeout).toBe(120_000);
    expect(options.maxArtifactBytes).toBe(512 * 1024 * 1024);
    expect(isAbsolute(options.trustFile)).toBe(true);
  });

  it('accepts an explicit target and rejects a manifest for another target', () => {
    const options = fixture('custom-target');
    expect(loadPicogkKernelOptions({ ...options, target: 'custom-target' }).workerExecutable).toContain(
      'custom-target',
    );
    writeFileSync(
      join(options.resourceRoot, 'custom-target/tau-runtime-manifest.json'),
      JSON.stringify(manifest('wrong-target')),
    );
    expect(() => loadPicogkKernelOptions({ ...options, target: 'custom-target' })).toThrow(
      'PicoGK resource target mismatch: wrong-target',
    );
  });

  it('pins protocol versions, digests, and confined relative resource paths', () => {
    expect(picogkRuntimeManifestSchema.safeParse({ ...manifest(), schemaVersion: 1 }).success).toBe(false);
    expect(picogkRuntimeManifestSchema.safeParse({ ...manifest(), protocolVersion: 2 }).success).toBe(false);
    expect(picogkRuntimeManifestSchema.safeParse({ ...manifest(), workerSha256: 'invalid' }).success).toBe(false);
    expect(picogkRuntimeManifestSchema.safeParse({ ...manifest(), workerPath: '/worker' }).success).toBe(false);
    expect(picogkRuntimeManifestSchema.safeParse({ ...manifest(), workerPath: '../worker' }).success).toBe(false);
  });
});
