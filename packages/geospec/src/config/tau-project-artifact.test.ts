import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { ProjectManifest } from '@taucad/project-core';
import type { RuntimeDocument } from '@taucad/runtime/client';
import type { ExportFile, RuntimeSourceSnapshotFile } from '@taucad/runtime/types';
import { exportTauProjectArtifact } from '#config/tau-project-artifact.js';
import type { GeoSpecTauProjectRuntime } from '#config/tau-project-artifact.js';
import type { GeoSpecExportRoute } from '#model/export-intent.js';

const manifest: ProjectManifest = {
  $schema: 'https://tau.new/schemas/tau-schema-v1.json',
  id: 'proj_aaaaaaaaaaaaaaaaaaaaa',
  name: 'Nested fixture',
  description: 'Tau artifact adapter fixture',
  tags: [],
  assets: { main: { entryPath: 'src/model.ts' } },
};

const encodeManifest = (value: ProjectManifest): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(JSON.stringify(value));

const route = {
  kernelId: 'replicad',
  sourceFormat: 'step',
  targetFormat: 'step',
  fidelity: 'brep',
  exportOptions: {
    schema: { properties: { coordinateSystem: {} } },
    defaults: {},
  },
} as const;

const glbRoute = {
  kernelId: 'replicad',
  sourceFormat: 'glb',
  targetFormat: 'glb',
  fidelity: 'mesh',
  exportOptions: {
    schema: { properties: { coordinateSystem: {}, unit: {} } },
    defaults: {},
  },
} as const;

const run = async (options?: {
  manifestBytes?: Uint8Array<ArrayBuffer>;
  sourceHash?: string;
  format?: 'step' | 'glb';
  snapshotRoute?: GeoSpecExportRoute;
  exportRoute?: GeoSpecExportRoute;
  artifact?: ExportFile;
  artifacts?: ExportFile[];
}) => {
  const manifestBytes = options?.manifestBytes ?? encodeManifest(manifest);
  const entryBytes = new TextEncoder().encode('export default drawBox(10, 20, 30);');
  const files: RuntimeSourceSnapshotFile[] = [
    {
      path: 'parts/bracket/src/model.ts',
      content: entryBytes,
      sha256: options?.sourceHash ?? 'a'.repeat(64),
      role: 'entry',
    },
    {
      path: 'parts/bracket/tau.json',
      content: manifestBytes,
      sha256: 'f'.repeat(64),
      role: 'additional',
    },
  ];
  const artifact =
    options?.artifact ??
    (options?.format === 'glb'
      ? ({
          name: 'bracket.glb',
          mimeType: 'model/gltf-binary',
          bytes: new Uint8Array([1, 2, 3]),
        } satisfies ExportFile)
      : ({
          name: 'bracket.step',
          mimeType: 'application/step',
          bytes: new Uint8Array([1, 2, 3]),
        } satisfies ExportFile));
  const sourceRuntime = mock<GeoSpecTauProjectRuntime>();
  sourceRuntime.bestRouteFor.mockReturnValue(options?.snapshotRoute ?? route);
  sourceRuntime.snapshotSource.mockResolvedValue({
    success: true,
    data: {
      entryPath: 'parts/bracket/src/model.ts',
      files,
      unresolvedPaths: [],
      kernelId: 'replicad',
    },
    issues: [],
  });
  const exportRuntime = mock<GeoSpecTauProjectRuntime>();
  exportRuntime.bestRouteFor.mockReturnValue(options?.exportRoute ?? options?.snapshotRoute ?? route);
  const exportDocument = mock<RuntimeDocument>();
  exportRuntime.open.mockReturnValue(exportDocument);
  const [primary = artifact, ...companions] = options?.artifacts ?? [artifact];
  exportDocument.export.mockResolvedValue({
    success: true,
    exportId: options?.format ?? 'step',
    evaluationId: 'evaluation-1',
    files: [primary, ...companions],
    issues: [],
  });
  const createRuntime = vi.fn().mockResolvedValueOnce(sourceRuntime).mockResolvedValueOnce(exportRuntime);
  const result = await exportTauProjectArtifact({
    descriptor: {
      kind: 'tau-project',
      manifestPath: 'parts/bracket/tau.json',
      manifest,
      format: options?.format ?? 'step',
      parameters: { width: 10 },
    },
    createRuntime,
  });
  return {
    artifact,
    createRuntime,
    entryBytes,
    exportRuntime,
    exportDocument,
    files,
    manifestBytes,
    result,
    sourceRuntime,
  };
};

