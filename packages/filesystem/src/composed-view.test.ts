import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fc from 'fast-check';

import type { FileStat, FileStatEntry } from '@taucad/types';
import { MemoryProvider } from '#backend/memory-provider.js';
import { bufferToStream } from '#backend/stream-utils.js';
import { composeView, maskedPathCode } from '#composed-view.js';
import { tauPathPolicy } from '#path-registry.js';
import { createWorkspaceFileService } from '#testing/workspace-service-harness.js';
import type { ComposedViewOverlay } from '#composed-view.js';
import type { FileReadStreamOptions, WatchEvent, WatchRequest } from '#types.js';

const encoder = new TextEncoder();
const contents = {
  'SKILL.md': '---\nname: demo\ndescription: Demo skill\n---\n',
  'api-index.md': '# Index\nneedle\n',
  'references/detail.md': '# Detail\n',
} as const;

const skillsRoot = '.agents/skills';
const demoIdentity = 'skill:demo@1.0.0#demo-fingerprint';

/** The paths the bundle overlay serves, shaped as the producer in `libs/agent-tools` builds them. */
const overlayNodes = new Map<string, { type: 'dir'; children: readonly string[] } | { type: 'file'; size: number }>([
  ['', { type: 'dir', children: ['.agents'] }],
  ['.agents', { type: 'dir', children: ['skills'] }],
  [skillsRoot, { type: 'dir', children: ['demo'] }],
  [`${skillsRoot}/demo`, { type: 'dir', children: ['SKILL.md', 'api-index.md', 'references'] }],
  [`${skillsRoot}/demo/references`, { type: 'dir', children: ['detail.md'] }],
  [`${skillsRoot}/demo/SKILL.md`, { type: 'file', size: encoder.encode(contents['SKILL.md']).byteLength }],
  [`${skillsRoot}/demo/api-index.md`, { type: 'file', size: encoder.encode(contents['api-index.md']).byteLength }],
  [
    `${skillsRoot}/demo/references/detail.md`,
    { type: 'file', size: encoder.encode(contents['references/detail.md']).byteLength },
  ],
]);

let provider: MemoryProvider;
let reads: ReturnType<typeof vi.fn<(path: string) => Promise<Uint8Array<ArrayBuffer>>>>;

const skillOverlay = (): ComposedViewOverlay => ({
  root: skillsRoot,
  source: 'system-skills',
  unit: (path) =>
    path.startsWith(`${skillsRoot}/`) && path.slice(skillsRoot.length + 1).split('/')[0] === 'demo'
      ? { root: `${skillsRoot}/demo`, identity: demoIdentity }
      : undefined,
  node: (path) => {
    const node = overlayNodes.get(path);
    if (node === undefined) {
      return undefined;
    }
    return node.type === 'dir'
      ? { type: 'dir', children: node.children }
      : {
          type: 'file',
          size: node.size,
          contentKind: 'text',
          lineCount: contents[path.slice(`${skillsRoot}/demo/`.length) as keyof typeof contents].split('\n').length,
        };
  },
  read: async (path) => reads(path),
});

const agentView = () =>
  composeView({ filesystem: provider }, { consumer: 'agent', policy: tauPathPolicy, overlays: [skillOverlay()] });
const userView = () =>
  composeView({ filesystem: provider }, { consumer: 'user', policy: tauPathPolicy, overlays: [skillOverlay()] });

beforeEach(async () => {
  provider = new MemoryProvider();
  await provider.writeFile('main.ts', 'export {};\n');
  reads = vi.fn(async (path: string) =>
    encoder.encode(contents[path.slice(`${skillsRoot}/demo/`.length) as keyof typeof contents]),
  );
});

