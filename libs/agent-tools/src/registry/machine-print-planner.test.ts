/* eslint-disable @typescript-eslint/naming-convention -- Bambu Studio setting keys are its own wire vocabulary */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { JsonObject } from '@taucad/agent-host';
import { fffProcessOf } from '@taucad/runtime/machine';
import type { MachineDirectoryEntry } from '@taucad/runtime/machine';
import { machineSettingsPath } from '@taucad/runtime/machine/settings';
import { slicingPreferences } from '@taucad/slicer/preferences';
import type { SlicingPreferences } from '@taucad/slicer/preferences';
import type { MachineSettingsRecord } from '@taucad/types';
import { bambuSettingsConfiguration } from '@taucad/bambu/settings';
import { writeBambuContainer, slicedFilamentColors } from '@taucad/slicer/container';
import { sha256Bytes } from '@taucad/utils/hash';
import { createMachinePrintPlanner, defaultFilamentSlots } from '#registry/machine-print-planner.js';
import type { MachinePrintPlannerDependencies } from '#registry/machine-print-planner.js';
import { observedSlots, readProjectMachinePreferences } from '#registry/print-profiles.js';
import type { BambuStudioEngine, ResolvedMachinePreferences } from '#registry/print-profiles.js';
import { fixtureEntry, fixtureManifest, fixtureProvider } from '#registry/machine.fixture.js';
import type { FixtureTray } from '#registry/machine.fixture.js';

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
const settingsPath = machineSettingsPath({ typeId: 'bambu.x1c' });
const projectId = 'proj_000000000000000000001';
const loaded = {
  bedType: 'textured-pei',
  materials: [{ slot: 2, state: 'loaded', materialId: 'PETG', profileId: 'GFG00' }],
};
const install = {
  executable: '/Applications/BambuStudio.app/Contents/MacOS/BambuStudio',
  version: '02.08.02.61',
  resourcesDir: '/Applications/BambuStudio.app/Contents/Resources',
};
const printers = ['Bambu Lab X1 Carbon 0.4 nozzle'];
const filament = (name: string, filamentId: string, filamentType: string) =>
  ({ name, kind: 'filament', source: 'system', filamentId, filamentType, compatiblePrinters: printers }) as const;
/** The X1C presets of an installed Bambu Studio, as its catalog summarizes them. */
const catalog = {
  installation: install,
  printers: [
    { name: printers[0]!, kind: 'machine', source: 'system', printerModel: 'Bambu Lab X1 Carbon', nozzleDiameter: 0.4 },
  ],
  processes: [
    {
      name: '0.20mm Standard @BBL X1C',
      kind: 'process',
      source: 'system',
      layerHeight: 0.2,
      compatiblePrinters: printers,
    },
    {
      name: '0.12mm Fine @BBL X1C',
      kind: 'process',
      source: 'system',
      layerHeight: 0.12,
      compatiblePrinters: printers,
    },
  ],
  filaments: [
    filament('Bambu PLA Basic @BBL X1C', 'GFA00', 'PLA'),
    filament('Bambu PLA Matte @BBL X1C', 'GFA01', 'PLA'),
    filament('Bambu PETG Basic @BBL X1C', 'GFG00', 'PETG'),
  ],
  plates: [],
} as const;

type ObservedSetup = Readonly<{
  bedType?: string;
  materials: ReadonlyArray<
    Readonly<{ slot: number; state: string; materialId?: string; profileId?: string; color?: string }>
  >;
}>;

/** Bambu's tray numbers as the material system addresses them. */
const address = (slot: number) =>
  slot === 254 ? { unitId: 'external', slotId: 'spool' } : { unitId: 'ams-a', slotId: `a${String(slot + 1)}` };

/** The fixture X1C, idle, reporting this plate and these trays. */
const machine = (setup: ObservedSetup): MachineDirectoryEntry =>
  fixtureEntry({
    run: false,
    plate: setup.bedType ?? false,
    trays: setup.materials.map(({ slot, state, materialId, profileId, color }) => ({
      ...address(slot),
      state: state as 'empty' | 'loaded' | 'unknown',
      ...(materialId === undefined ? {} : { materialType: materialId }),
      ...(profileId === undefined ? {} : { profileId }),
      ...(color === undefined ? {} : { color }),
    })),
  });

const provider = (() => {
  const manifest = fixtureManifest();
  const fff = fffProcessOf(manifest)!;
  return fixtureProvider({
    ...manifest,
    processes: [
      {
        ...fff,
        bed: {
          ...fff.bed,
          plates: [
            { id: 'cool', label: 'Cool plate' },
            { id: 'high-temperature', label: 'High temperature plate' },
          ],
        },
      },
    ],
  });
})();

const dependencies = () => ({
  exportModel: vi.fn<NonNullable<MachinePrintPlannerDependencies['exportModel']>>(async () => ({
    isError: false,
    content: {
      success: true,
      to: 'gcode.3mf',
      files: [{ name: 'pyramid.gcode.3mf', artifactPath, mimeType: mediaType, byteLength: container.byteLength }],
    },
  })),
  readArtifact: vi.fn<MachinePrintPlannerDependencies['readArtifact']>(async ({ path }) => {
    if (path !== artifactPath) {
      throw new Error(`Unexpected read of ${path}`);
    }
    return container;
  }),
  projectId,
  machines: { listProviders: async () => [provider] },
  /* No Bambu Studio on this host unless a test installs one. */
  bambuStudio: {
    findBambuStudio: async () => undefined,
    loadBambuStudioCatalog: vi.fn<BambuStudioEngine['loadBambuStudioCatalog']>(async () => catalog),
  },
});

