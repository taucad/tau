/**
 * A symlink inside the checkout must not launder the mask (G0-6, invariant CI1).
 *
 * `classify` answers about the spelling it is given, and a view only has the
 * lexical one: `notes/config` looks like ordinary authored content however
 * `notes` resolves. The node backend is the only one that can hold a link — the
 * OPFS, Web Access, IndexedDB and memory providers have no symlink concept, so
 * there the lexical spelling *is* the real one — and it is also the only layer
 * that knows the real path, so it answers for both.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFsProvider } from '#backend/node/provider.js';
import { statConcurrency } from '#concurrency.js';
import { composeView } from '#composed-view.js';
import type { ComposedViewConsumer } from '#composed-view.js';
import { tauPathPolicy } from '#path-registry.js';

const sandboxes: string[] = [];

afterEach(() => {
  for (const sandbox of sandboxes.splice(0)) {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

/** One checkout whose ordinary names resolve into paths the mask hides. */
const checkout = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'tau-view-symlink-'));
  sandboxes.push(root);
  mkdirSync(join(root, '.git', 'hooks'), { recursive: true });
  mkdirSync(join(root, 'vendor', 'lib', '.git'), { recursive: true });
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, '.git', 'config'), 'url = git@github.com:owner/private.git\n');
  writeFileSync(join(root, 'vendor', 'lib', '.git', 'config'), 'vendored\n');
  writeFileSync(join(root, 'src', 'main.ts'), 'export const main = 1;\n');
  symlinkSync(join(root, '.git'), join(root, 'notes'));
  symlinkSync(join(root, 'vendor', 'lib', '.git'), join(root, 'link'));
  symlinkSync(join(root, 'src'), join(root, 'sources'));
  return root;
};

const viewOf = (root: string, consumer: ComposedViewConsumer): ReturnType<typeof composeView> =>
  composeView({ filesystem: new NodeFsProvider(root, { policy: tauPathPolicy }) }, { consumer, policy: tauPathPolicy });

describe('composed view over a checkout holding symlinks', () => {
  it.each(['user', 'agent'] as const)(
    'should refuse the %s view a read through a link into the control plane',
    async (consumer) => {
      const view = viewOf(checkout(), consumer);

      await expect(view.readFile('notes/config', 'utf8')).rejects.toMatchObject({ code: 'ELOOP' });
      await expect(view.readFile('link/config', 'utf8')).rejects.toMatchObject({ code: 'ELOOP' });
      await expect(view.readdir('notes')).rejects.toMatchObject({ code: 'ELOOP' });
    },
  );

  it.each(['user', 'agent'] as const)(
    'should refuse the %s view a write through a link into the control plane',
    async (consumer) => {
      const view = viewOf(checkout(), consumer);

      /* The hook does not exist yet, so only the link's own target says where the
       * bytes would land — the attack the lexical spelling cannot see. */
      await expect(view.writeFile('notes/hooks/pre-commit', '#!/bin/sh\n')).rejects.toMatchObject({ code: 'ELOOP' });
      await expect(view.writeFile('notes/config', 'url = mine\n')).rejects.toMatchObject({ code: 'ELOOP' });
      await expect(view.writeFile('link/config', 'url = mine\n')).rejects.toMatchObject({ code: 'ELOOP' });
    },
  );

  /* A listing is not the place to discover the refusal: a walker stats every row
   * it lists, and one that raised would cost the caller the whole snapshot. */
  it('should leave a laundered link out of the listing while the rest of it stands', async () => {
    const view = viewOf(checkout(), 'agent');

    await expect(view.readdir('')).resolves.toEqual(['sources', 'src', 'vendor']);
    await expect(view.readdirWithStats('')).resolves.toEqual([
      expect.objectContaining({ name: 'sources', type: 'dir' }),
      expect.objectContaining({ name: 'src', type: 'dir' }),
      expect.objectContaining({ name: 'vendor', type: 'dir' }),
    ]);
  });

  it('should still serve an ordinary link to a visible path', async () => {
    const view = viewOf(checkout(), 'agent');

    await expect(view.readFile('sources/main.ts', 'utf8')).resolves.toBe('export const main = 1;\n');
    await view.writeFile('sources/added.ts', 'export const added = 2;\n');
    await expect(view.readFile('src/added.ts', 'utf8')).resolves.toBe('export const added = 2;\n');
  });

  /*
   * The refusal is the backend's and belongs to every consumer: `'working-copy'`
   * reaches the control plane by its own name, never laundered through one the
   * mask would have allowed.
   */
  it('should refuse the laundered spelling on the raw working copy while the real one still reads', async () => {
    const root = checkout();
    const provider = new NodeFsProvider(root, { policy: tauPathPolicy });

    await expect(provider.readFile('notes/config')).rejects.toMatchObject({ code: 'ELOOP' });
    await expect(provider.readFile('.git/config', 'utf8')).resolves.toContain('owner/private');
  });
});

/**
 * G0b-4, G0b-5: the probe that keeps a laundered row out of a listing answers for
 * every row a `_resolve` refuses, and it answers from a bounded pool.
 */
describe('the node provider probing its symlink rows', () => {
  const sandbox = (): string => {
    const root = mkdtempSync(join(tmpdir(), 'tau-provider-symlink-'));
    sandboxes.push(root);
    return root;
  };

  /* One unresolvable link used to cost the caller the whole directory: the probe
   * dropped a row only for `ELOOP`, so a broken link — or one pointing out of the
   * root — stayed listed, and the `stat` every walker then runs rejected. */
  it('should drop a link the provider cannot resolve for any reason and keep the rest of the listing', async () => {
    const root = sandbox();
    writeFileSync(join(root, 'main.ts'), 'export const main = 1;\n');
    mkdirSync(join(root, 'src'));
    symlinkSync('./gone', join(root, 'broken'));
    symlinkSync(tmpdir(), join(root, 'outside'));
    const provider = new NodeFsProvider(root, { policy: tauPathPolicy });

    await expect(provider.readdir('')).resolves.toEqual(['main.ts', 'src']);
    await expect(provider.readdirWithStats('')).resolves.toEqual([
      expect.objectContaining({ name: 'main.ts', type: 'file' }),
      expect.objectContaining({ name: 'src', type: 'dir' }),
    ]);
  });

  /* Budget row: a pnpm `node_modules` is thousands of link rows, and every one of
   * them is an `lstat` walk plus a `realpath`. Unbounded, one listing put all of
   * them in flight at once — twice, because `readdirWithStats` stats them again. */
  it('should probe its link rows from one bounded pool', async () => {
    const root = sandbox();
    writeFileSync(join(root, 'main.ts'), 'export const main = 1;\n');
    for (let row = 0; row < statConcurrency * 3; row++) {
      symlinkSync('./main.ts', join(root, `link${row}.ts`));
    }
    const provider = new NodeFsProvider(root, { policy: tauPathPolicy });
    let inFlight = 0;
    let maxInFlight = 0;
    const realpath = fs.realpath.bind(fs);
    vi.spyOn(fs, 'realpath').mockImplementation(async (target) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        return await realpath(target);
      } finally {
        inFlight -= 1;
      }
    });

    try {
      await expect(provider.readdir('')).resolves.toHaveLength(statConcurrency * 3 + 1);
    } finally {
      vi.restoreAllMocks();
    }

    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(statConcurrency);
  });
});