describe('exportTauProjectArtifact', () => {
  it('preserves finalized STEP artifacts with the runtime extensionless assembly name', async () => {
    const artifact = {
      name: 'assembly',
      mimeType: 'application/step',
      bytes: new Uint8Array([1, 2, 3]),
    } satisfies ExportFile;
    const fixture = await run({ artifact });

    expect(fixture.result).toMatchObject({ success: true, data: artifact });
    if (fixture.result.success) {
      expect(fixture.result.data.bytes).toBe(artifact.bytes);
    }
  });

  it('returns exact finalized bytes with manifest, asset, frame, route, and source identities', async () => {
    const fixture = await run();

    expect(fixture.result.success).toBe(true);
    if (!fixture.result.success) {
      return;
    }
    expect(fixture.result.data.bytes).toBe(fixture.artifact.bytes);
    expect(fixture.result.data.source.manifestBytes).toBe(fixture.manifestBytes);
    expect(fixture.result.data.source.files).toBe(fixture.files);
    expect(fixture.result.data).toMatchObject({
      format: 'step',
      name: 'bracket.step',
      mimeType: 'application/step',
      frame: {
        coordinateSystem: 'z-up',
        lengthUnit: 'millimeter',
        sourceUnit: 'mm',
      },
      source: {
        manifest,
        manifestPath: 'parts/bracket/tau.json',
        projectEntryPath: 'src/model.ts',
        entryPath: 'parts/bracket/src/model.ts',
        kernelId: 'replicad',
      },
      export: {
        options: { coordinateSystem: 'z-up' },
        route: {
          kernelId: 'replicad',
          sourceFormat: 'step',
          targetFormat: 'step',
          fidelity: 'brep',
          direct: true,
        },
      },
    });
    expect(fixture.sourceRuntime.snapshotSource).toHaveBeenCalledWith({
      source: { path: 'parts/bracket/src/model.ts' },
      additionalPaths: [{ path: 'parts/bracket/tau.json', required: true }],
    });
    expect(fixture.exportRuntime.open).toHaveBeenCalledWith({
      source: {
        files: {
          'parts/bracket/src/model.ts': fixture.entryBytes,
          'parts/bracket/tau.json': fixture.manifestBytes,
        },
        entry: 'parts/bracket/src/model.ts',
      },
      parameters: { width: 10 },
      watch: false,
    });
    expect(fixture.exportDocument.export).toHaveBeenCalledWith('step', { options: { coordinateSystem: 'z-up' } });
    expect(fixture.sourceRuntime.snapshotSource.mock.invocationCallOrder[0]).toBeLessThan(
      fixture.sourceRuntime.bestRouteFor.mock.invocationCallOrder[0]!,
    );
    expect(fixture.exportDocument.export.mock.invocationCallOrder[0]).toBeLessThan(
      fixture.exportRuntime.bestRouteFor.mock.invocationCallOrder[0]!,
    );
    expect(fixture.createRuntime).toHaveBeenCalledTimes(2);
    expect(fixture.exportDocument.close).toHaveBeenCalledOnce();
    expect(fixture.sourceRuntime.shutdown).toHaveBeenCalledWith();
    expect(fixture.exportRuntime.shutdown).toHaveBeenCalledWith();
  });

  it('rotates source/finalized identity on edits and recovers it on revert', async () => {
    const baseline = await run({
      sourceHash: 'a'.repeat(64),
      artifact: {
        name: 'a.step',
        mimeType: 'application/step',
        bytes: new Uint8Array([1]),
      },
    });
    const comment = await run({
      sourceHash: 'b'.repeat(64),
      artifact: {
        name: 'a.step',
        mimeType: 'application/step',
        bytes: new Uint8Array([1]),
      },
    });
    const changed = await run({
      sourceHash: 'c'.repeat(64),
      artifact: {
        name: 'b.step',
        mimeType: 'application/step',
        bytes: new Uint8Array([2]),
      },
    });
    const reverted = await run({
      sourceHash: 'a'.repeat(64),
      artifact: {
        name: 'a.step',
        mimeType: 'application/step',
        bytes: new Uint8Array([1]),
      },
    });

    expect([baseline.result.success, comment.result.success, changed.result.success, reverted.result.success]).toEqual([
      true,
      true,
      true,
      true,
    ]);
    if (!baseline.result.success || !comment.result.success || !changed.result.success || !reverted.result.success) {
      return;
    }
    expect(comment.result.data.source.files[0]?.sha256).not.toBe(baseline.result.data.source.files[0]?.sha256);
    expect(comment.result.data.bytes).toStrictEqual(baseline.result.data.bytes);
    expect(changed.result.data.bytes).not.toStrictEqual(baseline.result.data.bytes);
    expect(reverted.result.data.source.files[0]?.sha256).toBe(baseline.result.data.source.files[0]?.sha256);
    expect(reverted.result.data.bytes).toStrictEqual(baseline.result.data.bytes);
  });

  it('requires and records an honored Z-up millimeter GLB route', async () => {
    const fixture = await run({ format: 'glb', snapshotRoute: glbRoute });

    expect(fixture.result).toMatchObject({
      success: true,
      data: {
        format: 'glb',
        mimeType: 'model/gltf-binary',
        frame: {
          coordinateSystem: 'z-up',
          lengthUnit: 'millimeter',
          sourceUnit: 'mm',
        },
        export: {
          options: { coordinateSystem: 'z-up', unit: { length: 'millimeter' } },
          route: { kernelId: 'replicad', targetFormat: 'glb', direct: true },
        },
      },
    });
  });

  it('refuses a fresh runtime whose route changes after export', async () => {
    const changedRoute = { ...route, sourceFormat: 'stp' } as const;
    const fixture = await run({ exportRoute: changedRoute });

    expect(fixture.result).toMatchObject({
      success: false,
      issues: [
        {
          code: 'KERNEL_CAPABILITY_MISSING',
          message: 'Export runtime did not retain the requested source-bound route and Z-up/mm frame.',
        },
      ],
    });
    expect(fixture.exportDocument.export).toHaveBeenCalledOnce();
  });

  it('refuses stale imported manifest data and unusable multi-file output', async () => {
    const stale = await run({
      manifestBytes: encodeManifest({
        ...manifest,
        assets: { main: { entryPath: 'src/other.ts' } },
      }),
    });
    expect(stale.result).toMatchObject({
      success: false,
      issues: [{ code: 'SOURCE_SNAPSHOT_CHANGED' }],
    });
    expect(stale.createRuntime).toHaveBeenCalledTimes(1);

    const multiple = await run({
      artifacts: [
        {
          name: 'a.step',
          mimeType: 'application/step',
          bytes: new Uint8Array([1]),
        },
        {
          name: 'extra.bin',
          mimeType: 'application/octet-stream',
          bytes: new Uint8Array([2]),
        },
      ],
    });
    expect(multiple.result).toMatchObject({
      success: false,
      issues: [{ code: 'EXPORT_ARTIFACT_SET_INVALID' }],
    });
  });
});
