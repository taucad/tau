/**
 * The turn-placement adapter over a real root and a real port (W8 TS-S3, TS-A8).
 *
 * Each row drives the six verbs as M1 does and reads the durable effects back from the store: the lease directory,
 * the revisions and their provenance, and the files the attempt's tools could write.
 */

import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';
import { join } from 'node:path';

import { NodeFsAuthorityHost, serveNodeFsProvider, NodeFsProvider } from '@taucad/filesystem/backend/node';
import { WorkspaceFileService, ProviderRegistry, MountTable, ResourceQueue, ChangeEventBus } from '@taucad/filesystem';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import type { CheckedFileWrite } from '@taucad/filesystem';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from 'xstate';

import { ImmutableRevisionTree, revisionId } from '#algorithms/index.js';
import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
import { digestHex } from '#object-hash.js';
import type { Checkout, RevisionPort } from '#revision-port.js';
import { createProjectRevisionsActor } from '#revision-effects.js';
import type { ProjectRevisions, RevisionFileSystem } from '#revision-effects.js';
import { createTurnPlacementPort } from '#turn-placement.js';
import type { TurnPlacementAdapter } from '#turn-placement.js';
import type { TurnAttemptKey } from '#turn.types.js';

const roots: string[] = [];
const stops: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const stop of stops.splice(0).reverse()) {
    // oxlint-disable-next-line no-await-in-loop -- each tree is stopped and settled before its directory goes.
    await stop();
  }
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

const key: TurnAttemptKey = { chatId: 'chat-1', turnId: 'turn-1', runId: 'run-1', attempt: 1 };

type Project = Readonly<{
  filesystem: RevisionFileSystem;
  port: RevisionPort;
  /** Start a root over the same store, as a host (re)start does, and one placement session over it. */
  open: (
    options?: Readonly<{ deviceId?: () => string | undefined; revisionPort?: RevisionPort }>,
  ) => Readonly<{ revisions: ProjectRevisions; placement: TurnPlacementAdapter<RevisionFileSystem> }>;
}>;

const createProject = async (withAuthority = false): Promise<Project> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-turn-placement-'));
  roots.push(root);
  let filesystem: RevisionFileSystem = new NodeFsProvider(root);
  if (withAuthority) {
    const authorityRoot = await mkdtemp(join(tmpdir(), 'tau-placement-authority-'));
    roots.push(authorityRoot);
    const { port1, port2 } = new MessageChannel();
    const authority = new NodeFsAuthorityHost({
      authorityDirectory: () => authorityRoot,
      authorityIdentity: () => root,
    });
    const stop = serveNodeFsProvider(port2, { policy: tauPathPolicy, allowRoot: () => true, authority }).close;
    const registry = new ProviderRegistry({ createNodeFsPort: async () => port1 });
    const scope = { backend: 'node', path: root, storageRootKey: `node:${root}` } as const;
    const mounts = new MountTable();
    mounts.mount('/', await registry.getProvider(scope), { class: 'authored', ...scope });
    const service = new WorkspaceFileService({
      providerRegistry: registry,
      mountTable: mounts,
      resourceQueue: new ResourceQueue(),
      eventBus: new ChangeEventBus(),
    });
    filesystem = service.createRootedFileSystem('/');
    stops.push(async () => {
      service.dispose();
      await stop();
      port2.close();
    });
  }
  /* Linked checkouts live outside the project, one directory each (revisions policy rule 3). */
  const linkedRoot = await mkdtemp(join(tmpdir(), 'tau-placement-checkouts-'));
  roots.push(linkedRoot);
  const linked = new Map<string, RevisionFileSystem>();
  const linkedFilesystem = async (id: string): Promise<RevisionFileSystem> => {
    const existing = linked.get(id);
    if (existing !== undefined) {
      return existing;
    }
    await mkdir(join(linkedRoot, id), { recursive: true });
    const created = new NodeFsProvider(join(linkedRoot, id));
    linked.set(id, created);
    return created;
  };
  const port = createIsomorphicGitRevisionPort({
    filesystem,
    checkouts: { projectId: 'project-1', root: linkedFilesystem },
  });
  await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
  return {
    filesystem,
    port,
    /**
     * `deviceId`: the host's id, which gives it a record identity to sync chats under; none by default. `revisionPort`:
     * the port the root reads through, this project's own by default.
     */
    open: (options: Readonly<{ deviceId?: () => string | undefined; revisionPort?: RevisionPort }> = {}) => {
      const { deviceId } = options;
      const revisions = createProjectRevisionsActor({
        port: options.revisionPort ?? port,
        projectId: 'project-1',
        ...(deviceId === undefined ? {} : { deviceId }),
        filesystem: async (checkout: Checkout) =>
          checkout.kind === 'live' ? filesystem : linkedFilesystem(checkout.id),
      });
      revisions.actor.start();
      stops.push(async () => {
        revisions.actor.stop();
        await revisions.settled();
      });
      return {
        revisions,
        placement: createTurnPlacementPort({ revisions, openTools: ({ filesystem: view }) => view }),
      };
    },
  };
};

const recordsChanged = {
  type: 'sync',
  event: { type: 'recordsChanged' },
} as const;

/**
 * The revisions with every `sync` event the adapter sends its root observed on the way in.
 *
 * @param opened - The root and its store.
 * @returns The same revisions over a root that records each sync event in `syncs`.
 */
