/**
 * The page's GitHub credential lifecycle (D2, D3, ruling G2).
 *
 * The token a GitHub remote is reached with expires. The page re-mints it
 * before it does, re-mints once when the provider refuses it, and treats the
 * same repository picked again as a re-grant. Each row scripts the revision
 * client's projection and reads the frames and verbs the page sent it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { mock } from 'vitest-mock-extended';
import type { MockProxy } from 'vitest-mock-extended';
import { assign, createActor, setup } from 'xstate';
import { Topic } from '@taucad/events';
import type { GitRemoteCredential, RemoteFacet, SyncFacet } from '@taucad/revisions';
import type { RevisionStatusProjection } from '@taucad/revisions/project-revisions-machine';
import { UnloadProvider } from '#hooks/use-flush-on-close.js';
import {
  githubCredentialRenewDelay,
  revisionClientTestApi,
  useRevisionClientLifecycle,
  useRevisionCommands,
} from '#hooks/use-revision-status.js';
import type { RevisionClient } from '#hooks/use-revision-status.js';
import { revisionStatusHarness } from '#hooks/use-revision-status.test-harness.js';
import { GithubRequestError } from '#lib/github-connections.js';
import type * as GithubConnectionsModule from '#lib/github-connections.js';
import { githubProjectBinding } from '#lib/github-project-binding.js';
import { setRevisionSessionUser } from '#lib/revision-actor.js';
import type { WorkerRevisionCommand } from '#machines/file-manager.worker.revisions.js';

const projectId = 'alpha';
const connectionId = '00000000-0000-4000-8000-000000000001';
const repositoryUrl = 'https://github.com/o/r.git';

type Token = Readonly<{ accessToken: string; expiresAt: string; generation: number }>;
const githubToken = vi.hoisted(() => vi.fn<(connectionId: string) => Promise<Token>>());
const githubList = vi.hoisted(() =>
  vi.fn(async () => [{ id: connectionId, subject: 7, login: 'octo', generation: 3 }]),
);

vi.mock('#lib/github-connections.js', async (importOriginal) => ({
  ...(await importOriginal<typeof GithubConnectionsModule>()),
  githubConnections: { token: githubToken, list: githubList },
}));

const fileManagerMachine = setup({
  types: {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    context: {} as { worker: Worker | undefined },
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    events: {} as { type: 'worker'; worker: Worker | undefined },
  },
}).createMachine({
  context: { worker: undefined },
  on: { worker: { actions: assign(({ event }) => ({ worker: event.worker })) } },
});
const fileManagerRef = createActor(fileManagerMachine).start();
const worker = mock<Worker>();

vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId }) }));
vi.mock('#hooks/use-file-manager.js', () => ({ useFileManager: () => ({ fileManagerRef }) }));

const basic = (accessToken: string): string => `Basic ${globalThis.btoa(`x-access-token:${accessToken}`)}`;
const expiringIn = (milliseconds: number): string => new Date(Date.now() + milliseconds).toISOString();
const renewWindow = 5 * 60_000;
const eightHours = 8 * 60 * 60_000;

/**
 * A revision client whose projection the row moves, and which records what
 * the page sent it.
 *
 * @returns The client, the projection pump, and what was sent.
 */
const scriptedClient = (): Readonly<{
  client: MockProxy<RevisionClient>;
  show: (remote: Partial<RemoteFacet>, sync?: Partial<SyncFacet>) => void;
  frames: () => GitRemoteCredential[];
  /** Remote commands only; `setActor` is asserted through {@link actors}. */
  sent: () => WorkerRevisionCommand[];
  actors: () => WorkerRevisionCommand[];
}> => {
  const changed = new Topic<void>({ name: 'ScriptedRevisionClient' });
  let projection: RevisionStatusProjection = revisionStatusHarness.status;
  const client = mock<RevisionClient>();
  client.status.mockImplementation(() => projection);
  client.subscribe.mockImplementation((listener) => changed.subscribe(listener));
  return {
    client,
    show: (remote, sync = {}) => {
      projection = {
        ...projection,
        remote: { ...projection.remote, ...remote },
        sync: { ...projection.sync, ...sync },
      };
      changed.emit();
    },
    frames: () => client.remoteCredential.mock.calls.map(([frame]) => frame),
    sent: () => client.send.mock.calls.map(([command]) => command).filter(({ command }) => command !== 'setActor'),
    actors: () => client.send.mock.calls.map(([command]) => command).filter(({ command }) => command === 'setActor'),
  };
};

let commands: ReturnType<typeof useRevisionCommands> | undefined;

