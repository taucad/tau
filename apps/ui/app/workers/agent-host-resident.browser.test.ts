import { afterEach, expect, it, vi } from 'vitest';
import type { AgentChannelClient } from '@taucad/agent-host/channel-client';
import { createAgentChannelClient } from '@taucad/agent-host/channel-client';
import { createBrowserAgentHostClient, residentAgentWorker } from '#services/agent-host-client.js';
import { openBrowserProjectHost } from '#workers/agent-host.impl.js';
import {
  controlOf,
  disposeOpfsProject,
  opfsProject,
  opfsProvider,
  retireWorkers,
} from '#workers/test/agent-host-resident.fixture.js';
import { rootedProvider } from '#workers/test/rooted-provider.fixture.js';

afterEach(disposeOpfsProject);

const visibility = { visible: () => true, subscribe: () => () => undefined };

/** A `provide` of one host incarnation over the control channel, with fresh bridges. */
const provideOver = (control: ReturnType<typeof controlOf>, options: Awaited<ReturnType<typeof opfsProject>>) => {
  const {
    openFileSystemBridge: _fs,
    openProjectRootBridge: _root,
    openPlacementPort: _placement,
    durability: _durability,
    ...rest
  } = options;
  return async (hostId: string) => {
    const fileSystem = options.openFileSystemBridge();
    const projectRoot = options.openProjectRootBridge();
    const placementPort = options.openPlacementPort();
    return control.call('provide', {
      value: {
        ...rest,
        projectId: options.authority.projectId,
        hostId,
        fileSystemPort: fileSystem.port,
        projectRootPort: projectRoot.port,
        placementPort,
      },
      transferables: [fileSystem.port, projectRoot.port, placementPort],
    });
  };
};

/** One agent-wire stream on the named host, or the worker's `needs`. */
const streamOn = async (control: ReturnType<typeof controlOf>, projectId: string, hostId: string) => {
  const { port1, port2 } = new MessageChannel();
  const answer = await control.call('connect', { value: { projectId, hostId, port: port1 }, transferables: [port1] });
  return {
    answer,
    client: createAgentChannelClient({ connect: () => port2, sessionKey: `stream-${hostId}` }),
  };
};

/* RH-A26 (I31, RH-R4, RV3-F1): the page's last-close `release` names its incarnation, so one that arrives after a
 * newer provide replaced that incarnation closes nothing; the newer host keeps serving on its own bridges. */
it("should keep a new project host's bridges when the previous host's project-closed arrives late", async () => {
  const options = await opfsProject('late-release');
  const worker = new Worker(new URL('agent-host.worker.ts', import.meta.url), { type: 'module' });
  const control = controlOf(worker);
  const provide = provideOver(control, options);
  const { projectId } = options.authority;
  try {
    await control.call('init', { tabId: `tab-${crypto.randomUUID()}` });
    await expect(provide('host-1')).resolves.toEqual({});
    await expect(provide('host-2')).resolves.toEqual({ replaced: 'host-1' });

    await control.call('release', { projectId, hostId: 'host-1' });

    await expect(control.call('status', { projectId })).resolves.toMatchObject({ hostId: 'host-2' });
    const stream = await streamOn(control, projectId, 'host-2');
    expect(stream.answer).toEqual({ status: 'connected' });
    await expect(
      stream.client.execute({
        type: 'attach',
        commandId: 'req_late-release',
        payload: { chatId: 'chat-late' },
      } as Parameters<AgentChannelClient['execute']>[0]),
    ).resolves.toMatchObject({ status: 'applied' });
    stream.client.close();
  } finally {
    control.close();
    worker.terminate();
  }
});

