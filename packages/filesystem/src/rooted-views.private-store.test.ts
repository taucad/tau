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

    /* A range that is not two whole, non-negative numbers never reaches the provider. */
    for (const [offset, length] of [
      [-1, 4],
      [0, -1],
      [1.5, 2],
      [0, Number.NaN],
      [Number.POSITIVE_INFINITY, 1],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- each refusal checked in turn.
      await expect(store.readRange!(pack, offset, length)).rejects.toThrow(RangeError);
    }
    expect(ranges).toHaveLength(2);
  });

  /* W6.3: a large object streams into the store through the provider's own staging, with no claim and no event. */
  it('should stream a control-plane file through the provider, with no change event and no mutation claim', async () => {
    const { service, eventBus, resourceQueue } = await createWorkspaceFileService();
    const store = service.createRootedFileSystem('/').privateStore!;
    const events: ChangeEvent[] = [];
    eventBus.subscribe((event) => {
      events.push(event);
    });
    const claims = vi.spyOn(resourceQueue, 'queueFor');
    const object = '.git/lfs/objects/ab/cd/abcd.partial';
    const chunks = ['solid ', 'part'];
    await store.writeFileStream!(
      object,
      new ReadableStream<Uint8Array<ArrayBuffer>>({
        pull: (controller) => {
          const chunk = chunks.shift();
          if (chunk === undefined) {
            controller.close();
          } else {
            controller.enqueue(encoder.encode(chunk));
          }
        },
      }),
    );

    expect(decoder.decode(await store.readFile(object))).toBe('solid part');
    expect(claims).not.toHaveBeenCalled();
    expect(events).toStrictEqual([]);
    const cancel = vi.fn();
    await expect(
      store.writeFileStream!('models/a.step', new ReadableStream<Uint8Array<ArrayBuffer>>({ cancel })),
    ).rejects.toThrow(TypeError);
    /* Refused before any provider saw it: the store releases the source itself. */
    expect(cancel).toHaveBeenCalledWith(expect.any(TypeError));
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
