import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NodeFsChannel, NodeFsProviderClient } from '#backend/node/client.js';
import { NodeFsAuthorityHost, serveNodeFsProvider } from '#backend/node/host.js';
import { tauPathPolicy } from '#path-registry.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    // oxlint-disable-next-line no-await-in-loop -- Close ports and release ownership before removing storage.
    await cleanup();
  }
});

const connect = (root: string, authorityRoot: string): { client: NodeFsProviderClient; close: () => Promise<void> } => {
  const authority = new NodeFsAuthorityHost({
    authorityDirectory: () => authorityRoot,
    authorityIdentity: (canonicalRoot) => canonicalRoot,
  });
  const { port1, port2 } = new MessageChannel();
  const stop = serveNodeFsProvider(port2, {
    policy: tauPathPolicy,
    allowRoot: (candidate) => candidate === root,
    authority,
  });
  const channel = new NodeFsChannel(port1);
  const close = async (): Promise<void> => {
    channel.close();
    await stop();
    port2.close();
  };
  cleanups.push(close);
  return { client: new NodeFsProviderClient(channel, root), close };
};

describe.runIf(['darwin', 'linux', 'win32'].includes(process.platform))('native filesystem authority mutations', () => {
  it('should persist checked mutations, refuse a second host, and transfer ownership after port disposal', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'tau-authority-mutation-'));
    cleanups.push(async () => rm(sandbox, { force: true, recursive: true }));
    const root = join(sandbox, 'content');
    const authorityRoot = join(sandbox, 'authority');
    await mkdir(root);
    await mkdir(authorityRoot);
    await writeFile(join(root, 'model.txt'), 'initial');
    const first = connect(root, authorityRoot);
    const second = connect(root, authorityRoot);

    expect(
      await first.client.writeFileChecked({
        path: 'model.txt',
        data: 'saved',
        preconditions: [{ path: 'model.txt', expected: 'initial' }],
      }),
    ).toMatchObject({ status: 'applied' });
    expect(await readFile(join(root, 'model.txt'), 'utf8')).toBe('saved');

    const replacement = {
      path: 'model.txt',
      data: 'replacement',
      preconditions: [{ path: 'model.txt', expected: 'saved' }],
    };
    await expect(second.client.writeFileChecked(replacement)).rejects.toMatchObject({
      code: 'AUTHORITY_ALREADY_OWNED',
    });
    expect(await readFile(join(root, 'model.txt'), 'utf8')).toBe('saved');

    await first.close();
    expect(await second.client.writeFileChecked(replacement)).toMatchObject({ status: 'applied' });
    expect(await readFile(join(root, 'model.txt'), 'utf8')).toBe('replacement');
  });
});