describe('composeView overlays', () => {
  it('should expose overlay files through the checkout-relative tree without reading bytes', async () => {
    const view = agentView();

    expect(reads).not.toHaveBeenCalled();
    expect(await view.readdir('')).toContain('.agents');
    expect(await view.readdir(skillsRoot)).toContain('demo');
    expect(await view.readdir(`${skillsRoot}/demo`)).toStrictEqual(['SKILL.md', 'api-index.md', 'references']);
    expect(await view.exists(`${skillsRoot}/demo/references/detail.md`)).toBe(true);
    expect(await view.stat(`${skillsRoot}/demo/api-index.md`)).toMatchObject({
      type: 'file',
      contentKind: 'text',
      lineCount: 3,
    });
    expect(reads).not.toHaveBeenCalled();
    expect(await view.readFile(`${skillsRoot}/demo/api-index.md`, 'utf8')).toBe(contents['api-index.md']);
    expect(reads).toHaveBeenCalledOnce();
  });

  /* Mount-provenance V8: a bundle is a version, never a pile of files. */
  it('should let any project child replace the complete overlay unit', async () => {
    await provider.mkdir(`${skillsRoot}/demo`, { recursive: true });
    await provider.writeFile(`${skillsRoot}/demo/SKILL.md`, 'user\n');
    const view = agentView();

    expect(await view.readFile(`${skillsRoot}/demo/SKILL.md`, 'utf8')).toBe('user\n');
    expect(await view.exists(`${skillsRoot}/demo/api-index.md`)).toBe(false);
    await expect(view.readFile(`${skillsRoot}/demo/api-index.md`)).rejects.toBeInstanceOf(Error);
    expect(await view.provenance(`${skillsRoot}/demo/SKILL.md`)).toStrictEqual({
      source: 'project',
      versioned: true,
      agentAccess: 'read-write',
      overrides: demoIdentity,
    });
    expect(reads).not.toHaveBeenCalled();
  });

  it('should fail closed when a project file collides with an overlay unit root', async () => {
    await provider.mkdir(skillsRoot, { recursive: true });
    await provider.writeFile(`${skillsRoot}/demo`, 'not a directory\n');
    const view = agentView();

    expect(await view.readdir(skillsRoot)).toStrictEqual(['demo']);
    await expect(view.readFile(`${skillsRoot}/demo/api-index.md`)).rejects.toBeInstanceOf(Error);
    expect(reads).not.toHaveBeenCalled();
  });

  it('should reject every mutation into an overlay with EROFS and keep the read open', async () => {
    const view = agentView();
    const path = `${skillsRoot}/demo/api-index.md`;

    await expect(view.writeFile(path, 'x')).rejects.toMatchObject({ code: 'EROFS' });
    await expect(view.unlink(path)).rejects.toMatchObject({ code: 'EROFS' });
    await expect(view.rename(path, 'copy.md')).rejects.toMatchObject({ code: 'EROFS' });
    await expect(view.mkdir(`${skillsRoot}/demo/more`)).rejects.toMatchObject({ code: 'EROFS' });
    expect(await view.readFile(path, 'utf8')).toBe(contents['api-index.md']);
  });

  /* The overlay is read-only for the user too; only the mask differs (L4). */
  it('should refuse an overlay write for the user consumer as well', async () => {
    await expect(userView().writeFile(`${skillsRoot}/demo/SKILL.md`, 'x')).rejects.toMatchObject({ code: 'EROFS' });
  });

  it('should reject invalid and undeclared paths before reading bytes', async () => {
    const view = agentView();

    await expect(view.readFile('../outside')).rejects.toMatchObject({ code: 'PATH_OUTSIDE_ROOT' });
    await expect(view.readFile(String.raw`.agents\skills\demo\api-index.md`)).rejects.toMatchObject({
      code: 'INVALID_PATH',
    });
    await expect(view.readFile(`${skillsRoot}/demo/missing.md`)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(view.readFile(`${skillsRoot}/other/api-index.md`)).rejects.toBeInstanceOf(Error);
    expect(reads).not.toHaveBeenCalled();
  });

  it('should refuse an overlay file whose bytes do not match its declared length', async () => {
    reads.mockResolvedValueOnce(encoder.encode('short'));

    await expect(agentView().readFile(`${skillsRoot}/demo/api-index.md`)).rejects.toMatchObject({ code: 'EIO' });
  });
});

/*
 * A1 review R5: three optional provider members the mask wrapper forwarded and
 * the view dropped. A bridge handler that loses `refresh` is a stale listing
 * waiting to happen.
 */
/* A1 review R6: `ComposedViewOverlay.root` was declared and never read. */
describe('composeView overlay root', () => {
  it('should not ask an overlay about a path outside its root', async () => {
    const projection = skillOverlay();
    const unit = vi.fn(projection.unit);
    const node = vi.fn(projection.node);
    const view = composeView(
      { filesystem: provider },
      { consumer: 'user', policy: tauPathPolicy, overlays: [{ ...projection, unit, node }] },
    );

    expect(await view.readFile('main.ts', 'utf8')).toBe('export {};\n');
    expect(unit).not.toHaveBeenCalled();
    expect(node).not.toHaveBeenCalled();
    /* The directories above the root still merge, so they are still asked. */
    expect(await view.readdir('.agents')).toContain('skills');
    expect(node).toHaveBeenCalled();
  });

  /* A2 re-review R13: `''` is every path's ancestor, so an overlay composed at
     the checkout root touches everything. */
  it('should honour an overlay composed at the checkout root', async () => {
    const view = composeView(
      { filesystem: provider },
      {
        consumer: 'user',
        policy: tauPathPolicy,
        overlays: [
          {
            root: '',
            source: 'dependencies',
            unit: (path) => (path === 'vendored.ts' ? { root: 'vendored.ts', identity: 'pkg@1.0.0' } : undefined),
            node: (path) =>
              path === ''
                ? { type: 'dir', children: ['vendored.ts'] }
                : { type: 'file', size: 3, contentKind: 'text', lineCount: 1 },
            read: async () => encoder.encode('one'),
          },
        ],
      },
    );

    expect(await view.readFile('vendored.ts', 'utf8')).toBe('one');
    expect(await view.readdir('')).toContain('vendored.ts');
  });
});

describe('composeView optional provider members', () => {
  const streaming = () => {
    const refresh = vi.fn(async (_prefixes?: readonly string[]) => undefined);
    const base = Object.assign(Object.create(provider) as MemoryProvider, {
      /* A provider honours the requested window itself, as every real one does
       * through `bufferToStream`; the wrapper forwards it rather than slicing. */
      readFileStream: (path: string, streamOptions?: FileReadStreamOptions) => {
        let inner: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>> | undefined;
        return new ReadableStream<Uint8Array<ArrayBuffer>>({
          async pull(controller) {
            inner ??= bufferToStream(await provider.readFile(path), streamOptions).getReader();
            const chunk = await inner.read();
            if (chunk.done) {
              controller.close();
            } else {
              controller.enqueue(chunk.value);
            }
          },
        });
      },
      refresh,
    });
    return {
      refresh,
      view: composeView({ filesystem: base }, { consumer: 'agent', policy: tauPathPolicy, overlays: [skillOverlay()] }),
    };
  };

  const collect = async (stream: ReadableStream<Uint8Array<ArrayBuffer>>): Promise<string> =>
    new Response(stream).text();

  it('should stream the project bytes and the overlay bytes through one reader', async () => {
    const { view } = streaming();

    expect(await collect(view.readFileStream!('main.ts'))).toBe('export {};\n');
    expect(await collect(view.readFileStream!(`${skillsRoot}/demo/api-index.md`))).toBe(contents['api-index.md']);
    /* The mask refuses before the stream exists — no I/O, nothing to cancel. */
    expect(() => view.readFileStream!('.git/HEAD')).toThrow(/exists in a composed view/u);
  });

  /* A2 re-review R12: the wrapper forwarded `position`/`length`/`signal` on one
     branch and dropped them on the other, so a ranged read of an overlay path
     answered the whole file. */
  it('should serve a byte window and honour an abort signal on either route', async () => {
    const { view } = streaming();

    expect(await collect(view.readFileStream!(`${skillsRoot}/demo/api-index.md`, { position: 2, length: 5 }))).toBe(
      contents['api-index.md'].slice(2, 7),
    );
    expect(await collect(view.readFileStream!('main.ts', { position: 7 }))).toBe('export {};\n'.slice(7));
    await expect(collect(view.readFileStream!('main.ts', { signal: AbortSignal.abort() }))).rejects.toThrow();
  });

  /* A project file rides the provider's own stream: the wrapper buffered every
   * route whole, so a chunked provider arrived as one chunk (W9b). */
  it('should stream a project file through the provider chunks the base emits', async () => {
    const base = Object.assign(Object.create(provider) as MemoryProvider, {
      readFileStream: (path: string) =>
        new ReadableStream<Uint8Array<ArrayBuffer>>({
          async start(controller) {
            const bytes = await provider.readFile(path);
            controller.enqueue(bytes.subarray(0, 4));
            controller.enqueue(bytes.subarray(4));
            controller.close();
          },
        }),
    });
    const view = composeView({ filesystem: base }, { consumer: 'agent', policy: tauPathPolicy });

    const chunks: number[] = [];
    for await (const chunk of view.readFileStream!('main.ts') as unknown as AsyncIterable<Uint8Array<ArrayBuffer>>) {
      chunks.push(chunk.byteLength);
    }

    expect(chunks).toEqual([4, 'export {};\n'.length - 4]);
  });

  it('should answer readdirEntries from the merged listing', async () => {
    const { view } = streaming();

    /* Each row keeps the provenance the merge computed, so a walk over the view
     * can filter on it without asking again. */
    const provenance = { source: 'system-skills', versioned: false, agentAccess: 'read-only', identity: demoIdentity };
    expect(await view.readdirEntries!(`${skillsRoot}/demo`)).toStrictEqual([
      { name: 'SKILL.md', kind: 'file', provenance },
      { name: 'api-index.md', kind: 'file', provenance },
      { name: 'references', kind: 'dir', provenance },
    ]);
  });

  it('should forward refresh to the checkout it composes', async () => {
    const { refresh, view } = streaming();

    await view.refresh!(['src']);
    expect(refresh).toHaveBeenCalledWith(['src']);
  });
});

describe('composeView provenance', () => {
  it('should report the overlay source, identity and read-only access for an overlay entry', async () => {
    expect(await agentView().provenance(`${skillsRoot}/demo/SKILL.md`)).toStrictEqual({
      source: 'system-skills',
      versioned: false,
      agentAccess: 'read-only',
      identity: demoIdentity,
    });
  });

  it('should report the registry answer and the checkout identity for a project entry', async () => {
    const view = composeView({ filesystem: provider, id: 'chk_live' }, { consumer: 'user', policy: tauPathPolicy });

    expect(await view.provenance('main.ts')).toStrictEqual({
      source: 'project',
      versioned: true,
      agentAccess: 'read-write',
      identity: 'chk_live',
    });
    expect(await view.provenance('.tau/chats/chat-1/events.jsonl')).toStrictEqual({
      source: 'project',
      versioned: false,
      agentAccess: 'read-only',
      identity: 'chk_live',
    });
  });

  it('should stamp every row of a directory listing', async () => {
    const rows = await agentView().readdirWithStats(`${skillsRoot}/demo`);

    expect(rows.map(({ name, provenance }) => [name, provenance?.source])).toStrictEqual([
      ['SKILL.md', 'system-skills'],
      ['api-index.md', 'system-skills'],
      ['references', 'system-skills'],
    ]);
    const projectRows = await agentView().readdirWithStats('');
    expect(projectRows.find(({ name }) => name === 'main.ts')?.provenance?.source).toBe('project');
  });
});

describe('composeView agent mask', () => {
  beforeEach(async () => {
    await provider.mkdir('.tau/export', { recursive: true });
    await provider.writeFile('.tau/export/preferences.json', '{"format":"step"}\n');
    await provider.mkdir('.tau/chats/chat-1', { recursive: true });
    await provider.writeFile('.tau/chats/chat-1/events.jsonl', '{"type":"run.lifecycle"}\n');
    await provider.mkdir('.tau/runs', { recursive: true });
    await provider.writeFile('.tau/runs/run-1.json', '{}\n');
    await provider.mkdir('.git/refs/heads', { recursive: true });
    await provider.writeFile('.git/HEAD', 'ref: refs/heads/main\n');
    await provider.writeFile('.tau/binding.json', '{}\n');
  });

  /* North-star acceptance 6 (S18, A9): the control plane never reaches provider
   * I/O, so `list_directory('.tau')` shows the host's records and never the
   * revision store. */
  it('should hide the control plane from a listing and from a read, and keep records readable', async () => {
    const view = agentView();

    const controlPlane = await view.readdir('.tau');
    expect(controlPlane.toSorted()).toStrictEqual(['chats', 'export', 'runs']);
    /* The store moved to the project root under D29, so the listing half of
     * this pin belongs at the root too. */
    expect(await view.readdir('')).not.toContain('.git');
    await expect(view.readFile('.git/HEAD')).rejects.toMatchObject({
      code: 'EPERM',
      reason: 'WORKSPACE_MASKED_PATH',
    });
    expect(await view.exists('.tau/binding.json')).toBe(false);

    expect(await view.readFile('.tau/chats/chat-1/events.jsonl', 'utf8')).toBe('{"type":"run.lifecycle"}\n');
    expect(await view.readFile('.tau/export/preferences.json', 'utf8')).toBe('{"format":"step"}\n');
    await expect(view.writeFile('.tau/export/preferences.json', '{}\n')).rejects.toMatchObject({
      code: 'EROFS',
      reason: 'WORKSPACE_MASKED_PATH',
    });
    await expect(view.writeFile('.tau/runs/run-1.json', 'forged')).rejects.toMatchObject({
      code: 'EROFS',
      reason: 'WORKSPACE_MASKED_PATH',
    });
  });

  it('should refuse every write under the control plane and the record families', async () => {
    const view = agentView();

    await expect(view.writeFile('.tau/chats/chat-1/events.jsonl', 'forged\n')).rejects.toMatchObject({
      code: 'EROFS',
      reason: 'WORKSPACE_MASKED_PATH',
    });
    /* The browser port's object store is revision evidence (RC6 S5 gate 15):
     * an agent that could write it could forge the account of its own turn. */
    await expect(view.writeFile('.git/objects/ab/cdef', 'forged')).rejects.toMatchObject({
      code: 'EPERM',
      reason: 'WORKSPACE_MASKED_PATH',
    });
    /* The engine stores are the same evidence on a disk host (8-review S3). */
    await expect(view.writeFile('.jj/repo/store/forged', 'forged')).rejects.toMatchObject({ code: 'EPERM' });
    await expect(view.writeFile('.git/refs/heads/main', 'forged')).rejects.toMatchObject({ code: 'EPERM' });
    /* Reads stay open: an agent may read back the account of its own turn. */
    expect(await view.readFile('.tau/chats/chat-1/events.jsonl', 'utf8')).toBe('{"type":"run.lifecycle"}\n');
  });

  /* G0-1, G0-5: this provider is case-sensitive, so `.Git` is a directory of its
   * own here — and on the disks a `NodeFsProvider` actually runs on it is the
   * project's own store. The view refuses it for both consumers at every depth,
   * so the answer never depends on the filesystem underneath. */
  it.each(['user', 'agent'] as const)(
    'should refuse a case-folded control plane for the %s consumer',
    async (consumer) => {
      await provider.mkdir('.Git', { recursive: true });
      await provider.writeFile('.Git/config', '[remote "origin"]\n');
      await provider.mkdir('vendor/.GIT', { recursive: true });
      await provider.writeFile('vendor/.GIT/config', '[remote "origin"]\n');
      const view = composeView({ filesystem: provider }, { consumer, policy: tauPathPolicy });

      expect(await view.readdir('')).not.toContain('.Git');
      await expect(view.readFile('.Git/config', 'utf8')).rejects.toMatchObject({ code: 'EPERM' });
      await expect(view.readFile('vendor/.GIT/config', 'utf8')).rejects.toMatchObject({ code: 'EPERM' });
      await expect(view.writeFile('.Git/config', 'forged')).rejects.toMatchObject({ code: 'EPERM' });
      await expect(view.writeFile('vendor/.GIT/hooks/pre-commit', 'forged')).rejects.toMatchObject({ code: 'EPERM' });
    },
  );

  /* `.tau` is Tau's namespace, so a spelling the filesystem folds onto it is the
   * row it folds to: this provider is case-sensitive, but on the disks a
   * `NodeFsProvider` runs on `.TAU/chats/**` is the agent's own durable log, and
   * calling it authored made it the agent's to rewrite. */
  it('should answer the folded `.tau` row for an agent rather than the authored default', async () => {
    await provider.mkdir('.TAU/chats/c1', { recursive: true });
    await provider.writeFile('.TAU/chats/c1/events.jsonl', '{"type":"run.lifecycle"}\n');
    await provider.writeFile('.TAU/parameters/main.json', '{}\n');
    await provider.writeFile('.Tau/library.json', '{}\n');
    await provider.writeFile('.TAU/binding.json', '{}\n');
    const view = agentView();

    await expect(view.writeFile('.TAU/chats/c1/events.jsonl', 'forged\n')).rejects.toMatchObject({
      code: 'EROFS',
      reason: 'WORKSPACE_MASKED_PATH',
    });
    /* Records stay readable to an agent, so this cannot pass by the whole
     * subtree having been hidden. */
    expect(await view.readFile('.TAU/chats/c1/events.jsonl', 'utf8')).toBe('{"type":"run.lifecycle"}\n');
    expect(await view.exists('.Tau/library.json')).toBe(false);
    expect(await view.exists('.TAU/binding.json')).toBe(false);
    /* The authored controls keep their own row through the fold. */
    await expect(view.writeFile('.TAU/parameters/main.json', '{"a":1}\n')).resolves.toBeUndefined();
  });

  it('should hide a folded `.tau` family from the user consumer too', async () => {
    await provider.writeFile('.Tau/library.json', '{}\n');
    await provider.writeFile('.TAU/binding.json', '{}\n');
    const view = userView();

    expect(await view.exists('.Tau/library.json')).toBe(false);
    await expect(view.readFile('.Tau/library.json', 'utf8')).rejects.toMatchObject({ code: 'EPERM' });
    await expect(view.readFile('.TAU/binding.json', 'utf8')).rejects.toMatchObject({ code: 'EPERM' });
  });

  /* G0-3: the cache row matched `node_modules` first, so a dependency's own
   * store was the agent's to read and write. */
  it('should refuse a repository vendored inside the cache', async () => {
    await provider.mkdir('node_modules/pkg/.git', { recursive: true });
    await provider.writeFile('node_modules/pkg/.git/config', '[remote "origin"]\n');
    const view = agentView();

    expect(await view.readdir('node_modules/pkg')).not.toContain('.git');
    await expect(view.readFile('node_modules/pkg/.git/config', 'utf8')).rejects.toMatchObject({ code: 'EPERM' });
    await expect(view.writeFile('node_modules/pkg/.git/hooks/pre-commit', 'forged')).rejects.toMatchObject({
      code: 'EPERM',
    });
  });

  it('should show the user consumer the records the agent may not write, and no control plane (P30)', async () => {
    const view = userView();

    const records = await view.readdir('.tau');
    expect(records.toSorted()).toStrictEqual(['chats', 'export', 'runs']);
    expect(await view.exists('.git/HEAD')).toBe(false);
    await expect(view.readFile('.git/HEAD', 'utf8')).rejects.toMatchObject({ code: 'EPERM' });
    await expect(view.writeFile('.tau/chats/chat-1/events.jsonl', '')).resolves.toBeUndefined();
    await expect(view.writeFile('.tau/export/preferences.json', '{"format":"stl"}\n')).resolves.toBeUndefined();
    expect(await view.readFile('.tau/export/preferences.json', 'utf8')).toBe('{"format":"stl"}\n');
  });
});

/*
 * D6: the view is a mechanism and the reserved layout is data. The registry is
 * one instance of the port, not a dependency of the mask.
 */
describe('composeView path policy', () => {
  it('should classify generated project views only by project-relative path', async () => {
    const context = await createWorkspaceFileService();
    const segment = fc
      .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_-'), { minLength: 1, maxLength: 10 })
      .map((characters) => characters.join(''));

    try {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'), { minLength: 21, maxLength: 21 }),
          segment,
          fc.array(segment, { minLength: 1, maxLength: 4 }),
          async (projectCharacters, providerBasePath, pathSegments) => {
            const projectId = `proj_${projectCharacters.join('')}`;
            const path = pathSegments.join('/');
            await context.provider.mkdir(providerBasePath, { recursive: true });
            await context.provider.writeFile(`${providerBasePath}/${path}`, 'project data');
            await context.service.configureProjectRoots({
              projects: [{ projectId, backend: 'memory', storageRootKey: 'memory:0', providerBasePath }],
              roots: [],
            });
            const classify = vi.fn(tauPathPolicy.classify);
            const view = composeView(
              { filesystem: context.service.createRootedFileSystem(`/projects/${projectId}`) },
              { consumer: 'agent', policy: { classify } },
            );

            await expect(view.readFile(path, 'utf8')).resolves.toBe('project data');
            expect(classify).toHaveBeenCalledWith(path);
            expect(classify.mock.calls.every(([classified]) => !classified.startsWith('/'))).toBe(true);
            expect(classify.mock.calls.every(([classified]) => !classified.includes(projectId))).toBe(true);
          },
        ),
      );
    } finally {
      context.service.dispose();
    }
  });

  it('should mask by the injected policy rather than by the Tau registry', async () => {
    await provider.writeFile('secret/key.pem', 'private\n');
    await provider.writeFile('.git/HEAD', 'ref: refs/heads/main\n');
    const view = composeView(
      { filesystem: provider },
      {
        consumer: 'agent',
        policy: {
          classify: (path) =>
            path === 'secret' || path.startsWith('secret/')
              ? { class: 'control-plane', versioned: false, agentAccess: 'hidden', watch: 'none' }
              : { class: 'authored', versioned: true, agentAccess: 'read-write', watch: 'ui' },
        },
      },
    );

    await expect(view.readFile('secret/key.pem')).rejects.toMatchObject({
      code: 'EPERM',
      reason: 'WORKSPACE_MASKED_PATH',
    });
    expect(await view.readdir('')).not.toContain('secret');
    /* The Tau registry hides `.git`; this policy does not, and the view obeys
     * the policy it was given. */
    expect(await view.readFile('.git/HEAD', 'utf8')).toBe('ref: refs/heads/main\n');
    expect(await view.provenance('.git/HEAD')).toMatchObject({ versioned: true, agentAccess: 'read-write' });
  });
});

