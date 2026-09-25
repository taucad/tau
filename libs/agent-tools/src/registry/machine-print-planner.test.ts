/* eslint-disable @typescript-eslint/naming-convention -- Bambu Studio setting keys are its own wire vocabulary */
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
const loaded = {
  bedType: 'textured-pei',
  materials: [{ slot: 2, state: 'loaded', materialId: 'PETG', profileId: 'GFG00' }],
};
const install = {
  executable: '/Applications/BambuStudio.app/Contents/MacOS/BambuStudio',
  version: '02.08.02.61',
  resourcesDir: '/Applications/BambuStudio.app/Contents/Resources',
};

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
  vendor: 'Bambu Lab',
  manifest: {
    toolhead: {
      filamentDiameter: { value: 1.75, unit: 'mm' },
      nozzles: [{ id: 'nozzle-0.4', diameter: { value: 0.4, unit: 'mm' } }],
    },
    bed: {
      plates: [
        { id: 'cool', label: 'Cool plate' },
        { id: 'high-temperature', label: 'High temperature plate' },
      ],
    },
    slicing: {
      recommended: { nozzleTemperature: { value: 250, unit: 'Cel' }, bedTemperature: { value: 70, unit: 'Cel' } },
    },
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
  /* No Bambu Studio on this host unless a test installs one. */
  bambuStudio: { findBambuStudio: async () => undefined },
});

type PlanCall = Parameters<ReturnType<typeof createMachinePrintPlanner>>[0];

const plan = async (
  deps: MachinePrintPlannerDependencies,
  entry: MachineDirectoryEntry = machine(loaded),
  call: Partial<Pick<PlanCall, 'plate' | 'preset' | 'options' | 'profiles' | 'settings'>> = {},
) =>
  createMachinePrintPlanner(deps)({
    toolCallId: 'call-1',
    targetFile: 'main.ts',
    machine: entry,
    cursor,
    ...call,
    signal: new AbortController().signal,
  });

/** The same planner on a host where Bambu Studio is installed. */
const withBambuStudio = () => ({ ...dependencies(), bambuStudio: { findBambuStudio: async () => install } });

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
      /* The machine fixes plate, nozzle, filament and temperatures; the call adds none here. */
      exportOptions: {
        plate: 'textured-pei',
        nozzleDiameter: 0.4,
        filamentDiameter: 1.75,
        nozzleTemperature: 250,
        bedTemperature: 70,
      },
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

  it('asks for a plate the machine cannot report, and carries a named one as operator confirmed', async () => {
    const unreported = machine({ materials: loaded.materials });
    const refused = dependencies();
    await expect(plan(refused, unreported)).rejects.toThrow(
      'Workshop X1C does not report its build plate; ask the person which plate is installed, then pass plate as one of cool, high-temperature.',
    );
    await expect(plan(refused, unreported, { plate: 'textured-plate' })).rejects.toThrow(
      'does not report its build plate',
    );
    expect(refused.exportGeometry).not.toHaveBeenCalled();

    const deps = dependencies();
    const result = await plan(deps, unreported, { plate: 'high-temperature' });
    expect(result.configuration).toMatchObject({
      expectedBedType: 'high-temperature',
      operatorConfirmedBedType: 'high-temperature',
    });
    expect(deps.exportGeometry.mock.calls[0]![0].exportOptions).toMatchObject({ plate: 'high-temperature' });
  });

  it('drops a summary it cannot derive', async () => {
    const garbage = Uint8Array.from([1, 2, 3, 4]);
    const deps = { ...dependencies(), readArtifact: async () => garbage };
    const result = await plan(deps);
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

  it("slices a Bambu printer through Bambu Studio with the printer as hints and the call's profiles and settings", async () => {
    const deps = withBambuStudio();
    await plan(deps, machine(loaded), {
      preset: 'fine',
      profiles: { process: '0.12mm Fine @BBL X1C' },
      settings: { sparse_infill_density: '25%', wall_loops: 3 },
    });
    /* Bambu Studio's presets own temperatures, nozzle and filament: none of the reference options ride along. */
    expect(deps.exportGeometry.mock.calls[0]![0].exportOptions).toEqual({
      engine: 'bambu-studio',
      bambuStudio: {
        process: '0.12mm Fine @BBL X1C',
        plate: 'textured-pei',
        settings: { sparse_infill_density: '25%', wall_loops: 3 },
        hints: {
          model: 'X1C',
          nozzleDiameter: 0.4,
          preset: 'fine',
          plate: 'textured-pei',
          materials: [{ slot: 2, materialId: 'PETG', profileId: 'GFG00' }],
        },
      },
    });
  });

  it('keeps an operator-confirmed plate for Bambu Studio and refuses reference options there', async () => {
    const unreported = machine({ materials: loaded.materials });
    const deps = withBambuStudio();
    const result = await plan(deps, unreported, { plate: 'high-temperature' });
    expect(result.configuration).toMatchObject({ operatorConfirmedBedType: 'high-temperature' });
    expect(deps.exportGeometry.mock.calls[0]![0].exportOptions).toMatchObject({
      bambuStudio: { plate: 'high-temperature', hints: { plate: 'high-temperature' } },
    });

    const refused = withBambuStudio();
    await expect(plan(refused, machine(loaded), { options: { walls: 3 } })).rejects.toThrow(
      'Bambu Studio slices for Workshop X1C, so options do not apply; set Bambu Studio settings instead, with keys from get_print_profiles.',
    );
    expect(refused.exportGeometry).not.toHaveBeenCalled();
  });

  it('refuses a reported plate Bambu Studio has no bed type for, before slicing', async () => {
    const deps = withBambuStudio();
    await expect(plan(deps, machine({ ...loaded, bedType: 'smooth-pei' }), {})).rejects.toThrow(
      'Bambu Studio has no build plate "smooth-pei"; ask the person which plate is installed, then pass plate as one of cool, engineering, high-temperature, textured-pei.',
    );
    expect(deps.exportGeometry).not.toHaveBeenCalled();
  });

  it('falls back to the reference engine without Bambu Studio or for another vendor, refusing Bambu Studio fields', async () => {
    const other = {
      ...withBambuStudio(),
      machines: { listProviders: async () => [{ ...provider, vendor: 'Prusa Research' }] },
    };
    await plan(other);
    expect(other.exportGeometry.mock.calls[0]![0].exportOptions).not.toHaveProperty('engine');

    const refused = dependencies();
    await expect(plan(refused, machine(loaded), { settings: { wall_loops: 3 } })).rejects.toThrow(
      'Bambu Studio does not slice for Workshop X1C on this host, so profiles and settings do not apply',
    );
    await expect(
      plan(refused, machine(loaded), { profiles: { printer: 'Bambu Lab X1 Carbon 0.4 nozzle' } }),
    ).rejects.toThrow('profiles and settings do not apply');
    expect(refused.exportGeometry).not.toHaveBeenCalled();
  });

  it("names the container's producer and prefers the slicer's own time estimate", async () => {
    const stated = writeBambuContainer({
      gcode: [
        '; HEADER_BLOCK_START',
        '; generated by @taucad/slicer reference engine',
        '; total estimated time: 1h 2m 3s',
        '; HEADER_BLOCK_END',
        gcode,
      ].join('\n'),
      modelName: 'pyramid',
    });
    const deps = { ...dependencies(), readArtifact: async () => stated };
    const result = await plan(deps);
    expect(result.summary).toMatchObject({
      producer: { name: '@taucad/slicer reference' },
      layers: 3,
      estimatedDuration: 3723,
    });
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
