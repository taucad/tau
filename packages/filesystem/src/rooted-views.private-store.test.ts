import { describe, expect, it, vi } from 'vitest';
import type { ChangeEvent } from '#types.js';
import { createWorkspaceFileService, decoder, encoder } from '#testing/workspace-service-harness.js';

const oid = `abcd${'0'.repeat(60)}`;
const object = `.git/lfs/objects/ab/cd/${oid}`;

describe('rooted storePrivateObject', () => {
  it('should store a large object once, with no change event and no mutation claim', async () => {
    const { service, eventBus, resourceQueue } = await createWorkspaceFileService();
    const rooted = service.createRootedFileSystem('/');
    const events: ChangeEvent[] = [];
    eventBus.subscribe((event) => {
      events.push(event);
    });
    const claims = [
      vi.spyOn(resourceQueue, 'queueFor'),
      vi.spyOn(resourceQueue, 'queueForMany'),
      vi.spyOn(resourceQueue, 'queueForClaims'),
    ];
    const content = encoder.encode('solid a');

    expect(await rooted.storePrivateObject!(object, content)).toBe('stored');
    expect(await rooted.storePrivateObject!(object, content)).toBe('present');

    /* Sampled once both stores have settled: neither asked the queue for anything. */
    expect(claims.map((claim) => claim.mock.calls.length)).toStrictEqual([0, 0, 0]);
    expect(resourceQueue.depth).toBe(0);
    expect(events).toStrictEqual([]);
    expect(decoder.decode(await rooted.readFile(object))).toBe('solid a');
    expect(await rooted.readdir('.git/lfs/objects/ab/cd')).toStrictEqual([oid]);
  });

  it.each([
    'models/a.step',
    '.git',
    '.git/HEAD',
    '.git/index',
    '.git/refs/heads/main',
    `vendor/x/.git/lfs/objects/ab/cd/${oid}`,
    `.git/lfs/objects/ab/ce/${oid}`,
    '.git/lfs/objects/ab/cd/abcd',
    `.git/lfs/objects/AB/CD/${oid.toUpperCase()}`,
    `.git/lfs/objects/ab/cd/${oid}.partial`,
  ])('should refuse %s, which belongs to the mutation pipeline', async (path) => {
    const { service } = await createWorkspaceFileService();
    const rooted = service.createRootedFileSystem('/');

    await expect(rooted.storePrivateObject!(path, encoder.encode('solid a'))).rejects.toThrow(TypeError);
    expect(await rooted.exists(path)).toBe(false);
  });

  it('should replace a copy cut short, and keep a whole one', async () => {
    const { service } = await createWorkspaceFileService();
    const rooted = service.createRootedFileSystem('/');
    await rooted.writeFile(object, 'sol');

    expect(await rooted.storePrivateObject!(object, encoder.encode('solid a'))).toBe('stored');
    expect(decoder.decode(await rooted.readFile(object))).toBe('solid a');
    expect(await rooted.readdir('.git/lfs/objects/ab/cd')).toStrictEqual([oid]);
  });

  /* Two tabs storing one oid: the one that sees a whole copy appear while it writes keeps it. */
  it('should keep a whole copy another writer stored while this one was writing', async () => {
    const { service, provider } = await createWorkspaceFileService();
    const rooted = service.createRootedFileSystem('/');
    await rooted.writeFile(object, 'sol');
    const unlink = vi.spyOn(provider, 'unlink');
    const write = provider.writeFile.bind(provider);
    vi.spyOn(provider, 'writeFile').mockImplementation(async (path, data) => {
      await write(path, data);
      if (path.endsWith('.partial')) {
        /* The other tab's store lands, whole, between this one's two looks. */
        await write(object, 'solid a');
      }
    });

    expect(await rooted.storePrivateObject!(object, encoder.encode('solid a'))).toBe('present');
    expect(unlink.mock.calls.map(([path]) => path).filter((path) => !path.endsWith('.partial'))).toStrictEqual([]);
    expect(await rooted.readdir('.git/lfs/objects/ab/cd')).toStrictEqual([oid]);
  });

  it('should answer present when it loses the rename to another writer', async () => {
    const { service, provider } = await createWorkspaceFileService();
    const rooted = service.createRootedFileSystem('/');
    const rename = provider.rename.bind(provider);
    vi.spyOn(provider, 'rename').mockImplementation(async (from, to) => {
      if (from.endsWith('.partial')) {
        await provider.writeFile(to, 'solid a');
        throw Object.assign(new Error('EEXIST: file already exists'), { code: 'EEXIST' });
      }
      return rename(from, to);
    });

    expect(await rooted.storePrivateObject!(object, encoder.encode('solid a'))).toBe('present');
    expect(await rooted.readdir('.git/lfs/objects/ab/cd')).toStrictEqual([oid]);
  });

  it('should fail when the rename fails and nothing whole is there', async () => {
    const { service, provider } = await createWorkspaceFileService();
    const rooted = service.createRootedFileSystem('/');
    vi.spyOn(provider, 'rename').mockRejectedValue(Object.assign(new Error('EIO: rename failed'), { code: 'EIO' }));

    await expect(rooted.storePrivateObject!(object, encoder.encode('solid a'))).rejects.toThrow('EIO');
    expect(await rooted.readdir('.git/lfs/objects/ab/cd')).toStrictEqual([]);
  });

  it('should leave one whole object after concurrent stores of the same oid', async () => {
    const { service } = await createWorkspaceFileService();
    const first = service.createRootedFileSystem('/');
    const second = service.createRootedFileSystem('/');
    const content = encoder.encode('solid a');

    const answers = await Promise.all([
      first.storePrivateObject!(object, content),
      second.storePrivateObject!(object, content),
      first.storePrivateObject!(object, content),
    ]);

    expect(answers).toContain('stored');
    expect(decoder.decode(await first.readFile(object))).toBe('solid a');
    expect(await first.readdir('.git/lfs/objects/ab/cd')).toStrictEqual([oid]);
  });
});
