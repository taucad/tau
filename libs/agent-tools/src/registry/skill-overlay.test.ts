import { ResourceQueue } from '@taucad/filesystem';
import { composeView } from '@taucad/filesystem/composed-view';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createProviderRpcFileSystem } from '#registry/provider-file-system.js';
import { createSkillBundleOverlay, createSkillBundleRegistry } from '#registry/skill-overlay.js';
import type { SkillResourceDescriptor, SystemSkillBundle } from '#registry/skill-overlay.js';

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

  it('should reject every mutation into a bundle with EROFS', async () => {
    const tools = fileSystem();
    const path = '.agents/skills/demo/api-index.md';

    await expect(tools.writeFile(path, 'x')).rejects.toMatchObject({ code: 'EROFS' });
    await expect(tools.writeBinaryFile(path, encoder.encode('x'))).rejects.toMatchObject({ code: 'EROFS' });
    await expect(tools.appendFile(path, 'x')).rejects.toMatchObject({ code: 'EROFS' });
    await expect(tools.editFile(path, 'needle', 'x')).rejects.toMatchObject({ code: 'EROFS' });
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