type PlanCall = Parameters<ReturnType<typeof createMachinePrintPlanner>>[0];

const plan = async (
  deps: MachinePrintPlannerDependencies,
  entry: MachineDirectoryEntry = machine(loaded),
  call: Partial<Pick<PlanCall, 'plate' | 'preset' | 'options' | 'profiles' | 'settings' | 'preferences'>> = {},
) =>
  createMachinePrintPlanner(deps)({
    toolCallId: 'call-1',
    targetFile: 'main.ts',
    machine: entry,
    ...call,
    signal: new AbortController().signal,
  });

/** The same planner on a host where Bambu Studio is installed. */
const withBambuStudio = () => {
  const deps = dependencies();
  return { ...deps, bambuStudio: { ...deps.bambuStudio, findBambuStudio: async () => install } };
};

/** The project's print intent for this printer's model, as read. */
const current = (
  preferences: SlicingPreferences & {
    plate?: ResolvedMachinePreferences['machine']['plate'];
  },
): ResolvedMachinePreferences => {
  const { plate, ...slicing } = preferences;
  const record: MachineSettingsRecord = {
    version: 1,
    typeId: 'bambu.x1c',
    activeProfile: 'default',
    profiles: {
      default: {
        name: 'Default',
        configurations: {
          [slicingPreferences.manifest.source.id]: {
            version: slicingPreferences.manifest.source.version,
            values: slicing,
          },
          ...(plate
            ? {
                [bambuSettingsConfiguration.manifest.source.id]: {
                  version: bambuSettingsConfiguration.manifest.source.version,
                  values: { plate },
                },
              }
            : {}),
        },
      },
    },
  };
  return {
    status: 'current',
    preferences,
    machine: plate ? { plate } : {},
    record,
    profileId: 'default',
  };
};
const reportedProfile = {
  path: settingsPath,
  typeId: 'bambu.x1c',
  profileId: 'default',
  profileName: 'Default',
  configurationVersions: {
    [slicingPreferences.manifest.source.id]: slicingPreferences.manifest.source.version,
  },
};

const sliced = (deps: Pick<ReturnType<typeof dependencies>, 'exportModel'>): JsonObject | undefined =>
  deps.exportModel.mock.calls[0]![0].options;

