import { describe, expect, it, vi } from 'vitest';
import { createEntryAdoption } from '#hooks/entry-adoption.js';
import type { KernelPackageFiles } from '#hooks/entry-adoption.js';

/* Blueprint D3: an entry-less project adopts the first successful evaluation as main and gains its kernel's package files. */

const bytes = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);

const setup = (input: Readonly<{ mainEntryPath?: string; existing?: readonly string[] }> = {}) => {
  const existing = new Set(input.existing ?? []);
  const project = { name: 'Bracket', mainEntryPath: input.mainEntryPath };
  const setMainFile = vi.fn((path: string) => {
    project.mainEntryPath = path;
  });
  const writeFile = vi.fn(async (path: string) => {
    existing.add(path);
  });
  const packageFiles = vi.fn<KernelPackageFiles>(async (kernel) =>
    kernel === 'build123d'
      ? { 'pyproject.toml': { content: bytes('[project]') }, 'uv.lock': { content: bytes('') } }
      : {},
  );
  const adoption = createEntryAdoption({
    project: { manifest: () => project, setMainFile },
    files: { exists: async (path) => existing.has(path), writeFile },
    packageFiles,
  });
  return { adoption, setMainFile, writeFile, packageFiles };
};

describe('createEntryAdoption', () => {
  it('adopts the first successful evaluation of an entry-less project as main', async () => {
    const { adoption, setMainFile } = setup();
    const result = await adoption.afterEvaluation({
      targetFile: 'bracket.ts',
      runtimeKernelId: 'replicad',
      isSuccess: true,
    });
    expect(result.adopted).toBe('bracket.ts');
    expect(setMainFile).toHaveBeenCalledWith('bracket.ts');
    // Main now resolves once the file is there, so a later evaluation of a helper adopts nothing.
  });

  it('treats a main that names a missing file as entry-less', async () => {
    const { adoption, setMainFile } = setup({ mainEntryPath: 'main.ts' });
    await adoption.afterEvaluation({ targetFile: 'model.scad', runtimeKernelId: 'openscad', isSuccess: true });
    expect(setMainFile).toHaveBeenCalledWith('model.scad');
  });

  it('leaves a project whose main resolves alone', async () => {
    const { adoption, setMainFile, writeFile } = setup({ mainEntryPath: 'main.ts', existing: ['main.ts'] });
    const result = await adoption.afterEvaluation({
      targetFile: 'other.ts',
      runtimeKernelId: 'replicad',
      isSuccess: true,
    });
    expect(result).toEqual({ wrote: [] });
    expect(setMainFile).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('writes the bound kernel’s package files even when the evaluation failed, and adopts nothing then', async () => {
    const { adoption, setMainFile, writeFile } = setup({ existing: ['uv.lock'] });
    const result = await adoption.afterEvaluation({
      targetFile: 'main.py',
      runtimeKernelId: 'build123d',
      isSuccess: false,
    });
    expect(result).toEqual({ wrote: ['pyproject.toml'] });
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(setMainFile).not.toHaveBeenCalled();
  });

  it('settles a kernel’s package files once', async () => {
    const { adoption, packageFiles } = setup();
    await adoption.afterEvaluation({ targetFile: 'main.py', runtimeKernelId: 'build123d', isSuccess: false });
    await adoption.afterEvaluation({ targetFile: 'main.py', runtimeKernelId: 'build123d', isSuccess: false });
    expect(packageFiles).toHaveBeenCalledTimes(1);
  });

  it('adopts a GeoSpec load whose kernel is unknown without writing package files', async () => {
    const { adoption, setMainFile, packageFiles } = setup();
    await adoption.afterEvaluation({ targetFile: 'parts/vase.scad', runtimeKernelId: undefined, isSuccess: true });
    expect(setMainFile).toHaveBeenCalledWith('parts/vase.scad');
    expect(packageFiles).not.toHaveBeenCalled();
  });
});
