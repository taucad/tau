import { beforeEach, describe, expect, it } from 'vitest';

import { MemoryProvider } from '#backend/memory-provider.js';
import { composeView, maskedPathCode } from '#composed-view.js';
import type { ComposedView } from '#composed-view.js';
import { tauPathPolicy } from '#path-registry.js';

/**
 * The contract that justifies `'agent'` for every executor of project code (W14).
 *
 * A kernel runtime, the GeoSpec runner, Quick Look and the host daemon's runtime
 * child all execute code the agent wrote, so each opens the `'agent'` view rather
 * than the working copy (invariant CI1). These pins state what that view answers
 * an executor: the control plane is absent at any depth, the durable records the
 * agent itself writes are read-only, and everything a kernel genuinely needs —
 * staged sources, `tau.json`, the parameter sidecars and the bundler's artifact
 * cache — stays writable.
 */

const seeded = {
  'src/main.ts': 'export default () => undefined;\n',
  'tau.json': '{}\n',
  '.git/config': '[remote "origin"]\n',
  '.git/HEAD': 'ref: refs/heads/main\n',
  'vendor/dep/.git/config': '[remote "origin"]\n',
  '.tau/chats/c/events.jsonl': '{}\n',
  'exports/x.step': 'ISO-10303-21;\n',
} as const;

let provider: MemoryProvider;

/** The executor as every host composes it: one `'agent'` view over the checkout. */
const executorView = (): ComposedView =>
  composeView({ filesystem: provider }, { consumer: 'agent', policy: tauPathPolicy });

beforeEach(async () => {
  provider = new MemoryProvider();
  for (const [path, content] of Object.entries(seeded)) {
    // oxlint-disable-next-line no-await-in-loop -- Deterministic seed order keeps the fixture readable.
    await provider.writeFile(path, content);
  }
});

describe('the executor view over a project', () => {
  it('should refuse reading the control plane', async () => {
    await expect(executorView().readFile('.git/config')).rejects.toMatchObject({
      code: 'EPERM',
      reason: maskedPathCode,
    });
  });

  it('should refuse writing into the control plane', async () => {
    await expect(executorView().writeFile('.git/hooks/pre-commit', '#!/bin/sh\n')).rejects.toMatchObject({
      code: 'EPERM',
      reason: maskedPathCode,
    });
    expect(await provider.exists('.git/hooks/pre-commit')).toBe(false);
  });

  it('should refuse a control plane nested inside the design', async () => {
    const view = executorView();

    await expect(view.readFile('vendor/dep/.git/config')).rejects.toMatchObject({ code: 'EPERM' });
    await expect(view.writeFile('vendor/dep/.git/config', 'forged')).rejects.toMatchObject({ code: 'EPERM' });
  });

  it('should report the control plane as absent', async () => {
    const view = executorView();

    expect(await view.exists('.git')).toBe(false);
    expect(await view.exists('.git/HEAD')).toBe(false);
    expect(await view.readdir('')).not.toContain('.git');
  });

  /* Agent-authored CAD code must not be able to rewrite the agent's own durable
   * log, its exports or a project's thumbnail: records are read-only to `'agent'`,
   * which is the whole reason an executor is not the `'user'` view. */
  it('should refuse writing the records Tau keeps itself', async () => {
    const view = executorView();

    await expect(view.writeFile('.tau/chats/c/events.jsonl', '{}\n')).rejects.toMatchObject({
      code: 'EROFS',
      reason: maskedPathCode,
    });
    await expect(view.writeFile('exports/x.step', 'forged')).rejects.toMatchObject({
      code: 'EROFS',
      reason: maskedPathCode,
    });
  });

  it('should write the bundler artifact cache a kernel populates', async () => {
    await executorView().writeFile('node_modules/.tau-bundler/artifacts/x.mjs', 'export default 1;\n');

    expect(await provider.readFile('node_modules/.tau-bundler/artifacts/x.mjs', 'utf8')).toBe('export default 1;\n');
  });

  it('should write the sources, manifest and parameter sidecars a render stages', async () => {
    const view = executorView();

    await view.writeFile('src/main.ts', 'export default () => 1;\n');
    await view.writeFile('tau.json', '{"kernel":"jscad"}\n');
    await view.writeFile('.tau/parameters/main.json', '{"revision":"r1"}\n');

    expect(await provider.readFile('src/main.ts', 'utf8')).toBe('export default () => 1;\n');
    expect(await provider.readFile('tau.json', 'utf8')).toBe('{"kernel":"jscad"}\n');
    expect(await provider.readFile('.tau/parameters/main.json', 'utf8')).toBe('{"revision":"r1"}\n');
  });
});
