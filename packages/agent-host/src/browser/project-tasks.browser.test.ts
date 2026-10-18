import { expect, it, vi } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';

import { browserProjectTasks } from '#browser/project-tasks.js';
import type { ProviderEventLogOptions } from '#browser.js';
import type { AgentChannelSource } from '#launchers/agent-channel.js';
import type { ProjectTaskOwner } from '#launchers/project-task-platform.js';

it('should claim and forward through real Chromium Web Locks and BroadcastChannel', async () => {
  const projectId = `project-${crypto.randomUUID()}`;
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  const encoder = new TextEncoder();
  const bytesOf = (data: Uint8Array<ArrayBuffer> | string): Uint8Array<ArrayBuffer> =>
    typeof data === 'string' ? encoder.encode(data) : new Uint8Array(data);
  const fileSystem: ProviderEventLogOptions['fileSystem'] = {
    exists: async (path) => files.has(path),
    readFile: async (path) => {
      const bytes = files.get(path);
      if (!bytes) {
        throw new Error(`Missing ${path}`);
      }
      return new Uint8Array(bytes);
    },
    writeFile: async (path, data) => {
      files.set(path, bytesOf(data));
    },
    appendFile: async (path, data) => {
      const previous = files.get(path) ?? new Uint8Array();
      const added = bytesOf(data);
      const next = new Uint8Array(previous.byteLength + added.byteLength);
      next.set(previous);
      next.set(added, previous.byteLength);
      files.set(path, next);
    },
    unlink: async (path) => {
      files.delete(path);
    },
  };
  const source = mockDeep<AgentChannelSource>();
  const request = vi.fn(async () => ({ kind: 'refused', code: 'TASK_UNAVAILABLE', message: 'browser owner' }) as const);
  const createOwner = async (
    input: Parameters<Parameters<ReturnType<typeof browserProjectTasks>['open']>[0]['createOwner']>[0],
  ): Promise<ProjectTaskOwner> => {
    await input.storage.append(
      encoder.encode(`${JSON.stringify({ version: 1, projectId, sequence: 1, tasks: [] })}\n`),
    );
    return {
      source,
      projectTasks: { request },
      stoppability: () => 'stoppable',
      drain: async () => undefined,
      close: async () => input.storage.close(),
    };
  };
  const leader = await browserProjectTasks({
    tabId: 'browser-leader',
    build: 'build-1',
    log: { kind: 'provider', fileSystem },
  }).open({ projectId, createOwner });
  try {
    const follower = await browserProjectTasks({
      tabId: 'browser-follower',
      build: 'build-1',
      log: { kind: 'provider', fileSystem },
    }).open({ projectId, createOwner: async () => expect.fail('follower took owner lock') });
    try {
      await expect(
        follower.projectTasks.request({ operation: 'read', input: { after: 0, limit: 1 } }),
      ).resolves.toEqual({ kind: 'refused', code: 'TASK_UNAVAILABLE', message: 'browser owner' });
      expect(request).toHaveBeenCalledOnce();
      const bytes = files.get('.tau/chats/.project-tasks/records.jsonl');
      expect(new TextDecoder().decode(bytes).trim().split('\n')).toHaveLength(1);
      const locks = await navigator.locks.query();
      expect(locks.held?.some((lock) => lock.name === `agent-host-project-log:${encodeURIComponent(projectId)}`)).toBe(
        true,
      );
    } finally {
      await follower.close();
    }
  } finally {
    await leader.close();
  }
}, 10_000);

it('should retain the OPFS task journal handle until its owner closes', async () => {
  const worker = new Worker(new URL('project-task-storage.browser.fixture.ts', import.meta.url), { type: 'module' });
  try {
    const result = await new Promise<Readonly<{ code: unknown; rows: string }>>((resolve, reject) => {
      const opfsTimeout = setTimeout(() => {
        reject(new Error('OPFS journal worker did not answer.'));
      }, 15_000);
      worker.addEventListener(
        'message',
        (event: MessageEvent<Readonly<{ code: unknown; rows: string }>>) => {
          clearTimeout(opfsTimeout);
          resolve(event.data);
        },
        { once: true },
      );
      worker.addEventListener(
        'error',
        (error) => {
          clearTimeout(opfsTimeout);
          reject(new Error(error.message));
        },
        { once: true },
      );
      worker.postMessage('run');
    });
    expect(result).toEqual({ code: 'WRITER_LOCKED', rows: '{"sequence":1}\n' });
  } finally {
    worker.terminate();
  }
}, 20_000);

it('should fence owner tools when Chromium revokes the project Web Lock', async () => {
  const projectId = `project-stolen-${crypto.randomUUID()}`;
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  const fileSystem: ProviderEventLogOptions['fileSystem'] = {
    exists: async (path) => files.has(path),
    readFile: async (path) => files.get(path) ?? new Uint8Array(),
    writeFile: async (path, bytes) => {
      files.set(path, typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes);
    },
    appendFile: async (path, bytes) => {
      files.set(path, typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes);
    },
    unlink: async (path) => {
      files.delete(path);
    },
  };
  const source = mockDeep<AgentChannelSource>();
  let ownerSignal: AbortSignal | undefined;
  const owner = await browserProjectTasks({
    tabId: 'stealable',
    build: 'build-1',
    log: { kind: 'provider', fileSystem },
  }).open({
    projectId,
    createOwner: async ({ storage, signal }) => {
      ownerSignal = signal;
      await storage.append(
        new TextEncoder().encode(`${JSON.stringify({ version: 1, projectId, sequence: 1, tasks: [] })}\n`),
      );
      return {
        source,
        projectTasks: { request: async () => ({ kind: 'refused', code: 'TASK_UNAVAILABLE', message: 'fixture' }) },
        stoppability: () => 'stoppable',
        drain: async () => undefined,
        close: async () => storage.close(),
      };
    },
  });
  try {
    await navigator.locks.request(
      `agent-host-project-log:${encodeURIComponent(projectId)}`,
      { steal: true },
      async () => undefined,
    );
    await vi.waitFor(() => {
      expect(ownerSignal?.aborted).toBe(true);
    });
    await expect(owner.projectTasks.request({ operation: 'read', input: {} })).rejects.toMatchObject({
      code: 'LEADERSHIP_LOST',
    });
  } finally {
    await owner.close();
  }
}, 10_000);
