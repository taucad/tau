import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMemoryProvider } from '@taucad/filesystem/backend';
import { ImmutableRevisionTree, revisionId } from '#algorithms/index.js';
import { createRevisionHttpClient } from '#http-client.js';
import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
import { bootstrapRemoteRevisionStore } from '#remote-bootstrap.js';
import { startGitHttpBackend } from '#test/git-http-backend.js';
import { generatedGitattributesContent, generatedIgnoreContent } from '#workspace-config.js';

const author = { name: 'Tau', email: 'noreply@tau.new' };
const provenance = {
  source: 'import',
  actorId: 'github:42',
  createdAt: Date.UTC(2026, 8, 14),
} as const;

describe('bootstrapRemoteRevisionStore', () => {
  let root = '';

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'tau-remote-bootstrap-'));
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('pins one source head and records exactly one reviewed setup child', async () => {
    const fixture = await startGitHttpBackend({ root, name: 'source' });
    try {
      const source = createIsomorphicGitRevisionPort({
        filesystem: await createMemoryProvider(),
        http: createRevisionHttpClient(),
      });
      await source.init({ author, createSetupFiles: false });
      const receipt = await source.writeRevision({
        parents: [],
        tree: new ImmutableRevisionTree([['model.scad', 'cube(1);\n', '100755']]),
        provenance,
        summary: { generated: 'Source' },
      });
      const sourceHead = revisionId(receipt.commitId);
      await source.updateRef({ name: 'main', expectedHead: undefined, head: sourceHead });
      await source.setRemote({ name: 'origin', url: fixture.url });
      await source.push({ remote: 'origin', refs: [{ name: 'refs/heads/main' }] });

      const destination = createIsomorphicGitRevisionPort({
        filesystem: await createMemoryProvider(),
        http: createRevisionHttpClient(),
      });
      const result = await bootstrapRemoteRevisionStore({
        port: destination,
        remote: { name: 'origin', url: fixture.url, provider: 'github', repositoryId: '99' },
        sourceRef: 'refs/heads/main',
        sourceHead,
        targetBranch: 'main',
        author,
        setup: {
          files: [{ path: 'tau.json', content: new TextEncoder().encode('{"name":"Imported"}\n') }],
          provenance,
          summary: { generated: 'Set up Tau project' },
        },
      });

      expect(result.head).not.toBe(sourceHead);
      expect(result.tree.mode('model.scad')).toBe('100755');
      expect(new TextDecoder().decode(result.tree.get('tau.json'))).toContain('Imported');
      /* The generated config is part of the reviewed setup, not a later unsaved change (D34). */
      expect(new TextDecoder().decode(result.tree.get('.gitignore'))).toBe(generatedIgnoreContent(undefined));
      expect(new TextDecoder().decode(result.tree.get('.gitattributes'))).toBe(
        generatedGitattributesContent(undefined),
      );
      const importedRevision = await destination.readRevision(result.head);
      expect(importedRevision?.parents).toEqual([sourceHead]);
      expect(await destination.readHead()).toEqual({ branch: 'main', head: result.head });
      expect(await destination.listRemotes()).toEqual([
        expect.objectContaining({ provider: 'github', repositoryId: '99' }),
      ]);

      const unchanged = createIsomorphicGitRevisionPort({
        filesystem: await createMemoryProvider(),
        http: createRevisionHttpClient(),
      });
      const exact = await bootstrapRemoteRevisionStore({
        port: unchanged,
        remote: { name: 'origin', url: fixture.url },
        sourceRef: 'refs/heads/main',
        sourceHead,
        targetBranch: 'main',
        author,
      });
      expect(exact.head).toBe(sourceHead);
      const exactLog = await unchanged.log({ heads: [exact.head] });
      expect(exactLog.map((row) => row.id)).toEqual([sourceHead]);

      const collisionReceipt = await source.writeRevision({
        parents: [sourceHead],
        tree: new ImmutableRevisionTree([
          ['Part.scad', 'cube(1);\n'],
          ['part.scad', 'cube(2);\n'],
        ]),
        provenance,
        summary: { generated: 'Portable path collision' },
      });
      const collisionHead = revisionId(collisionReceipt.commitId);
      await source.updateRef({ name: 'collision', expectedHead: undefined, head: collisionHead });
      await source.push({ remote: 'origin', refs: [{ name: 'refs/heads/collision' }] });
      const collision = createIsomorphicGitRevisionPort({
        filesystem: await createMemoryProvider(),
        http: createRevisionHttpClient(),
      });
      await expect(
        bootstrapRemoteRevisionStore({
          port: collision,
          remote: { name: 'origin', url: fixture.url },
          sourceRef: 'refs/heads/collision',
          sourceHead: collisionHead,
          targetBranch: 'collision',
          author,
        }),
      ).rejects.toThrow(/Part\.scad, part\.scad/u);
    } finally {
      await fixture.close();
    }
  }, 180_000);

  it('creates one root revision only after an empty remote is reverified', async () => {
    const fixture = await startGitHttpBackend({ root, name: 'empty' });
    try {
      const destination = createIsomorphicGitRevisionPort({
        filesystem: await createMemoryProvider(),
        http: createRevisionHttpClient(),
      });
      const result = await bootstrapRemoteRevisionStore({
        port: destination,
        remote: { name: 'origin', url: fixture.url },
        targetBranch: 'main',
        author,
        setup: {
          files: [{ path: 'tau.json', content: new TextEncoder().encode('{}\n') }],
          provenance,
          summary: { generated: 'Initialize Tau project' },
        },
      });
      const setupRevision = await destination.readRevision(result.head);
      expect(setupRevision?.parents).toEqual([]);
      expect(await destination.readHead()).toEqual({ branch: 'main', head: result.head });
    } finally {
      await fixture.close();
    }
  }, 180_000);
});
