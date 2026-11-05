// oxlint-disable-next-line import/no-unassigned-import -- Side-effect import to polyfill IndexedDB for topology tests
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { applyChangesetToProvider } from '#changeset-provider.js';
import { MemoryProvider } from '#backend/memory-provider.js';
import { composeView } from '#composed-view.js';
import { tauPathPolicy } from '#path-registry.js';
import { createWorkspaceFileService } from '#testing/workspace-service-harness.js';

const projectId = 'proj_eeeeeeeeeeeeeeeeeeeee';
const log = '.tau/chats/c1/events/segment-0001.jsonl';
const line = (text: string): string => `${text}\n`;

const projectRoot = async () => {
  const context = await createWorkspaceFileService();
  await context.service.configureProjectRoots({
    projects: [{ projectId, backend: 'memory', storageRootKey: 'memory:fences', providerBasePath: 'project' }],
    roots: [],
  });
  return { context, rooted: context.service.createRootedFileSystem(`/projects/${projectId}`) };
};

describe('fenced record-log appends (D23)', () => {
  it('applies an append whose expected length holds and reports the durability class', async () => {
    const { context, rooted } = await projectRoot();
    try {
      const first = await rooted.apply!({
        entries: [{ op: 'append', path: log, data: line('a'), fence: { expectedLength: 0 } }],
      });
      expect(first.state).toBe('applied');
      expect(first.entries[0]!.durability).toBe('ephemeral');

      const second = await rooted.apply!({
        entries: [{ op: 'append', path: log, data: line('b'), fence: { expectedLength: 2, token: 1 } }],
      });
      expect(second.state).toBe('applied');
      expect(new TextDecoder().decode(await rooted.readFile(log))).toBe('a\nb\n');
    } finally {
      context.service.dispose();
    }
  });

  it('refuses an append when another writer appended first, and changes nothing', async () => {
    const { context, rooted } = await projectRoot();
    try {
      await rooted.apply!({ entries: [{ op: 'append', path: log, data: line('mine') }] });
      await rooted.apply!({ entries: [{ op: 'append', path: log, data: line('theirs') }] });

      const stale = await rooted.apply!({
        entries: [{ op: 'append', path: log, data: line('late'), fence: { expectedLength: 5 } }],
      });

      expect(stale.state).toBe('known-not-applied');
      expect(stale.entries[0]).toMatchObject({
        outcome: 'failed',
        error: { code: 'EAPPENDSTALE', expectedLength: 5, actualLength: 12 },
      });
      expect(new TextDecoder().decode(await rooted.readFile(log))).toBe('mine\ntheirs\n');
    } finally {
      context.service.dispose();
    }
  });

  it('refuses a writer whose fencing token is older than one already applied', async () => {
    const { context, rooted } = await projectRoot();
    try {
      await rooted.apply!({
        entries: [{ op: 'append', path: log, data: line('new'), fence: { expectedLength: 0, token: 7 } }],
      });

      const zombie = await rooted.apply!({
        entries: [{ op: 'append', path: log, data: line('old'), fence: { expectedLength: 4, token: 6 } }],
      });

      expect(zombie.entries[0]).toMatchObject({ outcome: 'failed', error: { code: 'EFENCED', token: 6, highest: 7 } });
      expect(new TextDecoder().decode(await rooted.readFile(log))).toBe('new\n');

      const successor = await rooted.apply!({
        entries: [{ op: 'append', path: log, data: line('next'), fence: { expectedLength: 4, token: 7 } }],
      });
      expect(successor.state).toBe('applied');
    } finally {
      context.service.dispose();
    }
  });

  it('lets only one of two appends fenced at the same length land', async () => {
    const { context, rooted } = await projectRoot();
    try {
      const result = await rooted.apply!({
        entries: [
          { op: 'append', path: log, data: line('a'), fence: { expectedLength: 0 } },
          { op: 'append', path: log, data: line('b'), fence: { expectedLength: 0 } },
        ],
      });

      expect(result.entries.map(({ outcome }) => outcome)).toEqual(['applied', 'failed']);
      expect(result.entries[1]).toMatchObject({
        error: { code: 'EAPPENDSTALE', expectedLength: 0, actualLength: 2 },
      });
      expect(new TextDecoder().decode(await rooted.readFile(log))).toBe('a\n');
    } finally {
      context.service.dispose();
    }
  });

  it('applies pipelined appends fenced at L and then at L + n in one changeset', async () => {
    const { context, rooted } = await projectRoot();
    try {
      const result = await rooted.apply!({
        entries: [
          { op: 'append', path: log, data: line('a'), fence: { expectedLength: 0, token: 1 } },
          { op: 'append', path: log, data: line('b'), fence: { expectedLength: 2, token: 1 } },
        ],
      });

      expect(result.state).toBe('applied');
      expect(new TextDecoder().decode(await rooted.readFile(log))).toBe('a\nb\n');
    } finally {
      context.service.dispose();
    }
  });

  it('keeps a stale fence from halting nothing but its own phase', async () => {
    const { context, rooted } = await projectRoot();
    try {
      const receipt = await rooted.apply!({
        entries: [
          { op: 'append', path: log, data: line('x'), fence: { expectedLength: 3 } },
          { op: 'write', path: 'other.ts', data: 'export {};' },
        ],
      });

      expect(receipt.entries.map((entry) => entry.outcome)).toEqual(['failed', 'applied']);
    } finally {
      context.service.dispose();
    }
  });

  it('serves the fence as one call on the rooted view and the composed user view', async () => {
    const { context, rooted } = await projectRoot();
    try {
      await rooted.appendFileFenced!(log, line('a'), { expectedLength: 0 });
      const view = composeView({ filesystem: rooted }, { consumer: 'user', policy: tauPathPolicy });
      await view.appendFileFenced!(log, line('b'), { expectedLength: 2 });

      await expect(view.appendFileFenced!(log, line('late'), { expectedLength: 2 })).rejects.toMatchObject({
        code: 'EAPPENDSTALE',
        actualLength: 4,
      });
      expect(new TextDecoder().decode(await rooted.readFile(log))).toBe('a\nb\n');
    } finally {
      context.service.dispose();
    }
  });

  it('refuses a fenced append on a bare provider, which holds no lock to keep the fence true', async () => {
    await expect(
      applyChangesetToProvider(new MemoryProvider(), {
        entries: [{ op: 'append', path: 'log', data: 'x', fence: { expectedLength: 0 } }],
      }),
    ).rejects.toMatchObject({ code: 'EINVAL' });
  });
});
