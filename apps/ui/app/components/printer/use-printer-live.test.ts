import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { fffProcessOf } from '@taucad/runtime/machine';
import type { MachineClient, MachineDirectoryCursor, MachineJob, MachineRun } from '@taucad/runtime/machine';
import { createQuantity, quantityKinds, quantityReferences } from '@taucad/units/quantity';
import type { Quantity } from '@taucad/units/quantity';
import { selectPrinterLive, useMachineDirectoryEntries } from '#components/printer/use-printer-live.js';
import {
  a1MiniManifest,
  fffComponents,
  known,
  machineEntry,
  machineSnapshot,
  observedAt,
  x1cManifest,
} from '#components/print/testing/machines.fixture.js';

// SAFETY: the brand names exactly this shape; the test never verifies bytes.
const digest = `sha256:${'a'.repeat(64)}` as MachineJob['artifact']['digest'];
// SAFETY: as above.
const otherDigest = `sha256:${'d'.repeat(64)}` as MachineJob['artifact']['digest'];

/** A real temperature, which the viewer converts to degrees Celsius. */
const celsius = (value: number): Quantity => {
  const result = createQuantity({
    value,
    unit: 'Cel',
    kind: quantityKinds.temperature,
    space: 'point',
    reference: quantityReferences.thermodynamicAbsoluteZero,
  });
  if (result.status !== 'success') {
    throw new Error('Cannot build a temperature.');
  }
  return result.value;
};

const run: MachineRun = {
  runId: 'run-1',
  origin: 'tau',
  delivery: 'stored',
  state: 'running',
  progress: { basis: 'executed', fraction: 0.42, counters: [{ id: 'layer', label: 'Layer', current: 12, total: 80 }] },
};

/** A heating, printing X1C: nozzle and bed with targets, the chamber light on and a red spool in A1. */
const printing = () =>
  machineEntry({
    manifest: x1cManifest,
    snapshot: machineSnapshot(
      [
        ...fffComponents().filter(({ componentId }) => !['tool-0', 'bed', 'chamber-light'].includes(componentId)),
        known('tool-0', 'temperature', {
          kind: 'readings',
          values: [{ id: 'nozzle', label: 'Nozzle', value: celsius(215), target: celsius(220) }],
        }),
        known('bed', 'temperature', {
          kind: 'readings',
          values: [{ id: 'bed', label: 'Bed', value: celsius(54), target: celsius(55) }],
        }),
        known('chamber-light', 'accessories', { kind: 'switch', on: true }),
      ],
      { state: { status: 'active' }, run },
    ),
  });

/** A job the ledger records as started, naming the run its start receipt reported. */
const started = (runId: string): MachineJob => ({
  version: 1,
  jobId: 'job-1',
  machineId: 'machine-1',
  artifact: {
    projectId: 'proj_aaaaaaaaaaaaaaaaaaaaa',
    path: 'plate.gcode.3mf',
    digest,
    length: 1,
    mediaType: 'application/vnd.bambulab.gcode-3mf',
    contract: { id: 'manufacturing.toolpath.bambu-gcode-3mf', version: 1 },
    selectedMember: 'Metadata/plate_1.gcode',
  },
  configuration: {},
  requestedBy: { kind: 'user', id: 'operator', label: 'You' },
  state: 'started',
  createdAt: observedAt,
  updatedAt: observedAt,
  program: { name: 'plate', facts: { process: 'fff' } },
  checks: [],
  receipt: {
    operationId: 'start-1',
    machineId: 'machine-1',
    kind: 'start',
    status: 'accepted',
    runId,
    observedAt,
  },
});

