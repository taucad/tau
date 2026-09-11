import { ResourceQueue } from '@taucad/filesystem';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createProviderRpcFileSystem } from '#registry/provider-file-system.js';
import { createSkillBundleRegistry, createSkillResourceFileSystem } from '#registry/skill-resource-file-system.js';
import type { SkillResourceDescriptor, SystemSkillBundle } from '#registry/skill-resource-file-system.js';

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

const fileSystem = () => {
  const upper = createProviderRpcFileSystem({
    provider,
    mutations: new ResourceQueue(),
  });
  return createSkillResourceFileSystem({
    upper,
    registry: createSkillBundleRegistry([bundle]),
    readResource: reads,
  });
};

beforeEach(async () => {
  provider = new MemoryProvider();
  await provider.writeFile('main.ts', 'export {};\n');
  reads = vi.fn(async ({ path }: SkillResourceDescriptor) => encoder.encode(contents[path as keyof typeof contents]));
});

describe('skill resource filesystem', () => {
  it('should expose lazy package files through the canonical project-relative tree', async () => {
    const overlay = fileSystem();

    expect(reads).not.toHaveBeenCalled();
    const rootEntries = await overlay.readdir('');
    expect(rootEntries.find(({ name }) => name === '.agents')).toMatchObject({
      type: 'dir',
      traverseOnImplicitSearch: false,
    });
    expect(await overlay.readdir('.agents/skills')).toContainEqual(
      expect.objectContaining({
        name: 'demo',
        type: 'dir',
        traverseOnImplicitSearch: false,
      }),
    );
    expect(await overlay.readdir('.agents/skills/demo')).toEqual([
      expect.objectContaining({ name: 'SKILL.md', type: 'file' }),
      expect.objectContaining({ name: 'api-index.md', type: 'file' }),
      expect.objectContaining({ name: 'references', type: 'dir' }),
    ]);
    expect(await overlay.exists('.agents/skills/demo/references/detail.md')).toBe(true);
    expect(await overlay.stat('.agents/skills/demo/api-index.md')).toMatchObject({
      isDirectory: false,
      contentKind: 'text',
      lineCount: 3,
    });
    expect(reads).not.toHaveBeenCalled();
    expect(await overlay.readFile('.agents/skills/demo/api-index.md')).toBe(contents['api-index.md']);
    expect(reads).toHaveBeenCalledOnce();
  });

  it('should let any upper child hide the complete lower bundle', async () => {
    await provider.writeFile('.agents/skills/demo/SKILL.md', 'user\n');
    const overlay = fileSystem();

    expect(await overlay.readFile('.agents/skills/demo/SKILL.md')).toBe('user\n');
    expect(await overlay.exists('.agents/skills/demo/api-index.md')).toBe(false);
    await expect(overlay.readFile('.agents/skills/demo/api-index.md')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(reads).not.toHaveBeenCalled();
  });

  it('should fail closed when an invalid upper file collides with a bundle slug', async () => {
    await provider.writeFile('.agents/skills/demo', 'not a directory\n');
    const overlay = fileSystem();

    expect(await overlay.readdir('.agents/skills')).toContainEqual(
      expect.objectContaining({ name: 'demo', type: 'file' }),
    );
    await expect(overlay.readFile('.agents/skills/demo/api-index.md')).rejects.toBeInstanceOf(Error);
    expect(reads).not.toHaveBeenCalled();
  });

  it('should reject every mutation into a lower bundle with EROFS', async () => {
    const overlay = fileSystem();
    const path = '.agents/skills/demo/api-index.md';

    await expect(overlay.writeFile(path, 'x')).rejects.toMatchObject({
      code: 'EROFS',
    });
    await expect(overlay.writeBinaryFile(path, encoder.encode('x'))).rejects.toMatchObject({ code: 'EROFS' });
    await expect(overlay.appendFile(path, 'x')).rejects.toMatchObject({
      code: 'EROFS',
    });
    await expect(overlay.editFile(path, 'needle', 'x')).rejects.toMatchObject({
      code: 'EROFS',
    });
    await expect(overlay.deleteFile(path)).rejects.toMatchObject({
      code: 'EROFS',
    });
    expect(await overlay.readFile(path)).toBe(contents['api-index.md']);
  });

  it('should reject invalid and undeclared resource paths before reading bytes', async () => {
    const overlay = fileSystem();

    await expect(overlay.readFile('../outside')).rejects.toMatchObject({
      code: 'PATH_OUTSIDE_ROOT',
    });
    await expect(overlay.readFile(String.raw`.agents\skills\demo\api-index.md`)).rejects.toMatchObject({
      code: 'INVALID_PATH',
    });
    await expect(overlay.readFile('.agents/skills/demo/missing.md')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(overlay.readFile('.agents/skills/other/api-index.md')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(reads).not.toHaveBeenCalled();
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