describe('composeView index-backed reads', () => {
  /** A rooted filesystem whose index is a fixed list, so the mask is the only variable. */
  const indexed = (entries: ReadonlyArray<{ path: string; type: 'file' | 'dir' }>) => {
    type Admits = (path: string, kind: 'file' | 'dir') => boolean;
    const rows: FileStatEntry[] = entries.map(({ path, type }) =>
      type === 'file'
        ? { path, name: path.split('/').at(-1)!, type, size: 1, mtimeMs: 0, contentKind: 'binary' }
        : { path, name: path.split('/').at(-1)!, type, size: 1, mtimeMs: 0 },
    );
    const admitted = (queryRoot: string, admits?: Admits) =>
      rows
        .filter(({ path }) => queryRoot === '' || path.startsWith(`${queryRoot}/`))
        .map((row) => ({ ...row, path: queryRoot === '' ? row.path : row.path.slice(queryRoot.length + 1) }))
        .filter(({ path, type }) => admits?.(path, type) !== false);
    return Object.assign(new MemoryProvider(), {
      search: async (query: string, options?: { maxResults?: number; admits?: Admits }) =>
        admitted('', options?.admits)
          .filter(({ path }) => path.includes(query))
          .slice(0, options?.maxResults ?? 100),
      statTree: async (path: string, options?: { admits?: Admits }) => admitted(path, options?.admits),
    });
  };

  it('refuses the control plane before the descent, so a capped search still fills its cap', async () => {
    const view = composeView(
      {
        filesystem: indexed([
          { path: '.git', type: 'dir' },
          { path: '.git/a.ts', type: 'file' },
          { path: '.git/b.ts', type: 'file' },
          { path: 'src', type: 'dir' },
          { path: 'src/c.ts', type: 'file' },
          { path: 'src/d.ts', type: 'file' },
        ]),
      },
      { consumer: 'agent', policy: tauPathPolicy },
    );

    /* Two of the four `.ts` rows are the control plane's; the cap must be spent
     * on the two a consumer may see, not filtered down to nothing afterwards. */
    await expect(view.search!('.ts', { maxResults: 2 })).resolves.toMatchObject([
      { path: 'src/c.ts' },
      { path: 'src/d.ts' },
    ]);
  });

  it('masks a recursive stat relative to the directory it was asked about', async () => {
    const view = composeView(
      {
        filesystem: indexed([
          { path: '.git', type: 'dir' },
          { path: '.git/HEAD', type: 'file' },
          { path: 'src/main.ts', type: 'file' },
        ]),
      },
      { consumer: 'user', policy: tauPathPolicy },
    );

    await expect(view.statTree!('')).resolves.toMatchObject([{ path: 'src/main.ts' }]);
    await expect(view.statTree!('.git')).rejects.toMatchObject({ code: 'EPERM' });
  });

  it('offers neither read when the composed filesystem has no index', async () => {
    const view = composeView({ filesystem: provider }, { consumer: 'user', policy: tauPathPolicy });

    expect(view.search).toBeUndefined();
    expect(view.statTree).toBeUndefined();
  });
});