describe('selectPrinterLive', () => {
  it('draws the followed machine with its own provider manifest', () => {
    const live = selectPrinterLive(
      [machineEntry({ manifest: x1cManifest, machineId: 'idle-1' }), printing()],
      new Map([['bambu-simulator', x1cManifest]]),
    );

    expect(live?.isActive).toBe(true);
    expect(live?.manifest).toBe(x1cManifest);
    // The name the person gave the printer, not the one the device reports (blueprint D3).
    expect(live?.machineName).toBe('Workshop X1C');
  });

  it('reads targets from the toolhead and heater, the light switch, the layer counter and the loaded spool', () => {
    expect(selectPrinterLive([printing()])).toMatchObject({
      runState: 'running',
      nozzleTarget: 220,
      bedTarget: 55,
      chamberLight: 'on',
      position: { currentLayer: 12, totalLayers: 80, progress: 42 },
      filamentColor: '#000000',
    });
  });

  /** The printing X1C with a heated chamber listed before the bed; its FFF process names `heater` as the bed's when given. */
  const withChamber = (heater?: string) => {
    const base = printing();
    const { components, processes } = base.descriptor.capabilities;
    const fff = fffProcessOf(base.descriptor.capabilities);
    return {
      ...base,
      descriptor: {
        ...base.descriptor,
        capabilities: {
          ...base.descriptor.capabilities,
          components: [{ id: 'chamber', kind: 'heater', label: 'Chamber' } as const, ...components],
          processes: processes.map((process) =>
            process === fff && heater !== undefined ? { ...fff, bed: { ...fff.bed, heater } } : process,
          ),
        },
      },
      snapshot: {
        ...base.snapshot,
        components: [
          known('chamber', 'temperature', {
            kind: 'readings',
            values: [{ id: 'chamber', label: 'Chamber', value: celsius(40), target: celsius(60) }],
          }),
          ...base.snapshot.components,
        ],
      },
    };
  };

  it("shows no bed target where several heaters leave the bed unnamed, never another heater's", () => {
    expect(selectPrinterLive([withChamber()])?.bedTarget).toBeUndefined();
  });

  it('reads the bed target from the heater the FFF process names, past a chamber heater listed first', () => {
    expect(selectPrinterLive([withChamber('bed')])?.bedTarget).toBe(55);
  });

  it('reads the layer counter by its id, never by an English label', () => {
    const base = printing();
    const counted = {
      ...base,
      snapshot: {
        ...base.snapshot,
        run: { ...run, progress: { ...run.progress, counters: [{ id: 'lines', label: 'Layers', current: 3 }] } },
      },
    };

    expect(selectPrinterLive([counted])?.position.currentLayer).toBeUndefined();
  });

  it('reads an undeclared light as unknown, as on the A1 mini', () => {
    expect(selectPrinterLive([machineEntry({ manifest: a1MiniManifest })])?.chamberLight).toBe('unknown');
  });

  it('leaves the manifest unset until the providers load, or when the provider published none', () => {
    expect(selectPrinterLive([printing()])?.manifest).toBeUndefined();
    expect(selectPrinterLive([printing()], new Map([['other-provider', x1cManifest]]))?.manifest).toBeUndefined();
  });

  it('follows a run only from the file whose exact bytes the run prints', () => {
    const file = { digest, jobs: [started('run-1')] };

    expect(selectPrinterLive([printing()], undefined, { file })).toMatchObject({
      isActive: true,
      printsThisFile: true,
    });
    // Another file's tab: the machine prints, but not these bytes.
    expect(selectPrinterLive([printing()], undefined, { file: { ...file, digest: otherDigest } })).toMatchObject({
      isActive: true,
      printsThisFile: false,
    });
    // A run no job started, such as one started on the printer's own screen.
    const unrelated = { ...file, jobs: [started('run-2')] };
    expect(selectPrinterLive([printing()], undefined, { file: unrelated })?.printsThisFile).toBe(false);
    expect(selectPrinterLive([printing()])?.printsThisFile).toBe(false);
  });

  it('follows no machine that is stale or disconnected', () => {
    expect(
      selectPrinterLive(
        [machineEntry({ manifest: x1cManifest, freshness: 'stale' })],
        new Map([['bambu-simulator', x1cManifest]]),
      ),
    ).toBeUndefined();
  });
});

it('keeps the selected Mini even while another printer runs or changes order', () => {
  const mini = machineEntry({ manifest: a1MiniManifest, machineId: 'mini', providerId: 'bambu-a1-mini', name: 'Mini' });
  const x1 = printing();
  for (const entries of [
    [x1, mini],
    [mini, x1],
  ]) {
    expect(selectPrinterLive(entries, undefined, { machineId: 'mini' })).toMatchObject({
      machineId: 'mini',
      isActive: false,
    });
  }
  expect(selectPrinterLive([x1, { ...mini, freshness: 'stale' }], undefined, { machineId: 'mini' })).toMatchObject({
    machineId: 'mini',
    isActive: false,
    printsThisFile: false,
    chamberLight: 'unknown',
    nozzleTarget: undefined,
  });
});

describe('useMachineDirectoryEntries', () => {
  it('lists again once the directory watch ends, so the viewer resyncs (R10)', async () => {
    const cursor = (position: number): MachineDirectoryCursor => ({
      hostId: 'host-1',
      authorityId: 'authority-1',
      generation: 'generation-1',
      position,
      revision: position,
    });
    const list = vi
      .fn<MachineClient['list']>()
      .mockResolvedValueOnce({ cursor: cursor(1), entries: [] })
      .mockResolvedValue({ cursor: cursor(2), entries: [printing()] });
    // SAFETY: the hook calls only list and watch.
    const client = {
      list,
      // A watch that ends at once, as after a host restart.
      async *watch() {
        yield* [];
      },
    } as unknown as MachineClient;

    const { result } = renderHook(() => useMachineDirectoryEntries(client));

    await waitFor(() => {
      expect(result.current?.map(({ machineId }) => machineId)).toEqual(['machine-1']);
    });
    expect(list).toHaveBeenCalledTimes(2);
  });
});