/* RH-A26: bridges sent for an incarnation that is no longer open are closed, never handed to the registered host. */
it('should answer needs to a rebridge that names a host that is no longer open', async () => {
  const options = await opfsProject('stale-host');
  const worker = new Worker(new URL('agent-host.worker.ts', import.meta.url), { type: 'module' });
  const control = controlOf(worker);
  const provide = provideOver(control, options);
  const { projectId } = options.authority;
  try {
    await control.call('init', { tabId: `tab-${crypto.randomUUID()}` });
    await expect(provide('host-1')).resolves.toEqual({});
    await expect(provide('host-2')).resolves.toEqual({ replaced: 'host-1' });
    /* The first host closes once its (empty) drain ends; a rebridge naming it then finds nothing to rebridge. */
    await control.call('release', { projectId, hostId: 'host-1' });
    const fileSystem = options.openFileSystemBridge();
    const projectRoot = options.openProjectRootBridge();

    /* Closed in the worker, which this Chromium does not report to the page (no MessagePort `close` event); the
     * registry's test asserts the close. */
    await expect(
      control.call('rebridge', {
        value: { projectId, hostId: 'host-1', fileSystemPort: fileSystem.port, projectRootPort: projectRoot.port },
        transferables: [fileSystem.port, projectRoot.port],
      }),
    ).resolves.toEqual({ status: 'needs' });
    await expect(streamOn(control, projectId, 'host-1')).resolves.toMatchObject({ answer: { status: 'needs' } });
    const stream = await streamOn(control, projectId, 'host-2');
    await expect(
      stream.client.execute({
        type: 'attach',
        commandId: 'req_stale-host',
        payload: { chatId: 'chat-stale' },
      } as Parameters<AgentChannelClient['execute']>[0]),
    ).resolves.toMatchObject({ status: 'applied' });
    stream.client.close();
  } finally {
    control.close();
    worker.terminate();
  }
});

/* W6.r1 round 3: a host whose project-root bridge rejects (a read-only root) closes the bridge that did open and every
 * port its provide transferred, the unused ones included. Opened in the page, so the ports' closes are observed. */
it('should close every transferred port when the project host fails to open', async () => {
  const options = await opfsProject('failed-open');
  const {
    openFileSystemBridge: _fs,
    openProjectRootBridge: _root,
    openPlacementPort: _placement,
    durability: _durability,
    ...rest
  } = options;
  const { createFileSystemBridgePort } = await import('@taucad/fs-bridge');
  const fileSystem = options.openFileSystemBridge();
  const rooted = rootedProvider(opfsProvider(), options.projectStorage.providerBasePath);
  const projectRoot = createFileSystemBridgePort({
    ...rooted,
    capabilities: { ...rooted.capabilities, writable: false },
  });
  const revisions = new MessageChannel();
  const placement = new MessageChannel();
  const ports = [fileSystem.port, projectRoot.port, revisions.port1, placement.port1];
  const closes = ports.map((port) => vi.spyOn(port, 'close'));

  await expect(
    openBrowserProjectHost(
      {
        ...rest,
        projectId: options.authority.projectId,
        hostId: 'host-failed',
        computeMode: 'off',
        fileSystemPort: fileSystem.port,
        projectRootPort: projectRoot.port,
        revisionsPort: revisions.port1,
        placementPort: placement.port1,
      },
      { tabId: `tab-${crypto.randomUUID()}`, visibility },
    ),
  ).rejects.toMatchObject({ code: 'STORAGE_NOT_WRITABLE' });

  expect(closes.map((close) => close.mock.calls.length > 0)).toEqual([true, true, true, true]);
  fileSystem.dispose();
  projectRoot.dispose();
});

/* RV1-F1: a file-manager restart swaps fresh bridges into the open host; the old ones go, the host and its stream stay. */
it('should rebridge an open project host without replacing it', async () => {
  const options = await opfsProject('rebridge');
  const worker = new Worker(new URL('agent-host.worker.ts', import.meta.url), { type: 'module' });
  const createWorker = (): Worker => worker;
  const disposals: Array<ReturnType<typeof vi.fn>> = [];
  const tracked =
    (open: () => ReturnType<(typeof options)['openFileSystemBridge']>) =>
    (): ReturnType<(typeof options)['openFileSystemBridge']> => {
      const connection = open();
      const dispose = vi.fn(() => {
        connection.dispose();
      });
      disposals.push(dispose);
      return { ...connection, dispose };
    };
  const client = createBrowserAgentHostClient({
    ...options,
    openFileSystemBridge: tracked(options.openFileSystemBridge),
    openProjectRootBridge: tracked(options.openProjectRootBridge),
    createWorker,
  });
  try {
    await client.hostCommand({
      type: 'attach',
      commandId: 'attach-before-rebridge',
      payload: { chatId: 'chat-rebridge' },
    });

    await residentAgentWorker(createWorker).reprovide();

    expect(disposals.map((dispose) => dispose.mock.calls.length)).toEqual([1, 1, 0, 0]);
    await expect(
      client.hostCommand({
        type: 'attach',
        commandId: 'attach-after-rebridge',
        payload: { chatId: 'chat-rebridge' },
      }),
    ).resolves.toMatchObject({ status: 'applied' });
  } finally {
    await client.close();
    await retireWorkers(worker);
  }
});
