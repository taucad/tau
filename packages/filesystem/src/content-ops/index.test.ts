// oxlint-disable-next-line import/no-unassigned-import -- Side-effect import to polyfill IndexedDB for tests
import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { MemoryProvider } from '#backend/memory-provider.js';
import { composeView } from '#composed-view.js';
import { archive, contents, walk, withReadContentOps } from '#content-ops/index.js';
import { classify, tauPathPolicy } from '#path-registry.js';
import type { ComposedOverlayNode, ComposedViewOverlay } from '#composed-view.js';
import type { ReadContentOps, WalkEntry } from '#content-ops/index.js';

const decoder = new TextDecoder();

/** A memory provider holding exactly these root-relative files, seeded in order. */
const seeded = async (files: Record<string, string>): Promise<MemoryProvider> => {
  const provider = new MemoryProvider();
  for (const [path, text] of Object.entries(files)) {
    // oxlint-disable-next-line no-await-in-loop -- Deterministic seed order keeps the fixture readable.
    await provider.writeFile(path, text);
  }
  return provider;
};

const collect = async (entries: AsyncIterable<WalkEntry>): Promise<Array<[string, 'file' | 'dir']>> => {
  const rows: Array<[string, 'file' | 'dir']> = [];
  for await (const entry of entries) {
    rows.push([entry.relativePath, entry.kind]);
  }
  return rows;
};

/** Archived files with their bytes, excluding the parent folder rows JSZip creates on its own. */
const archived = async (blob: Blob): Promise<Record<string, string>> => {
  const jszipModule = await import('jszip');
  const jszip = jszipModule.default;
  const zip = await jszip.loadAsync(await blob.arrayBuffer());
  const files = Object.values(zip.files).filter((file) => !file.dir);
  const rows = await Promise.all(
    files.map(async (file): Promise<[string, string]> => [file.name, decoder.decode(await file.async('uint8array'))]),
  );
  return Object.fromEntries(rows.sort(([left], [right]) => left.localeCompare(right)));
};

const tree = {
  'main.ts': 'export const part = 1;',
  'src/part.ts': 'export const inner = 2;',
  'src/nested/deep.ts': 'export const deep = 3;',
  'tau.json': '{}',
} as const;

describe('walk', () => {
  it('should yield every entry under the root depth-first with its kind', async () => {
    const provider = await seeded(tree);

    expect(await collect(walk(provider, ''))).toEqual([
      ['main.ts', 'file'],
      ['src', 'dir'],
      ['src/part.ts', 'file'],
      ['src/nested', 'dir'],
      ['src/nested/deep.ts', 'file'],
      ['tau.json', 'file'],
    ]);
  });

  it('should yield paths relative to a nested root', async () => {
    const provider = await seeded(tree);

    expect(await collect(walk(provider, 'src'))).toEqual([
      ['part.ts', 'file'],
      ['nested', 'dir'],
      ['nested/deep.ts', 'file'],
    ]);
  });

  it('should read nothing beneath a directory its admits refuses', async () => {
    const provider = await seeded(tree);
    const readdirEntries = vi.spyOn(provider, 'readdirEntries');
    const readFile = vi.spyOn(provider, 'readFile');

    const rows = await collect(walk(provider, '', { admits: (relativePath) => relativePath !== 'src' }));

    expect(rows).toEqual([
      ['main.ts', 'file'],
      ['tau.json', 'file'],
    ]);
    expect(readdirEntries.mock.calls.map(([path]) => path)).toEqual(['']);
    expect(readFile).not.toHaveBeenCalled();
  });

  it('should abort before reading a directory when its signal is already aborted', async () => {
    const provider = await seeded(tree);
    const readdirEntries = vi.spyOn(provider, 'readdirEntries');

    try {
      await collect(walk(provider, '', { signal: AbortSignal.abort() }));
      expect.fail('should have thrown');
    } catch (error) {
      expect(error).toMatchObject({ name: 'AbortError' });
    }
    expect(readdirEntries).not.toHaveBeenCalled();
  });
});

