import { describe, expect, it, vi } from 'vitest';
import { createMemoryProvider } from '@taucad/filesystem/backend';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import { createChatEffects } from '#chat-effects.js';
import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
import type { RevisionPort } from '#revision-port.js';

it('records ordinary chats while protected project task records never become chat refs', async () => {
  const storage = await createMemoryProvider();
  const recordsRoot = await mkdtemp(join(tmpdir(), 'tau-chat-effects-'));
  const records = new NodeFsProvider(recordsRoot);
  try {
    const port = createIsomorphicGitRevisionPort({ filesystem: storage });
    await records.writeFile('.tau/chats/ordinary/chat.json', JSON.stringify({ id: 'ordinary', name: 'Ordinary' }));
    await records.writeFile('.tau/chats/ordinary/events.jsonl', '{"event":"ordinary"}\n');
    await records.writeFile('.tau/chats/.project-tasks/records.jsonl', '{"protected":"task"}\n');
    const effects = createChatEffects({
      port,
      recordsFileSystem: async () => records,
      deviceId: () => 'host-device',
      recordDevices: { deviceFor: async () => 'record-device', ownDevices: async () => new Set<string>() },
      actor: undefined,
      onChatsProjected: undefined,
      actorId: 'host-actor',
      now: () => 0,
    });
    const outcomes = await effects.recordChats(true, 'tau');
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]?.name).toBe('refs/tau/chats/ordinary');
    expect(outcomes[0]?.status).toBe('upToDate');
    expect(await port.readRef('refs/tau/chats/ordinary')).toBeDefined();
    expect(await port.readRef('refs/tau/chats/.project-tasks')).toBeUndefined();
    expect(new TextDecoder().decode(await records.readFile('.tau/chats/.project-tasks/records.jsonl'))).toBe(
      '{"protected":"task"}\n',
    );
  } finally {
    await rm(recordsRoot, { recursive: true, force: true });
  }
});

const setup = async () => {
  const filesystem = await createMemoryProvider();
  const base = createIsomorphicGitRevisionPort({
    filesystem,
    checkouts: { projectId: 'push-record-test', root: async () => filesystem },
  });
  const push = vi.fn<RevisionPort['push']>();
  const port = { ...base, push };
  const effects = createChatEffects({
    port,
    recordsFileSystem: async () => {
      throw new Error('No record filesystem is needed to offer refs.');
    },
    deviceId: undefined,
    actor: undefined,
    onChatsProjected: undefined,
    recordDevices: { deviceFor: async () => 'test-device', ownDevices: async () => new Set<string>() },
    actorId: 'test-actor',
    now: () => 0,
  });
  return { push, effects };
};

const name = 'refs/tau/chats/example';
const input = {
  names: [name],
  remote: 'origin',
  repositoryUrl: 'https://github.com/owner/repo.git',
  leases: {},
  offered: new Map<string, string>(),
};

describe('explicit record push refusals', () => {
  it('keeps an all-rejected result terminal instead of requesting per-ref retries', async () => {
    const { push, effects } = await setup();
    push.mockResolvedValue({ refs: [{ name, head: undefined, status: 'rejected', reason: 'fetch first' }] });
    const result = await effects.pushRecordSet({ ...input, retryRejected: false });
    expect(result?.get(name)).toMatchObject({ status: 'rejected', reason: 'fetch first' });
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ repositoryUrl: input.repositoryUrl }));
  });

  it('keeps a failed request terminal instead of requesting per-ref retries', async () => {
    const { push, effects } = await setup();
    push.mockRejectedValue(new Error('Connection lost'));
    const result = await effects.pushRecordSet({ ...input, retryRejected: false });
    expect(result?.get(name)).toMatchObject({ status: 'rejected', reason: 'Connection lost' });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('makes a missing ref verdict terminal instead of requesting another push', async () => {
    const { push, effects } = await setup();
    push.mockResolvedValue({ refs: [] });
    const result = await effects.pushRecordSet({ ...input, retryRejected: false });
    expect(result?.get(name)).toMatchObject({ status: 'rejected', reason: 'The remote said nothing about this ref.' });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('preserves the automatic Tau backup per-ref fallback', async () => {
    const { push, effects } = await setup();
    push.mockResolvedValue({ refs: [{ name, head: undefined, status: 'rejected', reason: 'fetch first' }] });
    await expect(effects.pushRecordSet(input)).resolves.toBeUndefined();
  });
});
