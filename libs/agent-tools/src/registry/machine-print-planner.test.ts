import { describe, expect, it, vi } from 'vitest';
import type { MachineDirectoryEntry, MachineProvider } from '@taucad/runtime/machine';
import { writeBambuContainer } from '@taucad/slicer/container';
import { quantityKinds } from '@taucad/units/quantity';
import { sha256Bytes } from '@taucad/utils/hash';
import { createMachinePrintPlanner } from '#registry/machine-print-planner.js';
import type { MachinePrintPlannerDependencies } from '#registry/machine-print-planner.js';

/* Three annotated layers; relative extrusion totals 5 mm. */
const gcode = [
  'G28',
  'M104 S220',
  'M83',
  ';LAYER_CHANGE',
  'G1 Z0.2 F600',
  'G1 X10 Y0 E1.5 F1200',
  ';LAYER_CHANGE',
  'G1 Z0.4',
  'G1 X0 Y0 E1.5',
  ';LAYER_CHANGE',
  'G1 Z0.6',
  'G1 X10 Y10 E2',
  '',
].join('\n');
const container = writeBambuContainer({ gcode, modelName: 'pyramid' });
const artifactPath = '.tau/artifacts/call-1__main.ts-gcode.3mf/pyramid.gcode.3mf';
const mediaType = 'application/vnd.bambulab.gcode-3mf';
const contract = { id: 'manufacturing.toolpath.bambu-gcode-3mf', version: 1 };
const cursor = {
  hostId: 'host-1',
  authorityId: 'authority-1',
  workspaceId: 'workspace-1',
  generation: 'generation-1',
  position: 1,
  revision: 1,
};
const loaded = { bedType: 'textured-pei', materials: [{ slot: 2, state: 'loaded', materialId: 'PETG' }] };

const machine = (setup: unknown): MachineDirectoryEntry =>
  ({
    machineId: 'machine-1',
    providerId: 'bambu',
    descriptor: {
      id: 'physical-1',
      name: 'Workshop X1C',
      model: 'X1C',
      accepts: [
        {
          contract,
          mediaType,
          requiredMembers: ['Metadata/plate_1.gcode'],
          payloadSelection: 'plate',
          technology: 'additive.fff',
        },
      ],
    },
    snapshot: { connection: 'connected', readiness: 'idle', observedAt: '2026-09-24T00:00:00.000Z', setup },
    freshness: 'current',
  }) as unknown as MachineDirectoryEntry;

const provider = {
  id: 'bambu',
  name: 'Bambu Lab',
  manifest: {
    toolhead: {
      filamentDiameter: { value: 1.75, unit: 'mm' },
      nozzles: [{ id: 'nozzle-0.4', diameter: { value: 0.4, unit: 'mm' } }],
    },
    bed: { plates: [{ id: 'cool-plate', label: 'Cool Plate' }] },
  },
} as unknown as MachineProvider;

const dependencies = () => ({
  exportGeometry: vi.fn<MachinePrintPlannerDependencies['exportGeometry']>(async () => ({
    isError: false,
    content: {
      success: true,
      format: 'gcode.3mf',
      files: [{ name: 'pyramid.gcode.3mf', artifactPath, mimeType: mediaType, byteLength: container.byteLength }],
    },
  })),
  readArtifact: vi.fn<MachinePrintPlannerDependencies['readArtifact']>(async ({ path }) => {
    if (path !== artifactPath) {
      throw new Error(`Unexpected read of ${path}`);
    }
    return container;
  }),
  revisions: {
    describe: async () => ({ branch: 'main', revisionNumber: 7, revisionId: 'revision-7', branches: [], line: '' }),
  },
  machines: { listProviders: async () => [provider] },
});

const plan = async (deps: MachinePrintPlannerDependencies, entry: MachineDirectoryEntry = machine(loaded)) =>
  createMachinePrintPlanner(deps)({
    toolCallId: 'call-1',
    targetFile: 'main.ts',
    machine: entry,
    cursor,
    signal: new AbortController().signal,
  });

describe('machine print planner', () => {
  it('slices through the export route and qualifies the artifact, the expected setup and the summary', async () => {
    const deps = dependencies();
    const result = await plan(deps);
    const digest = `sha256:${await sha256Bytes(container)}`;
    expect(deps.exportGeometry).toHaveBeenCalledTimes(1);
    expect(deps.exportGeometry.mock.calls[0]![0]).toMatchObject({
      toolCallId: 'call-1',
      targetFile: 'main.ts',
      format: 'gcode.3mf',
    });
    expect(result.artifact).toEqual({
      revision: {
        authorityId: 'authority-1',
        workspaceId: 'workspace-1',
        revisionId: 'revision-7',
        treeDigest: digest,
      },
      path: artifactPath,
      digest,
      length: container.byteLength,
      mediaType,
      contract,
      selectedMember: 'Metadata/plate_1.gcode',
    });
    const diameter = (value: number) => ({ value, unit: 'mm', kind: quantityKinds.diameter, space: 'linear' });
    expect(result.configuration).toEqual({
      expectedModel: 'X1C',
      expectedBedType: 'textured-pei',
      expectedMaterials: [{ slot: 2, materialId: 'PETG' }],
      amsMapping: [2],
      expectedNozzleDiameter: diameter(0.4),
      expectedFilamentDiameter: diameter(1.75),
    });
    expect(result.summary).toMatchObject({ layers: 3, filamentLength: 5 });
    expect(result.summary?.estimatedDuration).toBeGreaterThan(0);
  });

  it('falls back to the manifest plate and drops a summary it cannot derive', async () => {
    const garbage = Uint8Array.from([1, 2, 3, 4]);
    const deps = { ...dependencies(), readArtifact: async () => garbage };
    const result = await plan(deps, machine({ materials: loaded.materials }));
    expect(result.configuration).toMatchObject({ expectedBedType: 'cool-plate' });
    expect(result.summary).toBeUndefined();
    expect(result.artifact).toMatchObject({ digest: `sha256:${await sha256Bytes(garbage)}`, length: 4 });
  });

  it('refuses before slicing when nothing is loaded, no revision exists or the provider is gone', async () => {
    const empty = dependencies();
    await expect(plan(empty, machine({ materials: [{ slot: 0, state: 'empty' }] }))).rejects.toThrow(
      'No material is loaded in Workshop X1C; load one, then ask again.',
    );
    const unsaved = {
      ...dependencies(),
      revisions: {
        describe: async () => ({
          branch: undefined,
          revisionNumber: undefined,
          revisionId: undefined,
          branches: [],
          line: '',
        }),
      },
    };
    await expect(plan(unsaved)).rejects.toThrow('No revision qualifies a print yet; save a revision, then ask again.');
    const orphaned = { ...dependencies(), machines: { listProviders: async () => [] } };
    await expect(plan(orphaned)).rejects.toThrow('No provider bambu backs Workshop X1C.');
    for (const deps of [empty, unsaved, orphaned]) {
      expect(deps.exportGeometry).not.toHaveBeenCalled();
    }
  });

  it('reports why the export refused instead of requesting nothing', async () => {
    const deps = {
      ...dependencies(),
      exportGeometry: async () => ({
        isError: true,
        content: { errorCode: 'KERNEL_ERROR', message: 'Kernel refused' },
      }),
    };
    await expect(plan(deps)).rejects.toThrow('Slicing main.ts failed: Kernel refused');
    expect(deps.readArtifact).not.toHaveBeenCalled();
  });
});
