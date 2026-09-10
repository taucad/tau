import { createActor, waitFor } from 'xstate';
import { afterEach, expect, it } from 'vitest';
import {
  deleteProjectFileSystemConfig,
  getProjectRootConfigs,
  setProjectFileSystemConfig,
} from '#filesystem/handle-store.js';
import { fileManagerMachine } from '#machines/file-manager.machine.js';
import { connectComputeStoreChannel } from '@taucad/runtime/host';
import { createRuntimeClient } from '@taucad/runtime';
import { defineRuntime } from '@taucad/runtime/worker';
import { defineKernel } from '@taucad/runtime/kernel';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';

const verifyPublicReuse = async (
  openPort: () => MessagePort,
  phase = 'initial',
  options: {
    existingStore?: ReturnType<typeof connectComputeStoreChannel>['store'];
    expectedSolves?: number;
  } = {},
): Promise<void> => {
  const { existingStore, expectedSolves = 1 } = options;
  let solves = 0;
  let publication: unknown;
  const kernel = defineKernel({
    id: 'file-manager-compute',
    name: 'File manager compute fixture',
    version: '1.0.0',
    extensions: ['compute'],
    exportFormats: {},
    async initialize() {
      return {};
    },
    async getDependencies(input) {
      return { resolved: [input.entryPath], unresolved: [] };
    },
    async getParameters() {
      return { success: true, data: { defaultParameters: {}, jsonSchema: {} }, issues: [] };
    },
    async exportGeometry() {
      return { success: false, issues: [] };
    },
    async createGeometry(_input, runtime) {
      if (runtime.compute.status !== 'on') {
        throw new Error('compute capability was off');
      }
      const result = await runtime.compute.evaluate({
        action: {
          schemaVersion: 1,
          namespace: 'file-manager.browser',
          producer: { id: 'browser-test', version: '1', implementationAssets: [] },
          operation: 'make-shape',
          inputs: [],
          arguments: { phase },
          environment: {},
          codec: { id: 'test.bytes', version: '1' },
        },
        codec: {
          id: 'test.bytes',
          version: '1',
          mediaType: 'application/octet-stream',
          encode: ({ value }) => new TextEncoder().encode(value),
          decode: ({ bytes }) => new TextDecoder().decode(bytes),
        },
        policy: 'best-effort',
        compute: async () => {
          solves += 1;
          return 'shape';
        },
      });
      publication = 'publication' in result ? result.publication : undefined;
      return { geometry: { format: 'gltf', content: new Uint8Array([1]) }, nativeHandle: {}, issues: [] };
    },
  })();
  const createClient = (store = existingStore) => {
    const connection = store ? undefined : connectComputeStoreChannel(openPort());
    const client = createRuntimeClient({
      transport: inProcessTransport({
        runtime: defineRuntime({ kernels: [kernel] }),
        fileSystem: fromMemoryFs(),
        compute: { mode: 'durable', store: store ?? connection!.store },
      }),
    });
    return { client, connection };
  };
  const producer = createClient();
  const rendered = await producer.client.render({ source: { files: { 'main.compute': 'producer' } } });
  if (existingStore) {
    expect(rendered.superseded || !rendered.geometry.success).toBe(true);
    expect(publication).toBeUndefined();
  } else if (expectedSolves === 1) {
    expect(publication).toMatchObject({ status: 'stored' });
  } else {
    expect(publication).toBeUndefined();
  }
  await producer.client.shutdown();
  producer.connection?.dispose();
  if (existingStore) {
    return;
  }
  const consumer = createClient();
  await consumer.client.render({ source: { files: { 'main.compute': 'consumer' } } });
  expect(solves).toBe(expectedSolves);
  await consumer.client.shutdown();
  consumer.connection?.dispose();
};

const rawComputeRequest = async (worker: Worker, data: Record<string, unknown>) => {
  const channel = new MessageChannel();
  worker.postMessage({ ...data, port: channel.port1 }, [channel.port1]);
  return new Promise<unknown>((resolve) => {
    channel.port2.addEventListener(
      'message',
      ({ data: result }) => {
        resolve(result);
      },
      { once: true },
    );
    channel.port2.start();
  });
};

const rawTerminalComputeRequest = async (worker: Worker, data: Record<string, unknown>) => {
  const channel = new MessageChannel();
  const message = Promise.withResolvers<unknown>();
  channel.port2.addEventListener(
    'message',
    ({ data: result }) => {
      channel.port2.close();
      message.resolve(result);
    },
    { once: true },
  );
  channel.port2.start();
  worker.postMessage({ ...data, port: channel.port1 }, [channel.port1]);
  const terminal = async () => ({ result: await message.promise, terminal: true });
  const requestExpiry = new Promise<{ expired: true }>((resolve) => {
    setTimeout(() => {
      resolve({ expired: true });
    }, 1000);
  });
  return Promise.race([terminal(), requestExpiry]);
};

