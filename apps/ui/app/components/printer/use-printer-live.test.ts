import { describe, expect, it } from 'vitest';
import type { MachineJob, MachineRun } from '@taucad/runtime/machine';
import { createQuantity, quantityKinds, quantityReferences } from '@taucad/units/quantity';
import type { Quantity } from '@taucad/units/quantity';
import { selectPrinterLive } from '#components/printer/use-printer-live.js';
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