function Owner(): React.JSX.Element {
  useRevisionClientLifecycle();
  commands = useRevisionCommands();
  return <div data-testid='owner' />;
}

const unmounts: Array<() => void> = [];

/**
 * Mount the lifecycle owner over a scripted client, bound to a GitHub repository.
 *
 * @returns The scripted client.
 */
const mountBound = (): ReturnType<typeof scriptedClient> => {
  const scripted = scriptedClient();
  revisionClientTestApi.adopt(projectId, worker, scripted.client);
  fileManagerRef.send({ type: 'worker', worker });
  const view = render(
    <UnloadProvider>
      <Owner />
    </UnloadProvider>,
  );
  unmounts.push(view.unmount);
  return scripted;
};

const apiBaseUrl = 'http://localhost:4000';

/**
 * Let every pending promise and every timer due within `milliseconds` run.
 *
 * @param milliseconds - How far to move the fake clock.
 */
const elapse = async (milliseconds: number): Promise<void> => {
  await vi.advanceTimersByTimeAsync(milliseconds);
};

const githubRemote = {
  kind: 'git',
  url: repositoryUrl,
  provider: 'github',
  repositoryId: '99',
} as const satisfies Partial<RemoteFacet>;

beforeEach(() => {
  revisionStatusHarness.reset();
  githubProjectBinding.set(projectId, { connectionId, repositoryId: 99, repositoryUrl, generation: 3 });
  setRevisionSessionUser({ id: 'user-1', name: 'Ada' });
});

afterEach(() => {
  vi.useRealTimers();
  for (const unmount of unmounts.splice(0)) {
    unmount();
  }
  revisionClientTestApi.reset();
  githubProjectBinding.remove(projectId);
  setRevisionSessionUser(undefined);
  githubToken.mockReset();
  commands = undefined;
});

describe('githubCredentialRenewDelay', () => {
  it('should wait until the renewal window opens', () => {
    const now = Date.parse('2026-09-23T00:00:00Z');

    expect(githubCredentialRenewDelay(new Date(now + eightHours).toISOString(), now)).toBe(eightHours - renewWindow);
  });

  it('should ask again in a minute inside the window, past expiry, or for an unreadable expiry', () => {
    const now = Date.parse('2026-09-23T00:00:00Z');

    expect(githubCredentialRenewDelay(new Date(now + 60_000).toISOString(), now)).toBe(60_000);
    expect(githubCredentialRenewDelay(new Date(now - 60_000).toISOString(), now)).toBe(60_000);
    expect(githubCredentialRenewDelay('not a date', now)).toBe(60_000);
  });

  it('should never hand setTimeout a delay it would fire at once', () => {
    const now = Date.parse('2026-09-23T00:00:00Z');

    expect(githubCredentialRenewDelay('2100-01-01T00:00:00Z', now)).toBe(2_147_483_647);
  });
});

describe('the GitHub credential frame (D2)', () => {
  it('should re-mint the credential before it expires and re-send the frame', async () => {
    const soon = expiringIn(renewWindow + 50);
    const later = expiringIn(eightHours);
    githubToken
      .mockResolvedValueOnce({ accessToken: 'first', expiresAt: soon, generation: 3 })
      .mockResolvedValueOnce({ accessToken: 'second', expiresAt: later, generation: 3 });

    const scripted = mountBound();

    await vi.waitFor(() => {
      expect(scripted.frames()).toHaveLength(2);
    });
    expect(scripted.frames()).toStrictEqual([
      expect.objectContaining({ repositoryUrl, authorization: basic('first'), expiresAt: soon }),
      expect.objectContaining({ repositoryUrl, authorization: basic('second'), expiresAt: later }),
    ]);
    expect(githubToken).toHaveBeenCalledWith(connectionId);
  });

  it('should keep the held credential when a renewal fails', async () => {
    githubToken
      .mockResolvedValueOnce({ accessToken: 'first', expiresAt: expiringIn(renewWindow + 50), generation: 3 })
      .mockRejectedValueOnce(new GithubRequestError(503, 'GITHUB_UPSTREAM_UNAVAILABLE'));

    const scripted = mountBound();

    await vi.waitFor(() => {
      expect(githubToken).toHaveBeenCalledTimes(2);
    });
    await new Promise<void>((resolve) => {
      globalThis.setTimeout(resolve, 20);
    });
    expect(scripted.frames()).toStrictEqual([expect.objectContaining({ authorization: basic('first') })]);
  });

  it('should stop renewing once the project closes', async () => {
    githubToken.mockResolvedValue({ accessToken: 'first', expiresAt: expiringIn(renewWindow + 300), generation: 3 });

    const scripted = mountBound();
    await vi.waitFor(() => {
      expect(scripted.client.open).toHaveBeenCalledOnce();
    });
    for (const unmount of unmounts.splice(0)) {
      unmount();
    }
    await new Promise<void>((resolve) => {
      globalThis.setTimeout(resolve, 400);
    });

    expect(githubToken).toHaveBeenCalledOnce();
  });
});