describe('composeView mutating porcelain', () => {
  type Admits = (relativePath: string, kind: 'file' | 'dir') => boolean;

  /** A rooted surface that records what the view asked of it, and nothing else. */
  const porcelain = () => {
    const calls = {
      copyTree: vi.fn<(source: string, target: string, options?: { admits?: Admits }) => Promise<void>>(
        async () => undefined,
      ),
      duplicate: vi.fn<(source: string, target: string) => Promise<void>>(async () => undefined),
      move: vi.fn(
        async (): Promise<FileStat> => ({ type: 'file', size: 0, mtimeMs: 0, contentKind: 'text', lineCount: 0 }),
      ),
      bulkMove: vi.fn(async () => ({ moved: [], failed: [] })),
      writeFiles: vi.fn<(files: Record<string, { content: string | Uint8Array<ArrayBuffer> }>) => Promise<void>>(
        async () => undefined,
      ),
      canMove: vi.fn<(source: string, target: string) => Promise<true>>(async () => true),
      canRename: vi.fn<(source: string, newName: string) => Promise<true>>(async () => true),
      canCreate: vi.fn<(path: string, kind: 'file' | 'directory') => Promise<true>>(async () => true),
      canDelete: vi.fn<(path: string) => Promise<true>>(async () => true),
    };
    return Object.assign(new MemoryProvider(), calls);
  };

  it('should refuse a hidden operand before the rooted surface is asked', async () => {
    const base = porcelain();
    const view = composeView({ filesystem: base }, { consumer: 'user', policy: tauPathPolicy });

    await expect(view.copyTree!('.git', 'backup')).rejects.toMatchObject({
      code: 'EPERM',
      reason: maskedPathCode,
    });
    await expect(view.copyTree!('src', '.git/backup')).rejects.toMatchObject({ code: 'EPERM' });
    await expect(view.move!('src/main.ts', '.git/main.ts')).rejects.toMatchObject({ code: 'EPERM' });
    await expect(view.duplicate!('.git/HEAD', 'head.txt')).rejects.toMatchObject({ code: 'EPERM' });
    await expect(view.bulkMove!([{ source: 'src/a.ts', target: '.git/a.ts' }])).rejects.toMatchObject({
      code: 'EPERM',
    });
    await expect(view.writeFiles!({ '.git/HEAD': { content: 'ref' } })).rejects.toMatchObject({ code: 'EPERM' });
    await expect(view.canMove!('.git/HEAD', 'head.txt')).rejects.toMatchObject({ code: 'EPERM' });
    await expect(view.canCreate!('.git/HEAD', 'file')).rejects.toMatchObject({ code: 'EPERM' });
    await expect(view.canDelete!('.git/HEAD')).rejects.toMatchObject({ code: 'EPERM' });

    expect(base.copyTree).not.toHaveBeenCalled();
    expect(base.move).not.toHaveBeenCalled();
    expect(base.duplicate).not.toHaveBeenCalled();
    expect(base.bulkMove).not.toHaveBeenCalled();
    expect(base.writeFiles).not.toHaveBeenCalled();
    expect(base.canMove).not.toHaveBeenCalled();
    expect(base.canCreate).not.toHaveBeenCalled();
    expect(base.canDelete).not.toHaveBeenCalled();
  });

  it('should refuse a records target for an agent and admit it for a host', async () => {
    const agentBase = porcelain();
    const hostBase = porcelain();

    await expect(
      composeView({ filesystem: agentBase }, { consumer: 'agent', policy: tauPathPolicy }).writeFiles!({
        '.tau/chats/c1.json': { content: '{}' },
      }),
    ).rejects.toMatchObject({ code: 'EROFS', reason: maskedPathCode });
    expect(agentBase.writeFiles).not.toHaveBeenCalled();

    await composeView({ filesystem: hostBase }, { consumer: 'user', policy: tauPathPolicy }).writeFiles!({
      '.tau/chats/c1.json': { content: '{}' },
    });
    expect(hostBase.writeFiles).toHaveBeenCalledOnce();
  });

  it('should hand the copy its own mask as the entry filter, spelled from the source', async () => {
    const base = porcelain();
    const view = composeView({ filesystem: base }, { consumer: 'user', policy: tauPathPolicy });

    await view.copyTree!('', 'backup');
    const wholeProject = base.copyTree.mock.calls[0]![2]!.admits!;
    expect(wholeProject('.git', 'dir')).toBe(false);
    expect(wholeProject('src/main.ts', 'file')).toBe(true);

    await view.copyTree!('src', 'backup');
    const midTree = base.copyTree.mock.calls[1]![2]!.admits!;
    /* Project-relative: `src/exports` is not the records family, `exports` under
     * the project root is — the filter must join the copy root before it asks.
     * A repository is the control plane wherever it sits, so `src/.git` is
     * refused at this depth too (CI1). */
    expect(midTree('exports', 'dir')).toBe(true);
    expect(midTree('main.ts', 'file')).toBe(true);
    expect(midTree('.git', 'dir')).toBe(false);
  });

  it('should narrow, never widen, a caller filter on a copy', async () => {
    const base = porcelain();
    const view = composeView({ filesystem: base }, { consumer: 'user', policy: tauPathPolicy });

    await view.copyTree!('', 'backup', { admits: (relativePath) => relativePath !== 'src' });
    const admits = base.copyTree.mock.calls[0]![2]!.admits!;

    expect(admits('src', 'dir')).toBe(false);
    expect(admits('.git', 'dir')).toBe(false);
    expect(admits('tau.json', 'file')).toBe(true);
  });

  it('should refuse a write under an overlay root', async () => {
    const base = porcelain();
    const view = composeView(
      { filesystem: base },
      { consumer: 'user', policy: tauPathPolicy, overlays: [skillOverlay()] },
    );

    await expect(view.copyTree!('src', `${skillsRoot}/demo`)).rejects.toMatchObject({ code: 'EROFS' });
    expect(base.copyTree).not.toHaveBeenCalled();
  });

  /* Review N1: the overlay's bytes are the view's to serve and the checkout's to
   * know nothing about, so a copy out of one is refused here rather than handed
   * down as a path the base can only answer ENOENT for. */
  it('should refuse an overlay source for a copy and for a duplicate', async () => {
    const base = porcelain();
    const view = composeView(
      { filesystem: base },
      { consumer: 'user', policy: tauPathPolicy, overlays: [skillOverlay()] },
    );

    await expect(view.copyTree!(`${skillsRoot}/demo`, 'vendored')).rejects.toMatchObject({ code: 'EROFS' });
    await expect(view.duplicate!(`${skillsRoot}/demo/SKILL.md`, 'skill.md')).rejects.toMatchObject({ code: 'EROFS' });
    expect(base.copyTree).not.toHaveBeenCalled();
    expect(base.duplicate).not.toHaveBeenCalled();
  });

  it('should offer no porcelain when the composed filesystem serves none', () => {
    const view = composeView({ filesystem: provider }, { consumer: 'user', policy: tauPathPolicy });

    expect(view.copyTree).toBeUndefined();
    expect(view.move).toBeUndefined();
    expect(view.canMove).toBeUndefined();
  });
});

