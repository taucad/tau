import { afterEach, describe, expect, it, vi } from 'vitest';

import { defineRuntime } from '#worker/index.js';
import { fromMemoryFs } from '#filesystem/index.js';
import { electronUtilityClient } from '#electron/electron-utility-client.js';
import { registerElectronRuntimeHostExit } from '#electron/_internal/runtime-host-lease.js';
import type { ElectronRuntimeHostExitDetail } from '#electron/_internal/runtime-host-lease.js';
import type * as RuntimeHostModule from '#host/create-runtime-host.js';
import type * as ElectronUtilityModule from '#electron/utility.js';

vi.mock('#host/create-runtime-host.js', () => ({
  createRuntimeHost: vi.fn(() => ({ dispose: vi.fn(), id: 'electron-utility-host' })),
}));

describe('Electron utility runtime helper', () => {
  it('creates a runtime host from a worker-owned runtime and transport filesystem', async () => {
    const hostModule: typeof RuntimeHostModule = await import('#host/create-runtime-host.js');
    const utilityModule: typeof ElectronUtilityModule = await import('#electron/utility.js');
    const runtime = defineRuntime({ kernels: [] });
    const sourcePath = 'main.scad';

    const host = utilityModule.serveElectronRuntime({
      fileSystem: fromMemoryFs({ [sourcePath]: 'cube(10);' }),
      installProcessTeardown: false,
      runtime,
    });

    expect(host).toMatchObject({ id: 'electron-utility-host' });
    const createRuntimeHost = vi.mocked(hostModule.createRuntimeHost);
    expect(createRuntimeHost).toHaveBeenCalledTimes(1);
    expect(createRuntimeHost.mock.calls[0]?.[0].transport.id).toBe('electron-utility');
  });
});

/**
 * A renderer-shaped Electron client whose port death and exit relay can be
 * driven independently — the two signals whose ordering used to decide whether
 * the exit code survived.
 *
 * @returns The client, a way to kill the far end of its port, and the relay.
 */
const utilityClientHarness = () => {
  const { port1, port2 } = new MessageChannel();
  let notify: ((detail: ElectronRuntimeHostExitDetail) => void) | undefined;
  registerElectronRuntimeHostExit(port1 as unknown as MessagePort, (listener) => {
    notify = listener;
  });
  const client = electronUtilityClient({ port: port1 as unknown as MessagePort });
  return {
    client,
    killPort: (): void => {
      port2.close();
    },
    relay: (detail: ElectronRuntimeHostExitDetail): void => notify?.(detail),
  };
};

/** Let the port's `close` event reach the transport before timers advance. */
const flushPortEvents = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
};

describe('Electron utility transport close classification', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports the relayed exit code when the port death is observed first', async () => {
    vi.useFakeTimers();
    const { client, killPort, relay } = utilityClientHarness();

    killPort();
    await flushPortEvents();
    /* The last millisecond of the window still belongs to the relay. */
    await vi.advanceTimersByTimeAsync(249);
    relay({ exitCode: 1, released: false, stderrTail: 'boot: missing entry\n' });

    await expect(client.closed).resolves.toEqual({
      cause: 'host-exit',
      exitCode: 1,
      phase: 'boot',
      released: false,
      stderrTail: 'boot: missing entry\n',
    });
  });

  it('reports an unsignalled exit once the relay window elapses', async () => {
    vi.useFakeTimers();
    const { client, killPort, relay } = utilityClientHarness();

    killPort();
    await flushPortEvents();
    await vi.advanceTimersByTimeAsync(250);

    await expect(client.closed).resolves.toEqual({ cause: 'host-exit', phase: 'boot' });
    /* An exit report that misses the window cannot rewrite a settled fact. */
    relay({ exitCode: 4, released: false });
    await expect(client.closed).resolves.toEqual({ cause: 'host-exit', phase: 'boot' });
  });

  it('settles at once when the exit relay arrives before the port death', async () => {
    vi.useFakeTimers();
    const { client, killPort, relay } = utilityClientHarness();

    relay({ exitCode: 3, released: false });

    await expect(client.closed).resolves.toEqual({
      cause: 'host-exit',
      exitCode: 3,
      phase: 'boot',
      released: false,
    });
    killPort();
    await flushPortEvents();
    await expect(client.closed).resolves.toEqual({
      cause: 'host-exit',
      exitCode: 3,
      phase: 'boot',
      released: false,
    });
  });

  it('classifies a kill the supervisor initiated as a requested teardown', async () => {
    vi.useFakeTimers();
    const { client, killPort, relay } = utilityClientHarness();

    killPort();
    await flushPortEvents();
    relay({ exitCode: 0, released: true });

    await expect(client.closed).resolves.toEqual({ cause: 'requested' });
  });
});
