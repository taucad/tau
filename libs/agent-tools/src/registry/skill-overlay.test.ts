import { ResourceQueue } from '@taucad/filesystem';
import { composeView } from '@taucad/filesystem/composed-view';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { sha256Bytes } from '@taucad/utils/hash';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createProviderRpcFileSystem } from '#registry/provider-file-system.js';
import {
  createCachedSkillResourceReader,
  createSkillBundleOverlay,
  createSkillBundleRegistry,
} from '#registry/skill-overlay.js';
import type { SkillResourceCacheEvent, SkillResourceDescriptor, SystemSkillBundle } from '#registry/skill-overlay.js';

const encoder = new TextEncoder();
const contents = {
  'SKILL.md': '---\nname: demo\ndescription: Demo skill\n---\n',
  'api-index.md': '# Index\nneedle\n',
  'references/detail.md': '# Detail\n',
} as const;

const resource = (path: keyof typeof contents): SkillResourceDescriptor => {
  const bytes = encoder.encode(contents[path]);
  return {
    path,
    url: `memory:${path}`,
    byteLength: bytes.byteLength,
    lineCount: contents[path].split('\n').length,
    contentKind: 'text',
    mediaType: 'text/markdown',
    sha256: '0'.repeat(64),
  };
};

const bundle: SystemSkillBundle = {
  slug: 'demo',
  name: 'Demo',
  description: 'Demo skill',
  version: '1.0.0',
  whenToUse: 'Use for tests.',
  body: contents['SKILL.md'],
  fingerprint: '1'.repeat(64),
  files: [resource('SKILL.md'), resource('api-index.md'), resource('references/detail.md')],
};

let provider: MemoryProvider;
let reads: ReturnType<typeof vi.fn<(descriptor: SkillResourceDescriptor) => Promise<Uint8Array<ArrayBuffer>>>>;

const overlay = () => createSkillBundleOverlay(createSkillBundleRegistry([bundle]), reads);

const fileSystem = () =>
  createProviderRpcFileSystem({
    provider: composeView(
      { filesystem: provider },
      { consumer: 'agent', policy: tauPathPolicy, overlays: [overlay()] },
    ),
    mutations: new ResourceQueue(),
  });

beforeEach(async () => {
  provider = new MemoryProvider();
  await provider.writeFile('main.ts', 'export {};\n');
  reads = vi.fn(async ({ path }: SkillResourceDescriptor) => encoder.encode(contents[path as keyof typeof contents]));
});

describe('the system skill overlay', () => {
  it('should name one unit per bundle slug and nothing above it', () => {
    const projection = overlay();

    expect(projection.root).toBe('.agents/skills');
    expect(projection.source).toBe('system-skills');
    expect(projection.unit('.agents/skills/demo/SKILL.md')).toStrictEqual({
      root: '.agents/skills/demo',
      identity: `skill:demo@1.0.0#${'1'.repeat(64)}`,
    });
    /* The directories above every unit are merged with the project, not owned. */
    expect(projection.unit('.agents/skills')).toBeUndefined();
    expect(projection.unit('.agents/skills/absent/SKILL.md')).toBeUndefined();
    expect(projection.node('.agents/skills/demo/api-index.md')).toStrictEqual({
      type: 'file',
      size: encoder.encode(contents['api-index.md']).byteLength,
      contentKind: 'text',
      lineCount: 3,
    });
  });

  it('should reject malformed bundle paths while constructing the registry', () => {
    expect(() =>
      createSkillBundleRegistry([
        {
          ...bundle,
          files: [bundle.files[0]!, { ...bundle.files[1]!, path: '../outside.md' }],
        },
      ]),
    ).toThrow('Virtual path escapes the filesystem root');
  });
});

