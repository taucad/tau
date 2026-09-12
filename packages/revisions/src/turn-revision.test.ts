/* eslint-disable import-x/no-extraneous-dependencies -- the package import map resolves `#*.js` to this package's own source files. */
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ChangeEventBus,
  CrossTabCoordinator,
  ImmutableRevisionTree,
  materializedWorkspaceId,
  mergeRevisionTrees,
  MountTable,
  ProviderRegistry,
  ResourceQueue,
  WorkspaceFileService,
} from '@taucad/filesystem';
import type { RootedFileSystem } from '@taucad/filesystem';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { mainRevisionBranch, TurnRevisionRecorder, turnRevisionBranch } from '#turn-revision.js';
import type { TurnRevisionMode } from '#turn-revision.js';

type Harness = Readonly<{
  filesystem: RootedFileSystem;
  recorder: TurnRevisionRecorder;
  dispose: () => void;
}>;

const disposables: Harness[] = [];

afterEach(() => {
  while (disposables.length > 0) {
    disposables.pop()?.dispose();
  }
});

/** One real rooted filesystem over the in-memory provider, plus a recorder on it. */
const createHarness = (options?: { readonly wrap?: (filesystem: RootedFileSystem) => RootedFileSystem }): Harness => {
  const provider = new MemoryProvider();
  const mountTable = new MountTable();
  mountTable.mount('/project', provider, {
    backend: 'memory',
    storageRootKey: 'memory:turn-revision-test',
    class: 'authored',
  });
  const eventBus = new ChangeEventBus();
  const resourceQueue = new ResourceQueue();
  const crossTabCoordinator = new CrossTabCoordinator();
  const service = new WorkspaceFileService({
    providerRegistry: new ProviderRegistry(),
    resourceQueue,
    eventBus,
    crossTabCoordinator,
    mountTable,
  });
  const rooted = service.createRootedFileSystem('/project');
  const filesystem = options?.wrap ? options.wrap(rooted) : rooted;
  const harness: Harness = {
    filesystem,
    recorder: new TurnRevisionRecorder({ filesystem }),
    dispose: () => {
      service.dispose();
      provider.dispose();
      eventBus.dispose();
      crossTabCoordinator.dispose();
    },
  };
  disposables.push(harness);
  return harness;
};

/** Prepare, write through the turn root, then finalize — one whole turn. */
const runTurn = async (input: {
  readonly harness: Harness;
  readonly lane: string;
  readonly mode: TurnRevisionMode;
  readonly workspaceId: string;
  readonly write: (filesystem: RootedFileSystem) => Promise<void>;
  readonly summary?: string;
}) => {
  const { recorder } = input.harness;
  const { workspace } = await recorder.prepare({
    workspaceId: materializedWorkspaceId(input.workspaceId),
    mode: input.mode,
    lane: input.lane,
    actorId: 'project_turn',
  });
  await input.write(workspace.filesystem);
  const result = await recorder.finalize({
    lane: input.lane,
    workspace,
    actorId: 'agent',
    runId: `run_${input.workspaceId}`,
    summary: input.summary ?? 'Turn summary',
  });
  return { workspace, result };
};

