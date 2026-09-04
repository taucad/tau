import { describe, expect, it } from 'vitest';
import type { Chat, MyUIMessage } from '@taucad/chat';
import { buildRevisionGraph, filterRevisionGraph } from '#lib/revision-graph.js';
import type { PersistedRevisionGraphState } from '#types/revision.types.js';

const user = (id: string, createdAt: number): MyUIMessage => ({
  id,
  role: 'user',
  parts: [{ type: 'text', text: `turn ${id}` }],
  metadata: { createdAt },
});

const create = (path: string, content: string, createdAt: number): MyUIMessage => ({
  id: `assistant-create-${createdAt}`,
  role: 'assistant',
  metadata: { createdAt },
  parts: [
    {
      type: 'tool-create_file',
      toolCallId: `create-${createdAt}`,
      state: 'output-available',
      input: { targetFile: path, content },
      output: {
        diffStats: { linesAdded: 1, linesRemoved: 0, originalContent: '', modifiedContent: content },
      },
    },
  ],
});

type EditFixtureInput = {
  readonly path: string;
  readonly before: string;
  readonly after: string;
  readonly createdAt: number;
};

const edit = ({ path, before, after, createdAt }: EditFixtureInput): MyUIMessage => ({
  id: `assistant-edit-${createdAt}`,
  role: 'assistant',
  metadata: { createdAt },
  parts: [
    {
      type: 'tool-edit_file',
      toolCallId: `edit-${createdAt}`,
      state: 'output-available',
      input: { targetFile: path, codeEdit: after },
      output: {
        diffStats: { linesAdded: 1, linesRemoved: 1, originalContent: before, modifiedContent: after },
      },
    },
  ],
});

const chat = (id: string, name: string, messages: MyUIMessage[]): Chat => ({
  id,
  name,
  resourceId: 'project',
  messages,
  createdAt: 1,
  updatedAt: 10_000,
});

const decode = (bytes: Uint8Array<ArrayBuffer> | undefined): string | undefined =>
  bytes === undefined ? undefined : new TextDecoder().decode(bytes);

const graphMetadata = (): PersistedRevisionGraphState => ({
  activeBranch: 'main',
  nodes: {
    u1: {
      turnId: 'u1',
      parentTurnIds: [],
      branchName: 'main',
      chatId: 'chat-a',
      jobIds: [],
      status: 'complete',
      revisionId: 'rev-auth-1',
      baseRevisionId: 'rev-project-root',
      treeId: 'tree-auth-1',
      changedPaths: ['main.ts'],
      provenance: { source: 'agent', actorId: 'runner', runId: 'run-1', createdAt: 120 },
      generatedSummary: 'Created the base bracket',
      workspaceId: 'workspace-1',
      nativeGit: { status: 'not-configured' },
    },
    u2: {
      turnId: 'u2',
      parentTurnIds: ['u1'],
      branchName: 'main',
      chatId: 'chat-a',
      jobIds: ['job-cfd-1'],
      editedSummary: 'Main bracket approach',
      status: 'complete',
      revisionId: 'rev-auth-2',
      baseRevisionId: 'rev-auth-1',
      treeId: 'tree-auth-2',
      changedPaths: ['main.ts'],
      provenance: { source: 'agent', actorId: 'runner', runId: 'run-2', createdAt: 220 },
      generatedSummary: 'Strengthened the main bracket',
      workspaceId: 'workspace-2',
      nativeGit: { status: 'stored', commitId: 'abc123', objectFormat: 'sha1' },
      publication: {
        status: 'updated',
        branchName: 'main',
        expectedHeadRevisionId: 'rev-auth-1',
        previousHeadRevisionId: 'rev-auth-1',
        headRevisionId: 'rev-auth-2',
      },
    },
    u3: {
      turnId: 'u3',
      parentTurnIds: ['u1'],
      forkPointTurnId: 'u1',
      branchName: 'explore/lightweight',
      chatId: 'chat-b',
      jobIds: ['job-fea-2'],
      status: 'complete',
      revisionId: 'rev-auth-3',
      baseRevisionId: 'rev-auth-1',
      treeId: 'tree-auth-3',
      changedPaths: ['main.ts'],
      provenance: { source: 'agent', actorId: 'runner', runId: 'run-3', createdAt: 320 },
      generatedSummary: 'Explored a lightweight bracket',
      workspaceId: 'workspace-3',
      nativeGit: { status: 'failed', errorCode: 'GIT_COMMAND_FAILED' },
      publication: {
        status: 'conflicted',
        branchName: 'explore/lightweight',
        expectedHeadRevisionId: 'rev-auth-1',
        actualHeadRevisionId: 'rev-auth-9',
        proposedHeadRevisionId: 'rev-auth-3',
      },
      conflict: {
        type: 'stale-head',
        branchName: 'explore/lightweight',
        expectedHeadRevisionId: 'rev-auth-1',
        actualHeadRevisionId: 'rev-auth-9',
        proposedHeadRevisionId: 'rev-auth-3',
      },
    },
  },
  branches: {
    main: { name: 'main', headTurnId: 'u2', headRevisionId: 'rev-auth-2' },
    'explore/lightweight': {
      name: 'explore/lightweight',
      headTurnId: 'u1',
      headRevisionId: 'rev-auth-9',
      publication: {
        status: 'conflicted',
        branchName: 'explore/lightweight',
        expectedHeadRevisionId: 'rev-auth-1',
        actualHeadRevisionId: 'rev-auth-9',
        proposedHeadRevisionId: 'rev-auth-3',
      },
    },
  },
});

