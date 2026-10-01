import { describe, expect, it } from 'vitest';
import type { PrintRequest } from '@taucad/runtime/machine';
import { selectPrinterLive } from '#components/printer/use-printer-live.js';
import {
  agentRequest,
  artifact,
  entry,
  manifest,
  printing,
  timestamp,
} from '#routes/w.$workspace.$project/chat-print.fixture.js';

// SAFETY: the brand names exactly this shape; the test never verifies bytes.
const otherDigest = `sha256:${'d'.repeat(64)}` as PrintRequest['artifact']['digest'];

/** A request the ledger records as started, naming the provider run its start receipt reported. */
const started = (providerRunId: string): PrintRequest =>
  agentRequest({
    state: 'started',
    receipt: {
      operationId: 'start-1',
      machineId: 'machine-1',
      kind: 'start',
      status: 'accepted',
      providerRunId,
      observedAt: timestamp,
    },
  });

describe('selectPrinterLive', () => {
  it('draws the followed machine with its own provider manifest', () => {
    const live = selectPrinterLive(
      [entry({ machineId: 'idle-1' }), printing()],
      new Map([['bambu-simulator', manifest]]),
    );

    expect(live?.isActive).toBe(true);
    expect(live?.manifest).toBe(manifest);
    // The name the person gave the printer, not the one the device reports (blueprint D3).
    expect(live?.machineName).toBe('Workshop X1C');
  });

  it('leaves the manifest unset until the providers load, or when the provider published none', () => {
    expect(selectPrinterLive([printing()])?.manifest).toBeUndefined();
    expect(selectPrinterLive([printing()], new Map([['other-provider', manifest]]))?.manifest).toBeUndefined();
  });

  it('follows a run only from the file whose exact bytes the run prints', () => {
    const file = { digest: artifact.digest, requests: [started('provider-run-1')] };

    expect(selectPrinterLive([printing()], undefined, { file })).toMatchObject({
      isActive: true,
      printsThisFile: true,
    });
    // Another file's tab: the machine prints, but not these bytes.
    expect(selectPrinterLive([printing()], undefined, { file: { ...file, digest: otherDigest } })).toMatchObject({
      isActive: true,
      printsThisFile: false,
    });
    // A run no request started, such as one started on the printer's own screen.
    const unrelated = { ...file, requests: [started('provider-run-2')] };
    expect(selectPrinterLive([printing()], undefined, { file: unrelated })?.printsThisFile).toBe(false);
    expect(selectPrinterLive([printing()])?.printsThisFile).toBe(false);
  });

  it('follows no machine that is stale or disconnected', () => {
    expect(
      selectPrinterLive([entry({ freshness: 'stale' })], new Map([['bambu-simulator', manifest]])),
    ).toBeUndefined();
  });
});

it('keeps the selected Mini even while another printer runs or changes order', () => {
  const mini = entry({ machineId: 'mini', providerId: 'bambu-a1-mini', name: 'Mini' });
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