/*
 * G0b-1: the explicit `watch` is a second event stream on the same view. The
 * bridge masks its own broadcast; this one reaches the wire for a rooted agent
 * connection, and on the node composed views (host daemon, desktop) it is the
 * only stream there is, with no bridge in front of it.
 */
describe('composeView watch mask', () => {
  /** The memory provider with a watch surface, so the mask is the only variable. */
  const watchable = () => {
    const stop = vi.fn();
    const subscriptions: Array<{ request: WatchRequest; handler: (event: WatchEvent) => void }> = [];
    const base = Object.assign(new MemoryProvider(), {
      watch: (request: WatchRequest, handler: (event: WatchEvent) => void) => {
        subscriptions.push({ request, handler });
        return stop;
      },
    });
    return { base, subscriptions, stop };
  };

  it('should drop every hidden path from a recursive subscription', () => {
    const { base, subscriptions } = watchable();
    const view = composeView({ filesystem: base }, { consumer: 'agent', policy: tauPathPolicy });
    const received: WatchEvent[] = [];

    view.watch!({ paths: [''], recursive: true }, (event) => {
      received.push(event);
    });
    for (const path of [
      'src/main.ts',
      '.git/HEAD',
      'vendor/x/.git/HEAD',
      '.tau/binding.json',
      `${skillsRoot}/demo/SKILL.md`,
    ]) {
      subscriptions[0]!.handler({ type: 'change', path });
    }
    subscriptions[0]!.handler({ type: 'delete', path: '.git/index' });
    subscriptions[0]!.handler({ type: 'reset' });

    expect(received).toStrictEqual([
      { type: 'change', path: 'src/main.ts' },
      { type: 'change', path: `${skillsRoot}/demo/SKILL.md` },
      { type: 'reset' },
    ]);
  });

  it('should refuse a hidden request path before the base is subscribed', () => {
    const { base, subscriptions } = watchable();
    const view = composeView({ filesystem: base }, { consumer: 'agent', policy: tauPathPolicy });

    expect(() => view.watch!({ paths: ['.git'] }, () => undefined)).toThrow(
      expect.objectContaining({ code: 'EPERM', reason: maskedPathCode }),
    );
    expect(() => view.watch!({ paths: ['src', 'vendor/x/.git'] }, () => undefined)).toThrow(
      expect.objectContaining({ code: 'EPERM' }),
    );
    expect(subscriptions).toStrictEqual([]);
  });

  /* Degraded exactly as the bridge's `scopeEventToRoot` degrades an event whose
   * other end left the root: the visible end survives as a create or a delete. */
  it('should deliver only the visible end of a rename', () => {
    const { base, subscriptions, stop } = watchable();
    const view = composeView({ filesystem: base }, { consumer: 'user', policy: tauPathPolicy });
    const received: WatchEvent[] = [];

    const unsubscribe = view.watch!({ paths: [''], recursive: true }, (event) => {
      received.push(event);
    });
    const { handler } = subscriptions[0]!;
    handler({ type: 'rename', oldPath: '.git/HEAD', newPath: 'src/leaked.ts' });
    handler({ type: 'rename', oldPath: 'src/leaked.ts', newPath: '.git/HEAD' });
    handler({ type: 'rename', oldPath: '.git/HEAD', newPath: '.git/ORIG_HEAD' });
    handler({ type: 'rename', oldPath: 'src/a.ts', newPath: 'src/b.ts' });

    expect(received).toStrictEqual([
      { type: 'change', path: 'src/leaked.ts' },
      { type: 'delete', path: 'src/leaked.ts' },
      { type: 'rename', oldPath: 'src/a.ts', newPath: 'src/b.ts' },
    ]);
    /* The base's own disposer is what the caller gets back, so a `watch` that
     * answers a promise of one — `NodeFsProviderClient` — still works. */
    expect(unsubscribe).toBe(stop);
  });
});