const chats = (): Chat[] => [
  chat('chat-a', 'Primary design', [
    user('u1', 100),
    create('main.ts', 'base\n', 110),
    user('u2', 200),
    edit({ path: 'main.ts', before: 'base\n', after: 'main\n', createdAt: 210 }),
  ]),
  chat('chat-b', 'Lightweight exploration', [
    user('u3', 300),
    edit({ path: 'main.ts', before: 'base\n', after: 'branch\n', createdAt: 310 }),
  ]),
];

describe('buildRevisionGraph', () => {
  it('materializes sibling edits from their recorded immutable parent without cross-branch leakage', () => {
    const graph = buildRevisionGraph({
      chats: chats(),
      persisted: graphMetadata(),
      supersededTurnIds: [],
      headTurnId: 'u2',
    });
    const main = graph.byTurnId.get('u2')!;
    const branch = graph.byTurnId.get('u3')!;

    expect(decode(main.tree.get('main.ts'))).toBe('main\n');
    expect(decode(branch.tree.get('main.ts'))).toBe('branch\n');
    expect(main.treeId).not.toBe(branch.treeId);
    expect(branch.parents).toEqual([graph.byTurnId.get('u1')!.id]);
    expect(branch.forkPoint).toBe(graph.byTurnId.get('u1')!.id);
    expect(branch.parentSource).toBe('recorded');
  });

  it('keeps exact paths, tree/revision identities, chat/job seams, editable summary, conflict, and publication inspectable', () => {
    const persisted = graphMetadata();
    const first = buildRevisionGraph({
      chats: chats(),
      persisted,
      supersededTurnIds: [],
      headTurnId: 'u2',
    });
    const second = buildRevisionGraph({
      chats: chats(),
      persisted: structuredClone(persisted),
      supersededTurnIds: [],
      headTurnId: 'u2',
    });
    const node = first.byTurnId.get('u3')!;

    expect(node.id).toBe(second.byTurnId.get('u3')!.id);
    expect(String(node.id)).toBe('rev-auth-3');
    expect(node.treeId).toBe(second.byTurnId.get('u3')!.treeId);
    expect(String(node.treeId)).toBe('tree-auth-3');
    expect(node.baseRevisionId).toBe('rev-auth-1');
    expect(node.identitySource).toBe('authoritative');
    expect(node.diff.changedPaths).toEqual(['main.ts']);
    expect(node.chatName).toBe('Lightweight exploration');
    expect(node.jobIds).toEqual(['job-fea-2']);
    expect(first.byTurnId.get('u2')!.summary).toMatchObject({ edited: 'Main bracket approach' });
    expect(node.conflict).toMatchObject({ type: 'stale-head', actualHeadRevisionId: 'rev-auth-9' });
    expect(node.publication?.status).toBe('conflicted');
    expect(node.nativeGit).toEqual({ status: 'failed', errorCode: 'GIT_COMMAND_FAILED' });
    expect(node.provenance).toMatchObject({ actorId: 'runner', runId: 'run-3' });
    expect(first.headId).toBe(first.byTurnId.get('u2')!.id);
  });

  it('keeps an authoritative root a root when the legacy chain orders a later turn ahead of it', () => {
    /* The seeded turn carries a LATER anchor than the live turn that followed
     * it (a seeded/imported turn, or a chat row whose `createdAt` is ahead of a
     * later message's own stamp — `userAnchor`'s `Math.max(previous,
     * chat.createdAt)` fallback), so the global legacy chain orders `live`
     * first and infers `live` as `seed`'s parent. `seed`'s persisted record is
     * an authoritative ROOT (`parentTurnIds: []`), which must win. */
    const reversed = chat('chat-a', 'Primary design', [
      user('seed', 300),
      create('main.scad', 'cube(10);\n', 310),
      user('live', 100),
      edit({ path: 'main.scad', before: 'cube(10);\n', after: 'cube(20);\n', createdAt: 110 }),
    ]);
    const persisted: PersistedRevisionGraphState = {
      activeBranch: 'main',
      nodes: {
        seed: {
          turnId: 'seed',
          parentTurnIds: [],
          branchName: 'main',
          chatId: 'chat-a',
          jobIds: [],
          status: 'complete',
          revisionId: 'rev-seed',
        },
        live: {
          turnId: 'live',
          parentTurnIds: ['seed'],
          branchName: 'main',
          chatId: 'chat-a',
          jobIds: [],
          status: 'complete',
          revisionId: 'rev-live',
        },
      },
      branches: {},
    };

    const graph = buildRevisionGraph({ chats: [reversed], persisted, supersededTurnIds: [], headTurnId: '' });

    expect(graph.byTurnId.get('seed')!.parentTurnIds).toEqual([]);
    expect(graph.byTurnId.get('seed')!.parents).toEqual([]);
    expect(graph.byTurnId.get('live')!.parentTurnIds).toEqual(['seed']);
    expect(decode(graph.byTurnId.get('seed')!.tree.get('main.scad'))).toBe('cube(10);\n');
    expect(decode(graph.byTurnId.get('live')!.tree.get('main.scad'))).toBe('cube(20);\n');
  });

  it('does not lend a legacy fork point to an authoritative record that records none', () => {
    const graph = buildRevisionGraph({
      chats: chats(),
      persisted: graphMetadata(),
      supersededTurnIds: ['u2'],
      headTurnId: '',
    });

    // Legacy inference labels a superseded turn as forking off the active
    // parent; `u2`'s authoritative record deliberately carries no fork point.
    expect(graph.byTurnId.get('u2')!.forkPointTurnId).toBeUndefined();
    expect(graph.byTurnId.get('u2')!.forkPoint).toBeUndefined();
    expect(graph.byTurnId.get('u3')!.forkPointTurnId).toBe('u1');
  });

  it('marks legacy parent inference explicitly and withholds unfinished graph nodes from the visible projection', () => {
    const graph = buildRevisionGraph({ chats: chats(), supersededTurnIds: [], headTurnId: '' });
    expect(graph.nodes.every((node) => node.parentSource === 'inferred')).toBe(true);

    const visibleRevisions = graph.nodes.filter((node) => node.turnId !== 'u3').map((node) => node.revision);
    const visible = filterRevisionGraph(graph, new Set(['u3']), visibleRevisions);
    expect(visible.byTurnId.has('u3')).toBe(false);
    expect(visible.nodes.map((node) => node.turnId)).toEqual(['u1', 'u2']);
  });
});
