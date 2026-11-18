/**
 * STO-25 SP6 (SP3-local 674f6460 gap 3): a Tau Cloud open's network work started about 0.6 s after the click, once the
 * project route's session had loaded its `revisions` child. The *Open* gesture now opens the project's revision client
 * itself, as that child would (D36: the device id and the actor queued, the credential work settled, then the
 * connection), and the child adopts the same client when the session starts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActorRefFrom } from 'xstate';
import { revisionClientTestApi } from '#hooks/use-revision-status.js';
import { setRevisionSessionUser } from '#lib/revision-actor.js';
import type { RevisionSessionUser } from '#lib/revision-actor.js';
import type { fileManagerMachine } from '#machines/file-manager.machine.js';
import type { RevisionClient } from '#types/revision-client.types.js';
import { preconnectAdoptionMilliseconds, preconnectCloudOpen } from '#runtime/session-revisions.js';
import { startSessionRevisionsStandIn } from '#runtime/session-revisions.fixture.js';
import { revisionStatusHarness } from '#hooks/use-revision-status.test-harness.js';

const projectId = 'proj_preconnect0000000000000';
const workspace = 'home';
const worker = { name: 'shared-worker' } as unknown as Worker;

/** A client that records every call; its status is absent until a row says it is open. */
const createClient = (log: string[]) => {
  const user = Promise.withResolvers<void>();
  let open = false;
  const client = {
    send: (command: { command: string }) => {
      log.push(`send:${command.command}`);
    },
    setUser: async (next: RevisionSessionUser | undefined) => {
      log.push(`setUser:${next?.id ?? 'none'}`);
      await user.promise;
    },
    setCredential: async () => true,
    open: () => {
      open = true;
      log.push('open');
    },
    close: () => {
      open = false;
      log.push('close');
    },
    status: () => (open ? revisionStatusHarness.status : undefined),
    subscribe: () => () => undefined,
    focus: (on: boolean) => {
      log.push(`focus:${String(on)}`);
    },
  };
  return { client: client as unknown as RevisionClient, user };
};

/** The project's file manager, as the `revisions` child reads it: the shared worker. */
const fileManagerRef = {
  send: () => undefined,
  getSnapshot: () => ({ context: { worker, rootDirectory: `/projects/${projectId}` }, matches: () => true }),
  subscribe: () => ({ unsubscribe: () => undefined }),
} as unknown as ActorRefFrom<typeof fileManagerMachine>;

const settle = async (): Promise<void> => {
  for (let round = 0; round < 5; round += 1) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each round lets the next microtask run.
    await Promise.resolve();
  }
};

describe('preconnectCloudOpen (STO-25 SP6)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ salt: 'account-salt' }))),
    );
    setRevisionSessionUser({ id: 'usr_1', name: 'Ada' });
  });
  afterEach(() => {
    /* An orphan left by a row is closed by its own bound, so no row hands the next one a held client. */
    vi.runAllTimers();
    revisionClientTestApi.reset();
    setRevisionSessionUser(undefined);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('opens the client as the session child would: device id and actor queued, then the user, then the connection', async () => {
    const log: string[] = [];
    const { client, user } = createClient(log);
    revisionClientTestApi.adopt(projectId, worker, client);

    preconnectCloudOpen({ projectId, workspace, worker });
    expect(log).toEqual(['send:setDeviceId', 'send:setActor', 'setUser:usr_1']);
    user.resolve();
    await settle();
    expect(log.at(-1)).toBe('open');
  });

  it('is adopted by the session child, which keeps the client open past the adoption bound', async () => {
    const log: string[] = [];
    const { client, user } = createClient(log);
    revisionClientTestApi.adopt(projectId, worker, client);
    preconnectCloudOpen({ projectId, workspace, worker });
    user.resolve();
    await settle();

    const stop = startSessionRevisionsStandIn({ projectId, workspace, fileManagerRef });
    await settle();
    vi.advanceTimersByTime(preconnectAdoptionMilliseconds * 2);
    expect(log).not.toContain('close');
    stop();
    /* The child owns it now: its stop closes it. */
    expect(log.at(-1)).toBe('close');
  });

  it('closes a client no session adopted within the bound', async () => {
    const log: string[] = [];
    const { client, user } = createClient(log);
    revisionClientTestApi.adopt(projectId, worker, client);
    preconnectCloudOpen({ projectId, workspace, worker });
    user.resolve();
    await settle();

    vi.advanceTimersByTime(preconnectAdoptionMilliseconds - 1);
    expect(log).not.toContain('close');
    vi.advanceTimersByTime(1);
    expect(log.at(-1)).toBe('close');
  });

  it('does nothing signed out, or for a client a session already holds open', async () => {
    const log: string[] = [];
    const { client } = createClient(log);
    revisionClientTestApi.adopt(projectId, worker, client);
    setRevisionSessionUser(undefined);
    preconnectCloudOpen({ projectId, workspace, worker });
    expect(log).toEqual([]);

    setRevisionSessionUser({ id: 'usr_1' });
    client.open();
    log.length = 0;
    preconnectCloudOpen({ projectId, workspace, worker });
    vi.advanceTimersByTime(preconnectAdoptionMilliseconds);
    await settle();
    expect(log).toEqual([]);
  });
});