/*
 * G0b-2, CI1: "no consumer can write beneath one" has to include removing one.
 * A recursive removal and a directory move reach paths nobody named, so the mask
 * cannot answer from the operand alone.
 */
describe('composeView subtree-wide mutations', () => {
  /** A base that records the removals and moves the view passes down. */
  const recursive = () =>
    Object.assign(new MemoryProvider(), {
      rmdir: vi.fn<(path: string, options?: { recursive?: boolean }) => Promise<void>>(async () => undefined),
      move: vi.fn(
        async (): Promise<FileStat> => ({ type: 'file', size: 0, mtimeMs: 0, contentKind: 'text', lineCount: 0 }),
      ),
    });

  const seedVendoredStore = async (base: MemoryProvider): Promise<void> => {
    await base.writeFile('vendor/dep/.git/config', '[remote "origin"]\n');
    await base.writeFile('vendor/dep/index.js', 'module.exports = 1;\n');
    await base.writeFile('.git/HEAD', 'ref: refs/heads/main\n');
  };

  it.each(['user', 'agent'] as const)(
    'should refuse the %s consumer a recursive removal of the project root, before anything is deleted',
    async (consumer) => {
      const base = recursive();
      await seedVendoredStore(base);
      const view = composeView({ filesystem: base }, { consumer, policy: tauPathPolicy });

      await expect(view.rmdir('', { recursive: true })).rejects.toMatchObject({
        code: 'EPERM',
        reason: maskedPathCode,
      });
      expect(base.rmdir).not.toHaveBeenCalled();
      expect(await base.readFile('.git/HEAD', 'utf8')).toBe('ref: refs/heads/main\n');
    },
  );

  it('should refuse an agent a recursive removal of a directory holding a nested store', async () => {
    const base = recursive();
    await seedVendoredStore(base);
    const view = composeView({ filesystem: base }, { consumer: 'agent', policy: tauPathPolicy });

    await expect(view.rmdir('vendor', { recursive: true })).rejects.toMatchObject({
      code: 'EPERM',
      reason: maskedPathCode,
    });
    expect(base.rmdir).not.toHaveBeenCalled();
  });

  /* A person deleting a vendored folder must not be left with an undeletable
   * one: the removal carries the nested store with its directory. */
  it('should let the user consumer remove a directory holding a nested store', async () => {
    const base = recursive();
    await seedVendoredStore(base);
    const view = composeView({ filesystem: base }, { consumer: 'user', policy: tauPathPolicy });

    await view.rmdir('vendor', { recursive: true });

    expect(base.rmdir).toHaveBeenCalledWith('vendor', { recursive: true });
  });

  it('should pass an ordinary recursive removal straight down', async () => {
    const base = recursive();
    await base.writeFile('src/lib/helper.ts', 'export const helper = 1;\n');
    const view = composeView({ filesystem: base }, { consumer: 'agent', policy: tauPathPolicy });

    await view.rmdir('src', { recursive: true });
    /* A non-recursive removal empties one directory, so it has no subtree to
     * walk and pays nothing. */
    await view.rmdir('src/lib');

    expect(base.rmdir.mock.calls).toStrictEqual([
      ['src', { recursive: true }],
      ['src/lib', undefined],
    ]);
  });

  /* Records are already read-only to an agent, and that answer is unchanged: the
   * subtree walk is not what refuses this one. */
  it('should keep the records refusal an agent already had', async () => {
    const base = recursive();
    await base.writeFile('exports/part.stl', 'solid part\n');
    const view = composeView({ filesystem: base }, { consumer: 'agent', policy: tauPathPolicy });

    await expect(view.rmdir('exports', { recursive: true })).rejects.toMatchObject({ code: 'EROFS' });
    await composeView({ filesystem: base }, { consumer: 'user', policy: tauPathPolicy }).rmdir('exports', {
      recursive: true,
    });
    expect(base.rmdir).toHaveBeenCalledOnce();
  });

  it('should refuse an agent a move of a directory holding a nested store', async () => {
    const base = recursive();
    await seedVendoredStore(base);
    const view = composeView({ filesystem: base }, { consumer: 'agent', policy: tauPathPolicy });

    await expect(view.move!('vendor', 'vendored')).rejects.toMatchObject({ code: 'EPERM', reason: maskedPathCode });
    expect(base.move).not.toHaveBeenCalled();

    await composeView({ filesystem: base }, { consumer: 'user', policy: tauPathPolicy }).move!('vendor', 'vendored');
    expect(base.move).toHaveBeenCalledOnce();
  });

  it('should refuse an agent a rename of a directory holding a nested store', async () => {
    const base = recursive();
    await seedVendoredStore(base);
    const view = composeView({ filesystem: base }, { consumer: 'agent', policy: tauPathPolicy });

    await expect(view.rename('vendor', 'vendored')).rejects.toMatchObject({ code: 'EPERM', reason: maskedPathCode });
    expect(await base.readFile('vendor/dep/index.js', 'utf8')).toBe('module.exports = 1;\n');

    await composeView({ filesystem: base }, { consumer: 'user', policy: tauPathPolicy }).rename('vendor', 'vendored');
    expect(await base.readFile('vendored/dep/index.js', 'utf8')).toBe('module.exports = 1;\n');
  });

  it('should refuse an agent a bulk move whose source holds a nested store', async () => {
    const base = Object.assign(recursive(), { bulkMove: vi.fn(async () => ({ moved: [], failed: [] })) });
    await seedVendoredStore(base);
    const view = composeView({ filesystem: base }, { consumer: 'agent', policy: tauPathPolicy });

    await expect(
      view.bulkMove!([
        { source: 'vendor', target: 'vendored' },
        { source: 'src/a.ts', target: 'src/b.ts' },
      ]),
    ).rejects.toMatchObject({ code: 'EPERM', reason: maskedPathCode });
    expect(base.bulkMove).not.toHaveBeenCalled();
  });
});

describe('composeView listing cost', () => {
  /* Budget row (W7d): a listing classifies each row once. It asked two or three
   * times per row — the visible filter, then the row's provenance, each a fresh
   * regex and a scan of the registry's rows — which is what made a wide
   * directory expensive before any byte was read. */
  it('should classify each row of a wide listing once', async () => {
    const rows = 10_000;
    await Promise.all(
      Array.from({ length: rows }, async (_, row) => provider.writeFile(`wide/file${row}.ts`, 'export {};\n')),
    );
    const classify = vi.fn(tauPathPolicy.classify);
    const view = composeView({ filesystem: provider }, { consumer: 'agent', policy: { classify } });

    const listing = await view.readdirWithStats('wide');

    expect(listing).toHaveLength(rows);
    /* The directory itself is classified before the provider is touched at all
     * (the mask is checked first, always), so its own call rides along. */
    expect(classify.mock.calls.length).toBeLessThanOrEqual(rows + 1);
  });
});
