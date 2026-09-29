// @vitest-environment node
/* eslint-disable @typescript-eslint/naming-convention -- pointA/pointB are existing exact-measurement transport fields. */
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { MessageChannel } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';
import { runExactRequest } from './measurement-exact.transport.desktop.js';

const connect = vi.hoisted(() => vi.fn());
vi.mock('#filesystem/desktop-bridge.js', () => ({
  desktopBridge: () => ({ exactMeasurement: { connect } }),
}));

describe('desktop exact measurement transport', () => {
  it('should convert a matching native fact once at the UI boundary', async () => {
    const { port1, port2 } = new MessageChannel();
    connect.mockResolvedValueOnce(port1);
    const pending = runExactRequest({
      id: 6,
      source: { format: 'ap242', bytes: new TextEncoder().encode('AP242'), coordinateSystem: 'y-up' },
      occurrences: [{ name: 'a' }, { name: 'b' }],
    });
    await vi.waitFor(() => { expect(connect).toHaveBeenCalled(); });
    port2.postMessage({
      id: 6,
      result: {
        status: 'complete',
        fact: {
          source: 'ap242', assurance: 'exact-brep', unit: 'mm', coordinateSystem: 'z-up',
          subjectHash: 'a'.repeat(64), algorithmProfile: 'geospec-minimum-distance-v1',
          occurrences: ['a-path', 'b-path'], distance: 20,
          points: [[10, 5, 15], [30, 5, 15]],
        },
      },
    });
    await expect(pending).resolves.toEqual({
      id: 6, status: 'cad-geometry', source: 'ap242', distanceMeters: 0.02,
      pointAMeters: [0.01, 0.005, 0.015], pointBMeters: [0.03, 0.005, 0.015],
    });
    port2.close();
  });

  it('should close a late port and return cancellation without publishing its result', async () => {
    const controller = new AbortController();
    const port = mock<MessagePort>();
    let answerConnection: ((port: MessagePort) => void) | undefined;
    connect.mockImplementationOnce(async () => new Promise<MessagePort>((resolve) => { answerConnection = resolve; }));

    const pending = runExactRequest({
      id: 7,
      source: { format: 'ap242', bytes: new TextEncoder().encode('AP242'), coordinateSystem: 'y-up' },
      occurrences: [{ name: 'a' }, { name: 'b' }],
    }, controller.signal);
    controller.abort();
    expect(await pending).toEqual({ id: 7, status: 'unavailable', reason: 'The exact query was cancelled.' });
    answerConnection?.(port);
    await vi.waitFor(() => { expect(port.close).toHaveBeenCalledOnce(); });
    expect(port.postMessage).not.toHaveBeenCalled();
  });
});