describe('the tool filesystem over a composed view', () => {
  it('should expose lazy package files through the canonical project-relative tree', async () => {
    const tools = fileSystem();

    expect(reads).not.toHaveBeenCalled();
    /* The directories above a bundle are the project's own, so an implicit
     * search descends them and stops at the bundle itself — which is the only
     * row whose bytes are not the project's (N9). */
    expect(await tools.readdir('')).toContainEqual(expect.objectContaining({ name: '.agents', type: 'dir' }));
    expect(await tools.readdir('.agents/skills')).toContainEqual(
      expect.objectContaining({ name: 'demo', type: 'dir', traverseOnImplicitSearch: false }),
    );
    expect(await tools.readdir('.agents/skills/demo')).toStrictEqual([
      expect.objectContaining({ name: 'SKILL.md', type: 'file' }),
      expect.objectContaining({ name: 'api-index.md', type: 'file' }),
      expect.objectContaining({ name: 'references', type: 'dir' }),
    ]);
    expect(await tools.exists('.agents/skills/demo/references/detail.md')).toBe(true);
    expect(await tools.stat('.agents/skills/demo/api-index.md')).toMatchObject({
      isDirectory: false,
      contentKind: 'text',
      lineCount: 3,
      provenance: { source: 'system-skills', agentAccess: 'read-only' },
    });
    expect(reads).not.toHaveBeenCalled();
    expect(await tools.readFile('.agents/skills/demo/api-index.md')).toBe(contents['api-index.md']);
    expect(reads).toHaveBeenCalledOnce();
  });

  it('should serve SKILL.md from the bundle body without calling the reader', async () => {
    const tools = fileSystem();

    expect(await tools.readFile('.agents/skills/demo/SKILL.md')).toBe(bundle.body);
    expect(await tools.readFile('.agents/skills/demo/SKILL.md')).toBe(bundle.body);
    expect(reads).not.toHaveBeenCalled();
  });

  it('should hand each SKILL.md caller its own copy of the body bytes', async () => {
    const projection = overlay();
    const first = await projection.read('.agents/skills/demo/SKILL.md');
    first.fill(0);

    expect(new TextDecoder().decode(await projection.read('.agents/skills/demo/SKILL.md'))).toBe(bundle.body);
  });

  it('should fall through to the reader when the body length differs from the declared SKILL.md', async () => {
    const divergent: SystemSkillBundle = { ...bundle, body: `${bundle.body}extra\n` };
    const projection = createSkillBundleOverlay(createSkillBundleRegistry([divergent]), reads);

    expect(new TextDecoder().decode(await projection.read('.agents/skills/demo/SKILL.md'))).toBe(contents['SKILL.md']);
    expect(reads).toHaveBeenCalledOnce();
  });

  it('should reject every mutation into a bundle with EROFS', async () => {
    const tools = fileSystem();
    const path = '.agents/skills/demo/api-index.md';

    await expect(tools.writeFile(path, 'x')).rejects.toMatchObject({ code: 'EROFS' });
    await expect(tools.writeBinaryFile(path, encoder.encode('x'))).rejects.toMatchObject({ code: 'EROFS' });
    await expect(tools.appendFile(path, 'x')).rejects.toMatchObject({ code: 'EROFS' });
    await expect(tools.editFile({ targetFile: path, oldString: 'needle', newString: 'x' })).rejects.toMatchObject({
      code: 'EROFS',
    });
    await expect(tools.deleteFile(path)).rejects.toMatchObject({ code: 'EROFS' });
    expect(await tools.readFile(path)).toBe(contents['api-index.md']);
  });

  it('should let any project child hide the complete bundle', async () => {
    await provider.mkdir('.agents/skills/demo', { recursive: true });
    await provider.writeFile('.agents/skills/demo/SKILL.md', 'user\n');
    const tools = fileSystem();

    expect(await tools.readFile('.agents/skills/demo/SKILL.md')).toBe('user\n');
    expect(await tools.exists('.agents/skills/demo/api-index.md')).toBe(false);
    await expect(tools.readFile('.agents/skills/demo/api-index.md')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(reads).not.toHaveBeenCalled();
  });

  it('should reject invalid and undeclared resource paths before reading bytes', async () => {
    const tools = fileSystem();

    await expect(tools.readFile('../outside')).rejects.toMatchObject({ code: 'PATH_OUTSIDE_ROOT' });
    await expect(tools.readFile(String.raw`.agents\skills\demo\api-index.md`)).rejects.toMatchObject({
      code: 'INVALID_PATH',
    });
    await expect(tools.readFile('.agents/skills/demo/missing.md')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(tools.readFile('.agents/skills/other/api-index.md')).rejects.toBeInstanceOf(Error);
    expect(reads).not.toHaveBeenCalled();
  });
});

const verifiedResource = async (path: string, text: string): Promise<SkillResourceDescriptor> => {
  const bytes = encoder.encode(text);
  return {
    path,
    url: `memory:${path}`,
    byteLength: bytes.byteLength,
    lineCount: text.split('\n').length,
    contentKind: 'text',
    mediaType: 'text/markdown',
    sha256: await sha256Bytes(bytes),
  };
};

describe('the cached skill resource reader', () => {
  const texts: Record<string, string> = {
    'a.md': 'a'.repeat(40),
    'b.md': 'b'.repeat(40),
    'c.md': 'c'.repeat(40),
    'big.md': 'd'.repeat(60),
  };
  let fetched: ReturnType<typeof vi.fn<(descriptor: SkillResourceDescriptor) => Promise<Uint8Array<ArrayBuffer>>>>;

  beforeEach(() => {
    fetched = vi.fn(async ({ path }: SkillResourceDescriptor) => encoder.encode(texts[path] ?? ''));
  });

  it('should share one wrapped-reader call across concurrent reads of one resource', async () => {
    const resource = await verifiedResource('a.md', texts['a.md']!);
    const { promise, resolve } = Promise.withResolvers<Uint8Array<ArrayBuffer>>();
    fetched.mockReturnValueOnce(promise);
    const cache = createCachedSkillResourceReader(fetched);

    const reads = Array.from({ length: 5 }, async () => cache.read(resource, {}));
    resolve(encoder.encode(texts['a.md']));
    const results = await Promise.all(reads);

    expect(fetched).toHaveBeenCalledOnce();
    expect(results.every((bytes) => bytes === results[0])).toBe(true);
    expect(await cache.read(resource, {})).toBe(results[0]);
    expect(fetched).toHaveBeenCalledOnce();
    expect(cache.stats()).toStrictEqual({ fetches: 1, hits: 5, bytes: 40, evictions: 0 });
  });

  it('should never pass a caller signal to the shared fetch, so one abort leaves other readers whole', async () => {
    const resource = await verifiedResource('a.md', texts['a.md']!);
    const { promise, resolve } = Promise.withResolvers<Uint8Array<ArrayBuffer>>();
    fetched.mockReturnValueOnce(promise);
    const cache = createCachedSkillResourceReader(fetched);
    const controller = new AbortController();

    const aborting = cache.read(resource, { signal: controller.signal });
    const patient = cache.read(resource, {});
    controller.abort(new Error('caller left'));
    await expect(aborting).rejects.toThrow('caller left');
    resolve(encoder.encode(texts['a.md']));

    expect(new TextDecoder().decode(await patient)).toBe(texts['a.md']);
    expect(fetched).toHaveBeenCalledWith(resource, {});
    expect(fetched).toHaveBeenCalledOnce();
  });

  it('should reject an already aborted caller before reading', async () => {
    const resource = await verifiedResource('a.md', texts['a.md']!);
    const cache = createCachedSkillResourceReader(fetched);

    await expect(cache.read(resource, { signal: AbortSignal.abort(new Error('gone')) })).rejects.toThrow('gone');
    expect(fetched).not.toHaveBeenCalled();
  });

  it('should evict the least recently used resource to stay within the byte budget', async () => {
    const [a, b, c] = await Promise.all(
      ['a.md', 'b.md', 'c.md'].map(async (path) => verifiedResource(path, texts[path]!)),
    );
    const cache = createCachedSkillResourceReader(fetched, { maxBytes: 100 });

    await cache.read(a!, {});
    await cache.read(b!, {});
    /* Touch a so b is now the least recently used. */
    await cache.read(a!, {});
    await cache.read(c!, {});

    expect(cache.stats()).toMatchObject({ fetches: 3, bytes: 80, evictions: 1 });
    await cache.read(a!, {});
    expect(fetched).toHaveBeenCalledTimes(3);
    await cache.read(b!, {});
    expect(fetched).toHaveBeenCalledTimes(4);
  });

  it('should not retain a resource larger than half the budget', async () => {
    const big = await verifiedResource('big.md', texts['big.md']!);
    const cache = createCachedSkillResourceReader(fetched, { maxBytes: 100 });

    await cache.read(big, {});
    await cache.read(big, {});

    expect(fetched).toHaveBeenCalledTimes(2);
    expect(cache.stats()).toStrictEqual({ fetches: 2, hits: 0, bytes: 0, evictions: 0 });
  });

  it('should reject a digest mismatch with EIO, keep nothing, and fetch again next time', async () => {
    const resource = await verifiedResource('a.md', texts['a.md']!);
    fetched.mockResolvedValueOnce(encoder.encode('x'.repeat(40)));
    const cache = createCachedSkillResourceReader(fetched);

    await expect(cache.read(resource, {})).rejects.toMatchObject({ code: 'EIO' });
    expect(cache.stats().bytes).toBe(0);
    expect(new TextDecoder().decode(await cache.read(resource, {}))).toBe(texts['a.md']);
    expect(fetched).toHaveBeenCalledTimes(2);
  });

  it('should retry after the wrapped reader fails', async () => {
    const resource = await verifiedResource('a.md', texts['a.md']!);
    fetched.mockRejectedValueOnce(new Error('offline'));
    const cache = createCachedSkillResourceReader(fetched);

    await expect(cache.read(resource, {})).rejects.toThrow('offline');
    expect(new TextDecoder().decode(await cache.read(resource, {}))).toBe(texts['a.md']);
    expect(fetched).toHaveBeenCalledTimes(2);
  });

  it('should skip digest checks when verification is off', async () => {
    const resource = { ...(await verifiedResource('a.md', texts['a.md']!)), sha256: '0'.repeat(64) };
    const cache = createCachedSkillResourceReader(fetched, { verify: false });

    expect(new TextDecoder().decode(await cache.read(resource, {}))).toBe(texts['a.md']);
  });

  it('should hand out copies only when asked to', async () => {
    const resource = await verifiedResource('a.md', texts['a.md']!);
    const shared = createCachedSkillResourceReader(fetched);
    const copying = createCachedSkillResourceReader(fetched, { copy: true });

    expect(await shared.read(resource, {})).toBe(await shared.read(resource, {}));
    const first = await copying.read(resource, {});
    first.fill(0);
    expect(new TextDecoder().decode(await copying.read(resource, {}))).toBe(texts['a.md']);
  });

  it('should report each read, fetch and hit to its observer', async () => {
    const resource = await verifiedResource('a.md', texts['a.md']!);
    const events: SkillResourceCacheEvent[] = [];
    const cache = createCachedSkillResourceReader(fetched, {
      onEvent: (event, { path }) => {
        expect(path).toBe('a.md');
        events.push(event);
      },
    });

    await cache.read(resource, {});
    await cache.read(resource, {});

    expect(events).toStrictEqual(['read', 'fetch', 'read', 'hit']);
  });

  it('should feed the composed view so a repeated resource read fetches once', async () => {
    const descriptor = await verifiedResource('api-index.md', contents['api-index.md']);
    const verified: SystemSkillBundle = { ...bundle, files: [bundle.files[0]!, descriptor] };
    const cache = createCachedSkillResourceReader(reads);
    const projection = createSkillBundleOverlay(createSkillBundleRegistry([verified]), cache.read);

    await projection.read('.agents/skills/demo/api-index.md');
    await projection.read('.agents/skills/demo/api-index.md');

    expect(reads).toHaveBeenCalledOnce();
  });
});