describe('a renewal GitHub refuses for good (R-U3)', () => {
  it.each([
    [
      'the connection was removed',
      new GithubRequestError(404, 'GITHUB_CONNECTION_NOT_FOUND'),
      'This GitHub account is no longer connected. Refresh and choose another account.',
    ],
    [
      'the grant must be renewed',
      new GithubRequestError(409, 'GITHUB_RECONNECT_REQUIRED'),
      'Your GitHub connection needs to be renewed. Connect GitHub again.',
    ],
  ])('should say why and stop asking when %s', async (_label, refusal, sentence) => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    githubToken
      .mockResolvedValueOnce({ accessToken: 'first', expiresAt: expiringIn(eightHours), generation: 3 })
      .mockRejectedValueOnce(refusal);

    const scripted = mountBound();
    await elapse(eightHours - renewWindow);

    expect(githubToken).toHaveBeenCalledTimes(2);
    expect(scripted.frames().at(-1)).toStrictEqual({
      apiBaseUrl,
      origin: 'https://github.com',
      repositoryUrl,
      unavailable: sentence,
    });
    await elapse(10 * 60_000);
    expect(githubToken).toHaveBeenCalledTimes(2);
  });

  it('should treat a connection older than the binding as terminal', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    githubToken
      .mockResolvedValueOnce({ accessToken: 'first', expiresAt: expiringIn(eightHours), generation: 3 })
      .mockResolvedValueOnce({ accessToken: 'stale', expiresAt: expiringIn(eightHours), generation: 2 });

    const scripted = mountBound();
    await elapse(eightHours - renewWindow);

    expect(scripted.frames().at(-1)).toMatchObject({
      repositoryUrl,
      unavailable: 'Your GitHub connection needs to be renewed. Connect GitHub again.',
    });
    await elapse(10 * 60_000);
    expect(githubToken).toHaveBeenCalledTimes(2);
  });

  it('should keep asking after a rate limit, a server error or a lost network', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    githubToken
      .mockResolvedValueOnce({ accessToken: 'first', expiresAt: expiringIn(eightHours), generation: 3 })
      .mockRejectedValueOnce(new GithubRequestError(429, 'GITHUB_RATE_LIMITED'))
      .mockRejectedValueOnce(new GithubRequestError(502, undefined))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ accessToken: 'second', expiresAt: expiringIn(eightHours), generation: 3 });

    const scripted = mountBound();
    await elapse(eightHours - renewWindow + 3 * 60_000);

    expect(githubToken).toHaveBeenCalledTimes(5);
    expect(scripted.frames().map((frame) => frame.authorization)).toStrictEqual([basic('first'), basic('second')]);
  });
});

describe('opening a GitHub-bound project', () => {
  it('should withdraw the credential for its repository when there is no Tau session (R-U2)', async () => {
    setRevisionSessionUser(undefined);

    const scripted = mountBound();
    await vi.waitFor(() => {
      expect(scripted.client.open).toHaveBeenCalledOnce();
    });

    expect(githubToken).not.toHaveBeenCalled();
    expect(scripted.frames()).toStrictEqual([
      { apiBaseUrl, origin: 'https://github.com', repositoryUrl, unavailable: 'Sign in to Tau to sync with GitHub.' },
    ]);
  });

  it('should withdraw the credential for its repository when the project closes (R-U2)', async () => {
    githubToken.mockResolvedValue({ accessToken: 'first', expiresAt: expiringIn(eightHours), generation: 3 });
    const scripted = mountBound();
    await vi.waitFor(() => {
      expect(scripted.client.open).toHaveBeenCalledOnce();
    });

    for (const unmount of unmounts.splice(0)) {
      unmount();
    }

    expect(scripted.frames().at(-1)).toStrictEqual({
      apiBaseUrl,
      origin: 'https://github.com',
      repositoryUrl,
      unavailable: 'Open this project in Tau to sync with GitHub.',
    });
    expect(scripted.client.close).toHaveBeenCalledOnce();
  });

  it('should send a bare frame for a project with no GitHub binding', async () => {
    githubProjectBinding.remove(projectId);
    const scripted = mountBound();
    await vi.waitFor(() => {
      expect(scripted.client.open).toHaveBeenCalledOnce();
    });
    for (const unmount of unmounts.splice(0)) {
      unmount();
    }

    expect(scripted.frames()).toStrictEqual([{ apiBaseUrl }, { apiBaseUrl }]);
  });

  it('should retry a mint that failed for a passing reason, then have the refused remote try again (R-U5)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    githubToken
      .mockRejectedValueOnce(new GithubRequestError(503, 'GITHUB_UPSTREAM_UNAVAILABLE'))
      .mockResolvedValueOnce({ accessToken: 'late', expiresAt: expiringIn(eightHours), generation: 3 });

    const scripted = mountBound();
    await elapse(0);
    expect(scripted.frames()).toStrictEqual([
      {
        apiBaseUrl,
        origin: 'https://github.com',
        repositoryUrl,
        unavailable: "Tau couldn't reach GitHub. Try again shortly.",
      },
    ]);
    /* The open's first request met the withdrawn credential. */
    scripted.show({ ...githubRemote, phase: 'reconnectRequired' });
    scripted.client.send.mockClear();

    await elapse(60_000);

    expect(githubToken).toHaveBeenCalledTimes(2);
    expect(scripted.frames().at(-1)).toMatchObject({ repositoryUrl, authorization: basic('late') });
    expect(scripted.sent()).toStrictEqual([{ command: 'authorizeRemote' }]);
  });
});

