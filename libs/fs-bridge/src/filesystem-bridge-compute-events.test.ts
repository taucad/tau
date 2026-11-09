/**
 * The compute event relay (charter D14, W10): what the compute worker's one
 * supervisor reports on a death reaches every rooted connection's event
 * channel, once per death, and nothing after the relay is disposed.
 */
import { describe, expect, it } from 'vitest';
import { computeEventRelay } from '#filesystem-bridge-compute-events.js';
import type { ComputeRestartedEvent } from '#filesystem-bridge-compute-events.js';
import { createFileSystemBridgePort, createFileSystemBridgeProxy } from '#filesystem-bridge.js';
import type { FileSystemBridgeEvent } from '#filesystem-bridge-protocol.js';
import { rootedWorkspaceHandlers } from '#filesystem-bridge-rooted.test-fixture.js';

describe('computeEventRelay', () => {
  it('turns each crash report into one compute-restarted event for every listener', () => {
    const relay = computeEventRelay();
    const first: ComputeRestartedEvent[] = [];
    const second: ComputeRestartedEvent[] = [];
    relay.source.subscribe((event) => first.push(event));
    const leave = relay.source.subscribe((event) => second.push(event));
    relay.onCrash({ failedCalls: 3, restarts: 1, abandoned: false });
    leave();
    relay.onCrash({ failedCalls: 0, restarts: 4, abandoned: true });
    expect(first).toEqual([
      { kind: 'compute-restarted', failedCalls: 3, restarts: 1, abandoned: false },
      { kind: 'compute-restarted', failedCalls: 0, restarts: 4, abandoned: true },
    ]);
    expect(second).toHaveLength(1);
    relay.dispose();
    relay.onCrash({ failedCalls: 1, restarts: 5, abandoned: true });
    expect(first).toHaveLength(2);
  });

  it('copies only the report fields onto the event', () => {
    const relay = computeEventRelay();
    const heard: ComputeRestartedEvent[] = [];
    relay.source.subscribe((event) => heard.push(event));
    const report = { failedCalls: 1, restarts: 1, abandoned: false, extra: 'x' };
    relay.onCrash(report);
    expect(heard).toEqual([{ kind: 'compute-restarted', failedCalls: 1, restarts: 1, abandoned: false }]);
    relay.dispose();
  });

  it("reaches a rooted connection's event channel when the supervisor reports a death", async () => {
    const relay = computeEventRelay();
    const { service, handlers } = await rootedWorkspaceHandlers({ 'a.ts': 'x' }, 'working-copy');
    const proxy = createFileSystemBridgeProxy(createFileSystemBridgePort(handlers, { computeEvents: relay.source }));
    try {
      await proxy.ready;
      const heard: FileSystemBridgeEvent[] = [];
      const arrived = new Promise<void>((resolve) => {
        proxy.events((event) => {
          heard.push(event);
          resolve();
        });
      });
      await proxy.events(() => undefined).ready;
      relay.onCrash({ failedCalls: 2, restarts: 1, abandoned: false });
      await arrived;
      expect(heard).toEqual([{ kind: 'compute-restarted', failedCalls: 2, restarts: 1, abandoned: false }]);
    } finally {
      proxy.dispose();
      service.dispose();
      relay.dispose();
    }
  });
});