describe('TurnRevisionRecorder', () => {
  it.each([
    { mode: 'local', label: 'direct mode binds the live root' },
    { mode: 'branch', label: 'branch mode materializes an isolated copy' },
  ] as const)('records one revision per turn with the base as its parent — $label', async ({ mode }) => {
    const harness = createHarness();
    await harness.filesystem.writeFile('main.scad', 'cube(10);');

    const { workspace, result } = await runTurn({
      harness,
      lane: 'chat_1',
      mode,
      workspaceId: `run_${mode}`,
      write: async (filesystem) => {
        await filesystem.writeFile('main.scad', 'cube(20);');
      },
    });

    // Branch mode really is an isolated copy; direct mode really is the live root.
    await expect(harness.filesystem.exists(`.tau/workspaces/run_${mode}/tree`)).resolves.toBe(mode === 'branch');
    expect(workspace.identity.mode).toBe(mode);

    expect(result.status).toBe('recorded');
    if (result.status !== 'recorded') {
      return;
    }
    expect(result.revision.parents).toEqual([workspace.identity.baseRevisionId]);
    expect(result.revision.provenance).toMatchObject({ source: 'agent', actorId: 'agent', runId: `run_run_${mode}` });
    expect(result.changedPaths).toEqual(['main.scad']);
    // A direct turn records onto the trunk the live tree tracks; a candidate onto its own lane.
    expect(result.branch).toBe(mode === 'branch' ? turnRevisionBranch('chat_1') : mainRevisionBranch);
    expect(result.publication).toMatchObject({ status: 'updated', head: result.revision.id });
    expect(result.persistence).toMatchObject({
      engine: 'isomorphic-git',
      commitId: result.revision.id,
      objectFormat: 'sha1',
    });
    // The merged tree reached the live project either way.
    await expect(harness.filesystem.readFile('main.scad', 'utf8')).resolves.toBe('cube(20);');
    expect(harness.recorder.revisions.getBranchHead(result.branch)).toBe(result.revision.id);
  });

  it('creates the trunk on a first turn and tracks it as the live tree’s head', async () => {
    const harness = createHarness();
    await harness.filesystem.writeFile('main.scad', 'cube(10);');

    const { result } = await runTurn({
      harness,
      lane: 'chat_first',
      mode: 'local',
      workspaceId: 'run_first_trunk',
      write: async (filesystem) => {
        await filesystem.writeFile('main.scad', 'cube(20);');
      },
    });

    expect(result.status).toBe('recorded');
    if (result.status !== 'recorded') {
      return;
    }
    expect(result.branch).toBe(mainRevisionBranch);
    // The head reference is the store's, not this recorder's memory: it is what
    // a reopened project, another chat's base and the pane all read.
    await expect(harness.recorder.port.readHead()).resolves.toEqual({
      branch: 'main',
      head: result.revision.id,
    });
  });

  it('parents every candidate lane on the trunk head, so two lanes share a merge base', async () => {
    const harness = createHarness();
    await harness.filesystem.writeFile('main.scad', 'one\ntwo\nthree\n');
    await runTurn({
      harness,
      lane: 'chat_trunk',
      mode: 'local',
      workspaceId: 'run_trunk',
      write: async (filesystem) => {
        await filesystem.writeFile('main.scad', 'one\ntwo\nthree\n');
      },
    });
    const trunkHead = harness.recorder.revisions.getBranchHead(mainRevisionBranch);

    const left = await runTurn({
      harness,
      lane: 'chat_left',
      mode: 'branch',
      workspaceId: 'run_left',
      write: async (filesystem) => {
        await filesystem.writeFile('main.scad', 'LEFT\ntwo\nthree\n');
      },
    });
    // The left candidate's settlement merged its bytes back into the live tree;
    // this is the operator switching back to the trunk before the second chat
    // starts, which is the shape the cross-chat merge cell exercises.
    await harness.filesystem.writeFile('main.scad', 'one\ntwo\nthree\n');
    const right = await runTurn({
      harness,
      lane: 'chat_right',
      mode: 'branch',
      workspaceId: 'run_right',
      write: async (filesystem) => {
        await filesystem.writeFile('main.scad', 'one\ntwo\nRIGHT\n');
      },
    });

    expect(left.result.status).toBe('recorded');
    expect(right.result.status).toBe('recorded');
    if (left.result.status !== 'recorded' || right.result.status !== 'recorded') {
      return;
    }
    expect(left.result.branch).toBe(turnRevisionBranch('chat_left'));
    expect(right.result.branch).toBe(turnRevisionBranch('chat_right'));
    // Both lanes descend from the trunk head — which is exactly what a merge
    // base is. A parentless base is what made every cross-chat merge add/add.
    expect(left.result.revision.parents).toEqual([trunkHead]);
    expect(right.result.revision.parents).toEqual([trunkHead]);

    const base = harness.recorder.revisions.getRevision(trunkHead!)!;
    const merged = mergeRevisionTrees(base.tree, left.result.revision.tree, right.result.revision.tree);
    expect(merged.status).toBe('merged');
    expect(merged.status === 'merged' ? new TextDecoder().decode(merged.tree.get('main.scad')) : undefined).toBe(
      'LEFT\ntwo\nRIGHT\n',
    );
  });

  it('descends the next turn in a lane from the previous turn instead of a disconnected root', async () => {
    const harness = createHarness();
    await harness.filesystem.writeFile('main.scad', 'cube(10);');

    const first = await runTurn({
      harness,
      lane: 'chat_lineage',
      mode: 'branch',
      workspaceId: 'run_first',
      write: async (filesystem) => {
        await filesystem.writeFile('main.scad', 'cube(20);');
      },
    });
    const second = await runTurn({
      harness,
      lane: 'chat_lineage',
      mode: 'branch',
      workspaceId: 'run_second',
      write: async (filesystem) => {
        await filesystem.writeFile('main.scad', 'cube(30);');
      },
    });

    // Content-addressed identity removes the empty step: the live tree the
    // second turn starts from IS the first turn's recorded tree, so the second
    // turn's base is that revision rather than a fresh copy of it.
    expect(first.result.status).toBe('recorded');
    expect(second.workspace.identity.baseRevisionId).toBe(
      first.result.status === 'recorded' ? first.result.revision.id : undefined,
    );
    expect(second.result.status === 'recorded' ? second.result.revision.parents : undefined).toEqual([
      second.workspace.identity.baseRevisionId,
    ]);
  });

  it('records a branch turn against a concurrent live edit through the three-way merge', async () => {
    const harness = createHarness();
    await harness.filesystem.writeFile('main.scad', 'one\ntwo\nthree\n');
    const { recorder } = harness;
    const { workspace } = await recorder.prepare({
      workspaceId: materializedWorkspaceId('run_merge'),
      mode: 'branch',
      lane: 'chat_merge',
      actorId: 'project_turn',
    });

    await workspace.filesystem.writeFile('main.scad', 'one\ntwo\nTHREE\n');
    await harness.filesystem.writeFile('main.scad', 'ONE\ntwo\nthree\n');

    const result = await recorder.finalize({
      lane: 'chat_merge',
      workspace,
      actorId: 'agent',
      summary: 'Merged turn',
    });

    expect(result.status).toBe('recorded');
    await expect(harness.filesystem.readFile('main.scad', 'utf8')).resolves.toBe('ONE\ntwo\nTHREE\n');
  });

  it('reports an overlapping edit as a conflict and mints no revision', async () => {
    const harness = createHarness();
    await harness.filesystem.writeFile('main.scad', 'base\n');
    const { recorder } = harness;
    const { workspace } = await recorder.prepare({
      workspaceId: materializedWorkspaceId('run_conflict'),
      mode: 'branch',
      lane: 'chat_conflict',
      actorId: 'project_turn',
    });

    await workspace.filesystem.writeFile('main.scad', 'agent\n');
    await harness.filesystem.writeFile('main.scad', 'live\n');

    const result = await recorder.finalize({
      lane: 'chat_conflict',
      workspace,
      actorId: 'agent',
      summary: 'Conflicted turn',
    });

    expect(result).toMatchObject({ status: 'conflicted', conflicts: [{ type: 'text', path: 'main.scad' }] });
    await expect(harness.filesystem.readFile('main.scad', 'utf8')).resolves.toBe('live\n');
    await recorder.revisions.ready;
    expect(recorder.revisions.getBranchHead(turnRevisionBranch('chat_conflict'))).toBe(
      workspace.identity.baseRevisionId,
    );
  });

  it('captures a bound-in-place root once so a pipeline write is not replayed as an agent change', async () => {
    // `bindInPlace` returns a confining wrapper around the live root, never the
    // root object, so the fast path can only key on `identity.mode`.
    let rootWalks = 0;
    const harness = createHarness({
      wrap: (filesystem) => ({
        ...filesystem,
        readdir: async (path) => {
          if (path === '') {
            rootWalks += 1;
            // The geometry pipeline writes its own outputs into the live root
            // while the settlement runs. In local mode the second root walk is
            // the *verification*, not a second opinion on the agent tree, so
            // that write belongs to the pipeline, not to this revision.
            if (rootWalks === 2) {
              await filesystem.writeFile('thumbnail.webp', new Uint8Array([7]));
            }
          }
          return filesystem.readdir(path);
        },
      }),
    });
    await harness.filesystem.writeFile('main.scad', 'cube(10);');
    const { recorder } = harness;
    const { workspace } = await recorder.prepare({
      workspaceId: materializedWorkspaceId('run_local'),
      mode: 'local',
      lane: 'chat_local',
      actorId: 'project_turn',
    });
    await workspace.filesystem.writeFile('main.scad', 'cube(30);');
    // `prepare` took the first walk; the next two belong to the settlement.
    expect(rootWalks).toBe(1);
    rootWalks = 0;

    const result = await recorder.finalize({
      lane: 'chat_local',
      workspace,
      actorId: 'agent',
      summary: 'Local change beside a pipeline write',
    });

    expect(result).toMatchObject({ status: 'recorded', changedPaths: ['main.scad'] });
    expect(result.status === 'recorded' ? result.revision.tree.entries().map(({ path }) => path) : []).toEqual([
      'main.scad',
    ]);
    await expect(harness.filesystem.readFile('thumbnail.webp')).resolves.toHaveLength(1);
  });

  it('excludes authority state, kernel cache and the chat log from every capture', async () => {
    const harness = createHarness();
    await harness.filesystem.mkdir('.tau/cache/geometry', { recursive: true });
    await harness.filesystem.mkdir('.tau/chats/chat_log', { recursive: true });
    await harness.filesystem.writeFile('main.scad', 'cube(10);');
    await harness.filesystem.writeFile('.tau/cache/geometry/warm.bin', 'warm');
    await harness.filesystem.writeFile('.tau/chats/chat_log/events.jsonl', '{"seq":0}\n');

    const { result } = await runTurn({
      harness,
      lane: 'chat_log',
      mode: 'local',
      workspaceId: 'run_excluded',
      write: async (filesystem) => {
        await filesystem.writeFile('main.scad', 'cube(30);');
      },
    });

    expect(result).toMatchObject({ status: 'recorded', changedPaths: ['main.scad'] });
    // Excluded content stays on disk; it is simply not project content.
    await expect(harness.filesystem.readFile('.tau/cache/geometry/warm.bin', 'utf8')).resolves.toBe('warm');
    await expect(harness.filesystem.readFile('.tau/chats/chat_log/events.jsonl', 'utf8')).resolves.toContain('seq');
  });

  it('returns the same revision for a retry, and a changed payload is a different revision', async () => {
    const harness = createHarness();
    await harness.filesystem.writeFile('main.scad', 'cube(10);');
    const { recorder } = harness;
    const { workspace } = await recorder.prepare({
      workspaceId: materializedWorkspaceId('run_retry'),
      mode: 'branch',
      lane: 'chat_retry',
      actorId: 'project_turn',
    });
    await workspace.filesystem.writeFile('main.scad', 'cube(20);');
    const input = { lane: 'chat_retry', workspace, actorId: 'agent', summary: 'Retried turn' } as const;

    const first = await recorder.finalize(input);
    const retry = await recorder.finalize(input);

    expect(first.status).toBe('recorded');
    expect(retry.status === 'recorded' && first.status === 'recorded' ? retry.revision : undefined).toBe(
      first.status === 'recorded' ? first.revision : undefined,
    );
    // Different headers are a different revision, not a refused retry: the id
    // is the commit id, so nothing has to be compared to know that. It cannot
    // take the branch, because the branch no longer stands on its base.
    const restated = await recorder.finalize({ ...input, summary: 'A different summary' });
    expect(restated.status === 'recorded' ? restated.revision.id : undefined).not.toBe(
      first.status === 'recorded' ? first.revision.id : undefined,
    );
    expect(restated.status === 'recorded' ? restated.publication.status : undefined).toBe('conflicted');
  });

  it('gives every revision the Git commit id of its own object, and two turns two revisions', async () => {
    const harness = createHarness();
    await harness.filesystem.writeFile('main.scad', 'cube(10);');

    const first = await runTurn({
      harness,
      lane: 'chat_ids',
      mode: 'local',
      workspaceId: 'run_ids_1',
      write: async (filesystem) => {
        await filesystem.writeFile('main.scad', 'cube(20);');
      },
    });
    const second = await runTurn({
      harness,
      lane: 'chat_ids',
      mode: 'local',
      workspaceId: 'run_ids_2',
      write: async (filesystem) => {
        await filesystem.writeFile('main.scad', 'cube(30);');
      },
    });

    expect(first.result.status).toBe('recorded');
    expect(second.result.status).toBe('recorded');
    if (first.result.status !== 'recorded' || second.result.status !== 'recorded') {
      return;
    }
    const ids = [first.result.revision.id, second.result.revision.id];
    // Two turns on one chat: two revisions, one branch, the second on the first.
    expect(new Set(ids).size).toBe(2);
    expect(first.result.branch).toBe(mainRevisionBranch);
    expect(second.result.branch).toBe(mainRevisionBranch);
    expect(second.result.revision.parents).toEqual([first.result.revision.id]);
    expect(harness.recorder.revisions.getBranchHead(mainRevisionBranch)).toBe(second.result.revision.id);

    /* The oracle is Git's own definition, computed by Node rather than by this
     * package: a revision id is the SHA-1 of its loose object's framed bytes,
     * which a real repository stores deflated. */
    for (const id of ids) {
      // oxlint-disable-next-line no-await-in-loop -- two reads, ordered for a readable failure.
      const stored = await harness.filesystem.readFile(`.tau/revisions/objects/${id.slice(0, 2)}/${id.slice(2)}`);
      expect(createHash('sha1').update(inflateSync(stored)).digest('hex')).toBe(id);
    }
  });
});

