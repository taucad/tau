import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { NodeFsAuthorityHost, serveNodeFsProvider } from '@taucad/filesystem/backend/node';
import { NodeFsChannel, NodeFsProviderClient } from '@taucad/filesystem/backend';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';

import { createPackageManifestCommit, updatePackageManifest } from '@taucad/bundler-core';

it('should publish through the real Node authority and fence two independent clients', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'tau-package-host-'));
  const root = join(sandbox, 'project');
  const authorityRoot = join(sandbox, 'authority');
  await mkdir(root);
  await mkdir(authorityRoot);
  const authority = new NodeFsAuthorityHost({ authorityDirectory: () => authorityRoot, authorityIdentity: () => root });
  const connect = () => {
    const ports = new MessageChannel();
    const stop = serveNodeFsProvider(ports.port2, {
      authority,
      policy: tauPathPolicy,
      allowRoot: (candidate) => candidate === root,
    });
    const channel = new NodeFsChannel(ports.port1);
    return { ports, channel, stop, provider: new NodeFsProviderClient(channel, root) };
  };
  const first = connect();
  const second = connect();
  const { signal } = new AbortController();
  try {
    const filesystem = {
      exists: first.provider.exists.bind(first.provider),
      readFile: first.provider.readFile.bind(first.provider),
      writeFile: first.provider.writeFile.bind(first.provider),
      ensureDir: async (path: string) => first.provider.mkdir(path, { recursive: true }),
    };
    const commit = createPackageManifestCommit({ authority: first.provider, signal });
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : input.toString();
      return url.includes('registry.npmjs.org')
        ? Response.json({
            'dist-tags': { latest: '1.0.0' },
            versions: {
              '1.0.0': {
                name: 'example',
                version: '1.0.0',
                dist: {
                  tarball: 'https://registry.npmjs.org/example/-/example-1.0.0.tgz',
                  integrity: `sha512-${'A'.repeat(86)}==`,
                },
              },
            },
          })
        : new Response('export const value = 42;');
    });
    const lock = await updatePackageManifest({
      filesystem,
      commit,
      signal,
      requests: { example: '1.0.0' },
      mode: 'install',
      nodeVersion: '24.0.0',
    });
    const content = await readFile(join(root, 'package.json'), 'utf8');
    expect(JSON.parse(content)).toEqual({ dependencies: { example: '1.0.0' }, taucadPackageLock: lock });
    expect(await readFile(join(root, lock.packages['example']!.artifact.cachePath), 'utf8')).toBe(
      'export const value = 42;',
    );
    const otherCommit = createPackageManifestCommit({ authority: second.provider, signal });
    const outcomes = await Promise.all([
      commit({ expected: content, content: 'first' }),
      otherCommit({ expected: content, content: 'second' }),
    ]);
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    expect(['first', 'second']).toContain(await readFile(join(root, 'package.json'), 'utf8'));
    expect(await otherCommit({ expected: content, content: 'stale' })).toBe(false);
  } finally {
    vi.unstubAllGlobals();
    first.channel.close();
    second.channel.close();
    await first.stop();
    await second.stop();
    first.ports.port2.close();
    second.ports.port2.close();
    await rm(sandbox, { recursive: true, force: true });
  }
});

describe('authority failure semantics', () => {
  it('should preserve potentially-applied failures instead of claiming the old manifest survived', async () => {
    const failure = Object.assign(new Error('authority connection lost after write'), {
      applicationState: 'potentially-applied',
    });
    const commit = createPackageManifestCommit({
      authority: { writeFileChecked: vi.fn().mockRejectedValue(failure) },
      signal: new AbortController().signal,
    });
    await expect(commit({ expected: undefined, content: '{}' })).rejects.toBe(failure);
  });
});
