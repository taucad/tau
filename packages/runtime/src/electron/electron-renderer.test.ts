// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createElectronClientOptions,
  getElectronRuntimeBridge,
  requestElectronRuntimePort,
} from '#electron/renderer.js';

describe('Electron renderer runtime helpers', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis as unknown as Record<string, unknown>, 'taucad');
  });

  it('fails loudly when the preload bridge is unavailable', () => {
    expect(() => getElectronRuntimeBridge()).toThrow(/window\.taucad bridge is unavailable/);
  });

  it('requests a runtime port after subscribing to the preload relay', async () => {
    const port = new MessageChannel().port1;
    let listener: ((event: MessageEvent) => void) | undefined;
    const target = {
      addEventListener: vi.fn((_name: 'message', handler: (event: MessageEvent) => void) => {
        listener = handler;
      }),
      removeEventListener: vi.fn(),
    } as unknown as Window;
    const requestRuntimePort = vi.fn(() => {
      listener?.({ data: { taucadRelay: 'taucad:connect-runtime:port' }, ports: [port] } as unknown as MessageEvent);
    });
    const bridge = {
      requestRuntimePort,
      relayTag: { runtime: 'taucad:connect-runtime:port' },
    };

    const received = await requestElectronRuntimePort({ bridge, target });

    expect(received).toBe(port);
    expect(requestRuntimePort).toHaveBeenCalledTimes(1);
    expect(target.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
    expect(target.removeEventListener).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('creates an async client-options provider backed by electronUtilityTransport', async () => {
    const port = new MessageChannel().port1;
    let listener: ((event: MessageEvent) => void) | undefined;
    const target = {
      addEventListener: vi.fn((_name: 'message', handler: (event: MessageEvent) => void) => {
        listener = handler;
      }),
      removeEventListener: vi.fn(),
    } as unknown as Window;
    const requestRuntimePort = vi.fn(() => {
      listener?.({ data: { taucadRelay: 'tau-runtime-port' }, ports: [port] } as unknown as MessageEvent);
    });
    const bridge = {
      requestRuntimePort,
      relayTag: { runtime: 'tau-runtime-port' },
    };

    const provider = createElectronClientOptions({ bridge, target, renderTimeout: 1234 });
    const options = await provider();

    expect(requestRuntimePort).toHaveBeenCalledOnce();
    expect(options.renderTimeout).toBe(1234);
    expect(options.transport.id).toBe('electron-utility');
    expect(options.transport.describe()).toMatchObject({
      fileSystem: 'host-local',
      memory: {
        abortSignal: 'wire-notify',
        fileDelivery: 'copy',
        geometryDelivery: 'copy',
      },
      wire: 'electron-utility',
    });
  });
});
