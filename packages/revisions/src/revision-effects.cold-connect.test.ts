/**
 * STO-25 SP6 (SP3-local 5bc7b961 gap 2): a cold connect to Tau Cloud asks for the remote's advertisement as the
 * connect is written, beside the store's creation, its Start version and the remote's config write, and `validate`
 * takes that listing instead of asking again; the connect-time fetch then takes it as before (R6).
 *
 * Guarded: the listing is used only for the destination it was asked for and only by the connect that asked; a remote
 * re-pointed, replaced or removed meanwhile lists again; a listing that fails is asked again by `validate` and never
 * rejects unhandled, even when the store work fails beside it; only a Tau remote (no credential to authorize) is
 * asked early.
 */
import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';

import { createMemoryProvider } from '@taucad/filesystem/backend';

import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
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
  options: Readonly<{ failInit?: boolean; failListing?: (remote: string | RevisionRemoteAddress) => boolean }> = {},
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