describe('TurnRevisionRecorder.merge', () => {
  const base = new ImmutableRevisionTree([['main.scad', '']]);

  const agentFileSystem = async (files: Readonly<Record<string, string>>): Promise<RootedFileSystem> => {
    const harness = createHarness();
    for (const [path, content] of Object.entries(files)) {
      // oxlint-disable-next-line no-await-in-loop -- fixture setup is ordered by construction.
      await harness.filesystem.writeFile(path, content);
    }
    return harness.filesystem;
  };

  it('applies an agent-created file to the live project', async () => {
    const harness = createHarness();
    await harness.filesystem.writeFile('main.scad', '');
    const agent = await agentFileSystem({ 'main.scad': 'cube(20);', 'main.geospec.ts': 'it("passes", () => {});' });

    const result = await harness.recorder.merge({ base, agent, mode: 'branch' });

    expect(result.status).toBe('merged');
    await expect(harness.filesystem.readFile('main.scad', 'utf8')).resolves.toBe('cube(20);');
    await expect(harness.filesystem.readFile('main.geospec.ts', 'utf8')).resolves.toContain('passes');
  });

  it('publishes nothing when apply fails and converges when the turn is retried', async () => {
    const harness = createHarness();
    await harness.filesystem.writeFile('main.scad', '');
    const agent = await agentFileSystem({ 'main.scad': 'cube(20);' });
    const originalWrite = harness.filesystem.writeFile.bind(harness.filesystem);
    let attempts = 0;
    harness.filesystem.writeFile = async (path, data) => {
      attempts += 1;
      if (attempts === 1) {
        throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
      }
      await originalWrite(path, data);
    };

    await expect(harness.recorder.merge({ base, agent, mode: 'branch' })).rejects.toMatchObject({ code: 'ENOSPC' });
    await expect(harness.filesystem.readFile('main.scad', 'utf8')).resolves.toBe('');
    await expect(harness.recorder.merge({ base, agent, mode: 'branch' })).resolves.toMatchObject({ status: 'merged' });
    await expect(harness.filesystem.readFile('main.scad', 'utf8')).resolves.toBe('cube(20);');
  });

  it('settles when the preview pipeline writes its own files between the merge and its verification', async () => {
    const harness = createHarness();
    await harness.filesystem.writeFile('main.scad', '');
    const agent = await agentFileSystem({ 'main.scad': 'cube(20);' });
    const write = harness.filesystem.writeFile.bind(harness.filesystem);
    harness.filesystem.writeFile = async (path, data) => {
      await write(path, data);
      if (path === 'main.scad') {
        // The settlement neither owns nor fences the geometry pipeline's own
        // outputs, so verifying the whole tree fails on writes it never made.
        await write('thumbnail.webp', new Uint8Array([1, 2, 3]));
      }
    };

    const result = await harness.recorder.merge({ base, agent, mode: 'branch' });

    expect(result).toMatchObject({ status: 'merged' });
    expect(result.status === 'merged' ? result.tree.entries().map(({ path }) => path) : []).toEqual(['main.scad']);
    await expect(harness.filesystem.readFile('thumbnail.webp')).resolves.toHaveLength(3);
  });

  it('refuses to publish when an applied write silently did not land', async () => {
    const harness = createHarness();
    await harness.filesystem.writeFile('main.scad', '');
    const agent = await agentFileSystem({ 'main.scad': 'cube(20);' });
    harness.filesystem.writeFile = async () => undefined;

    await expect(harness.recorder.merge({ base, agent, mode: 'branch' })).rejects.toMatchObject({
      code: 'WORKSPACE_VERIFY_FAILED',
    });
  });

  it('refuses to publish when an applied deletion silently did not land', async () => {
    const harness = createHarness();
    await harness.filesystem.writeFile('main.scad', 'cube(20);');
    await harness.filesystem.writeFile('stale.scad', 'sphere(1);');
    const agent = await agentFileSystem({ 'main.scad': 'cube(20);' });
    harness.filesystem.unlink = async () => undefined;

    await expect(
      harness.recorder.merge({
        base: new ImmutableRevisionTree([
          ['main.scad', 'cube(20);'],
          ['stale.scad', 'sphere(1);'],
        ]),
        agent,
        mode: 'branch',
      }),
    ).rejects.toMatchObject({ code: 'WORKSPACE_VERIFY_FAILED' });
  });
});
