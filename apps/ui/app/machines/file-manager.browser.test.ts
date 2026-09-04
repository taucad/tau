import { createActor, waitFor } from 'xstate';
import { afterEach, expect, it } from 'vitest';
import {
  deleteProjectFileSystemConfig,
  getProjectRootConfigs,
  setProjectFileSystemConfig,
} from '#filesystem/handle-store.js';
import { fileManagerMachine } from '#machines/file-manager.machine.js';

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
