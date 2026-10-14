import { describe, expect, it, vi } from 'vitest';
import { createMemoryProvider } from '@taucad/filesystem/backend';
import type { RevisionPort } from '#revision-port.js';
import { createChatEffects } from '#chat-effects.js';
import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';

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