describe('recovery from a refused GitHub credential (D2)', () => {
  it('should re-validate a remote the opening fetch refused before the first mint landed (D36)', async () => {
    let answer: (token: Token) => void = () => undefined;
    githubToken.mockImplementationOnce(
      async () =>
        new Promise<Token>((resolve) => {
          answer = resolve;
        }),
    );
    const scripted = mountBound();
    /* The worker fetched as the port connected, with no credential yet held. */
    scripted.show({ ...githubRemote, phase: 'reconnectRequired', error: 'The remote rejected the saved credentials.' });
    expect(scripted.sent()).not.toContainEqual({ command: 'authorizeRemote' });

    answer({ accessToken: 'first', expiresAt: expiringIn(eightHours), generation: 3 });

    await vi.waitFor(() => {
      expect(scripted.sent()).toContainEqual({ command: 'authorizeRemote' });
    });
    expect(githubToken).toHaveBeenCalledOnce();
  });

  it('should re-mint once and re-validate a remote that needs reconnecting', async () => {
    githubToken.mockResolvedValue({ accessToken: 'fresh', expiresAt: expiringIn(eightHours), generation: 3 });
    const scripted = mountBound();
    await vi.waitFor(() => {
      expect(scripted.client.open).toHaveBeenCalledOnce();
    });

    scripted.show({ ...githubRemote, phase: 'reconnectRequired', error: 'The remote rejected the saved credentials.' });

    await vi.waitFor(() => {
      expect(scripted.sent()).toContainEqual({ command: 'authorizeRemote' });
    });
    expect(githubToken).toHaveBeenCalledTimes(2);
    expect(scripted.frames().at(-1)).toMatchObject({ authorization: basic('fresh') });

    /* A revoked grant is refused again: that lands in *Reconnect GitHub*. */
    scripted.show({ ...githubRemote, phase: 'reconnectRequired', error: 'Refused again.' });
    await new Promise<void>((resolve) => {
      globalThis.setTimeout(resolve, 20);
    });
    expect(githubToken).toHaveBeenCalledTimes(2);

    /* Backed up again, the next refusal gets its own one retry. */
    scripted.show({ ...githubRemote, phase: 'connected', error: undefined }, { state: 'backedUp' });
    scripted.show({ ...githubRemote, phase: 'reconnectRequired' }, { state: 'failed' });
    await vi.waitFor(() => {
      expect(githubToken).toHaveBeenCalledTimes(3);
    });
  });

  it('should retry a push GitHub refused once, with a fresh credential', async () => {
    githubToken.mockResolvedValue({ accessToken: 'fresh', expiresAt: expiringIn(eightHours), generation: 3 });
    const scripted = mountBound();
    await vi.waitFor(() => {
      expect(scripted.client.open).toHaveBeenCalledOnce();
    });

    scripted.show(
      { ...githubRemote, phase: 'connected' },
      { state: 'failed', reason: 'unauthorized', error: 'The remote rejected the saved credentials.' },
    );

    await vi.waitFor(() => {
      expect(scripted.sent()).toContainEqual({ command: 'syncNow' });
    });
    expect(githubToken).toHaveBeenCalledTimes(2);
  });

  it('should say why when the re-mint is refused, and not retry', async () => {
    githubToken
      .mockResolvedValueOnce({ accessToken: 'first', expiresAt: expiringIn(eightHours), generation: 3 })
      .mockRejectedValueOnce(new GithubRequestError(409, 'GITHUB_RECONNECT_REQUIRED'));
    const scripted = mountBound();
    await vi.waitFor(() => {
      expect(scripted.client.open).toHaveBeenCalledOnce();
    });

    scripted.show({ ...githubRemote, phase: 'reconnectRequired' });

    await vi.waitFor(() => {
      expect(scripted.frames().at(-1)).toStrictEqual({
        apiBaseUrl: 'http://localhost:4000',
        origin: 'https://github.com',
        repositoryUrl,
        unavailable: 'Your GitHub connection needs to be renewed. Connect GitHub again.',
      });
    });
    expect(scripted.sent()).not.toContainEqual({ command: 'authorizeRemote' });
  });
});