const rawComputePort = (worker: Worker, projectId: string): MessagePort => {
  const channel = new MessageChannel();
  worker.postMessage({ type: 'computeStoreConnect', projectId, port: channel.port1 }, [channel.port1]);
  return channel.port2;
};

const computeDatabaseName = async (projectId: string): Promise<string> => {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(projectId)));
  const hexadecimal = [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `tau-compute-${hexadecimal.slice(0, 32)}`;
};

const openHigherVersionDatabase = async (name: string): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 2);
    request.addEventListener(
      'success',
      () => {
        resolve(request.result);
      },
      { once: true },
    );
    request.addEventListener(
      'error',
      () => {
        reject(request.error ?? new Error(`Could not open ${name}.`));
      },
      { once: true },
    );
  });

const deleteDatabase = async (name: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.addEventListener(
      'success',
      () => {
        resolve();
      },
      { once: true },
    );
    request.addEventListener(
      'error',
      () => {
        reject(request.error ?? new Error(`Could not delete ${name}.`));
      },
      { once: true },
    );
  });

let activeProjectId: string | undefined;

afterEach(async () => {
  if (activeProjectId !== undefined) {
    await deleteProjectFileSystemConfig(activeProjectId);
    activeProjectId = undefined;
  }
});

it('registers a project persisted after worker boot before opening its rooted bridge', async () => {
  const { createFileSystemBridgeProxy } = await import('@taucad/fs-bridge');
  const projectId = `proj_${crypto.randomUUID().replaceAll('-', '').slice(0, 21)}`;
  activeProjectId = projectId;
  const rootDirectory = `/projects/${projectId}`;
  const actor = createActor(fileManagerMachine, {
    input: { projectId, rootDirectory, shouldInitializeOnStart: true },
  });
  actor.start();

  try {
    const ready = await waitFor(actor, (snapshot) => snapshot.matches('ready'), { timeout: 30_000 });
    const open = ready.context.openFileSystemBridge;
    if (open === undefined) {
      throw new Error('The rooted filesystem bridge opener was not published.');
    }
    const unavailable = createFileSystemBridgeProxy(open(rootDirectory));
    try {
      await unavailable.ready;
      expect(unavailable.hello.payload).toMatchObject({
        state: 'unavailable',
        capabilities: null,
        error: { code: 'ROOT_UNAVAILABLE' },
      });
    } finally {
      unavailable.dispose();
    }
    await setProjectFileSystemConfig({ projectId, backend: 'indexeddb', providerBasePath: projectId });
    if (ready.context.proxy === undefined) {
      throw new Error('The file-manager proxy was not published.');
    }
    await ready.context.proxy.configureProjectRoots(await getProjectRootConfigs());
    const proxy = createFileSystemBridgeProxy(open(rootDirectory));
    try {
      await proxy.ready;
      expect(proxy.hello.payload).toMatchObject({
        state: 'ready',
        capabilities: { writable: true, durability: 'transactional-rewrite' },
      });
      await proxy.mkdir('.tau/chats/chat_browser_mount', { recursive: true });
      await proxy.appendFile('.tau/chats/chat_browser_mount/events.jsonl', '{"type":"mounted"}\n');
      await expect(proxy.readFile('.tau/chats/chat_browser_mount/events.jsonl', 'utf8')).resolves.toBe(
        '{"type":"mounted"}\n',
      );
    } finally {
      proxy.dispose();
    }
  } finally {
    actor.stop();
  }
});

