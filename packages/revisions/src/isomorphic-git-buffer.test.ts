/**
 * The adapter installs `Buffer` for hosts that have none (W19-b, W19-b-a2).
 *
 * `isomorphic-git@1.38.5` reads the Node `Buffer` **global** on every write
 * path — `GitTree.toObject`, `GitIndex` and its `BufferCursor` all call
 * `Buffer.from`/`alloc`/`concat` directly — so a browser, which has no such
 * global, threw `Buffer is not defined` on the first object it recorded. The
 * defect survived to a live browser precisely because every Node and jsdom
 * suite in this workspace inherits a real `Buffer`: deleting the adapter's two
 * lines leaves every other suite green.
 *
 * So this is the one case that takes the global away first. It is the owner's
 * own guard; `apps/ui-e2e/src/first-turn-admission.spec.ts` remains the
 * integration proof in a real browser.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import { ImmutableRevisionTree } from '@taucad/filesystem/revisions';

const roots: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.resetModules();
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

it('records a revision on a host with no `Buffer` global', async () => {
  /* Before the module is evaluated: the assignment it makes at module scope is
   * what is under test, so the global has to be gone when it runs. */
  vi.stubGlobal('Buffer', undefined);
  vi.resetModules();
  const { createIsomorphicGitRevisionPort } = await import('#isomorphic-git-adapter.js');

  const root = await mkdtemp(join(tmpdir(), 'tau-revisions-no-buffer-'));
  roots.push(root);
  const port = createIsomorphicGitRevisionPort({ filesystem: new NodeFsProvider(root) });
  await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });

  /* A write, not a read: reading never touched the global, which is why the
   * port read healthy right up to the first mint. */
  const receipt = await port.writeRevision({
    parents: [],
    tree: new ImmutableRevisionTree([['part.ts', 'export const part = 1;\n']]),
    provenance: { source: 'user', actorId: 'ada', createdAt: Date.UTC(2026, 8, 13) },
    summary: { generated: 'Add the part' },
  });

  expect(receipt.commitId).toMatch(/^[0-9a-f]{40}$/u);
});
