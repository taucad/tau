/**
 * STO-25 SP6 (SP3-local 5bc7b961 gap 2): a cold connect to Tau Cloud asks for the remote's advertisement as the
 * connect is written, beside the store's creation, its Start version and the remote's config write, and `validate`
 * takes that listing instead of asking again; the connect-time fetch then takes it as before (R6).
 *
 * Guarded: the listing is used only for the destination it was asked for and only by the connect that asked; a remote
 * re-pointed, replaced or removed meanwhile, or a connect whose write failed, lists again; a listing that fails is
 * asked again by `validate` and never rejects unhandled, even when the store work fails beside it, except a `404`
 * this host can register on, which `validate` registers on at once (D11); only a Tau remote (no credential to
 * authorize) is asked early, and only when the connect names its URL: a host that resolves the destination itself is
 * asked once, after the store exists, as before.
 */
import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';

import { createMemoryProvider } from '@taucad/filesystem/backend';

import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
import { RevisionPortError } from '#revision-port.js';
import type { RemoteRef, RevisionPort, RevisionRemoteAddress } from '#revision-port.js';
import { createRevisionActors } from '#revision-effects.js';
import type { RevisionFileSystem } from '#revision-effects.js';
import { testIdentity } from '#test/identity.js';

const tauUrl = 'https://api.taucad.dev/v1/git/project-1.git';
const head = 'a'.repeat(40);

type Harness = Readonly<{
  actors: ReturnType<typeof createRevisionActors>;
  port: RevisionPort;
  /** Every step, in order: `list:<remote>`, `init:start`, `init:end`, `fetch:<advertised listing index>`. */
  steps: string[];
  listings: Array<readonly RemoteRef[]>;
  /** Lets the store's creation finish. */
  releaseInit: () => void;
  /** Creates the store underneath the actors, as another open of it would. */
  createStore: () => Promise<void>;
}>;

const harness = async (
  options: Readonly<{
    failInit?: boolean;
    failListing?: (remote: string | RevisionRemoteAddress) => boolean;
    /** The remote answers `404` until the project is registered. */
    unregistered?: boolean;
    /** The status that `404`-family answer carries (a `410` is a tombstoned project). */
    notFoundStatus?: number;
    /** No registration seam, as a host that cannot register a project. */
    noRegistration?: boolean;
    remoteUrl?: (projectId: string) => string | undefined;
  }> = {},
): Promise<Harness> => {
  const filesystem = await createMemoryProvider();
  const inner = createIsomorphicGitRevisionPort({ filesystem });
  const steps: string[] = [];
  const listings: Array<readonly RemoteRef[]> = [];
  const init = Promise.withResolvers<void>();
  const port: RevisionPort = {
    ...inner,
    init: async (input) => {
      steps.push('init:start');
      await init.promise;
      if (options.failInit === true) {
        steps.push('init:failed');
        throw new Error('The store could not be created.');
      }
      await inner.init(input);
      steps.push('init:end');
    },
    listRemoteRefs: async (remote) => {
      steps.push(`list:${typeof remote === 'string' ? remote : `${remote.name}@${remote.url}`}`);
      await Promise.resolve();
      if (options.failListing?.(remote) === true) {
        throw new Error('The remote did not answer.');
      }
      if (options.unregistered === true && !steps.includes('register')) {
        throw new RevisionPortError(
          'REMOTE_NOT_FOUND',
          'No repository here yet.',
          options.notFoundStatus === undefined ? undefined : { status: options.notFoundStatus },
        );
      }
      const listed = Object.freeze([{ name: 'refs/heads/main', head }]) as readonly RemoteRef[];
      listings.push(listed);
      return listed;
    },
    fetch: async (input) => {
      steps.push(`fetch:${String(input.advertised === undefined ? -1 : listings.indexOf(input.advertised))}`);
      return { refs: [] };
    },
  };
  const actors = createRevisionActors({
    identity: testIdentity,
    port,
    projectId: 'project-1',
    filesystem: async () => Object.create(filesystem) as RevisionFileSystem,
    ...(options.noRegistration === true
      ? {}
      : {
          registerRemoteProject: async () => {
            steps.push('register');
          },
        }),
    ...(options.remoteUrl === undefined ? {} : { remoteUrl: options.remoteUrl }),
  });
  return {
    actors,
    port,
    steps,
    listings,
    releaseInit: init.resolve,
    createStore: async () => inner.init({ author: { name: 'Tau', email: 'noreply@tau.new' } }),
  };
};

