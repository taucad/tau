// oxlint-disable-next-line import/no-unassigned-import -- Side-effect import to polyfill IndexedDB for topology tests
import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import type { ChangeSet } from '#change-event-bus.js';
import type { ChangesetEntry } from '#changeset.js';
import { createWorkspaceFileService } from '#testing/workspace-service-harness.js';
import { composeView } from '#composed-view.js';
import { tauPathPolicy } from '#path-registry.js';

const projectId = 'proj_ddddddddddddddddddddd';

const projectContext = async () => {
  const context = await createWorkspaceFileService();
  await context.service.configureProjectRoots({
    projects: [{ projectId, backend: 'memory', storageRootKey: 'memory:change-sets', providerBasePath: 'project' }],
    roots: [],
  });
  return context;
};

describe('rooted change-set watches (D6)', () => {
  it('delivers one change set in the root namespace for a fifty-write changeset', async () => {
    const context = await projectContext();
    const rooted = context.service.createRootedFileSystem(`/projects/${projectId}`);
    const sets: ChangeSet[] = [];
    const paths: string[] = [];
    const stopSets = rooted.watchChangeSets!({ paths: [''], recursive: true }, (set) => {
      sets.push(set);
    });
    const stopPaths = rooted.watch({ paths: [''], recursive: true }, (event) => {
      paths.push(event.type);
    });
    try {
      const receipt = await rooted.apply!({
        entries: Array.from(
          { length: 50 },
          (_, index): ChangesetEntry => ({
            op: 'write',
            path: `agent/turn/file-${String(index)}.ts`,
            data: `export const value = ${String(index)};`,
          }),
        ),
      });
      expect(receipt.state).toBe('applied');

      expect(sets).toHaveLength(1);
      expect(sets[0]!.entries.every((entry) => entry.path.startsWith('agent/turn/file-'))).toBe(true);
      expect(sets[0]!.entries.filter((entry) => entry.kind === 'file')).toHaveLength(50);
      expect(sets[0]!.touchedDirectories).toContain('agent/turn');
      expect(sets[0]!.reset).toBeUndefined();
    } finally {
      stopSets();
      stopPaths();
      context.service.dispose();
    }
  });

  it('leaves out the facts of the port that wrote them', async () => {
    const context = await projectContext();
    const author = context.service.createRootedFileSystem(`/projects/${projectId}`, { originClientId: 'port-a' });
    const handler = vi.fn();
    const stop = author.watchChangeSets!({ paths: [''], recursive: true }, handler);
    try {
      await author.writeFile('mine.ts', 'export {};');
      expect(handler).not.toHaveBeenCalled();

      await context.service.createRootedFileSystem(`/projects/${projectId}`).writeFile('theirs.ts', 'export {};');
      expect(handler).toHaveBeenCalledOnce();
      expect((handler.mock.calls[0]![0] as ChangeSet).entries.map((entry) => entry.path)).toEqual(['theirs.ts']);
    } finally {
      stop();
      context.service.dispose();
    }
  });

  it("masks a composed view's change sets like its per-path watch", async () => {
    const context = await projectContext();
    const rooted = context.service.createRootedFileSystem(`/projects/${projectId}`);
    const view = composeView({ filesystem: rooted }, { consumer: 'agent', policy: tauPathPolicy });
    const sets: ChangeSet[] = [];
    const stop = view.watchChangeSets!({ paths: [''], recursive: true }, (set) => {
      sets.push(set);
    });
    try {
      await rooted.apply!({
        entries: [
          { op: 'write', path: 'visible.ts', data: 'export {};' },
          { op: 'write', path: '.git/HEAD', data: 'ref: refs/heads/main\n' },
        ],
      });
      await rooted.writeFile('.git/config', '[core]\n');

      expect(sets).toHaveLength(1);
      expect(sets[0]!.entries.map((entry) => entry.path)).toEqual(['visible.ts']);
      expect(sets[0]!.touchedDirectories).not.toContain('.git');
    } finally {
      stop();
      context.service.dispose();
    }
  });

  it('lifts a reset of a hidden directory to the nearest directory the view shows', async () => {
    const context = await projectContext();
    const rooted = context.service.createRootedFileSystem(`/projects/${projectId}`);
    let deliver: ((set: ChangeSet) => void) | undefined;
    const base: typeof rooted = Object.assign(Object.create(rooted) as typeof rooted, {
      watchChangeSets: (_request: unknown, handler: (set: ChangeSet) => void) => {
        deliver = handler;
        return () => undefined;
      },
    });
    const view = composeView({ filesystem: base }, { consumer: 'agent', policy: tauPathPolicy });
    const sets: ChangeSet[] = [];
    const stop = view.watchChangeSets!({ paths: [''], recursive: true }, (set) => {
      sets.push(set);
    });
    try {
      const empty = { entries: [], touchedDirectories: [] };
      deliver!({ generation: 1, ...empty, reset: { prefix: '.git/objects/ab', reason: 'observer-uncertain' } });
      deliver!({ generation: 2, ...empty, reset: { prefix: 'src/lib', reason: 'overflow' } });

      expect(sets.map(({ reset }) => reset)).toEqual([
        { prefix: '', reason: 'observer-uncertain' },
        { prefix: 'src/lib', reason: 'overflow' },
      ]);
    } finally {
      stop();
      context.service.dispose();
    }
  });

  it('resets the root when its mount goes', async () => {
    const context = await createWorkspaceFileService();
    const rooted = context.service.createRootedFileSystem('/');
    const handler = vi.fn();
    const stop = rooted.watchChangeSets!({ paths: [''], recursive: true }, handler);
    try {
      await context.service.mount('/previews/sets', {
        class: 'authored',
        backend: 'memory',
        storageRootKey: 'memory:preview:sets',
      });
      const last = handler.mock.lastCall?.[0] as ChangeSet | undefined;
      expect(last?.entries).toEqual([]);
      expect(last?.reset?.prefix).toBe('');
    } finally {
      stop();
      context.service.dispose();
    }
  });
});
