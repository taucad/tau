import { describe, expect, it, vi } from 'vitest';
import type { ChangeEvent, FileReadStreamOptions } from '#types.js';
import { createWorkspaceFileService, decoder, encoder } from '#testing/workspace-service-harness.js';

const pack = '.git/objects/pack/pack-1.pack';

describe('rooted privateStore', () => {
  it('should write, move and remove control-plane files with no change event and no mutation claim', async () => {
    const { service, eventBus, resourceQueue } = await createWorkspaceFileService();
    const rooted = service.createRootedFileSystem('/');
    const store = rooted.privateStore!;
    const events: ChangeEvent[] = [];
    eventBus.subscribe((event) => {
      events.push(event);
    });
    const claims = [
      vi.spyOn(resourceQueue, 'queueFor'),
      vi.spyOn(resourceQueue, 'queueForMany'),
      vi.spyOn(resourceQueue, 'queueForClaims'),
    ];

    await store.mkdir('.git/refs/heads', { recursive: true });
    await store.writeFile('.git/refs/heads/main.lock', `${'a'.repeat(40)}\n`);
    await store.rename('.git/refs/heads/main.lock', '.git/refs/heads/main');
    await store.writeFile('.git/HEAD', 'ref: refs/heads/main\n');
    await store.unlink('.git/HEAD');

    /* Sampled once every write has settled: none asked the queue for anything. */
    expect(claims.map((claim) => claim.mock.calls.length)).toStrictEqual([0, 0, 0]);
    expect(resourceQueue.depth).toBe(0);
    expect(events).toStrictEqual([]);
    expect(await store.readFile('.git/refs/heads/main', 'utf8')).toBe(`${'a'.repeat(40)}\n`);
    expect(await store.readdir('.git/refs/heads')).toStrictEqual(['main']);
    expect(await store.exists('.git/HEAD')).toBe(false);
    const stat = await store.stat('.git/refs/heads/main');
    expect(stat.size).toBe(41);
  });

  it("should read one range of a file through the provider's ranged stream, never the whole file", async () => {
    const { service, provider } = await createWorkspaceFileService();
    const ranges: Array<FileReadStreamOptions | undefined> = [];
    const whole = provider.readFile.bind(provider) as (path: string) => Promise<Uint8Array<ArrayBuffer>>;
    const readFile = vi.spyOn(provider, 'readFile');
    Object.assign(provider, {
      readFileStream: (path: string, options?: FileReadStreamOptions) => {
        ranges.push(options);
        return new ReadableStream<Uint8Array<ArrayBuffer>>({
          start: async (controller) => {
            const content = await whole(path);
            const start = options?.position ?? 0;
            controller.enqueue(content.slice(start, start + (options?.length ?? content.byteLength)));
            controller.close();
          },
        });
      },
    });
    const store = service.createRootedFileSystem('/').privateStore!;
    await store.writeFile(pack, encoder.encode('PACK0123456789'));
    readFile.mockClear();

    expect(decoder.decode(await store.readRange!(pack, 4, 4))).toBe('0123');
    expect(decoder.decode(await store.readRange!(pack, 12, 10))).toBe('89');
    expect(ranges).toStrictEqual([
      { position: 4, length: 4 },
      { position: 12, length: 10 },
    ]);
    expect(readFile).not.toHaveBeenCalled();
  });

  it('should offer no range read over a provider that cannot stream ranges', async () => {
    const { service } = await createWorkspaceFileService();

    expect(service.createRootedFileSystem('/').privateStore!.readRange).toBeUndefined();
  });

  it.each(['models/a.step', '', 'vendor/x/.git/HEAD', '.github/workflows/ci.yml', '.gitignore', '.git-x/HEAD'])(
    'should refuse %s, which belongs to the mutation pipeline',
    async (path) => {
      const { service } = await createWorkspaceFileService();
      const rooted = service.createRootedFileSystem('/');

      await expect(rooted.privateStore!.writeFile(path, encoder.encode('solid a'))).rejects.toThrow(TypeError);
      await expect(rooted.privateStore!.readFile(path)).rejects.toThrow(TypeError);
      if (path !== '') {
        expect(await rooted.exists(path)).toBe(false);
      }
    },
  );

  it('should refuse a move out of the control plane', async () => {
    const { service } = await createWorkspaceFileService();
    const rooted = service.createRootedFileSystem('/');
    await rooted.privateStore!.writeFile('.git/a', 'a');

    await expect(rooted.privateStore!.rename('.git/a', 'a')).rejects.toThrow(TypeError);
    expect(await rooted.exists('a')).toBe(false);
  });
});