describe('contents', () => {
  it('should key each file’s bytes by its path relative to the walk root', async () => {
    const provider = await seeded(tree);

    const files = await contents(provider, '');

    expect(Object.keys(files).sort()).toEqual(['main.ts', 'src/nested/deep.ts', 'src/part.ts', 'tau.json']);
    expect(decoder.decode(files['src/nested/deep.ts'])).toBe(tree['src/nested/deep.ts']);
  });
});

describe('archive', () => {
  it('should archive exactly the files the walk yields', async () => {
    const provider = await seeded(tree);

    expect(await archived(await archive(provider, ''))).toEqual({
      'main.ts': tree['main.ts'],
      'src/nested/deep.ts': tree['src/nested/deep.ts'],
      'src/part.ts': tree['src/part.ts'],
      'tau.json': tree['tau.json'],
    });
  });

  /**
   * The ceiling, not the tree, is what bounds an archive's resident bytes: the
   * whole-tree map is gone, and the ZIP writer is never handed more than the
   * ceiling plus the file that crossed it — however large the tree is.
   */
  it('should refuse an archive over its byte ceiling instead of reading the whole tree', async () => {
    const kibibyte = 'x'.repeat(1024);
    const provider = await seeded(
      Object.fromEntries(Array.from({ length: 64 }, (_, index) => [`f-${index}.txt`, kibibyte])),
    );
    let read = 0;
    const counting = Object.assign(Object.create(provider) as MemoryProvider, {
      readFile: async (path: string): Promise<Uint8Array<ArrayBuffer>> => {
        const bytes = await provider.readFile(path);
        read += bytes.byteLength;
        return bytes;
      },
    });

    await expect(archive(counting, '', { maxBytes: 4096 })).rejects.toMatchObject({ code: 'ARCHIVE_TOO_LARGE' });
    expect(read).toBeLessThanOrEqual(4096 + 1024);
  });

  it('should refuse an oversized file before reading its bytes', async () => {
    const provider = await seeded({ 'oversized.bin': 'x'.repeat(8192) });
    const readFile = vi.spyOn(provider, 'readFile');

    await expect(archive(provider, '', { maxBytes: 1024 })).rejects.toMatchObject({ code: 'ARCHIVE_TOO_LARGE' });
    expect(readFile).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Mask inheritance — the view hides, the content operation never filters
// ---------------------------------------------------------------------------

describe('content operations over a composed view', () => {
  const checkout = {
    '.git/HEAD': 'ref: refs/heads/main',
    '.tau/chats/c1.json': '{"messages":[]}',
    'src/main.ts': 'export const part = 1;',
  } as const;

  it('should omit every hidden entry without an admits argument', async () => {
    const view = composeView({ filesystem: await seeded(checkout) }, { consumer: 'user', policy: tauPathPolicy });

    const files = await contents(view, '');

    expect(Object.keys(files).sort()).toEqual(['.tau/chats/c1.json', 'src/main.ts']);
  });

  it('should archive only what the view shows', async () => {
    const view = composeView({ filesystem: await seeded(checkout) }, { consumer: 'user', policy: tauPathPolicy });

    expect(Object.keys(await archived(await archive(view, '')))).toEqual(['.tau/chats/c1.json', 'src/main.ts']);
  });
});

// ---------------------------------------------------------------------------
// versionedOnly is a caller filter, not a content-operation concern
// ---------------------------------------------------------------------------

describe('a caller-built versionedOnly admits', () => {
  it('should keep exactly the versioned project bytes', async () => {
    const provider = await seeded({
      'main.ts': 'export const part = 1;',
      'tau.json': '{}',
      '.gitignore': 'node_modules',
      '.tau/parameters/size.json': '{"width":10}',
      'thumbnail.webp': 'webp-bytes',
      'exports/part.stl': 'solid part',
      '.tau/chats/chat_a/log.json': '{"messages":[]}',
    });

    const files = await contents(provider, '', {
      admits: (relativePath, kind) => kind === 'dir' || classify(relativePath).versioned,
    });

    expect(Object.keys(files).sort()).toEqual(['.gitignore', '.tau/parameters/size.json', 'main.ts', 'tau.json']);
  });
});

// ---------------------------------------------------------------------------
// withReadContentOps — "the project" is the view's provenance, not a spelling
// ---------------------------------------------------------------------------

describe('withReadContentOps over a view carrying a system-skills overlay', () => {
  const skillsRoot = '.agents/skills';
  const unitRoot = `${skillsRoot}/demo`;
  const bundled = '# Bundled skill\n';

  /** The overlay's own tree, shaped as the skill-bundle producer builds it. */
  const overlayNodes = new Map<string, ComposedOverlayNode>([
    ['', { type: 'dir', children: ['.agents'] }],
    ['.agents', { type: 'dir', children: ['skills'] }],
    [skillsRoot, { type: 'dir', children: ['demo'] }],
    [unitRoot, { type: 'dir', children: ['SKILL.md'] }],
    [`${unitRoot}/SKILL.md`, { type: 'file', size: bundled.length, contentKind: 'text', lineCount: 2 }],
  ]);

  const project = {
    'main.ts': 'export const part = 1;',
    'tau.json': '{}',
    '.agents/skills/mine/SKILL.md': '# My own skill\n',
    'exports/part.stl': 'solid part',
  } as const;

  /** The whole-project export surface: a `'user'` view with the bundle overlay above it. */
  const exportView = async (): Promise<{
    view: ReturnType<typeof composeView> & ReadContentOps;
    read: ReturnType<typeof vi.fn<ComposedViewOverlay['read']>>;
  }> => {
    const read = vi.fn<ComposedViewOverlay['read']>(async () => new TextEncoder().encode(bundled));
    const overlay: ComposedViewOverlay = {
      root: skillsRoot,
      source: 'system-skills',
      unit: (path) =>
        path === unitRoot || path.startsWith(`${unitRoot}/`) ? { root: unitRoot, identity: 'skill:demo@1' } : undefined,
      node: (path) => overlayNodes.get(path),
      read,
    };
    const view = composeView(
      { filesystem: await seeded(project) },
      { consumer: 'user', policy: tauPathPolicy, overlays: [overlay] },
    );
    return { view: withReadContentOps(view, tauPathPolicy), read };
  };

  it('should omit every overlay entry from contents and archive', async () => {
    const { view } = await exportView();

    expect(Object.keys(await view.contents('')).sort()).toEqual([
      '.agents/skills/mine/SKILL.md',
      'exports/part.stl',
      'main.ts',
      'tau.json',
    ]);
    expect(Object.keys(await archived(await view.archive('')))).toEqual([
      '.agents/skills/mine/SKILL.md',
      'exports/part.stl',
      'main.ts',
      'tau.json',
    ]);
  });

  it('should export exactly the versioned project files when versionedOnly is set', async () => {
    const { view } = await exportView();

    expect(Object.keys(await view.contents('', { versionedOnly: true })).sort()).toEqual([
      '.agents/skills/mine/SKILL.md',
      'main.ts',
      'tau.json',
    ]);
    expect(Object.keys(await archived(await view.archive('', { versionedOnly: true })))).toEqual([
      '.agents/skills/mine/SKILL.md',
      'main.ts',
      'tau.json',
    ]);
  });

  it('should keep a project-authored skill the checkout holds beside the overlay', async () => {
    const { view } = await exportView();
    const files = await view.contents('', { versionedOnly: true });

    expect(decoder.decode(files['.agents/skills/mine/SKILL.md'])).toBe(project['.agents/skills/mine/SKILL.md']);
  });

  it('should prune an overlay unit at its root without reading its bytes', async () => {
    const { view, read } = await exportView();

    await view.archive('', { versionedOnly: true });

    expect(read).not.toHaveBeenCalled();
  });
});
