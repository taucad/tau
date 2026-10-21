import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ImmutableRevisionTree, revisionId } from '#algorithms/index.js';
import { createNativeGitRevisionPort } from '#native-git-port.js';
import { runGitCommand } from '#git-command.js';
import { largeObjectThresholdBytes } from '#workspace-config.js';
import { startGitHttpBackend } from '#test/git-http-backend.js';
import { gitToolchainOnPath } from '#test/native-git-harness.js';

const author = { name: 'Transfer test', email: 'transfer@example.com' };

// A real Git/LFS transfer whose start is delayed past the local plumbing budget.
// The executable shim does not implement the protocol or the result being asserted.
const transferFixture = async (operation: 'fetch' | 'push' | 'discovery') => {
  const root = await mkdtemp(join(tmpdir(), 'tau-lfs-budget-'));
  const server = await startGitHttpBackend({ root });
  const marker = join(root, 'transfer-started');
  const executable = join(root, 'slow-git');
  const release = join(root, 'release-transfer');
  const fail = join(root, 'fail-transfer');
  await writeFile(
    executable,
    `#!${process.execPath}
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const args = process.argv.slice(2);
const delayed = ${JSON.stringify(operation)} === 'discovery' ? args.includes('ls-remote') : args.some((arg, i) => arg === 'lfs' && args[i + 1] === ${JSON.stringify(operation)});
const start = () => {
  if (delayed && fs.existsSync(${JSON.stringify(fail)})) process.exit(1);
  const child = spawn('git', args, { stdio: 'inherit' });
  child.on('error', () => process.exit(1));
  child.on('exit', (code) => process.exit(code ?? 1));
};
if (delayed && !fs.existsSync(${JSON.stringify(release)})) {
  fs.writeFileSync(${JSON.stringify(marker)}, 'started');
  setTimeout(start, 31000);
} else start();
`,
    { mode: 0o755 },
  );
  const repositoryPath = join(root, 'source');
  await mkdir(repositoryPath);
  const source = createNativeGitRevisionPort({
    repositoryPath,
    tauCredential: () => ({ apiBaseUrl: server.url, authorization: 'Bearer session-token' }),
    ...(operation === 'push' ? { gitExecutable: executable } : {}),
  });
  await source.init({ author });
  const bytes = new Uint8Array(largeObjectThresholdBytes + 1024).fill(73);
  const receipt = await source.writeRevision({
    parents: [],
    tree: new ImmutableRevisionTree([['large.bin', bytes]]),
    provenance: { source: 'user', actorId: 'test', createdAt: 1 },
    summary: { generated: 'Large file' },
  });
  const head = revisionId(receipt.commitId);
  await source.updateRef({ name: 'main', expectedHead: undefined, head });
  await source.setRemote({ name: 'tau', url: server.url });
  const clonePath = join(root, 'clone');
  await mkdir(clonePath);
  const clone = createNativeGitRevisionPort({
    repositoryPath: clonePath,
    gitExecutable: executable,
    tauCredential: () => ({ apiBaseUrl: server.url, authorization: 'Bearer session-token' }),
  });
  await clone.init({ author });
  await clone.setRemote({ name: 'tau', url: server.url });
  if (operation !== 'push') {
    await source.tag({ name: 'ready', revisionId: head });
    await source.push({ remote: 'tau', refs: [{ name: 'refs/heads/main' }, { name: 'refs/tags/ready' }] });
  }
  return {
    marker,
    release,
    fail,
    clonePath,
    bytes,
    head,
    clone,
    server,
    transfer: async (signal?: AbortSignal) =>
      operation === 'push'
        ? source.push({ remote: 'tau', refs: [{ name: 'refs/heads/main' }], ...(signal ? { signal } : {}) })
        : clone.fetch({
            remote: 'tau',
            ...(operation === 'discovery' ? {} : { refs: ['refs/heads/main', 'refs/tags/ready'] }),
            ...(signal ? { signal } : {}),
          }),
    close: async () => {
      await server.close();
      await rm(root, { recursive: true, force: true });
    },
  };
};