const start = async <Output>(actor: unknown, input: unknown): Promise<Output> =>
  new Promise<Output>((resolve, reject) => {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the actor logic is the machine's own; this drives it directly.
    const running = createActor(actor as Parameters<typeof createActor>[0], { input });
    running.subscribe({
      next: (snapshot) => {
        if (snapshot.status === 'done') {
          // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the output type is the caller's contract.
          resolve(snapshot.output as Output);
        }
        if (snapshot.status === 'error') {
          const { error } = snapshot as { error: unknown };
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      },
      error: (failure: unknown) => {
        reject(failure instanceof Error ? failure : new Error(String(failure)));
      },
    });
    running.start();
  });

const settle = async (): Promise<void> => {
  for (let round = 0; round < 8; round += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each round lets the next microtask run.
    await Promise.resolve();
  }
};

const tauConnect = { projectId: 'project-1', kind: 'tau', url: tauUrl } as const;

describe('a cold Tau Cloud connect lists the remote beside the store work (STO-25 SP6)', () => {
  it('asks for info/refs before the store work settles, and validate and the connect-time fetch take that listing', async () => {
    const { actors, steps, listings, releaseInit } = await harness();
    const written = start(actors.remote.writeRemote, tauConnect);
    await settle();
    /* The advertisement is asked for while the store is still being created. */
    expect(steps).toContain('list:tau@' + tauUrl);
    expect(steps).not.toContain('init:end');
    releaseInit();
    await written;
    await start(actors.remote.validate, { remote: 'tau', url: tauUrl });
    await start(actors.remote.initialSync, { remote: 'tau', branch: 'main' });
    /* One listing for the whole connect: validate asked nothing, and the fetch was handed the early one. */
    expect(listings).toHaveLength(1);
    expect(steps.filter((step) => step.startsWith('list:'))).toHaveLength(1);
    expect(steps.at(-1)).toBe('fetch:0');
  });

  it('lists again when the remote was re-pointed after the connect that listed it', async () => {
    const { actors, port, steps, releaseInit } = await harness();
    releaseInit();
    await start(actors.remote.writeRemote, tauConnect);
    await port.setRemote({ name: 'tau', url: 'https://api.taucad.dev/v1/git/project-2.git' });
    await start(actors.remote.validate, { remote: 'tau', url: 'https://api.taucad.dev/v1/git/project-2.git' });
    expect(steps.filter((step) => step.startsWith('list:'))).toStrictEqual(['list:tau@' + tauUrl, 'list:tau']);
  });

  it('forgets the early listing when the remote is removed, and when another connect is written', async () => {
    const { actors, port, steps, releaseInit } = await harness();
    releaseInit();
    await start(actors.remote.writeRemote, tauConnect);
    await start(actors.remote.removeRemote, { name: 'tau' });
    await port.setRemote({ name: 'tau', url: tauUrl });
    await start(actors.remote.validate, { remote: 'tau', url: tauUrl });
    expect(steps.filter((step) => step.startsWith('list:'))).toStrictEqual(['list:tau@' + tauUrl, 'list:tau']);

    /* A GitHub connect written after a Tau one: validate never takes the Tau listing for it. */
    await start(actors.remote.writeRemote, tauConnect);
    await start(actors.remote.writeRemote, {
      projectId: 'project-1',
      kind: 'git',
      url: 'https://github.com/acme/part.git',
      provider: 'github',
      repositoryId: '42',
    });
    await start(actors.remote.validate, { remote: 'github-42', url: 'https://github.com/acme/part.git' });
    expect(steps.filter((step) => step.startsWith('list:')).slice(2)).toStrictEqual([
      'list:tau@' + tauUrl,
      'list:github-42',
    ]);
  });

  /* Review of 7bb4b645 (LOW): a connect whose write failed leaves no listing for a later `validate`. */
  it('forgets the early listing when the connect that asked for it fails to write', async () => {
    const { actors, port, steps, listings, releaseInit, createStore } = await harness({ failInit: true });
    releaseInit();
    await expect(start(actors.remote.writeRemote, tauConnect)).rejects.toThrow('The store could not be created.');
    expect(listings).toHaveLength(1);
    /* The destination is recorded by some later path; its `validate` asks the remote itself. */
    await createStore();
    await port.setRemote({ name: 'tau', url: tauUrl });
    await start(actors.remote.validate, { remote: 'tau', url: tauUrl });
    expect(steps.filter((step) => step.startsWith('list:'))).toStrictEqual(['list:tau@' + tauUrl, 'list:tau']);
  });

  /* CI on #2653: the early listing's `404` is the one validate registers on (D11); no second listing before the PUT. */
  it('registers on the early listing’s 404, then lists once, with no second listing before the registration', async () => {
    const { actors, steps, releaseInit } = await harness({ unregistered: true });
    releaseInit();
    await start(actors.remote.writeRemote, tauConnect);
    await start(actors.remote.validate, { remote: 'tau', url: tauUrl });
    expect(steps.filter((step) => step.startsWith('list:') || step === 'register')).toStrictEqual([
      'list:tau@' + tauUrl,
      'register',
      'list:tau',
    ]);
  });

  /* CI on #2653: a host resolves the project's identity for its Tau URL; one connect asks it once. */
  it('asks a host that resolves the Tau destination once per connect, and lists nothing early for it', async () => {
    const asked: string[] = [];
    const { actors, steps, releaseInit } = await harness({
      remoteUrl: (projectId) => {
        asked.push(projectId);
        return tauUrl;
      },
    });
    releaseInit();
    await start(actors.remote.writeRemote, { projectId: 'project-1', kind: 'tau' });
    expect(asked).toStrictEqual(['project-1']);
    expect(steps.filter((step) => step.startsWith('list:'))).toStrictEqual([]);

    /* With no destination, the write still fails as before, having asked once. */
    asked.length = 0;
    const none = await harness({
      remoteUrl: (projectId) => {
        asked.push(projectId);
        return undefined;
      },
    });
    none.releaseInit();
    await expect(start(none.actors.remote.writeRemote, { projectId: 'project-1', kind: 'tau' })).rejects.toThrow(
      'Couldn’t find this project in the cloud',
    );
    expect(asked).toStrictEqual(['project-1']);
  });

  /* Merge queue on #2653: a destination known only once the store exists (a daemon's API origin set meanwhile). */
  it('asks a host for a destination it resolves itself only after the store, when it knows it', async () => {
    const asked: string[] = [];
    let known = false;
    const { actors, port, steps, releaseInit } = await harness({
      remoteUrl: (projectId) => {
        asked.push(projectId);
        return known ? tauUrl : undefined;
      },
    });
    const written = start(actors.remote.writeRemote, { projectId: 'project-1', kind: 'tau' });
    await settle();
    known = true;
    releaseInit();
    await written;
    const recorded = await port.listRemotes();
    expect(recorded.map((remote) => remote.url)).toStrictEqual([tauUrl]);
    expect(asked).toStrictEqual(['project-1']);
    /* Resolved by the host: nothing was asked of the remote early. */
    expect(steps.filter((step) => step.startsWith('list:'))).toStrictEqual([]);
  });

  /* Review of bd71d15d (LOW): a `410` is a tombstoned project; registering cannot bring it back, so it is no seed. */
  it('keeps no early 410 to register on: validate asks the remote itself', async () => {
    const { actors, steps, releaseInit } = await harness({ unregistered: true, notFoundStatus: 410 });
    releaseInit();
    await start(actors.remote.writeRemote, tauConnect);
    await expect(start(actors.remote.validate, { remote: 'tau', url: tauUrl })).rejects.toThrow(
      'No repository here yet.',
    );
    expect(steps.filter((step) => step.startsWith('list:') || step === 'register')).toStrictEqual([
      'list:tau@' + tauUrl,
      'list:tau',
    ]);
  });

  /* Review of bd71d15d (LOW): with no way to register, an early `404` is no seed either. */
  it('keeps no early 404 on a host that cannot register: validate asks the remote itself', async () => {
    const { actors, steps, releaseInit } = await harness({ unregistered: true, noRegistration: true });
    releaseInit();
    await start(actors.remote.writeRemote, tauConnect);
    await expect(start(actors.remote.validate, { remote: 'tau', url: tauUrl })).rejects.toThrow(
      'No repository here yet.',
    );
    expect(steps.filter((step) => step.startsWith('list:'))).toStrictEqual(['list:tau@' + tauUrl, 'list:tau']);
  });

  it('asks a remote with a credential to authorize nothing early', async () => {
    const { actors, steps, releaseInit } = await harness();
    releaseInit();
    await start(actors.remote.writeRemote, {
      projectId: 'project-1',
      kind: 'git',
      url: 'https://github.com/acme/part.git',
      provider: 'github',
      repositoryId: '42',
    });
    expect(steps.filter((step) => step.startsWith('list:'))).toStrictEqual([]);
  });

  it('lists again in validate when the early listing failed, with no unhandled rejection when the store failed too', async () => {
    const early = (remote: string | RevisionRemoteAddress): boolean => typeof remote !== 'string';
    const failing = await harness({ failInit: true, failListing: early });
    failing.releaseInit();
    await expect(start(failing.actors.remote.writeRemote, tauConnect)).rejects.toThrow(
      'The store could not be created.',
    );
    await settle();

    const { actors, steps, releaseInit } = await harness({ failListing: early });
    releaseInit();
    await start(actors.remote.writeRemote, tauConnect);
    await start(actors.remote.validate, { remote: 'tau', url: tauUrl });
    expect(steps.filter((step) => step.startsWith('list:'))).toStrictEqual(['list:tau@' + tauUrl, 'list:tau']);
  });
});
