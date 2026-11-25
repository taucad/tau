// @vitest-environment node
import { readFile } from 'node:fs/promises';

import { workerTimings } from '@taucad/filesystem';
import { systemSkillBundles } from '@taucad/skills/resources';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { systemSkillResourceStats, systemSkillsOverlay } from '#workers/system-skills-overlay.js';

const fetchFromDisk = vi.fn(
  async (url: string, _init?: { readonly signal?: AbortSignal }) =>
    new Response(Uint8Array.from(await readFile(new URL(url)))),
);

/* A request the host never answers: it ends only when its own signal aborts it. */
const neverAnswered = async (_url: string, init?: { readonly signal?: AbortSignal }): Promise<Response> =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    });
  });

/* The cache is a module singleton shared by every test here, so each test
 * reads resources no other test touches and compares counter deltas. */
const resources = systemSkillBundles.flatMap((bundle) =>
  bundle.files.slice(1).map((resource) => ({ resource, path: `.agents/skills/${bundle.slug}/${resource.path}` })),
);

describe('the browser system skill overlay', () => {
  beforeEach(() => {
    fetchFromDisk.mockClear();
    vi.stubGlobal('fetch', fetchFromDisk);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should serve every SKILL.md from its bundle without a request', async () => {
    const overlay = systemSkillsOverlay();

    const bodies = await Promise.all(
      systemSkillBundles.map(async ({ slug }) => overlay.read(`.agents/skills/${slug}/SKILL.md`)),
    );

    expect(bodies.map((bytes) => new TextDecoder().decode(bytes))).toStrictEqual(
      systemSkillBundles.map(({ body }) => body),
    );
    expect(fetchFromDisk).not.toHaveBeenCalled();
  });

  it('should fetch a resource once per realm across overlays and count reads and fetches', async () => {
    const { resource, path } = resources[0]!;
    const before = systemSkillResourceStats();
    const startedAt = workerTimings.now();
    /* The summary counts whole seconds, so it holds what earlier tests recorded in this second: count the change. */
    const totalOf = (counter: 'overlay.read' | 'overlay.fetch'): number =>
      workerTimings.summarize(startedAt).counters[counter]?.total ?? 0;
    const counted = { reads: totalOf('overlay.read'), fetches: totalOf('overlay.fetch') };

    const [first, second] = await Promise.all([systemSkillsOverlay().read(path), systemSkillsOverlay().read(path)]);
    const third = await systemSkillsOverlay().read(path);

    expect(fetchFromDisk).toHaveBeenCalledOnce();
    expect(fetchFromDisk).toHaveBeenCalledWith(resource.url, { signal: expect.any(AbortSignal) as AbortSignal });
    expect(first.byteLength).toBe(resource.byteLength);
    expect(second).not.toBe(first);
    expect(second).toStrictEqual(first);
    /* Detaching one caller's buffer, as a transferred reply does, leaves the cache intact. */
    structuredClone(first.buffer, { transfer: [first.buffer] });
    expect(third.byteLength).toBe(resource.byteLength);
    expect(new Uint8Array(await systemSkillsOverlay().read(path)).byteLength).toBe(resource.byteLength);
    const after = systemSkillResourceStats();
    expect({
      fetches: after.fetches - before.fetches,
      hits: after.hits - before.hits,
      bytes: after.bytes - before.bytes,
    }).toStrictEqual({ fetches: 1, hits: 3, bytes: resource.byteLength });
    expect({
      reads: totalOf('overlay.read') - counted.reads,
      fetches: totalOf('overlay.fetch') - counted.fetches,
    }).toStrictEqual({ reads: 4, fetches: 1 });
  });

  it('should reject a failed response with EIO and fetch again on the next read', async () => {
    const { resource, path } = resources[1]!;
    fetchFromDisk.mockResolvedValueOnce(new Response('missing', { status: 404 }));

    await expect(systemSkillsOverlay().read(path)).rejects.toMatchObject({ code: 'EIO' });
    const retried = await systemSkillsOverlay().read(path);
    expect(retried.byteLength).toBe(resource.byteLength);
    expect(fetchFromDisk).toHaveBeenCalledTimes(2);
  });

  /* Launch audit PERF-2: two reads of one skill file each waited 300 s on a stalled request, then failed on its 502,
   * while the same URL answered in under a second minutes later. */
  describe('a static host that stalls or fails', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should give up on a request that is not answered in ten seconds and read the resource from the next one', async () => {
      const { resource, path } = resources[2]!;
      fetchFromDisk.mockImplementationOnce(neverAnswered);

      const reading = systemSkillsOverlay().read(path);
      await vi.advanceTimersByTimeAsync(10_000 + 500);
      vi.useRealTimers();

      const bytes = await reading;
      expect(bytes.byteLength).toBe(resource.byteLength);
      expect(fetchFromDisk).toHaveBeenCalledTimes(2);
    });

    it('should ask again after a 502 and read the resource', async () => {
      const { resource, path } = resources[3]!;
      fetchFromDisk.mockResolvedValueOnce(new Response('bad gateway', { status: 502 }));

      const reading = systemSkillsOverlay().read(path);
      await vi.advanceTimersByTimeAsync(500);
      vi.useRealTimers();

      const bytes = await reading;
      expect(bytes.byteLength).toBe(resource.byteLength);
      expect(fetchFromDisk).toHaveBeenCalledTimes(2);
    });

    it('should fail the read within its bound, saying why, when the host never answers', async () => {
      const { path } = resources[4]!;
      fetchFromDisk.mockImplementation(neverAnswered);

      const reading = systemSkillsOverlay().read(path);
      const failed = expect(reading).rejects.toMatchObject({
        code: 'EIO',
        message: 'Resource request was not answered within 10 s.',
      });
      /* Three requests of ten seconds, and the two waits between them. */
      await vi.advanceTimersByTimeAsync(3 * 10_000 + 500 + 1000);

      await failed;
      expect(fetchFromDisk).toHaveBeenCalledTimes(3);
      fetchFromDisk.mockReset();
    });
  });
});