const observeSyncs = (opened: ProjectRevisions): Readonly<{ revisions: ProjectRevisions; syncs: unknown[] }> => {
  const syncs: unknown[] = [];
  const actor = new Proxy(opened.actor, {
    get: (target, property): unknown => {
      const value: unknown = Reflect.get(target, property, target);
      if (property === 'send') {
        return (event: Parameters<typeof target.send>[0]) => {
          if (event.type === 'sync') {
            syncs.push(event);
          }
          target.send(event);
        };
      }
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });
  return { revisions: { ...opened, actor }, syncs };
};

/**
 * The revisions as a project that syncs with a remote sees them: the evidence that a missing branch may still arrive.
 *
 * @param opened - The root and its store.
 * @returns The same revisions over a root whose snapshot names a remote child.
 */
const withRemote = (opened: ProjectRevisions): ProjectRevisions => {
  const actor = new Proxy(opened.actor, {
    get: (target, property): unknown => {
      if (property === 'getSnapshot') {
        return () => {
          const snapshot = target.getSnapshot();
          return new Proxy(snapshot, {
            get: (inner, name): unknown =>
              name === 'children'
                ? { ...inner.children, remote: { getSnapshot: () => ({ context: { kind: 'tau' } }) } }
                : Reflect.get(inner, name, inner),
          });
        };
      }
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });
  return { ...opened, actor };
};

/**
 * The root once its remotes read has settled on `state` (round 28): only a settled read is evidence of no remote.
 *
 * @param opened - The root and its store.
 * @param state - The remote child's settled state.
 * @returns The same revisions, once the remote child is in `state`.
 */
const remoteSettled = async (
  opened: ProjectRevisions,
  state: 'none' | 'failed' = 'none',
): Promise<ProjectRevisions> => {
  await waitFor(opened.actor, (snapshot) => snapshot.children.remote?.getSnapshot().value === state);
  return opened;
};

/**
 * The checkout id another device derives for a branch (`tau-checkout\0<branch>`, both git ports): what a synced
 * `chat.json` names when that chat last ran on a linked checkout there.
 */
const checkoutIdOnAnotherDevice = async (port: RevisionPort, branch: string): Promise<string> => {
  const { objectFormat } = await port.describe();
  return digestHex(objectFormat, new TextEncoder().encode(`tau-checkout\0${branch}`)).slice(0, 16);
};

/** Record `files` as a revision and point `branch` at it, as a pull leaves a branch this device has no checkout of. */
const commitBranch = async (
  port: RevisionPort,
  branch: string,
  { files, parent }: Readonly<{ files: Readonly<Record<string, string>>; parent?: string }>,
): Promise<string> => {
  const receipt = await port.writeRevision({
    tree: new ImmutableRevisionTree(
      Object.entries(files).map(([path, text]) => [path, new TextEncoder().encode(text)]),
    ),
    parents: parent === undefined ? [] : [revisionId(parent)],
    provenance: { source: 'user', actorId: 'person-1', createdAt: 1 },
    summary: { generated: branch },
  });
  const head = await port.readRef(branch);
  await port.updateRef({
    name: `refs/heads/${branch}`,
    expectedHead: head,
    head: revisionId(receipt.commitId),
  });
  return receipt.commitId;
};

/** Write a synced chat record naming `checkoutId`, as another device left it. */
const writeChatRecord = async (filesystem: RevisionFileSystem, checkoutId: string): Promise<void> => {
  await filesystem.writeFile(
    '.tau/chats/chat-1/chat.json',
    JSON.stringify({ id: 'chat-1', name: 'Chat', createdAt: 0, updatedAt: 0, checkoutId }),
  );
};

/** The revisions a turn attempt minted, by `turnCut`, walking first parents from the head. */
const turnCuts = async (port: RevisionPort, of: TurnAttemptKey): Promise<readonly string[]> => {
  const cuts: string[] = [];
  const head = await port.readHead();
  let cursor = head?.head;
  while (cursor !== undefined) {
    // oxlint-disable-next-line no-await-in-loop -- a first-parent walk reads one commit at a time.
    const record = await port.readRevision(revisionId(cursor));
    if (record === undefined) {
      break;
    }
    const { provenance } = record;
    if (provenance.runId === of.runId && provenance.attempt === of.attempt && provenance.turnCut !== undefined) {
      cuts.push(provenance.turnCut);
    }
    cursor = record.parents[0];
  }
  return cuts;
};

/** The first settlement fact a fresh subscription replays or receives. */
const firstSettlement = async (placement: TurnPlacementAdapter<RevisionFileSystem>) => {
  const listening = new AbortController();
  for await (const fact of placement.settlements({ signal: listening.signal })) {
    if (fact.kind === 'settled') {
      listening.abort();
      return fact;
    }
  }
  throw new Error('The settlements listen ended with no settlement.');
};

/** The first `leaseHeld` fact a subscription receives. */
const firstLeaseHeld = async (placement: TurnPlacementAdapter<RevisionFileSystem>) => {
  const listening = new AbortController();
  for await (const fact of placement.settlements({ signal: listening.signal })) {
    if (fact.kind === 'leaseHeld') {
      listening.abort();
      return fact;
    }
  }
  throw new Error('The settlements listen ended with no leaseHeld fact.');
};

describe('createTurnPlacementPort (TS-S3)', () => {
  it('should attest only an actual versioned change through the admitted tools', async () => {
    const project = await createProject(true);
    await project.filesystem.writeFile('main.ts', 'before');
    const { placement } = project.open();
    const listening = new AbortController();
    const facts: Array<{ readonly kind: string }> = [];
    const collect = async (): Promise<void> => {
      for await (const fact of placement.settlements({ signal: listening.signal })) {
        facts.push(fact);
      }
    };
    const collected = collect();
    try {
      const answer = await placement.admit({ requestId: 'admit', key });
      if (answer.status === 'refused') {
        throw new Error(answer.message);
      }
      await answer.placement.tools.writeFile('main.ts', 'before');
      await answer.placement.tools.mkdir('empty');
      await answer.placement.tools.writeFile('.tau/cache/report.json', '{}');
      await project.filesystem.writeFile('foreign.ts', 'manual');
      expect(facts).toEqual([]);
      await answer.placement.tools.writeFile('main.ts', 'after');
      await vi.waitFor(() => {
        expect(facts).toContainEqual({ kind: 'changed', key, checkoutId: answer.placement.checkoutId });
      });
      await answer.placement.tools.writeFile('main.ts', 'again');
      expect(facts).toHaveLength(1);
    } finally {
      listening.abort();
      await collected;
      await placement.fence();
    }
  });

  it.each([
    'create',
    'delete',
    'deletePlain',
    'replay',
    'contended',
    'unsupported',
    'rename',
    'checkedConflict',
    'unknownFailure',
  ] as const)('should keep change proof authoritative for %s', async (scenario) => {
    const project = await createProject(scenario !== 'unsupported');
    await project.filesystem.writeFile('main.ts', 'before');
    const { placement } = project.open();
    const answer = await placement.admit({ requestId: 'admit', key });
    if (answer.status === 'refused') {
      throw new Error(answer.message);
    }
    const listening = new AbortController();
    const facts: Array<{ readonly kind: string }> = [];
    const collected = (async (): Promise<void> => {
      for await (const fact of placement.settlements({ signal: listening.signal })) {
        facts.push(fact);
      }
    })();
    try {
      const view = answer.placement.tools;
      switch (scenario) {
        case 'create': {
          await view.writeFile('binary.dat', new Uint8Array([1, 2, 3]));
          break;
        }
        case 'deletePlain': {
          await view.unlink('main.ts');
          break;
        }
        case 'delete': {
          await view.deleteFileChecked({ path: 'main.ts', preconditions: [{ path: 'main.ts', expected: 'before' }] });
          break;
        }
        case 'rename': {
          await view.rename('main.ts', 'renamed.ts');
          await expect(project.filesystem.readFile('renamed.ts', 'utf8')).resolves.toBe('before');
          break;
        }
        case 'checkedConflict': {
          await expect(
            view.writeFileChecked({
              path: 'main.ts',
              data: 'after',
              preconditions: [{ path: 'main.ts', expected: 'stale' }],
            }),
          ).resolves.toMatchObject({ status: 'conflict' });
          await expect(project.filesystem.readFile('main.ts', 'utf8')).resolves.toBe('before');
          break;
        }
        case 'unknownFailure': {
          vi.spyOn(project.filesystem, 'writeFileChecked').mockImplementationOnce(async () => {
            await project.filesystem.writeFile('main.ts', 'after');
            throw Object.assign(new Error('Write outcome unknown'), { applicationState: 'unknown' });
          });
          await expect(view.writeFile('main.ts', 'after')).rejects.toThrow('Write outcome unknown');
          await expect(project.filesystem.readFile('main.ts', 'utf8')).resolves.toBe('after');
          break;
        }
        case 'contended': {
          const original = project.filesystem.writeFileChecked.bind(project.filesystem);
          vi.spyOn(project.filesystem, 'writeFileChecked').mockImplementationOnce(async (input) => {
            await project.filesystem.writeFile('main.ts', 'after');
            return original(input);
          });
          await view.writeFile('main.ts', 'after');
          await placement.complete({ requestId: 'complete', key, cut: false });
          await vi.waitFor(() => {
            expect(facts.at(-1)?.kind).toBe('settled');
          });
          expect(facts.filter((fact) => fact.kind === 'changed')).toEqual([]);
          await expect(project.filesystem.readFile('main.ts', 'utf8')).resolves.toBe('after');
          return;
        }
        case 'unsupported': {
          await view.writeFile('main.ts', 'after');
          await placement.complete({ requestId: 'complete', key, cut: false });
          await vi.waitFor(() => {
            expect(facts.at(-1)?.kind).toBe('settled');
          });
          expect(facts.filter((fact) => fact.kind === 'changed')).toEqual([]);
          await expect(project.filesystem.readFile('main.ts', 'utf8')).resolves.toBe('after');
          return;
        }
        case 'replay': {
          await view.writeFile('main.ts', 'after');
          listening.abort();
          await collected;
          const iterator = placement.settlements({ signal: new AbortController().signal })[Symbol.asyncIterator]();
          try {
            await expect(iterator.next()).resolves.toMatchObject({
              value: { kind: 'changed', key, checkoutId: answer.placement.checkoutId },
            });
          } finally {
            await iterator.return?.();
          }
          return;
        }
      }
      if (scenario === 'rename' || scenario === 'checkedConflict' || scenario === 'unknownFailure') {
        await placement.complete({ requestId: 'complete', key, cut: false });
        await vi.waitFor(() => {
          expect(facts.at(-1)?.kind).toBe('settled');
        });
        expect(facts.filter((fact) => fact.kind === 'changed')).toEqual([]);
        return;
      }
      await vi.waitFor(() => {
        expect(facts).toEqual([{ kind: 'changed', key, checkoutId: answer.placement.checkoutId }]);
      });
    } finally {
      listening.abort();
      await collected;
      await placement.fence();
    }
  });

  it.each(['writeFileChecked', 'deleteFileChecked'] as const)(
    'should classify %s before an asynchronous mutation can change its input',
    async (operation) => {
      const project = await createProject(true);
      await project.filesystem.writeFile('.tau/cache/probe.json', '{}');
      const { placement } = project.open();
      const answer = await placement.admit({ requestId: 'admit', key });
      if (answer.status === 'refused') {
        throw new Error(answer.message);
      }
      const input = {
        path: '.tau/cache/probe.json',
        data: 'new',
        preconditions: [{ path: '.tau/cache/probe.json', expected: '{}' }],
      };
      const original = project.filesystem[operation].bind(project.filesystem);
      vi.spyOn(project.filesystem, operation).mockImplementationOnce(async (request: CheckedFileWrite) => {
        const result = await original({ ...request, data: input.data });
        input.path = 'main.ts';
        return result;
      });
      const listening = new AbortController();
      const facts: Array<{ readonly kind: string }> = [];
      const collected = (async (): Promise<void> => {
        for await (const fact of placement.settlements({ signal: listening.signal })) {
          facts.push(fact);
        }
      })();
      try {
        await answer.placement.tools[operation](input);
        await placement.complete({ requestId: 'complete', key, cut: false });
        await vi.waitFor(() => {
          expect(facts.at(-1)?.kind).toBe('settled');
        });
        expect(facts.filter((fact) => fact.kind === 'changed')).toEqual([]);
        await expect(project.filesystem.exists('main.ts')).resolves.toBe(false);
      } finally {
        listening.abort();
        await collected;
        await placement.fence();
      }
    },
  );

  /*
   * TS-R12 (W8.a2): with no checkout named, the chat record's is the placement intent, not the live checkout.
   * XD4: an id no checkout and no branch on this device answers to waits only while a remote may bring the branch;
   * a project with no remote can never receive it, so it is refused for good.
   */
  it("should place an attempt on the chat record's checkout when the person named none", async () => {
    const project = await createProject();
    await writeChatRecord(project.filesystem, 'missing-checkout');
    const { placement } = project.open();

    const answer = await placement.admit({ requestId: 'admit:run-1:1', key });

    expect(answer).toMatchObject({ status: 'refused', code: 'CHECKOUT_UNKNOWN' });
    await expect(project.filesystem.readdir('.tau/runs').catch(() => [])).resolves.toEqual([]);
  });

  it('should refuse retryably a checkout id no local branch derives while the project syncs with a remote', async () => {
    const project = await createProject();
    await writeChatRecord(project.filesystem, 'missing-checkout');
    const revisions = withRemote(project.open().revisions);
    const placement = createTurnPlacementPort({ revisions, openTools: ({ filesystem: view }) => view });

    const answer = await placement.admit({ requestId: 'admit:run-1:1', key });

    expect(answer).toMatchObject({ status: 'refused', code: 'BRANCH_UNAVAILABLE' });
  });

  /* XD4: a device that cannot tell where an id's branch refuses for now; only a recorded removal refuses for good. */
  it('should refuse retryably when this device cannot read its branches', async () => {
    const project = await createProject();
    await writeChatRecord(project.filesystem, 'missing-checkout');
    const opened = withRemote(project.open().revisions);
    const revisions = {
      ...opened,
      turns: {
        ...opened.turns,
        branchOf: async () => {
          throw new Error('The refs could not be listed.');
        },
      },
    };
    const placement = createTurnPlacementPort({ revisions, openTools: ({ filesystem: view }) => view });

    const answer = await placement.admit({ requestId: 'admit:run-1:1', key });

    expect(answer).toMatchObject({ status: 'refused', code: 'REVISIONS_UNAVAILABLE' });
  });

  /*
   * XD4: a checkout id is device state derived from its branch. A chat that last ran on another device's linked
   * checkout of a branch this device holds only as a ref (after a pull) runs on that branch, opened here on demand.
   */
  it("should open the chat's branch here and run on it when this device never opened its checkout", async () => {
    const project = await createProject();
    const base = await commitBranch(project.port, 'main', { files: { 'main.ts': 'export const size = 1;\n' } });
    await commitBranch(project.port, 'feature', { files: { 'main.ts': 'export const size = 2;\n' }, parent: base });
    await project.filesystem.writeFile('main.ts', 'export const size = 1;\n');
    const recorded = await checkoutIdOnAnotherDevice(project.port, 'feature');
    await writeChatRecord(project.filesystem, recorded);
    const { revisions, placement } = project.open();

    const answer = await placement.admit({ requestId: 'admit:run-1:1', key });
    if (answer.status === 'refused') {
      throw new Error(`${answer.code}: ${answer.message}`);
    }

    /* The same id the other device recorded: chat.json needs no rewrite. */
    expect(answer.placement).toMatchObject({ checkoutId: recorded, branch: 'feature', mode: 'candidate' });
    await expect(answer.placement.tools.readFile('main.ts', 'utf8')).resolves.toBe('export const size = 2;\n');
    expect(revisions.actor.getSnapshot().context.checkouts).toContainEqual(
      expect.objectContaining({ id: recorded, kind: 'linked', branch: 'feature' }),
    );

    await answer.placement.tools.writeFile('main.ts', 'export const size = 3;\n');
    await placement.complete({ requestId: 'complete:run-1:1', key, cut: true });
    expect(await firstSettlement(placement)).toMatchObject({ row: { type: 'turn.finalized', branch: 'feature' } });
    const featureHead = await project.port.readRef('feature');
    const [result] = await project.port.log({ heads: [revisionId(featureHead ?? '')] });
    expect(result?.provenance).toMatchObject({ runId: 'run-1', turnCut: 'result' });
    expect(await project.port.readRef('main')).toBe(base);
    await expect(project.filesystem.readFile('main.ts', 'utf8')).resolves.toBe('export const size = 1;\n');
  });

  /* XD4: a branch this device already has open, here the live checkout's, is where the chat runs; nothing is opened. */
  it("should run on the checkout that already holds the chat's branch, such as the live one", async () => {
    const project = await createProject();
    await commitBranch(project.port, 'main', { files: { 'main.ts': 'export const size = 1;\n' } });
    await project.filesystem.writeFile('main.ts', 'export const size = 1;\n');
    await writeChatRecord(project.filesystem, await checkoutIdOnAnotherDevice(project.port, 'main'));
    const { revisions, placement } = project.open();

    const answer = await placement.admit({ requestId: 'admit:run-1:1', key });

    expect(answer).toMatchObject({ status: 'applied', placement: { checkoutId: 'live', mode: 'direct' } });
    expect(revisions.actor.getSnapshot().context.checkouts.map((checkout) => checkout.kind)).toEqual(['live']);
  });

  /* XD4: a fresh device whose default branch is still unborn runs the chat on the live checkout, which tracks it. */
  it('should run on the live checkout when the chat names the default branch this device has not recorded yet', async () => {
    const project = await createProject();
    await project.filesystem.writeFile('main.ts', 'export const size = 1;\n');
    await writeChatRecord(project.filesystem, await checkoutIdOnAnotherDevice(project.port, 'main'));
    const { placement } = project.open();

    const answer = await placement.admit({ requestId: 'admit:run-1:1', key });

    expect(answer).toMatchObject({ status: 'applied', placement: { checkoutId: 'live', mode: 'direct' } });
  });

  /* XD4: a checkout this device removed is never opened again for a chat that still names it; the refusal is final. */
  it('should refuse a chat whose checkout this device removed, and not open it again', async () => {
    const project = await createProject();
    const base = await commitBranch(project.port, 'main', { files: { 'main.ts': 'export const size = 1;\n' } });
    await commitBranch(project.port, 'feature', { files: { 'main.ts': 'export const size = 2;\n' }, parent: base });
    await project.filesystem.writeFile('main.ts', 'export const size = 1;\n');
    const { revisions, placement } = project.open();
    const checkoutsOf = () => revisions.actor.getSnapshot().context.checkouts;
    await waitFor(revisions.actor, (snapshot) => snapshot.context.registrySettled);
    revisions.actor.send({ type: 'addCheckout', requestId: 'open-feature', branch: 'feature', from: '' });
    await waitFor(revisions.actor, () => checkoutsOf().some((checkout) => checkout.branch === 'feature'));
    const opened = checkoutsOf().find((checkout) => checkout.branch === 'feature')!.id;
    revisions.actor.send({ type: 'removeCheckout', requestId: 'close-feature', id: opened });
    await waitFor(revisions.actor, () => !checkoutsOf().some((checkout) => checkout.id === opened));
    await writeChatRecord(project.filesystem, opened);

    const answer = await placement.admit({ requestId: 'admit:run-1:1', key });

    expect(answer).toMatchObject({ status: 'refused', code: 'CHECKOUT_UNKNOWN' });
    expect(checkoutsOf().map((checkout) => checkout.id)).not.toContain(opened);
  });

  /*
   * XD4: a removal record that cannot be parsed would refuse every checkout for ever and never be repaired. It is moved
   * aside, kept whole, and the device carries on with no removal markers: losing one only lets a removed checkout's id
   * open its branch again, or wait on it, instead of refusing it for good.
   */
  it('should move an unparseable removed-checkout record aside, keep it, and place the turn', async () => {
    const project = await createProject();
    const base = await commitBranch(project.port, 'main', { files: { 'main.ts': 'export const size = 1;\n' } });
    await commitBranch(project.port, 'feature', { files: { 'main.ts': 'export const size = 2;\n' }, parent: base });
    await project.filesystem.writeFile('main.ts', 'export const size = 1;\n');
    await project.filesystem.writeFile('.git/tau-removed-checkouts.json', '{ torn');
    await writeChatRecord(project.filesystem, await checkoutIdOnAnotherDevice(project.port, 'feature'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { placement } = project.open();

    const answer = await placement.admit({ requestId: 'admit:run-1:1', key });

    if (answer.status === 'refused') {
      throw new Error(`${answer.code}: ${answer.message}`);
    }
    expect(answer.placement).toMatchObject({ branch: 'feature' });
    const entries = await project.filesystem.readdir('.git');
    const aside = entries.filter((name) => name.startsWith('tau-removed-checkouts.json.corrupt-'));
    expect(aside).toHaveLength(1);
    await expect(project.filesystem.readFile(`.git/${aside[0]!}`, 'utf8')).resolves.toBe('{ torn');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('tau-removed-checkouts.json'));
    warn.mockRestore();
  });

  /* XD4: two chats whose turns open the same branch at once both run on the one checkout, whichever add wins. */
  it('should place both of two concurrent admissions that open the same branch on one checkout', async () => {
    const project = await createProject();
    const base = await commitBranch(project.port, 'main', { files: { 'main.ts': 'export const size = 1;\n' } });
    await commitBranch(project.port, 'feature', { files: { 'main.ts': 'export const size = 2;\n' }, parent: base });
    await project.filesystem.writeFile('main.ts', 'export const size = 1;\n');
    const recorded = await checkoutIdOnAnotherDevice(project.port, 'feature');
    await Promise.all(
      ['chat-1', 'chat-2'].map(async (chatId) =>
        project.filesystem.writeFile(
          `.tau/chats/${chatId}/chat.json`,
          JSON.stringify({ id: chatId, name: 'Chat', createdAt: 0, updatedAt: 0, checkoutId: recorded }),
        ),
      ),
    );
    const { placement } = project.open();
    const second: TurnAttemptKey = { chatId: 'chat-2', turnId: 'turn-2', runId: 'run-2', attempt: 1 };

    const answers = await Promise.all([
      placement.admit({ requestId: 'admit:run-1:1', key }),
      placement.admit({ requestId: 'admit:run-2:1', key: second }),
    ]);

    expect(answers.map((answer) => (answer.status === 'refused' ? answer.code : answer.placement.checkoutId))).toEqual([
      recorded,
      recorded,
    ]);
  });

  /* XD4: an add the root never answers would hold the admission for ever: it is refused retryably after a bound. */
  it('should refuse REVISIONS_UNAVAILABLE when the branch is not opened within the bound', async () => {
    const project = await createProject();
    const base = await commitBranch(project.port, 'main', { files: { 'main.ts': 'export const size = 1;\n' } });
    await commitBranch(project.port, 'feature', { files: { 'main.ts': 'export const size = 2;\n' }, parent: base });
    await project.filesystem.writeFile('main.ts', 'export const size = 1;\n');
    await writeChatRecord(project.filesystem, await checkoutIdOnAnotherDevice(project.port, 'feature'));
    const { revisions: opened } = project.open();
    const silent = new Proxy(opened.actor, {
      get: (target, property): unknown => {
        if (property === 'send') {
          return (event: Parameters<typeof target.send>[0]) => {
            if (event.type !== 'addCheckout') {
              target.send(event);
            }
          };
        }
        const value: unknown = Reflect.get(target, property, target);
        return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
      },
    });
    const placement = createTurnPlacementPort({
      revisions: { ...opened, actor: silent },
      openTools: ({ filesystem: view }) => view,
      checkoutOpenBound: 50,
    });
    /* The bound never keeps a host's process open: its timer is unref'd, as every other bound's is. */
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const realSetTimeout = globalThis.setTimeout;
    const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((handler: () => void, timerDelay?: number) => {
      const timer = realSetTimeout(handler, timerDelay);
      if (timerDelay === 50) {
        timers.push(timer);
      }
      return timer;
    }) as typeof setTimeout);

    const answer = await placement.admit({ requestId: 'admit:run-1:1', key });
    spy.mockRestore();

    expect(answer).toMatchObject({ status: 'refused', code: 'REVISIONS_UNAVAILABLE' });
    expect(timers).not.toHaveLength(0);
    expect(timers.every((timer) => !timer.hasRef())).toBe(true);
  });

  /* XD4: an unborn branch runs only on a checkout that already tracks it; otherwise it waits only for a remote. */
  it('should refuse an unborn branch the live checkout is not on, retryably only while a remote may bring it', async () => {
    const project = await createProject();
    await project.filesystem.writeFile('main.ts', 'export const size = 1;\n');
    await writeChatRecord(project.filesystem, 'checkout-of-trunk');
    const { revisions: opened } = project.open();
    const unborn = (revisions: ProjectRevisions): ProjectRevisions => ({
      ...revisions,
      turns: { ...revisions.turns, branchOf: async () => ({ branch: 'trunk', unborn: true }) },
    });
    const local = createTurnPlacementPort({ revisions: unborn(opened), openTools: ({ filesystem: view }) => view });
    const synced = createTurnPlacementPort({
      revisions: unborn(withRemote(opened)),
      openTools: ({ filesystem: view }) => view,
    });

    expect(await local.admit({ requestId: 'admit:run-1:1', key })).toMatchObject({ code: 'CHECKOUT_UNKNOWN' });
    expect(await synced.admit({ requestId: 'admit:run-2:1', key: { ...key, runId: 'run-2' } })).toMatchObject({
      code: 'BRANCH_UNAVAILABLE',
    });
  });

  it('should answer replayed and mint no second base when an attempt is admitted twice', async () => {
    const project = await createProject();
    /* Unsaved edits the person made before sending: the dirty base the placement pre-mints. */
    await project.filesystem.writeFile('main.ts', 'export const size = 1;\n');
    const { placement } = project.open();

    const first = await placement.admit({ requestId: 'admit:run-1:1', key });
    const second = await placement.admit({ requestId: 'admit:run-1:1', key });

    expect(first).toMatchObject({ requestId: 'admit:run-1:1', status: 'applied' });
    expect(second).toMatchObject({ requestId: 'admit:run-1:1', status: 'replayed' });
    if (first.status === 'refused' || second.status === 'refused') {
      throw new Error('admit was refused');
    }
    expect(first.placement.baseRevisionId).toBeDefined();
    expect(second.placement.baseRevisionId).toBe(first.placement.baseRevisionId);
    expect(first.placement.mode).toBe('direct');
    expect(await turnCuts(project.port, key)).toEqual(['base']);
  });

  /* TS-R2: a replay is answered by the attempt the root holds, before any placement work: a chat record that names
   * another checkout since does not refuse it. */
  it('should answer a replayed admission before placing it again, whatever the chat record names now', async () => {
    const project = await createProject();
    await project.filesystem.writeFile('main.ts', 'export const size = 1;\n');
    const { placement } = project.open();
    const first = await placement.admit({ requestId: 'admit:run-1:1', key });
    await writeChatRecord(project.filesystem, 'missing-checkout');

    const again = await placement.admit({ requestId: 'admit:run-1:1', key });

    expect(first).toMatchObject({ status: 'applied' });
    expect(again).toMatchObject({ requestId: 'admit:run-1:1', status: 'replayed' });
  });

  it('should derive the settlement from the existing result when complete follows a crash after the cut', async () => {
    const project = await createProject();
    const before = project.open();
    const admitted = await before.placement.admit({ requestId: 'admit:run-1:1', key });
    if (admitted.status === 'refused') {
      throw new Error(admitted.message);
    }
    await admitted.placement.tools.writeFile('main.ts', 'export const size = 2;\n');
    const cut = await before.placement.complete({ requestId: 'complete:run-1:1', key, cut: true });
    const settled = await firstSettlement(before.placement);
    expect(cut.status).toBe('applied');
    /* The host dies between the cut and the settlement row: the lease stays, unacknowledged. */
    before.revisions.actor.stop();
    await before.revisions.settled();

    const after = project.open();
    const again = await after.placement.complete({ requestId: 'complete:run-1:1', key, cut: true });

    expect(again).toEqual({ requestId: 'complete:run-1:1', status: 'applied' });
    const resettled = await firstSettlement(after.placement);
    expect(resettled.row).toMatchObject({ type: 'turn.finalized', attempt: 1 });
    expect(resettled.row).toHaveProperty(
      'revisionId',
      settled.row.type === 'turn.finalized' ? settled.row.revisionId : '',
    );
    /* One result, newest first, over the base the placement pre-minted from the new project's generated files. */
    expect(await turnCuts(project.port, key)).toEqual(['result', 'base']);
  });

  it('should answer a replayed admission after a root restart from the adopted lease', async () => {
    const project = await createProject();
    const before = project.open();
    const first = await before.placement.admit({ requestId: 'admit:run-1:1', key });
    before.revisions.actor.stop();
    await before.revisions.settled();
    const after = project.open();
    await waitFor(after.revisions.actor, (snapshot) => snapshot.context.registrySettled);
    const placed: unknown[] = [];
    after.revisions.actor.on('turnPlaced', (event) => {
      placed.push(event.key);
    });

    after.revisions.actor.send({ type: 'admitTurn', key });

    expect(placed).toEqual([key]);
    const again = await after.placement.admit({ requestId: 'admit:run-1:1', key });
    expect(again).toMatchObject({
      status: 'replayed',
      placement: { checkoutId: first.status === 'refused' ? '' : first.placement.checkoutId },
    });
    expect(await turnCuts(project.port, key)).toEqual(['base']);
  });

  it("should hand the admitted tools a file's bytes as a stream, as the checkout's filesystem does", async () => {
    const project = await createProject();
    await project.filesystem.writeFile('intent.json', '{"plate":"high-temperature"}');
    const { placement } = project.open();
    const admitted = await placement.admit({ requestId: 'admit:run-1:1', key });
    if (admitted.status === 'refused') {
      throw new Error(admitted.message);
    }
    const { tools } = admitted.placement;

    /* A stream is returned, not a promise of one: bounded readers (the print intent) call it synchronously. */
    const stream = tools.readFileStream?.('intent.json');
    expect(stream).toBeInstanceOf(ReadableStream);
    expect(await new Response(stream).text()).toBe('{"plate":"high-temperature"}');

    await placement.abandon({ requestId: 'abandon:run-1:1', key });
    expect(() => tools.readFileStream?.('intent.json')).toThrow(expect.objectContaining({ code: 'TOOL_PORT_REVOKED' }));
  });

  it('should refuse a tool write after abandon is answered', async () => {
    const project = await createProject();
    const { placement } = project.open();
    const admitted = await placement.admit({ requestId: 'admit:run-1:1', key });
    if (admitted.status === 'refused') {
      throw new Error(admitted.message);
    }
    const { tools } = admitted.placement;
    await tools.writeFile('before.ts', 'export const before = true;\n');

    const abandoned = await placement.abandon({ requestId: 'abandon:run-1:1', key });

    expect(abandoned).toEqual({ requestId: 'abandon:run-1:1', status: 'applied' });
    await expect(tools.writeFile('after.ts', 'export const after = true;\n')).rejects.toMatchObject({
      code: 'TOOL_PORT_REVOKED',
    });
    expect(await project.filesystem.exists('after.ts')).toBe(false);
    expect(await placement.abandon({ requestId: 'abandon:run-1:1', key })).toEqual({
      requestId: 'abandon:run-1:1',
      status: 'replayed',
    });
  });

  it('should leave no lease, no revision and no tool port when admit is refused', async () => {
    const project = await createProject();
    await project.filesystem.writeFile('main.ts', 'export const size = 1;\n');
    const opened: string[] = [];
    const revisions = createProjectRevisionsActor({
      port: project.port,
      projectId: 'project-1',
      filesystem: () => project.filesystem,
    });
    revisions.actor.start();
    stops.push(async () => {
      revisions.actor.stop();
      await revisions.settled();
    });
    const placement = createTurnPlacementPort({
      revisions,
      openTools: ({ key: attempt }) => {
        opened.push(attempt.runId);
        return attempt.runId;
      },
    });

    const answer = await placement.admit({ requestId: 'admit:run-1:1', key, checkoutId: 'checkout-gone' });

    expect(answer).toMatchObject({ requestId: 'admit:run-1:1', status: 'refused', code: 'CHECKOUT_UNKNOWN' });
    expect(await revisions.turns.leases()).toEqual([]);
    expect(await turnCuts(project.port, key)).toEqual([]);
    expect(opened).toEqual([]);
  });

  it('should publish the settlement, then retire the lease on acknowledge', async () => {
    const project = await createProject();
    const { revisions, syncs } = observeSyncs(project.open().revisions);
    const placement = createTurnPlacementPort({ revisions, openTools: ({ filesystem: view }) => view });
    const admitted = await placement.admit({ requestId: 'admit:run-1:1', key });
    if (admitted.status === 'refused') {
      throw new Error(admitted.message);
    }
    await admitted.placement.tools.writeFile('main.ts', 'export const size = 3;\n');
    await placement.complete({ requestId: 'complete:run-1:1', key, cut: true });
    const settled = await firstSettlement(placement);
    const held = await placement.reconcile({ requestId: 'reconcile:chat-1:1', chatId: 'chat-1' });

    const acknowledged = await placement.acknowledge({ requestId: 'acknowledge:run-1:1', key });

    expect(settled).toMatchObject({ kind: 'settled', key, row: { type: 'turn.finalized', attempt: 1 } });
    expect(held).toMatchObject({ status: 'applied', held: [{ key, checkoutId: admitted.placement.checkoutId }] });
    expect(acknowledged).toEqual({ requestId: 'acknowledge:run-1:1', status: 'applied' });
    expect(await revisions.turns.leases()).toEqual([]);
    expect(await placement.acknowledge({ requestId: 'acknowledge:run-1:1', key })).toEqual({
      requestId: 'acknowledge:run-1:1',
      status: 'replayed',
    });
    /* The admission and the settlement are durable in the chat's log, so sync records the chats at each (W8.a2: the
     * host relay's recordsChanged; XD3: the run is published as it starts). */
    expect(syncs).toEqual([recordsChanged, recordsChanged]);
  });

  /* XD3: another device sees a run before it settles; the host's heartbeats keep it current through `publish`. */
  it('should record the chats when an attempt is admitted and each time the host publishes, never on its own', async () => {
    const project = await createProject();
    const { revisions, syncs } = observeSyncs(withRemote(project.open().revisions));
    const placement = createTurnPlacementPort({ revisions, openTools: ({ filesystem: view }) => view });

    const admitted = await placement.admit({ requestId: 'admit:run-1:1', key });
    expect(admitted).toMatchObject({ status: 'applied' });
    expect(syncs).toEqual([recordsChanged]);
    await sleep(30);
    /* No timer of its own: liveness is the host's heartbeat, which also reaches a paused run with no tools. */
    expect(syncs).toEqual([recordsChanged]);

    await placement.abandon({ requestId: 'abandon:run-1:1', key });
    const before = syncs.length;
    expect(await placement.publish({ requestId: 'publish:1', chatId: key.chatId })).toEqual({
      requestId: 'publish:1',
      status: 'applied',
    });
    expect(syncs).toHaveLength(before + 1);

    await placement.fence();
    expect(await placement.publish({ requestId: 'publish:2', chatId: key.chatId })).toMatchObject({
      status: 'refused',
      code: 'SESSION_FENCED',
    });
    expect(syncs).toHaveLength(before + 1);
  });

  /* XD3: a heartbeat row is for the other devices; a project that syncs with no remote has none to tell. Older builds
   * read the row as opaque, so the host writes none where the publish says the chat reaches no other device. */
  it('should refuse a publish CHAT_NOT_SHARED, and record nothing, where the project syncs with no remote', async () => {
    const project = await createProject();
    const { revisions, syncs } = observeSyncs(await remoteSettled(project.open().revisions));
    const placement = createTurnPlacementPort({ revisions, openTools: ({ filesystem: view }) => view });

    expect(await placement.publish({ requestId: 'publish:1', chatId: key.chatId })).toMatchObject({
      status: 'refused',
      code: 'CHAT_NOT_SHARED',
    });
    expect(syncs).toEqual([]);
  });

  /* XD3: a foreign run's quiet is evidenced only by a pull, so a host that holds a chat for one asks for it. */
  it('should ask the root to pull the remote when the host asks, and nothing once fenced', async () => {
    const project = await createProject();
    const { revisions, syncs } = observeSyncs(withRemote(project.open({ deviceId: () => 'device-1' }).revisions));
    const placement = createTurnPlacementPort({ revisions, openTools: ({ filesystem: view }) => view });

    expect(await placement.pull({ requestId: 'pull:1', chatId: key.chatId })).toEqual({
      requestId: 'pull:1',
      status: 'applied',
    });
    expect(syncs).toEqual([{ type: 'sync', event: { type: 'remoteMoved', generation: 0, refs: [] } }]);

    await placement.fence();
    expect(await placement.pull({ requestId: 'pull:2', chatId: key.chatId })).toMatchObject({ status: 'refused' });
    expect(syncs).toHaveLength(1);
  });

  /*
   * Round 27: a device that cannot pull the chat never records the pulls that would show another device's quiet run
   * abandoned, so the placement says so (`CHAT_NOT_SHARED`) and the host stops waiting for them: a project with no
   * remote, one whose chats do not sync, and a device with no record identity to read chats under.
   */
  describe('where this device cannot pull the chat', () => {
    const notShared = { requestId: 'pull:1', status: 'refused', code: 'CHAT_NOT_SHARED' } as const;

    it('should refuse a pull CHAT_NOT_SHARED, and pull nothing, where the project syncs with no remote', async () => {
      const project = await createProject();
      const { revisions, syncs } = observeSyncs(
        await remoteSettled(project.open({ deviceId: () => 'device-1' }).revisions),
      );
      const placement = createTurnPlacementPort({ revisions, openTools: ({ filesystem: view }) => view });

      expect(await placement.pull({ requestId: 'pull:1', chatId: key.chatId })).toMatchObject(notShared);
      expect(syncs).toEqual([]);
    });

    it('should refuse a pull CHAT_NOT_SHARED, and pull nothing, where the project does not sync its chats', async () => {
      const project = await createProject();
      await project.filesystem.writeFile('tau.json', JSON.stringify({ syncChats: false }));
      const { revisions, syncs } = observeSyncs(withRemote(project.open({ deviceId: () => 'device-1' }).revisions));
      const placement = createTurnPlacementPort({ revisions, openTools: ({ filesystem: view }) => view });

      expect(await placement.pull({ requestId: 'pull:1', chatId: key.chatId })).toMatchObject(notShared);
      expect(syncs).toEqual([]);
    });

    it('should refuse a pull CHAT_NOT_SHARED, and pull nothing, on a device with no record identity', async () => {
      const project = await createProject();
      const { revisions, syncs } = observeSyncs(withRemote(project.open().revisions));
      const placement = createTurnPlacementPort({ revisions, openTools: ({ filesystem: view }) => view });

      expect(await placement.pull({ requestId: 'pull:1', chatId: key.chatId })).toMatchObject(notShared);
      expect(syncs).toEqual([]);
    });
  });

  /*
   * Round 28: only a settled answer refuses a pull. A remotes read that failed, or an identity the host has not told
   * the root yet, or a device file it could not read, is no evidence that this device cannot pull, so the pull is
   * asked and the host keeps waiting on it.
   */
  describe('where this device cannot tell yet whether it pulls the chat', () => {
    const pulled = { requestId: 'pull:1', status: 'applied' } as const;

    it('should pull, never refuse CHAT_NOT_SHARED, where reading the remotes failed', async () => {
      const project = await createProject();
      const revisionPort: RevisionPort = {
        ...project.port,
        listRemotes: vi.fn(project.port.listRemotes).mockRejectedValueOnce(new Error('The config is locked.')),
      };
      const { revisions, syncs } = observeSyncs(
        await remoteSettled(project.open({ deviceId: () => 'device-1', revisionPort }).revisions, 'failed'),
      );
      const placement = createTurnPlacementPort({ revisions, openTools: ({ filesystem: view }) => view });

      expect(await placement.pull({ requestId: 'pull:1', chatId: key.chatId })).toEqual(pulled);
      expect(syncs).toEqual([{ type: 'sync', event: { type: 'remoteMoved', generation: 0, refs: [] } }]);
    });

    it('should pull, never refuse CHAT_NOT_SHARED, where the record devices could not be read', async () => {
      const project = await createProject();
      await project.filesystem.writeFile('.git/ops-devices.json', '{ not json');
      const { revisions, syncs } = observeSyncs(withRemote(project.open({ deviceId: () => 'device-1' }).revisions));
      const placement = createTurnPlacementPort({ revisions, openTools: ({ filesystem: view }) => view });

      expect(await placement.pull({ requestId: 'pull:1', chatId: key.chatId })).toEqual(pulled);
      expect(syncs).toEqual([{ type: 'sync', event: { type: 'remoteMoved', generation: 0, refs: [] } }]);
    });

    it('should pull, never refuse CHAT_NOT_SHARED, before the host has said which device it is', async () => {
      const project = await createProject();
      const { revisions, syncs } = observeSyncs(withRemote(project.open({ deviceId: () => undefined }).revisions));
      const placement = createTurnPlacementPort({ revisions, openTools: ({ filesystem: view }) => view });

      expect(await placement.pull({ requestId: 'pull:1', chatId: key.chatId })).toEqual(pulled);
      expect(syncs).toEqual([{ type: 'sync', event: { type: 'remoteMoved', generation: 0, refs: [] } }]);
    });
  });

  it('should record nothing for an attempt the root refused', async () => {
    const project = await createProject();
    await project.filesystem.writeFile('main.ts', 'export const size = 1;\n');
    const { revisions, syncs } = observeSyncs(project.open().revisions);
    const placement = createTurnPlacementPort({
      revisions,
      openTools: ({ filesystem: view }) => view,
    });

    const answer = await placement.admit({
      requestId: 'admit:run-1:1',
      key,
      checkoutId: 'checkout-gone',
    });

    expect(answer).toMatchObject({ status: 'refused' });
    expect(syncs).toEqual([]);
  });

  /* I25, TS-A14, RM-R8 narrowed (W8.r1 H1, probe P1): a second root refuses another live root's attempt. */
  it("should not settle or retire another root's attempt while that root lives", async () => {
    const project = await createProject();
    const a = project.open();
    const admitted = await a.placement.admit({ requestId: 'admit:run-1:1', key });
    if (admitted.status === 'refused') {
      throw new Error(admitted.message);
    }
    await admitted.placement.tools.writeFile('main.ts', 'export const size = 2;\n');
    const b = project.open();
    await waitFor(b.revisions.actor, (snapshot) => snapshot.context.registrySettled);

    const completed = await b.placement.complete({ requestId: 'complete:run-1:1', key, cut: true });
    const acknowledged = await b.placement.acknowledge({ requestId: 'acknowledge:run-1:1', key });
    const readmitted = await b.placement.admit({ requestId: 'admit:run-1:1', key });

    expect(completed).toMatchObject({ status: 'refused', code: 'LEASE_HELD_ELSEWHERE' });
    expect(acknowledged).toMatchObject({ status: 'refused', code: 'LEASE_HELD_ELSEWHERE' });
    expect(readmitted).toMatchObject({ status: 'refused', code: 'TURN_ALREADY_LEASED' });
    expect(b.revisions.actor.getSnapshot().context.turnRefs['run-1/1']).toBeUndefined();
    /* No result: only the base A pre-minted from the new project's files. */
    expect(await turnCuts(project.port, key)).toEqual(['base']);
    /* A's attempt is untouched: its tools write, and A settles and retires it. */
    await admitted.placement.tools.writeFile('late.ts', 'export const late = true;\n');
    expect(await a.placement.complete({ requestId: 'complete:run-1:1', key, cut: true })).toMatchObject({
      status: 'applied',
    });
    const settled = await firstSettlement(a.placement);
    expect(settled.row).toMatchObject({ type: 'turn.finalized' });
    expect(settled.row).toHaveProperty('changedPaths', expect.arrayContaining(['late.ts']));
    expect(await a.placement.acknowledge({ requestId: 'acknowledge:run-1:1', key })).toMatchObject({
      status: 'applied',
    });
    expect(await a.revisions.turns.leases()).toEqual([]);
  });

  /* TS-R16, RM-R8 narrowed: the refused root waits on the holder's mark, says so, and then settles the attempt. */
  it('should report leaseHeld once the holder root stops, and then adopt and settle its attempt', async () => {
    const project = await createProject();
    const a = project.open();
    const admitted = await a.placement.admit({ requestId: 'admit:run-1:1', key });
    if (admitted.status === 'refused') {
      throw new Error(admitted.message);
    }
    await admitted.placement.tools.writeFile('main.ts', 'export const size = 2;\n');
    const b = project.open();
    const held = firstLeaseHeld(b.placement);
    expect(await b.placement.complete({ requestId: 'complete:run-1:1', key, cut: true })).toMatchObject({
      code: 'LEASE_HELD_ELSEWHERE',
    });

    a.revisions.actor.stop();
    await a.revisions.settled();

    expect(await held).toMatchObject({ kind: 'leaseHeld', key, checkoutId: admitted.placement.checkoutId });
    expect(await b.placement.complete({ requestId: 'complete:run-1:1', key, cut: true })).toEqual({
      requestId: 'complete:run-1:1',
      status: 'applied',
    });
    const { row: adopted } = await firstSettlement(b.placement);
    expect(adopted).toMatchObject({ type: 'turn.finalized', attempt: 1 });
    expect(await b.placement.acknowledge({ requestId: 'acknowledge:run-1:1', key })).toMatchObject({
      status: 'applied',
    });
    expect(await b.revisions.turns.leases()).toEqual([]);
  });

  /* TS-R5 (W8.r1 L1, probe P2): with no actor, the record is gone before `acknowledge` answers. */
  it('should delete the record before an acknowledge with no actor answers', async () => {
    const project = await createProject();
    const a = project.open();
    await a.placement.admit({ requestId: 'admit:run-1:1', key });
    await a.placement.complete({ requestId: 'complete:run-1:1', key, cut: true });
    await firstSettlement(a.placement);
    a.revisions.actor.stop();
    await a.revisions.settled();
    const b = project.open();

    const answer = await b.placement.acknowledge({ requestId: 'acknowledge:run-1:1', key });

    expect(answer).toEqual({ requestId: 'acknowledge:run-1:1', status: 'applied' });
    expect(await b.revisions.turns.leases()).toEqual([]);
  });

  /* TS-Q5 (W8.r1 H2, probe P3): a record written before W5 names no attempt; any attempt's settlement retires it. */
  it('should retire a record written before W5 by the run settlement of any attempt, and free its checkout', async () => {
    const project = await createProject();
    const a = project.open();
    await waitFor(a.revisions.actor, (snapshot) => snapshot.context.registrySettled);
    const checkoutId = a.revisions.actor.getSnapshot().context.liveCheckoutId ?? '';
    await project.filesystem.mkdir('.tau/runs', { recursive: true });
    await project.filesystem.writeFile(
      '.tau/runs/run-legacy.json',
      JSON.stringify({
        runId: 'run-legacy',
        turnId: 'turn-legacy',
        chatId: 'chat-1',
        checkoutId,
        authorityEpoch: 'e',
        startedAt: 1,
      }),
    );
    const legacy = { chatId: 'chat-1', turnId: 'turn-legacy', runId: 'run-legacy', attempt: 0 };

    expect(await a.placement.reconcile({ requestId: 'reconcile:1', chatId: 'chat-1' })).toMatchObject({
      held: [{ key: legacy, checkoutId }],
    });
    expect(await a.placement.acknowledge({ requestId: 'acknowledge:run-legacy:0', key: legacy })).toMatchObject({
      status: 'applied',
    });
    await project.filesystem.writeFile('main.ts', 'export const edited = true;\n');
    const minted = new Promise<string>((resolve) => {
      a.revisions.actor.on('revisionMinted', (event) => {
        resolve(event.requestId ?? '');
      });
      a.revisions.actor.on('nothingToSave', (event) => {
        resolve(`nothingToSave ${JSON.stringify(event.heldBy)}`);
      });
    });
    a.revisions.actor.send({ type: 'cut', requestId: 'save:1', trigger: 'save', checkoutId, leaseIds: [] });
    expect(await minted).toBe('save:1');
  });

  /* TS-Q5: a record written before W5 whose run has no row settles as the run's current attempt. */
  it('should settle a record written before W5 as the run current attempt', async () => {
    const project = await createProject();
    const a = project.open();
    await waitFor(a.revisions.actor, (snapshot) => snapshot.context.registrySettled);
    const checkoutId = a.revisions.actor.getSnapshot().context.liveCheckoutId ?? '';
    const head = await project.port.readHead();
    await project.filesystem.mkdir('.tau/runs', { recursive: true });
    await project.filesystem.writeFile(
      '.tau/runs/run-1.json',
      JSON.stringify({
        runId: 'run-1',
        turnId: 'turn-1',
        chatId: 'chat-1',
        checkoutId,
        baseRevisionId: head?.head,
        startedAt: 1,
      }),
    );
    await project.filesystem.writeFile('main.ts', 'export const size = 5;\n');
    a.revisions.actor.stop();
    await a.revisions.settled();
    const b = project.open();

    expect(await b.placement.complete({ requestId: 'complete:run-1:1', key, cut: true })).toMatchObject({
      status: 'applied',
    });
    const { row: adopted } = await firstSettlement(b.placement);
    expect(adopted).toMatchObject({ type: 'turn.finalized', attempt: 1 });
    expect(await b.placement.acknowledge({ requestId: 'acknowledge:run-1:1', key })).toMatchObject({
      status: 'applied',
    });
    expect(await b.revisions.turns.leases()).toEqual([]);
  });

  /* TS-R1 (W8.r1 MU9, L2): a grant that cannot open the checkout answers after the release, naming the base. */
  it('should release a placement whose checkout cannot be opened before refusing, and name its base', async () => {
    const project = await createProject();
    await project.filesystem.writeFile('main.ts', 'export const size = 1;\n');
    const revisions = createProjectRevisionsActor({
      port: project.port,
      projectId: 'project-1',
      filesystem: () => project.filesystem,
    });
    revisions.actor.start();
    stops.push(async () => {
      revisions.actor.stop();
      await revisions.settled();
    });
    const placement = createTurnPlacementPort({
      revisions: { ...revisions, turns: { ...revisions.turns, open: async () => undefined } },
      openTools: ({ filesystem: view }) => view,
    });

    const answer = await placement.admit({ requestId: 'admit:run-1:1', key });

    expect(await revisions.turns.leases()).toEqual([]);
    const head = await project.port.readHead();
    const [base] = await project.port.log({ heads: [revisionId(head?.head ?? '')] });
    expect(base?.provenance).toMatchObject({ runId: 'run-1', turnCut: 'base' });
    expect(answer).toMatchObject({
      status: 'refused',
      code: 'CHECKOUT_UNKNOWN',
      details: { revisionId: base?.id },
    });
  });

  /*
   * TS-R15 (W8.r1 MU14, L-A): `complete` revokes the tools after the writes they accepted, so the cut holds every byte.
   * The write is held until `complete` answers or 2 s pass: `complete` may answer only after the write settled.
   */
  /* E1 through W8 (GM merge): a host whose change feed is complete settles it before the admission and before the
   * completion cut, so each cut re-reads only the paths it was told of (GM.r1 L5). */
  it("should wait for the host's settle before it admits and before it cuts the completion", async () => {
    const project = await createProject();
    const revisions = createProjectRevisionsActor({
      port: project.port,
      projectId: 'project-1',
      filesystem: () => project.filesystem,
    });
    revisions.actor.start();
    stops.push(async () => {
      revisions.actor.stop();
      await revisions.settled();
    });
    const gates: Array<PromiseWithResolvers<void>> = [];
    const settle = async (): Promise<void> => {
      const gate = Promise.withResolvers<void>();
      gates.push(gate);
      await gate.promise;
    };
    const placement = createTurnPlacementPort({ revisions, openTools: ({ filesystem: view }) => view, settle });
    const idle = async (): Promise<void> => {
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
    };

    const admitting = placement.admit({ requestId: 'admit:run-1:1', key });
    await vi.waitFor(() => {
      expect(gates).toHaveLength(1);
    });
    await idle();
    expect(revisions.actor.getSnapshot().context.turnFacts).toEqual({});
    gates[0]!.resolve();
    await expect(admitting).resolves.toMatchObject({ status: 'applied' });

    let answered = false;
    const complete = async () => {
      const answer = await placement.complete({ requestId: 'complete:run-1:1', key, cut: true });
      answered = true;
      return answer;
    };
    const completing = complete();
    await vi.waitFor(() => {
      expect(gates).toHaveLength(2);
    });
    await idle();
    expect(answered).toBe(false);
    expect(await turnCuts(project.port, key)).toEqual(['base']);
    gates[1]!.resolve();
    await expect(completing).resolves.toMatchObject({ status: 'applied' });
  });

  it('should cut a write the tools accepted before complete was sent', async () => {
    const project = await createProject();
    const gate = Promise.withResolvers<void>();
    const slow = new Proxy(project.filesystem, {
      get: (target, property): unknown => {
        const value: unknown = Reflect.get(target, property, target);
        if (property === 'writeFile') {
          return async (path: string, ...rest: unknown[]): Promise<unknown> => {
            if (path.endsWith('slow.ts')) {
              await gate.promise;
            }
            return (value as (...args: unknown[]) => Promise<unknown>).call(target, path, ...rest);
          };
        }
        return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
      },
    });
    const revisions = createProjectRevisionsActor({
      port: project.port,
      projectId: 'project-1',
      filesystem: () => slow,
    });
    revisions.actor.start();
    stops.push(async () => {
      revisions.actor.stop();
      await revisions.settled();
    });
    const placement = createTurnPlacementPort({ revisions, openTools: ({ filesystem: view }) => view });
    const admitted = await placement.admit({ requestId: 'admit:run-1:1', key });
    if (admitted.status === 'refused') {
      throw new Error(admitted.message);
    }
    const order: string[] = [];

    const write = async (): Promise<void> => {
      await admitted.placement.tools.writeFile('slow.ts', 'export const slow = true;\n');
      order.push('write settled');
    };
    const complete = async () => {
      const answer = await placement.complete({ requestId: 'complete:run-1:1', key, cut: true });
      order.push('complete answered');
      return answer;
    };
    const writing = write();
    const completing = complete();
    const bound = new Promise((resolve) => {
      setTimeout(resolve, 2000);
    });
    const release = async (): Promise<void> => {
      await Promise.race([completing, bound]);
      gate.resolve();
    };
    const released = release();
    const completed = await completing;
    await writing;
    await released;

    expect(order).toEqual(['write settled', 'complete answered']);
    expect(completed).toMatchObject({ status: 'applied' });
    const { row } = await firstSettlement(placement);
    expect(row).toMatchObject({ type: 'turn.finalized' });
    expect(row).toHaveProperty('changedPaths', expect.arrayContaining(['slow.ts']));
    /* The write is held up to the 2 s bound by design. */
  }, 15_000);

  /* RM-R8 narrowed (W8.r1 L-D): a stopped root keeps its liveness mark until every write it started has settled. */
  it('should hold the root mark after the root stops until its lease write settles', async () => {
    const project = await createProject();
    const gate = Promise.withResolvers<void>();
    const writing = Promise.withResolvers<void>();
    const slow = new Proxy(project.filesystem, {
      get: (target, property): unknown => {
        const value: unknown = Reflect.get(target, property, target);
        if (property === 'writeFile') {
          return async (path: string, ...rest: unknown[]): Promise<unknown> => {
            if (path.endsWith('run-1.json')) {
              writing.resolve();
              await gate.promise;
            }
            return (value as (...args: unknown[]) => Promise<unknown>).call(target, path, ...rest);
          };
        }
        return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
      },
    });
    const revisions = createProjectRevisionsActor({
      port: project.port,
      projectId: 'project-1',
      filesystem: () => slow,
    });
    revisions.actor.start();
    stops.push(async () => {
      gate.resolve();
      await revisions.settled();
    });
    const placement = createTurnPlacementPort({ revisions, openTools: ({ filesystem: view }) => view });
    const marks = async (): Promise<readonly string[]> => {
      const { held = [] } = await navigator.locks.query();
      return held.map((lock) => lock.name ?? '').filter((name) => name.startsWith('tau:revisions-root:project-1:'));
    };

    const admitting = placement.admit({ requestId: 'admit:run-1:1', key });
    await writing.promise;
    revisions.actor.stop();
    await admitting;

    expect(await marks()).toHaveLength(1);
    gate.resolve();
    await revisions.settled();
    await expect.poll(marks).toEqual([]);
  });

  /* TS-R6 (W8.r1 L-C, P9): a fence, or the root's stop, answers a `complete` waiting on the root's cut. */
  it.each(['fence', 'root stop'] as const)(
    'should answer a complete waiting on the cut after a %s',
    async (end) => {
      const project = await createProject();
      const cut = Promise.withResolvers<void>();
      let gating = false;
      /* The port is frozen, so the gate wraps a copy: once `gating`, every store call waits for the cut gate. */
      const gated = Object.fromEntries(
        Object.entries(project.port).map(([name, value]: [string, unknown]) => [
          name,
          typeof value === 'function'
            ? async (...args: unknown[]): Promise<unknown> => {
                if (gating) {
                  await cut.promise;
                }
                return (value as (...parameters: unknown[]) => Promise<unknown>).apply(project.port, args);
              }
            : value,
        ]),
      ) as unknown as RevisionPort;
      const revisions = createProjectRevisionsActor({
        port: gated,
        projectId: 'project-1',
        filesystem: () => project.filesystem,
      });
      revisions.actor.start();
      stops.push(async () => {
        cut.resolve();
        revisions.actor.stop();
        await revisions.settled();
      });
      const placement = createTurnPlacementPort({ revisions, openTools: ({ filesystem: view }) => view });
      const admitted = await placement.admit({ requestId: 'admit:run-1:1', key });
      if (admitted.status === 'refused') {
        throw new Error(admitted.message);
      }
      await admitted.placement.tools.writeFile('cut.ts', 'export const cut = true;\n');

      gating = true;
      const completing = placement.complete({ requestId: 'complete:run-1:1', key, cut: true });
      await waitFor(revisions.actor, (snapshot) => {
        const turn = snapshot.context.turnRefs['run-1/1'];
        return turn?.getSnapshot().matches('capturing') === true;
      });
      if (end === 'fence') {
        await placement.fence();
      } else {
        revisions.actor.stop();
      }

      expect(await completing).toMatchObject({ status: 'refused', code: 'SESSION_FENCED' });
    },
    15_000,
  );

  it('should refuse a fenced session and revoke its tools while the root keeps the attempt', async () => {
    const project = await createProject();
    const { revisions, placement } = project.open();
    const admitted = await placement.admit({ requestId: 'admit:run-1:1', key });
    if (admitted.status === 'refused') {
      throw new Error(admitted.message);
    }

    await placement.fence();
    const next = createTurnPlacementPort({ revisions, openTools: ({ filesystem: view }) => view });

    expect(await placement.complete({ requestId: 'complete:run-1:1', key, cut: true })).toMatchObject({
      status: 'refused',
      code: 'SESSION_FENCED',
    });
    await expect(admitted.placement.tools.writeFile('late.ts', '')).rejects.toMatchObject({
      code: 'TOOL_PORT_REVOKED',
    });
    expect(await next.complete({ requestId: 'complete:run-1:1', key, cut: true })).toEqual({
      requestId: 'complete:run-1:1',
      status: 'applied',
    });
  });
});