describe.runIf(gitToolchainOnPath)('native LFS operation bounds', () => {
  it.each(['fetch', 'push'] as const)(
    'should complete a %s beyond the local command deadline',
    async (operation) => {
      const fixture = await transferFixture(operation);
      try {
        await fixture.transfer();
        if (operation === 'fetch') {
          const tree = await fixture.clone.readTree(fixture.head);
          expect(tree?.get('large.bin')).toEqual(fixture.bytes);
        } else {
          expect(await fixture.server.git(['rev-parse', 'refs/heads/main'])).toBe(fixture.head);
          expect([...fixture.server.objects.values()]).toContainEqual(fixture.bytes);
        }
      } finally {
        await fixture.close();
      }
    },
    120_000,
  );

  it.each(['fetch', 'push'] as const)(
    'should cancel %s without continuing the transfer or publishing a push ref',
    async (operation) => {
      const fixture = await transferFixture(operation);
      const controller = new AbortController();
      try {
        if (operation === 'fetch') {
          await runGitCommand({
            gitExecutable: 'git',
            args: ['config', 'remote.tau.fetch', '+refs/heads/*:refs/remotes/tau/*'],
            cwd: fixture.clonePath,
          });
        }
        const pending = fixture.transfer(controller.signal);
        const rejection = expect(pending).rejects.toMatchObject({ code: 'ENGINE_FAILED', cause: { reason: 'signal' } });
        await expect.poll(async () => readFile(fixture.marker, 'utf8'), { timeout: 10_000 }).toBe('started');
        controller.abort();
        await rejection;
        if (operation === 'fetch') {
          expect(await fixture.clone.listRefs('refs/remotes/tau')).toEqual([]);
          expect(await fixture.clone.listRefs('refs/tags')).toEqual([]);
          expect(await fixture.clone.listRefs('refs/tau/transactions')).toEqual([]);
          await writeFile(fixture.release, 'resume');
          await fixture.transfer();
          const recovered = await fixture.clone.readTree(fixture.head);
          expect(recovered?.get('large.bin')).toEqual(fixture.bytes);
        } else {
          expect(await fixture.server.git(['for-each-ref', '--format=%(refname)', 'refs/heads'])).toBe('');
          expect(fixture.server.uploadCount()).toBe(0);
        }
      } finally {
        controller.abort();
        await fixture.close();
      }
    },
    30_000,
  );
  it('should leave tracking refs and tags untouched after an LFS failure and retry the same tip', async () => {
    const fixture = await transferFixture('fetch');
    try {
      await writeFile(fixture.release, 'start immediately');
      await writeFile(fixture.fail, 'fail LFS');
      await expect(fixture.transfer()).rejects.toMatchObject({ code: 'ENGINE_FAILED' });
      expect(await fixture.clone.listRefs('refs/remotes/tau')).toEqual([]);
      expect(await fixture.clone.listRefs('refs/tags')).toEqual([]);
      expect(await fixture.clone.listRefs('refs/tau/transactions')).toEqual([]);
      await rm(fixture.fail);
      await fixture.transfer();
      const recovered = await fixture.clone.readTree(fixture.head);
      expect(recovered?.get('large.bin')).toEqual(fixture.bytes);
      expect(await fixture.clone.readRef('refs/tags/ready')).toBe(fixture.head);
    } finally {
      await fixture.close();
    }
  }, 30_000);

  it('should preserve a concurrent tracking winner and publish none of the fetched refs', async () => {
    const fixture = await transferFixture('fetch');
    try {
      const competing = await fixture.clone.writeRevision({
        parents: [],
        tree: new ImmutableRevisionTree([['local.txt', new Uint8Array([42])]]),
        provenance: { source: 'user', actorId: 'test', createdAt: 2 },
        summary: { generated: 'Concurrent fetch' },
      });
      const winner = revisionId(competing.commitId);
      const pending = fixture.transfer();
      const rejected = expect(pending).rejects.toMatchObject({ code: 'ENGINE_FAILED' });
      await expect.poll(async () => readFile(fixture.marker, 'utf8'), { timeout: 10_000 }).toBe('started');
      await fixture.clone.updateRef({ name: 'refs/remotes/tau/main', expectedHead: undefined, head: winner });
      await rejected;
      expect(await fixture.clone.readRef('refs/remotes/tau/main')).toBe(winner);
      expect(await fixture.clone.listRefs('refs/tags')).toEqual([]);
      expect(await fixture.clone.listRefs('refs/remotes/tau/tags')).toEqual([]);
      expect(await fixture.clone.listRefs('refs/tau/transactions')).toEqual([]);
    } finally {
      await fixture.close();
    }
  }, 60_000);
  it('should cancel discovery before downloading or publishing any refs', async () => {
    const fixture = await transferFixture('discovery');
    const controller = new AbortController();
    try {
      const pending = fixture.transfer(controller.signal);
      const rejected = expect(pending).rejects.toMatchObject({ code: 'ENGINE_FAILED', cause: { reason: 'signal' } });
      await expect.poll(async () => readFile(fixture.marker, 'utf8'), { timeout: 10_000 }).toBe('started');
      controller.abort();
      await rejected;
      expect(await fixture.clone.listRefs('refs/remotes/tau')).toEqual([]);
      await expect(fixture.clone.fetch({ remote: 'tau', signal: AbortSignal.abort() })).rejects.toThrow();
    } finally {
      controller.abort();
      await fixture.close();
    }
  }, 30_000);
});
