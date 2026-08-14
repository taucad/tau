/* eslint-disable @typescript-eslint/naming-convention -- Kittycad wire JSON fixtures use API field names */
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileSystemManager } from '#kernels/zoo/filesystem-manager.js';
import { KclUtilities } from '#kernels/zoo/kcl-utils.js';
import type { KernelFileSystem } from '#types/runtime-kernel.types.js';
import type { ZooFakeWebSocket } from '#kernels/zoo/zoo-fake-websocket.js';
import {
  zooTestFakeSocketCapture,
  zooTestInstallFakeWebSocket,
  zooTestRestoreWebSocket,
  zooTestWrapSocketWithEngineAutoReply,
} from '#kernels/zoo/zoo-fake-websocket.js';

const authSuccess = {
  success: true,
  resp: {
    type: 'modeling_session_data',
    data: {
      session: { api_call_id: 'test-session' },
    },
  },
} as const;

const memoryFs = (): KernelFileSystem =>
  ({
    async readFile(path: string) {
      void path;
      return new TextEncoder().encode('x = 1\n');
    },
    async exists(path: string) {
      void path;
      return true;
    },
    async readdir() {
      return ['main.kcl'];
    },
  }) as unknown as KernelFileSystem;

async function waitForCapturedSocket(
  timeoutMs = 10_000,
): Promise<NonNullable<(typeof zooTestFakeSocketCapture)['current']>> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const socket = zooTestFakeSocketCapture.current;
    if (socket) {
      return socket;
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }

  throw new Error('Timed out waiting for fake WebSocket capture');
}

async function waitForDistinctCapturedSocket(
  afterClose: ZooFakeWebSocket,
  timeoutMs = 10_000,
): Promise<ZooFakeWebSocket> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const socket = zooTestFakeSocketCapture.current;
    if (socket !== undefined && socket !== afterClose) {
      return socket;
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }

  throw new Error('Timed out waiting for replacement fake WebSocket');
}

describe('KclUtilities engine reconnect after WebSocket close', () => {
  let OriginalWebSocket: typeof WebSocket;

  beforeEach(() => {
    OriginalWebSocket = zooTestInstallFakeWebSocket();
  });

  afterEach(() => {
    zooTestRestoreWebSocket(OriginalWebSocket);
  });

  it('marks engine not ready and calls createEngineManager again after re-init following remote close', async () => {
    const fs = new FileSystemManager(memoryFs());
    const utils = new KclUtilities({ baseUrl: 'ws://fake.example/modeling-commands', fileSystemManager: fs });
    await utils.initializeWasm();
    const { program } = await utils.parseKcl('x = 1\n');

    const createEngineManagerSpy = vi.spyOn(
      KclUtilities.prototype as unknown as { createEngineManager: () => Promise<unknown> },
      'createEngineManager',
    );

    const exec1 = utils.executeProgram(program, 'main.kcl');
    const socket1 = await waitForCapturedSocket();
    const unwrap1 = zooTestWrapSocketWithEngineAutoReply(socket1);
    socket1.testEmitMessage(JSON.stringify(authSuccess));
    await exec1;
    expect(utils.isEngineReady).toBe(true);

    socket1.close(1006, 'idle');
    expect(utils.isEngineReady).toBe(false);

    const reinit = utils.initializeEngine();
    const socket2 = await waitForDistinctCapturedSocket(socket1);
    const unwrap2 = zooTestWrapSocketWithEngineAutoReply(socket2);
    socket2.testEmitMessage(JSON.stringify(authSuccess));
    await reinit;
    expect(utils.isEngineReady).toBe(true);
    expect(createEngineManagerSpy).toHaveBeenCalledTimes(2);

    createEngineManagerSpy.mockRestore();
    await utils.cleanup();
    unwrap1();
    unwrap2();
  });

  it('cleanup after socket close does not throw', async () => {
    const fs = new FileSystemManager(memoryFs());
    const utils = new KclUtilities({ baseUrl: 'ws://fake.example/modeling-commands', fileSystemManager: fs });
    await utils.initializeWasm();

    const init = utils.initializeEngine();
    const socket = await waitForCapturedSocket();
    const unwrap = zooTestWrapSocketWithEngineAutoReply(socket);
    socket.testEmitMessage(JSON.stringify(authSuccess));
    await init;

    socket.close(1011, 'gone');
    expect(utils.isEngineReady).toBe(false);

    await expect(utils.cleanup()).resolves.toBeUndefined();

    unwrap();
  });
});
