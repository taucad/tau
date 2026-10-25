import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NodeFsChannel, NodeFsProviderClient } from '@taucad/filesystem/backend';
import { NodeFsAuthorityHost, serveNodeFsProvider } from '@taucad/filesystem/backend/node';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import { publishShellProjectionFile } from '#shell/shell-projection.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    // oxlint-disable-next-line no-await-in-loop -- Close authority before deleting its owned fixture.
    await cleanup();
  }
});

const connect = () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'tau-shell-projection-'));
  const root = join(sandbox, 'project');
  const authorityRoot = join(sandbox, 'authority');
  mkdirSync(root);
  mkdirSync(authorityRoot);
  const { port1, port2 } = new MessageChannel();
  const stop = serveNodeFsProvider(port2, {
    policy: tauPathPolicy,
    allowRoot: (candidate) => candidate === root,
    authority: new NodeFsAuthorityHost({ authorityDirectory: () => authorityRoot, authorityIdentity: () => root }),
  });
  const channel = new NodeFsChannel(port1);
  const authority = new NodeFsProviderClient(channel, root);
  cleanups.push(async () => {
    channel.close();
    await stop();
    port2.close();
    rmSync(sandbox, { recursive: true, force: true });
  });
  return { authority, root };
};

const options = () => ({ maximumBytes: 1024, signal: new AbortController().signal });

describe('shell projection outbound publication', () => {
  it('should allow only one concurrent publication against the same baseline', async () => {
    const { authority } = connect();
    await authority.writeFile('part.ts', 'baseline');
    const results = await Promise.all(
      ['first', 'second'].map(async (projected) =>
        publishShellProjectionFile(authority, { path: 'part.ts', baseline: 'baseline', projected }, options()),
      ),
    );
    expect(
      results
        .map((result) => (result.status === 'settled' ? result.result.status : result.status))
        .sort((left, right) => left.localeCompare(right)),
    ).toEqual(['applied', 'conflict']);
    expect(['first', 'second']).toContain(await authority.readFile('part.ts', 'utf8'));
  });

  it('should let the rooted authority refuse an authored-looking symlink into protected records', async () => {
    const { authority, root } = connect();
    mkdirSync(join(root, '.git'));
    writeFileSync(join(root, '.git', 'config'), 'protected');
    symlinkSync(join(root, '.git', 'config'), join(root, 'part.ts'));
    await expect(
      publishShellProjectionFile(authority, { path: 'part.ts', baseline: 'protected', projected: 'edit' }, options()),
    ).rejects.toMatchObject({ code: 'ELOOP' });
    expect(readFileSync(join(root, '.git', 'config'), 'utf8')).toBe('protected');
  });

  it('should publish authored creation and deletion through the real rooted authority', async () => {
    const { authority } = connect();
    const created = await publishShellProjectionFile(
      authority,
      { path: '.tau/parameters/part.json', baseline: null, projected: '{}' },
      options(),
    );
    expect(created).toMatchObject({ status: 'settled', result: { status: 'applied' } });
    expect(await authority.readFile('.tau/parameters/part.json', 'utf8')).toBe('{}');
    const removed = await publishShellProjectionFile(
      authority,
      { path: '.tau/parameters/part.json', baseline: '{}', projected: null },
      options(),
    );
    expect(removed).toMatchObject({ status: 'settled', result: { status: 'applied' } });
    expect(await authority.exists('.tau/parameters/part.json')).toBe(false);
  });

  it.each(['shell edit', null])('should preserve a newer editor save against projected %s', async (projected) => {
    const { authority, root } = connect();
    await authority.writeFile('part.ts', 'baseline');
    await authority.writeFile('part.ts', 'newer editor save');
    const result = await publishShellProjectionFile(
      authority,
      { path: 'part.ts', baseline: 'baseline', projected },
      options(),
    );
    expect(result).toMatchObject({
      status: 'settled',
      observation: { baseline: 'baseline', projected },
      result: { status: 'conflict' },
    });
    expect(readFileSync(join(root, 'part.ts'), 'utf8')).toBe('newer editor save');
  });

  it.each(['.TAU/unknown', '.tau./unknown', '.tau:alias/unknown', '.git/config', '.tau/chats/item.json'])(
    'should refuse protected spelling %s before it reaches backing storage',
    async (path) => {
      const { authority, root } = connect();
      expect(
        await publishShellProjectionFile(authority, { path, baseline: null, projected: 'secret' }, options()),
      ).toEqual({ status: 'refused', reason: 'protected-path' });
      expect(existsSync(join(root, path))).toBe(false);
    },
  );

  it('should reject an oversize publication without changing backing bytes', async () => {
    const { authority, root } = connect();
    writeFileSync(join(root, 'part.ts'), 'baseline');
    expect(
      await publishShellProjectionFile(
        authority,
        { path: 'part.ts', baseline: 'baseline', projected: 'large shell edit' },
        { ...options(), maximumBytes: 8 },
      ),
    ).toEqual({ status: 'refused', reason: 'size-limit' });
    expect(readFileSync(join(root, 'part.ts'), 'utf8')).toBe('baseline');
  });

  it('should copy captured bytes before an asynchronous authority mutation', async () => {
    const { authority } = connect();
    const projected = new TextEncoder().encode('captured');
    const publication = publishShellProjectionFile(
      authority,
      { path: 'part.ts', baseline: null, projected },
      options(),
    );
    projected.fill(0);
    expect(await publication).toMatchObject({ status: 'settled', result: { status: 'applied' } });
    expect(await authority.readFile('part.ts', 'utf8')).toBe('captured');
  });

  it('should reject noncanonical paths and cancelled publication', async () => {
    const { authority } = connect();
    await expect(
      publishShellProjectionFile(authority, { path: '../other/part.ts', baseline: null, projected: 'edit' }, options()),
    ).rejects.toMatchObject({ code: 'PATH_OUTSIDE_ROOT' });
    const controller = new AbortController();
    controller.abort(new Error('checkout closed'));
    await expect(
      publishShellProjectionFile(
        authority,
        { path: 'part.ts', baseline: null, projected: 'edit' },
        { ...options(), signal: controller.signal },
      ),
    ).rejects.toThrow('checkout closed');
    expect(await authority.exists('part.ts')).toBe(false);
  });
});