it('owns durable compute by admitted project and preserves generation across authority recreation', async () => {
  const projectId = `proj_${crypto.randomUUID().replaceAll('-', '').slice(0, 21)}`;
  activeProjectId = projectId;
  await setProjectFileSystemConfig({ projectId, backend: 'indexeddb', providerBasePath: projectId });
  const start = async () => {
    const actor = createActor(fileManagerMachine, {
      input: { projectId, rootDirectory: `/projects/${projectId}`, shouldInitializeOnStart: true },
    });
    actor.start();
    const ready = await waitFor(actor, (snapshot) => snapshot.matches('ready'), { timeout: 30_000 });
    return { actor, ready };
  };

  let clearedGeneration = 0;
  const first = await start();
  try {
    expect(() => first.ready.context.openComputeStorePort?.('candidate-workspace')).toThrow(/authority/);
    await expect(
      rawComputeRequest(first.ready.context.worker!, {
        type: 'computeStoreConnect',
        projectId: 'candidate-workspace',
      }),
    ).resolves.toEqual({ error: 'Compute store project authority does not match the active project.' });
    await Promise.all(
      (['computeStoreConnect', 'computeStoreControl'] as const).map(async (type) => {
        await expect(
          rawTerminalComputeRequest(first.ready.context.worker!, { type, action: 'inspect' }),
        ).resolves.toEqual({
          result: { error: 'Compute project identity is required.' },
          terminal: true,
        });
        await expect(
          rawTerminalComputeRequest(first.ready.context.worker!, { type, projectId: '', action: 'inspect' }),
        ).resolves.toEqual({ result: { error: 'Compute project identity is required.' }, terminal: true });
        await expect(
          rawTerminalComputeRequest(first.ready.context.worker!, { type, projectId: 42, action: 'inspect' }),
        ).resolves.toEqual({ result: { error: 'Compute project identity is required.' }, terminal: true });
      }),
    );
    await expect(
      rawComputeRequest(first.ready.context.worker!, {
        type: 'computeStoreControl',
        projectId: 'candidate-workspace',
        action: 'inspect',
      }),
    ).resolves.toEqual({ error: 'Compute control project authority does not match the active project.' });
    await expect(
      rawComputeRequest(first.ready.context.worker!, {
        type: 'computeStoreControl',
        projectId,
        action: 'bogus',
      }),
    ).resolves.toEqual({ error: 'Compute control action is invalid.' });
    await expect(
      rawComputeRequest(first.ready.context.worker!, {
        type: 'computeStoreControl',
        projectId,
        action: 'collect',
        budget: Number.POSITIVE_INFINITY,
      }),
    ).resolves.toEqual({ error: 'Compute collection budget must be a safe integer from 1 to 1000.' });
    await expect(
      rawComputeRequest(first.ready.context.worker!, {
        type: 'computeStoreControl',
        projectId,
        action: 'collect',
        budget: 20,
        cursor: 'x'.repeat(1025),
      }),
    ).resolves.toEqual({ error: 'Compute collection cursor is invalid.' });
    const leader = connectComputeStoreChannel(first.ready.context.openComputeStorePort!(projectId));
    const follower = connectComputeStoreChannel(first.ready.context.openComputeStorePort!(projectId));
    leader.dispose();
    follower.dispose();
    await verifyPublicReuse(() => first.ready.context.openComputeStorePort!(projectId));
    const before = await first.ready.context.computeControl!(projectId, 'inspect', {});
    const cleared = await first.ready.context.computeControl!(projectId, 'clear', {});
    expect(Number(cleared.generation)).toBe(Number(before.generation) + 1);
    clearedGeneration = Number(cleared.generation);
    await verifyPublicReuse(() => first.ready.context.openComputeStorePort!(projectId), 'after-clear');

    const projectB = `proj_${crypto.randomUUID().replaceAll('-', '').slice(0, 21)}`;
    const oldA = connectComputeStoreChannel(first.ready.context.openComputeStorePort!(projectId));
    first.ready.context.worker!.postMessage({ type: 'computeStoreAdmission', projectId: projectB });
    await verifyPublicReuse(() => rawComputePort(first.ready.context.worker!, projectId), 'revoked-a', {
      existingStore: oldA.store,
    });
    oldA.dispose();
    await verifyPublicReuse(() => rawComputePort(first.ready.context.worker!, projectB), 'project-b');

    const rejectedProject = `proj_${crypto.randomUUID().replaceAll('-', '').slice(0, 21)}`;
    const rejectedDatabase = await computeDatabaseName(rejectedProject);
    const blocker = await openHigherVersionDatabase(rejectedDatabase);
    blocker.close();
    first.ready.context.worker!.postMessage({ type: 'computeStoreAdmission', projectId: rejectedProject });
    try {
      const outcomes = await Promise.all(
        (['computeStoreConnect', 'computeStoreControl'] as const).map(async (type) =>
          rawTerminalComputeRequest(first.ready.context.worker!, {
            type,
            projectId: rejectedProject,
            action: 'inspect',
          }),
        ),
      );
      for (const outcome of outcomes) {
        expect(outcome).toEqual({
          result: { error: 'The requested version (1) is less than the existing version (2).' },
          terminal: true,
        });
      }
    } finally {
      await deleteDatabase(rejectedDatabase);
    }
  } finally {
    first.actor.stop();
  }

  const second = await start();
  try {
    const restored = await second.ready.context.computeControl!(projectId, 'inspect', {});
    expect(Number(restored.generation)).toBe(clearedGeneration);
    await verifyPublicReuse(() => second.ready.context.openComputeStorePort!(projectId), 'after-clear', {
      expectedSolves: 0,
    });
  } finally {
    second.actor.stop();
  }
});