describe('connecting a remote', () => {
  it('should re-grant rather than reconnect when the recorded repository is picked again (D3)', async () => {
    githubToken.mockResolvedValue({ accessToken: 'first', expiresAt: expiringIn(eightHours), generation: 3 });
    const scripted = mountBound();
    await vi.waitFor(() => {
      expect(scripted.client.open).toHaveBeenCalledOnce();
    });
    scripted.client.send.mockClear();
    scripted.show({ ...githubRemote, phase: 'reconnectRequired' });
    await vi.waitFor(() => {
      expect(scripted.sent()).toContainEqual({ command: 'authorizeRemote' });
    });
    scripted.client.send.mockClear();
    const expiresAt = expiringIn(eightHours);

    await commands?.connectRemote('git', repositoryUrl, {
      authorization: basic('picked'),
      provider: 'github',
      repositoryId: '99',
      connectionId,
      generation: 3,
      expiresAt,
    });

    expect(scripted.frames().at(-1)).toMatchObject({ repositoryUrl, authorization: basic('picked'), expiresAt });
    expect(scripted.sent()).toStrictEqual([{ command: 'authorizeRemote' }]);
  });

  it('should re-send the link when the recorded repository is picked again with changed access (R-U6)', async () => {
    githubToken.mockResolvedValue({ accessToken: 'first', expiresAt: expiringIn(eightHours), generation: 3 });
    const scripted = mountBound();
    await vi.waitFor(() => {
      expect(scripted.client.open).toHaveBeenCalledOnce();
    });
    scripted.show({ ...githubRemote, phase: 'connected', fetchOnly: false }, { state: 'backedUp' });
    scripted.client.send.mockClear();

    await commands?.connectRemote('git', repositoryUrl, {
      authorization: basic('picked'),
      provider: 'github',
      repositoryId: '99',
      connectionId,
      generation: 3,
      expiresAt: expiringIn(eightHours),
      fetchOnly: true,
    });

    expect(scripted.sent()).toStrictEqual([
      {
        command: 'connectRemote',
        kind: 'git',
        url: repositoryUrl,
        provider: 'github',
        repositoryId: '99',
        fetchOnly: true,
      },
    ]);
  });

  it('should author the next revisions with the linked account no-reply address (D33)', async () => {
    githubProjectBinding.remove(projectId);
    githubToken.mockResolvedValue({ accessToken: 'first', expiresAt: expiringIn(eightHours), generation: 3 });
    const scripted = mountBound();
    await vi.waitFor(() => {
      expect(scripted.client.open).toHaveBeenCalledOnce();
    });

    await commands?.connectRemote('git', repositoryUrl, {
      authorization: basic('picked'),
      provider: 'github',
      repositoryId: '99',
      connectionId,
      generation: 3,
      expiresAt: expiringIn(eightHours),
    });

    expect(scripted.actors().at(-1)).toMatchObject({
      command: 'setActor',
      actor: { kind: 'user', name: 'octo', email: '7+octo@users.noreply.github.com' },
    });
  });

  it('should link a github.com address with no App credential as an anonymous read-only remote (G2)', async () => {
    githubProjectBinding.remove(projectId);
    const scripted = mountBound();
    await vi.waitFor(() => {
      expect(scripted.client.open).toHaveBeenCalledOnce();
    });

    await commands?.connectRemote('git', 'https://github.com/o/public.git');

    expect(scripted.frames().at(-1)).toStrictEqual({
      apiBaseUrl: 'http://localhost:4000',
      origin: 'https://github.com',
    });
    expect(scripted.sent().at(-1)).toStrictEqual({
      command: 'connectRemote',
      kind: 'git',
      url: 'https://github.com/o/public.git',
      fetchOnly: true,
    });
  });
});