describe('machine print planner', () => {
  it('slices through the export route and qualifies the artifact, the expected setup and the summary', async () => {
    const deps = dependencies();
    const result = await plan(deps);
    const digest = `sha256:${await sha256Bytes(container)}`;
    expect(deps.exportModel).toHaveBeenCalledTimes(1);
    expect(deps.exportModel.mock.calls[0]![0]).toMatchObject({
      toolCallId: 'call-1',
      targetFile: 'main.ts',
      to: 'gcode.3mf',
      /* The machine fixes plate, nozzle, filament and temperatures; the call adds none here. */
      options: {
        plate: 'textured-pei',
        nozzleDiameter: 0.4,
        filamentDiameter: 1.75,
        nozzleTemperature: 250,
        bedTemperature: 70,
      },
    });
    /* Named by the host's project, never by anything the model or the directory said. */
    expect(result.artifact).toEqual({
      projectId,
      path: artifactPath,
      digest,
      length: container.byteLength,
      mediaType,
      contract,
      selectedMember: 'Metadata/plate_1.gcode',
    });
    /* What the call chose only: the provider completes model, nozzle and materials from what it reports. */
    expect(result.configuration).toEqual({ expectedBedType: 'textured-pei', amsMapping: [2] });
    expect(result.program).toMatchObject({
      name: 'pyramid.gcode.3mf',
      facts: { process: 'fff', layers: 3, filamentLength: 5 },
    });
    expect(result.program.estimatedDuration).toBeGreaterThan(0);
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
    expect(refused.exportModel).not.toHaveBeenCalled();

    const deps = dependencies();
    const result = await plan(deps, unreported, { plate: 'high-temperature' });
    expect(result.configuration).toMatchObject({
      expectedBedType: 'high-temperature',
      operatorConfirmedBedType: 'high-temperature',
    });
    expect(deps.exportModel.mock.calls[0]![0].options).toMatchObject({ plate: 'high-temperature' });
  });

  it('says so when it cannot read the toolpath, and names the program as other', async () => {
    const garbage = Uint8Array.from([0x50, 0x4b, 3, 4]);
    const deps = { ...dependencies(), readArtifact: async () => garbage };
    const result = await plan(deps);
    expect(result.program).toEqual({ name: 'pyramid.gcode.3mf', facts: { process: 'other' } });
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: 'RUNTIME_CONTENT_UNSUPPORTED',
        severity: 'warning',
        message: expect.stringContaining(
          'Tau could not read pyramid.gcode.3mf as manufacturing.toolpath.bambu-gcode-3mf',
        ) as string,
      }),
    ]);
    expect(result.artifact).toMatchObject({ digest: `sha256:${await sha256Bytes(garbage)}`, length: 4 });
  });

  it('runs a finished program as is, in the container the machine accepts, slicing nothing', async () => {
    const program = new TextEncoder().encode('G21\nG0 X0 Y0\n');
    const deps = { ...dependencies(), readArtifact: vi.fn(async () => program) };
    const router = fixtureEntry({ milling: true, run: false });
    const planner = createMachinePrintPlanner(deps);
    const { signal } = new AbortController();

    const result = await planner({ toolCallId: 'call-1', artifact: 'cam/part.nc', machine: router, signal });

    expect(deps.exportModel).not.toHaveBeenCalled();
    expect(result).toEqual({
      artifact: {
        projectId,
        path: 'cam/part.nc',
        digest: `sha256:${await sha256Bytes(program)}`,
        length: program.byteLength,
        mediaType: 'text/x.gcode',
        contract: { id: 'tau.toolpath.gcode', version: 1 },
        selectedMember: 'cam/part.nc',
      },
      configuration: {},
      program: { name: 'part.nc' },
    });
    /* A printer takes print-ready containers only. */
    await expect(
      planner({ toolCallId: 'call-2', artifact: 'cam/part.nc', machine: machine(loaded), signal }),
    ).rejects.toThrow(
      'Workshop X1C accepts additive.fff (application/vnd.bambulab.gcode-3mf); cam/part.nc is not one of them.',
    );
    /* A project file that is no program is never named G-code for the machine to refuse later. */
    await expect(planner({ toolCallId: 'call-3', artifact: 'main.scad', machine: router, signal })).rejects.toThrow(
      'main.scad is not one of them.',
    );
  });

  it('names a finished program by the extensions its container declares', async () => {
    const deps = { ...dependencies(), readArtifact: async () => new TextEncoder().encode('G21\n') };
    const router = fixtureEntry({ milling: true, run: false, name: 'Workshop mill' });
    const planner = createMachinePrintPlanner(deps);
    const { signal } = new AbortController();

    /* `.gc` is Grbl's, declared on the container; no table in Tau names it. */
    await expect(
      planner({ toolCallId: 'call-1', artifact: 'cam/PART.GC', machine: router, signal }),
    ).resolves.toMatchObject({ artifact: { mediaType: 'text/x.gcode', selectedMember: 'cam/PART.GC' } });
    await expect(planner({ toolCallId: 'call-2', artifact: 'cam/part.xyz', machine: router, signal })).rejects.toThrow(
      'Workshop mill accepts subtractive.milling (text/x.gcode: .gcode, .gc, .nc, .tap, .cnc); cam/part.xyz is not one of them.',
    );
  });

  it('refuses a plate container that names no plate to run, rather than guess one', async () => {
    const entry = machine(loaded);
    const { jobs } = entry.descriptor.capabilities;
    if (jobs.type !== 'supported') {
      throw new Error('The fixture printer takes jobs.');
    }
    const unnamed: MachineDirectoryEntry = {
      ...entry,
      descriptor: {
        ...entry.descriptor,
        capabilities: {
          ...entry.descriptor.capabilities,
          jobs: { ...jobs, accepts: jobs.accepts.map((container) => ({ ...container, requiredMembers: [] })) },
        },
      },
    };

    await expect(plan(dependencies(), unnamed)).rejects.toThrow(
      'Workshop X1C names no plate to run in application/vnd.bambulab.gcode-3mf.',
    );
  });

  it('refuses before slicing when nothing is loaded or the provider is gone', async () => {
    const empty = dependencies();
    await expect(plan(empty, machine({ materials: [{ slot: 0, state: 'empty' }] }))).rejects.toThrow(
      'No material is loaded in Workshop X1C; load one, then ask again.',
    );
    const orphaned = { ...dependencies(), machines: { listProviders: async () => [] } };
    await expect(plan(orphaned)).rejects.toThrow('No provider bambu backs Workshop X1C.');
    for (const deps of [empty, orphaned]) {
      expect(deps.exportModel).not.toHaveBeenCalled();
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
    expect(deps.exportModel.mock.calls[0]![0].options).toEqual({
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
    expect(deps.exportModel.mock.calls[0]![0].options).toMatchObject({
      bambuStudio: { plate: 'high-temperature', hints: { plate: 'high-temperature' } },
    });

    const refused = withBambuStudio();
    await expect(plan(refused, machine(loaded), { options: { walls: 3 } })).rejects.toThrow(
      'Bambu Studio slices for Workshop X1C, so options do not apply; set Bambu Studio settings instead, with keys from get_print_profiles.',
    );
    expect(refused.exportModel).not.toHaveBeenCalled();
  });

  it('refuses a reported plate Bambu Studio has no bed type for, before slicing', async () => {
    const deps = withBambuStudio();
    await expect(plan(deps, machine({ ...loaded, bedType: 'smooth-pei' }), {})).rejects.toThrow(
      'Bambu Studio has no build plate "smooth-pei"; ask the person which plate is installed, then pass plate as one of cool, engineering, high-temperature, textured-pei.',
    );
    expect(deps.exportModel).not.toHaveBeenCalled();
  });

  it('falls back to the reference engine without Bambu Studio, refusing Bambu Studio fields', async () => {
    const refused = dependencies();
    await expect(plan(refused, machine(loaded), { settings: { wall_loops: 3 } })).rejects.toThrow(
      'Bambu Studio does not slice for Workshop X1C on this host, so profiles and settings do not apply',
    );
    await expect(
      plan(refused, machine(loaded), { profiles: { printer: 'Bambu Lab X1 Carbon 0.4 nozzle' } }),
    ).rejects.toThrow('profiles and settings do not apply');
    expect(refused.exportModel).not.toHaveBeenCalled();
  });

  describe("for another vendor's printer", () => {
    /* Its own material system (`mmu/1`.., `spool-holder/main`), plain G-code and no Bambu settings. */
    const prusa = fixtureProvider(fixtureManifest({ generic: true }));
    const gcodePath = '.tau/artifacts/call-1__main.ts-gcode/pyramid.gcode';
    const program = new TextEncoder().encode(gcode);
    const generic = () => {
      const deps = withBambuStudio();
      return {
        ...deps,
        machines: { listProviders: async () => [prusa] },
        exportModel: vi.fn<NonNullable<MachinePrintPlannerDependencies['exportModel']>>(async () => ({
          isError: false,
          content: {
            success: true,
            to: 'gcode',
            files: [{ name: 'pyramid.gcode', artifactPath: gcodePath, mimeType: 'text/x.gcode', byteLength: 1 }],
          },
        })),
        readArtifact: vi.fn<MachinePrintPlannerDependencies['readArtifact']>(async () => program),
      };
    };
    const mk4 = (trays: readonly FixtureTray[]) => fixtureEntry({ generic: true, run: false, trays });

    it('keys its slots by address, every one the material system reports', () => {
      const entry = mk4([
        { unitId: 'mmu', slotId: '1', materialType: 'PLA' },
        { unitId: 'spool-holder', slotId: 'main', materialType: 'PETG' },
      ]);
      expect(observedSlots(entry).map(({ address }) => address)).toEqual([
        { unitId: 'mmu', slotId: '1' },
        { unitId: 'spool-holder', slotId: 'main' },
      ]);
    });

    it('plans a slice from the loaded slot, sends no Bambu keys, and exports the container its accepts name', async () => {
      const deps = generic();
      const entry = mk4([
        { unitId: 'mmu', slotId: '1', state: 'empty' },
        { unitId: 'mmu', slotId: '2', materialType: 'PLA' },
      ]);

      const result = await plan(deps, entry);

      /* The provider completes its own form from the program and what it reports (R5). */
      expect(result.configuration).toEqual({});
      /* Not Bambu's: the reference engine slices, to the plain G-code the printer accepts. */
      expect(deps.exportModel.mock.calls[0]![0]).toMatchObject({
        to: 'gcode',
        options: { plate: 'textured-pei', filamentType: 'PLA' },
      });
      expect(deps.exportModel.mock.calls[0]![0].options).not.toHaveProperty('engine');
      expect(result.artifact).toMatchObject({
        path: gcodePath,
        mediaType: 'text/x.gcode',
        contract: { id: 'tau.toolpath.gcode', version: 1 },
        selectedMember: gcodePath,
      });

      /* Its external spool feeds a print too. */
      await expect(
        plan(generic(), mk4([{ unitId: 'spool-holder', slotId: 'main', materialType: 'PETG' }])),
      ).resolves.toMatchObject({ configuration: {} });
    });

    it('slices for a printer that declares no material system with the process defaults', async () => {
      const entry = fixtureEntry({ generic: true, run: false });
      const { capabilities } = entry.descriptor;
      const bare: MachineDirectoryEntry = {
        ...entry,
        descriptor: {
          ...entry.descriptor,
          capabilities: {
            ...capabilities,
            components: capabilities.components.filter(({ kind }) => kind !== 'material-system'),
          },
        },
      };
      const manifest = fixtureManifest({ generic: true });
      const provider = fixtureProvider({
        ...manifest,
        components: manifest.components.filter(({ kind }) => kind !== 'material-system'),
      });
      const deps = { ...generic(), machines: { listProviders: async () => [provider] } };

      const result = await plan(deps, bare);

      expect(result.configuration).toEqual({});
      expect(deps.exportModel.mock.calls[0]![0]).toMatchObject({ to: 'gcode', options: { plate: 'textured-pei' } });
      /* Nothing reports a material, so none is claimed in the file. */
      expect(deps.exportModel.mock.calls[0]![0].options).not.toHaveProperty('filamentType');
    });

    it("keeps a stated plate out of a finished program's configuration, which the provider completes", async () => {
      const deps = generic();
      const result = await createMachinePrintPlanner(deps)({
        toolCallId: 'call-1',
        artifact: 'out/part.gcode',
        plate: 'cool',
        machine: fixtureEntry({ generic: true, run: false, plate: false }),
        signal: new AbortController().signal,
      });
      expect(result.configuration).toEqual({});
    });
  });

  describe('a plate stated for a finished program', () => {
    const finished = async (entry: MachineDirectoryEntry, plate: string, deps = dependencies()) =>
      createMachinePrintPlanner(deps)({
        toolCallId: 'call-1',
        artifact: artifactPath,
        plate,
        machine: entry,
        signal: new AbortController().signal,
      });

    it('is carried as operator confirmed for a Bambu printer that reports none', async () => {
      const result = await finished(machine({ materials: loaded.materials }), 'cool');
      expect(result.configuration).toEqual({ operatorConfirmedBedType: 'cool' });
      /* The printer's own report wins. */
      await expect(finished(machine(loaded), 'cool')).resolves.toMatchObject({ configuration: {} });
    });

    it('refuses on a machine that is no 3D printer, or a plate not its own, reading nothing', async () => {
      const deps = dependencies();
      await expect(
        finished(fixtureEntry({ milling: true, run: false, name: 'Workshop mill' }), 'cool', deps),
      ).rejects.toThrow('plate applies to a 3D printer; Workshop mill is not one, so pass no plate.');
      await expect(finished(machine({ materials: loaded.materials }), 'glass', deps)).rejects.toThrow(
        'plate "glass" is not one of Workshop X1C\'s plates: textured-pei, cool.',
      );
      expect(deps.readArtifact).not.toHaveBeenCalled();
    });
  });

  it('runs finished programs on a host that cannot slice, and refuses a targetFile there', async () => {
    const deps = { ...dependencies(), exportModel: undefined };
    await expect(plan(deps)).rejects.toThrow('This host cannot slice; name a finished program with artifact.');
    await expect(
      createMachinePrintPlanner(deps)({
        toolCallId: 'call-1',
        artifact: artifactPath,
        machine: machine(loaded),
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ artifact: { mediaType } });
  });

  it("reads only slicing and the provider's own settings, ignoring any other saved source", async () => {
    const record: MachineSettingsRecord = {
      version: 1,
      typeId: 'bambu.x1c',
      activeProfile: 'default',
      profiles: {
        default: {
          name: 'Default',
          configurations: {
            [slicingPreferences.manifest.source.id]: {
              version: slicingPreferences.manifest.source.version,
              values: { preset: 'fine' },
            },
            [bambuSettingsConfiguration.manifest.source.id]: {
              version: bambuSettingsConfiguration.manifest.source.version,
              values: { plate: 'cool' },
            },
            'acme.machine.settings': { version: '9.0.0', values: { nozzle: 'ruby' } },
          },
        },
      },
    };
    const service = { readMachineSettings: async () => ({ status: 'current', record }) as const };
    const { signal } = new AbortController();

    await expect(readProjectMachinePreferences(service, provider, { signal })).resolves.toMatchObject({
      preferences: { preset: 'fine', plate: 'cool' },
      machine: { plate: 'cool' },
    });
    /* Bambu's settings are a Bambu provider's alone. */
    await expect(
      readProjectMachinePreferences(service, fixtureProvider(fixtureManifest({ generic: true })), { signal }),
    ).resolves.toMatchObject({ preferences: { preset: 'fine' }, machine: {} });
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
    expect(result.program).toMatchObject({
      producer: { name: '@taucad/slicer reference' },
      facts: { layers: 3 },
      estimatedDuration: 3_723_000,
    });
  });

  describe("with the project's print intent", () => {
    const intent: SlicingPreferences & {
      plate?: ResolvedMachinePreferences['machine']['plate'];
    } = {
      preset: 'fine',
      printer: 'Bambu Lab X1 Carbon 0.4 nozzle',
      process: '0.12mm Fine @BBL X1C',
      filaments: { '0': 'Bambu PLA Basic @BBL X1C', '2': 'Bambu PETG Basic @BBL X1C' },
      settings: { wall_loops: 3, sparse_infill_density: '15%' },
      options: { walls: 4 },
    };
    const preferences = current(intent);

    it("should slice with the file's values under the call's own, and say which it used", async () => {
      const deps = withBambuStudio();
      const result = await plan(deps, machine(loaded), { settings: { sparse_infill_density: '25%' }, preferences });
      expect(sliced(deps)).toEqual({
        engine: 'bambu-studio',
        bambuStudio: {
          printer: 'Bambu Lab X1 Carbon 0.4 nozzle',
          process: '0.12mm Fine @BBL X1C',
          /* Slot 2 is the loaded one, so its filament is the one used. */
          filaments: ['Bambu PETG Basic @BBL X1C'],
          plate: 'textured-pei',
          settings: { wall_loops: 3, sparse_infill_density: '25%' },
          hints: {
            model: 'X1C',
            nozzleDiameter: 0.4,
            preset: 'fine',
            plate: 'textured-pei',
            materials: [{ slot: 2, materialId: 'PETG', profileId: 'GFG00' }],
          },
        },
      });
      /* Options are the reference engine's, so Bambu Studio leaves them in the file. */
      expect(result.machinePreferences).toEqual({
        ...reportedProfile,
        applied: {
          preset: 'fine',
          printer: 'Bambu Lab X1 Carbon 0.4 nozzle',
          process: '0.12mm Fine @BBL X1C',
          filaments: { '2': 'Bambu PETG Basic @BBL X1C' },
          settings: { wall_loops: 3 },
        },
      });
    });

    it("should keep none of the file's process or filaments for a printer the call names", async () => {
      const deps = withBambuStudio();
      const result = await plan(deps, machine(loaded), {
        preset: 'fast',
        profiles: { printer: 'Bambu Lab X1 Carbon 0.6 nozzle' },
        preferences,
      });
      expect(sliced(deps)).toEqual({
        engine: 'bambu-studio',
        bambuStudio: {
          printer: 'Bambu Lab X1 Carbon 0.6 nozzle',
          plate: 'textured-pei',
          settings: { wall_loops: 3, sparse_infill_density: '15%' },
          hints: expect.objectContaining({ preset: 'fast' }) as JsonObject,
        },
      });
      expect(result.machinePreferences).toEqual({
        ...reportedProfile,
        applied: { settings: { wall_loops: 3, sparse_infill_density: '15%' } },
      });
    });

    it("should apply only the file's quality preset and options when the reference engine slices", async () => {
      const deps = dependencies();
      const result = await plan(deps, machine(loaded), {
        options: { walls: 3 },
        preferences: current({ ...intent, options: { walls: 4, infillPercent: 30 } }),
      });
      /* The file's Bambu Studio values never reach the reference engine, and never refuse. The loaded tray's material
       * is recorded so the printer's filament check can read it. */
      expect(sliced(deps)).toEqual({
        plate: 'textured-pei',
        nozzleDiameter: 0.4,
        filamentDiameter: 1.75,
        filamentType: 'PETG',
        nozzleTemperature: 250,
        bedTemperature: 70,
        walls: 3,
        infillPercent: 30,
        preset: 'fine',
      });
      expect(result.machinePreferences).toEqual({
        ...reportedProfile,
        applied: { preset: 'fine', options: { infillPercent: 30 } },
      });
    });

    it("should stand the file's plate in for one the printer does not report, never for one it does", async () => {
      const deps = dependencies();
      const unreported = await plan(deps, machine({ materials: loaded.materials }), {
        preferences: current({ plate: 'high-temperature' }),
      });
      expect(unreported.configuration).toMatchObject({
        expectedBedType: 'high-temperature',
        operatorConfirmedBedType: 'high-temperature',
      });
      /* The approval prompt names the plate the person approves a print made for. */
      expect(unreported.statedPlate).toBe('high-temperature');
      expect(unreported.machinePreferences).toEqual({
        ...reportedProfile,
        configurationVersions: {
          ...reportedProfile.configurationVersions,
          [bambuSettingsConfiguration.manifest.source.id]: '1.0.0',
        },
        applied: { plate: 'high-temperature' },
      });

      const reported = await plan(dependencies(), machine(loaded), {
        preferences: current({ plate: 'high-temperature' }),
      });
      expect(reported.configuration).toMatchObject({ expectedBedType: 'textured-pei' });
      expect(reported.configuration).not.toHaveProperty('operatorConfirmedBedType');
      expect(reported).not.toHaveProperty('statedPlate');
      expect(reported.machinePreferences).toEqual({
        ...reportedProfile,
        configurationVersions: {
          ...reportedProfile.configurationVersions,
          [bambuSettingsConfiguration.manifest.source.id]: '1.0.0',
        },
        applied: {},
      });
    });

    it('should name the file when a slice it supplied values to fails', async () => {
      const deps = {
        ...withBambuStudio(),
        exportModel: async () => ({
          isError: true,
          content: { errorCode: 'EXPORT_FAILED', message: 'Bambu Studio has no process preset "0.12mm Old @BBL X1C".' },
        }),
      };
      await expect(
        plan(deps, machine(loaded), {
          preferences: current({ process: '0.12mm Old @BBL X1C' }),
        }),
      ).rejects.toThrow(
        `Slicing main.ts failed: Bambu Studio has no process preset "0.12mm Old @BBL X1C". The project's ${settingsPath} supplied process; edit it there, or pass your own.`,
      );
    });
  });

  describe('with a model of several colours', () => {
    /* Lane M's real Bambu Studio slice: a red cube (filament 1) beside a blue one (filament 2). */
    const twoColour = writeBambuContainer({
      gcode: readFileSync(
        new URL('../../../../packages/plugins/slicer/src/__fixtures__/two-colour-cubes.gcode', import.meta.url),
      ).toString(),
      modelName: 'cubes',
    });
    const resliced = writeBambuContainer({ gcode, modelName: 'cubes-resliced' });
    const tray = (slot: number, materialId: string, color: string) => ({
      slot,
      state: 'loaded',
      materialId,
      profileId: materialId.toUpperCase() === 'PETG' ? 'GFG00' : 'GFA00',
      color,
    });
    /* The first slice reads two colours; the one after it is a re-slice. */
    const slicing = <Deps extends MachinePrintPlannerDependencies>(deps: Deps) => ({
      ...deps,
      readArtifact: vi
        .fn<MachinePrintPlannerDependencies['readArtifact']>()
        .mockResolvedValueOnce(twoColour)
        .mockResolvedValue(resliced),
    });
    const exported = (deps: Pick<ReturnType<typeof dependencies>, 'exportModel'>) =>
      deps.exportModel.mock.calls.map(([call]) => call.options?.['bambuStudio']);

    it("should map each colour to a tray of that colour, and re-slice with each tray's filament", async () => {
      const deps = slicing(withBambuStudio());
      /* The printer reports RGBA; slot 0 is the first loaded one, which a one-colour print uses. */
      const entry = machine({
        bedType: 'textured-pei',
        materials: [
          tray(0, 'PLA', '#0000FFFF'),
          /* Listed before the AMS tray, the external spool holds red PLA too, but cannot change filament mid-print. */
          tray(254, 'PLA', '#FF0000FF'),
          { ...tray(1, 'PLA', '#FF0000FF'), profileId: 'GFA01' },
          tray(3, 'PETG', '#FF0000FF'),
        ],
      });
      const result = await plan(deps, entry);
      expect(result.configuration).toMatchObject({
        amsMapping: [1, 0],
      });
      /* The first slice printed both parts with slot 0's preset; filament 1 prints from slot 1's. */
      const [first, second, ...more] = exported(deps);
      expect(first).not.toHaveProperty('filaments');
      expect(second).toMatchObject({ filaments: ['Bambu PLA Matte @BBL X1C', 'Bambu PLA Basic @BBL X1C'] });
      expect(more).toEqual([]);
      expect(deps.bambuStudio.loadBambuStudioCatalog).toHaveBeenCalledWith(install, {
        model: 'X1C',
        nozzleDiameter: 0.4,
      });
      /* The request names the re-slice, which the export recorded at the same path. */
      expect(result.artifact).toMatchObject({
        path: artifactPath,
        digest: `sha256:${await sha256Bytes(resliced)}`,
        length: resliced.byteLength,
      });
    });

    it('should resolve saved slots before choosing each filament preset and pin their profile provenance', async () => {
      const deps = slicing(withBambuStudio());
      const preferences = current({ printer: printers[0] });
      const result = await plan(
        deps,
        machine({
          bedType: 'textured-pei',
          materials: [tray(0, 'PLA', '#0000FFFF'), tray(3, 'PETG', '#FF0000FF')],
        }),
        {
          preferences: {
            ...preferences,
            machine: { material: { slotsByColor: { '#ff0000': 3, '#0000ff': 0 } } },
          },
        },
      );
      expect(result.configuration).toMatchObject({
        amsMapping: [3, 0],
      });
      expect(exported(deps)[1]).toMatchObject({
        filaments: ['Bambu PETG Basic @BBL X1C', 'Bambu PLA Basic @BBL X1C'],
      });
      expect(result.program).toMatchObject({
        preferences: {
          scope: 'project',
          typeId: 'bambu.x1c',
          profileId: 'default',
          configurationVersions: {
            [slicingPreferences.manifest.source.id]: slicingPreferences.manifest.source.version,
          },
        },
      });
    });

    it("should take a free tray of the print's material for a colour none holds, and slice once when the presets agree", async () => {
      const deps = slicing(withBambuStudio());
      /* No PLA tray is blue; slot 2 is free, and slot 3 is blue but PETG. */
      const entry = machine({
        bedType: 'textured-pei',
        materials: [tray(0, 'PLA', '#FF0000FF'), tray(2, 'pla', '#FFFFFFFF'), tray(3, 'PETG', '#0000FFFF')],
      });
      const result = await plan(deps, entry);
      /* Each tray's own spelling, which preflight compares. */
      expect(result.configuration).toMatchObject({
        amsMapping: [0, 2],
      });
      expect(deps.exportModel).toHaveBeenCalledTimes(1);
      expect(result.artifact.digest).toBe(`sha256:${await sha256Bytes(twoColour)}`);
    });

    it('should refuse a colour no free tray of the material can print, naming it', async () => {
      const deps = slicing(withBambuStudio());
      const entry = machine({
        bedType: 'textured-pei',
        materials: [tray(0, 'PLA', '#FF0000FF'), tray(3, 'PETG', '#0000FFFF')],
      });
      await expect(plan(deps, entry)).rejects.toThrow(
        "No free PLA slot in Workshop X1C for the model's colour #0000FF; load one for each, then ask again.",
      );
    });

    it("should keep the filaments a call names, and the file's for each mapped slot", async () => {
      const entry = machine({
        bedType: 'textured-pei',
        materials: [tray(0, 'PLA', '#0000FFFF'), tray(1, 'PLA', '#FF0000FF')],
      });
      const own = slicing(withBambuStudio());
      const named = await plan(own, entry, { profiles: { filaments: ['Bambu PLA Matte @BBL X1C'] } });
      expect(named.configuration).toMatchObject({ amsMapping: [1, 0] });
      expect(exported(own)).toMatchObject([{ filaments: ['Bambu PLA Matte @BBL X1C'] }]);
      expect(own.bambuStudio.loadBambuStudioCatalog).not.toHaveBeenCalled();

      const deps = slicing(withBambuStudio());
      const result = await plan(deps, entry, {
        preferences: current({
          printer: printers[0],
          filaments: { '0': 'Bambu PLA Basic @BBL X1C', '1': 'Bambu PLA Matte @BBL X1C', '2': 'Generic PLA' },
        }),
      });
      expect(exported(deps)).toMatchObject([
        { printer: printers[0], filaments: ['Bambu PLA Basic @BBL X1C'] },
        { printer: printers[0], filaments: ['Bambu PLA Matte @BBL X1C', 'Bambu PLA Basic @BBL X1C'] },
      ]);
      expect(deps.bambuStudio.loadBambuStudioCatalog).toHaveBeenCalledWith(install, { printer: printers[0] });
      /* Only the slots this print uses. */
      expect(result.machinePreferences).toEqual({
        ...reportedProfile,
        applied: {
          printer: printers[0],
          filaments: { '1': 'Bambu PLA Matte @BBL X1C', '0': 'Bambu PLA Basic @BBL X1C' },
        },
      });
    });

    it('should print a one-part slice of several loaded presets from one slot', async () => {
      /* Bambu Studio records a colour per loaded preset; its header says the plate prints filament 1 only. */
      const onePart = writeBambuContainer({
        gcode: `; HEADER_BLOCK_START\n; filament: 1\n; HEADER_BLOCK_END\n${gcode}`,
        modelName: 'pyramid',
        filamentColors: ['#F5A623', '#FFFFFF'],
      });
      const deps = { ...withBambuStudio(), readArtifact: async () => onePart };
      const result = await plan(deps);
      expect(result.configuration).toMatchObject({ amsMapping: [2] });
      expect(deps.exportModel).toHaveBeenCalledTimes(1);
    });
  });

  it('reads the colours a slice prints and the slots that print them', () => {
    const colors = (header: string, filamentColors: readonly string[]) =>
      slicedFilamentColors({ gcode: new TextEncoder().encode(`${header}\nG28\n`), filamentColors });
    expect(colors('; filament: 1', ['#F5A623', '#FFFFFF'])).toEqual(['#F5A623']);
    expect(colors('; filament: 1,2', ['#FF0000', '#0000FF'])).toEqual(['#FF0000', '#0000FF']);
    /* No header: every recorded colour, as the reference engine's one. */
    expect(colors('G90', ['#F5A623'])).toEqual(['#F5A623']);

    const trays = [
      { slot: 0, state: 'loaded', materialId: 'PLA', color: '#FF0000FF' },
      { slot: 1, state: 'loaded', materialId: 'pla', color: 'ffffffff' },
      { slot: 2, state: 'empty', color: '#0000FFFF' },
      { slot: 3, state: 'loaded', materialId: 'PETG', color: '#0000FFFF' },
    ] as const;
    /* A colour no tray holds waits until red has taken its own tray. */
    expect(defaultFilamentSlots(['#123456', '#FF0000'], trays, 'PLA')).toEqual([1, 0]);
    expect(defaultFilamentSlots(['#FFFFFF', '#FF0000', '#0000FF'], trays, 'PLA')).toEqual([1, 0, undefined]);
    expect(defaultFilamentSlots(['#0000FF'], trays, 'PETG')).toEqual([3]);
  });

  it('takes the nearest colour when no tray holds the exact one', () => {
    // A model's pure red and grey against the colours spools actually come in.
    const trays = [
      { slot: 0, state: 'loaded', materialId: 'PETG', color: '#161616FF' },
      { slot: 1, state: 'loaded', materialId: 'PETG', color: '#8E9089FF' },
      { slot: 3, state: 'loaded', materialId: 'PETG', color: '#C12E1FFF' },
    ] as const;
    expect(defaultFilamentSlots(['#FF0000'], trays, 'PETG')).toEqual([3]);
    expect(defaultFilamentSlots(['#808080', '#FF0000'], trays, 'PETG')).toEqual([1, 3]);
    // The closest pair is settled first, so a later filament's near match is not taken by an earlier one's far one.
    expect(defaultFilamentSlots(['#303030', '#161616'], trays.slice(0, 2), 'PETG')).toEqual([1, 0]);
  });

  it('passes on what the export warned about the slice it made', async () => {
    const warning = {
      message: "The reference engine prints one material, so the model's 2 colours (#FF0000, #0000FF) print as one.",
      code: 'REPRESENTATION_UNSUPPORTED',
      severity: 'warning',
      details: { colors: ['#FF0000', '#0000FF'] },
    } as const;
    const deps = dependencies();
    deps.exportModel.mockResolvedValueOnce({
      isError: false,
      content: {
        success: true,
        to: 'gcode.3mf',
        files: [{ name: 'pyramid.gcode.3mf', artifactPath, mimeType: mediaType, byteLength: container.byteLength }],
        warnings: [warning],
      },
    });
    const warned = await plan(deps);
    expect(warned.warnings).toEqual([warning]);
    expect(await plan(dependencies())).not.toHaveProperty('warnings');
  });

  it('reports why the export refused instead of requesting nothing', async () => {
    const deps = {
      ...dependencies(),
      exportModel: async () => ({
        isError: true,
        content: { errorCode: 'KERNEL_ERROR', message: 'Kernel refused' },
      }),
    };
    await expect(plan(deps)).rejects.toThrow('Slicing main.ts failed: Kernel refused');
    expect(deps.readArtifact).not.toHaveBeenCalled();
  });
});
