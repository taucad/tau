import { describe, expect, it, vi } from 'vitest';
import type { RpcGeoSpecClient, RpcRuntimeClient } from '@taucad/chat/rpc';
import { withEntryAdoption } from '#runtime/entry-adoption.js';
import type { EntryAdoptionFileSystem } from '#runtime/entry-adoption.js';

/* Blueprint D3: while main does not resolve, the first model a host renders becomes main. */

const memoryFiles = (initial: Record<string, string>) => {
  const files = new Map(Object.entries(initial));
  const fileSystem: EntryAdoptionFileSystem = {
    readFile: async (path) => {
      const text = files.get(path);
      if (text === undefined) {
        throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
      }
      return text;
    },
    writeFile: vi.fn(async (path: string, content: string) => {
      files.set(path, content);
    }),
    writeBinaryFile: vi.fn(async (path: string, data: Uint8Array<ArrayBuffer>) => {
      files.set(path, new TextDecoder().decode(data));
    }),
    exists: async (path) => files.has(path),
  };
  return { files, fileSystem };
};

const entryless = JSON.stringify({ name: 'Bracket', tags: ['x'], assets: {} });
type Evaluation = Awaited<ReturnType<RpcRuntimeClient['evaluateModel']>>;
const evaluation = (status: 'ready' | 'error'): Evaluation => {
  const result: unknown = { success: true, status };
  return result as Evaluation;
};
const ready = (): RpcRuntimeClient => ({
  evaluateModel: vi.fn(async () => evaluation('ready')),
});
const mainOf = (files: Map<string, string>): unknown =>
  (JSON.parse(files.get('tau.json')!) as { assets: { main?: { entryPath: string } } }).assets.main?.entryPath;

describe('withEntryAdoption', () => {
  it('writes the first ready evaluate_model target into tau.json and keeps every other field', async () => {
    const { files, fileSystem } = memoryFiles({ 'tau.json': entryless, 'bracket.ts': 'x' });
    const onAdopted = vi.fn();
    const { kernelClient } = withEntryAdoption({ kernelClient: ready() }, { fileSystem, onAdopted });

    await kernelClient.evaluateModel({ targetFile: 'bracket.ts' });

    expect(mainOf(files)).toBe('bracket.ts');
    expect(JSON.parse(files.get('tau.json')!)).toMatchObject({ name: 'Bracket', tags: ['x'] });
    expect(onAdopted).toHaveBeenCalledWith('bracket.ts');
  });

  it('adopts nothing once main resolves, and nothing from an evaluation in error', async () => {
    const { files, fileSystem } = memoryFiles({ 'tau.json': entryless, 'a.ts': 'x', 'b.ts': 'x' });
    const failing: RpcRuntimeClient = {
      evaluateModel: async () => evaluation('error'),
    };
    await withEntryAdoption({ kernelClient: failing }, { fileSystem }).kernelClient.evaluateModel({
      targetFile: 'a.ts',
    });
    expect(mainOf(files)).toBeUndefined();

    const { kernelClient } = withEntryAdoption({ kernelClient: ready() }, { fileSystem });
    await kernelClient.evaluateModel({ targetFile: 'a.ts' });
    await kernelClient.evaluateModel({ targetFile: 'b.ts' });
    expect(mainOf(files)).toBe('a.ts');
  });

  it('treats a main that names a missing file as entry-less', async () => {
    const manifest = JSON.stringify({ name: 'P', assets: { main: { entryPath: 'gone.ts', thumbnail: 't.webp' } } });
    const { files, fileSystem } = memoryFiles({ 'tau.json': manifest, 'model.scad': 'x' });
    await withEntryAdoption({ kernelClient: ready() }, { fileSystem }).kernelClient.evaluateModel({
      targetFile: 'model.scad',
    });
    expect(JSON.parse(files.get('tau.json')!)).toMatchObject({
      assets: { main: { entryPath: 'model.scad', thumbnail: 't.webp' } },
    });
  });

  it('adopts the first model a complete test_model load rendered', async () => {
    const { files, fileSystem } = memoryFiles({ 'tau.json': entryless, 'parts/vase.scad': 'x' });
    const output: unknown = {
      success: true,
      lineage: [
        {
          file: 'parts/check.geospec.ts',
          lineage: {
            loads: [{ status: 'complete', evidence: { sourceRevision: { entry: 'parts/vase.scad', files: {} } } }],
          },
        },
      ],
    };
    const geospec: RpcGeoSpecClient = {
      runTests: async () => output as Awaited<ReturnType<RpcGeoSpecClient['runTests']>>,
    };
    const adopted = withEntryAdoption({ kernelClient: ready(), geospec }, { fileSystem });
    await adopted.geospec.runTests({ files: ['parts/check.geospec.ts'] } as never);
    expect(mainOf(files)).toBe('parts/vase.scad');
  });

  it('writes the bound kernel’s missing package files before the first evaluation, keeping files already there', async () => {
    const { files, fileSystem } = memoryFiles({ 'tau.json': entryless, 'main.py': 'x', 'uv.lock': 'mine' });
    const order: string[] = [];
    const kernelClient: RpcRuntimeClient = {
      evaluateModel: async () => {
        order.push(files.has('pyproject.toml') ? 'evaluated-with-package' : 'evaluated-without');
        return evaluation('ready');
      },
    };
    const packageFiles = vi.fn(async () => ({
      'pyproject.toml': new TextEncoder().encode('[project]'),
      'uv.lock': new TextEncoder().encode('theirs'),
    }));
    await withEntryAdoption({ kernelClient }, { fileSystem, packageFiles }).kernelClient.evaluateModel({
      targetFile: 'main.py',
    });
    expect(order).toEqual(['evaluated-with-package']);
    expect(files.get('uv.lock')).toBe('mine');
    expect(packageFiles).toHaveBeenCalledWith(
      expect.objectContaining({ targetFile: 'main.py', projectName: 'Bracket' }),
    );
  });

  it('passes a folder without tau.json, or with a manifest it cannot parse, through untouched', async () => {
    const folders: ReadonlyArray<Record<string, string>> = [{ 'a.ts': 'x' }, { 'tau.json': '{ not json', 'a.ts': 'x' }];
    const systems = folders.map((initial) => memoryFiles(initial).fileSystem);
    await Promise.all(
      systems.map(async (fileSystem) =>
        withEntryAdoption({ kernelClient: ready() }, { fileSystem }).kernelClient.evaluateModel({ targetFile: 'a.ts' }),
      ),
    );
    for (const fileSystem of systems) {
      expect(fileSystem.writeFile).not.toHaveBeenCalled();
    }
  });
});
