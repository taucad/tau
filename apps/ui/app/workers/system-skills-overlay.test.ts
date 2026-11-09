// @vitest-environment node
import { readFile } from 'node:fs/promises';

import { workerTimings } from '@taucad/filesystem';
import { systemSkillBundles } from '@taucad/skills/resources';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { systemSkillResourceStats, systemSkillsOverlay } from '#workers/system-skills-overlay.js';

const fetchFromDisk = vi.fn(async (url: string) => new Response(Uint8Array.from(await readFile(new URL(url)))));

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

    const [first, second] = await Promise.all([systemSkillsOverlay().read(path), systemSkillsOverlay().read(path)]);
    const third = await systemSkillsOverlay().read(path);

    expect(fetchFromDisk).toHaveBeenCalledOnce();
    expect(fetchFromDisk).toHaveBeenCalledWith(resource.url);
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
    expect(workerTimings.summarize(startedAt).counters).toMatchObject({
      'overlay.read': { total: 4 },
      'overlay.fetch': { total: 1 },
    });
  });

  it('should reject a failed response with EIO and fetch again on the next read', async () => {
    const { resource, path } = resources[1]!;
    fetchFromDisk.mockResolvedValueOnce(new Response('missing', { status: 404 }));

    await expect(systemSkillsOverlay().read(path)).rejects.toMatchObject({ code: 'EIO' });
    const retried = await systemSkillsOverlay().read(path);
    expect(retried.byteLength).toBe(resource.byteLength);
    expect(fetchFromDisk).toHaveBeenCalledTimes(2);
  });
});
