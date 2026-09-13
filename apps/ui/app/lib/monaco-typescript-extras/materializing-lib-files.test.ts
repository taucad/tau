import { describe, it, expect, vi, afterEach } from 'vitest';
import * as monaco from 'monaco-editor';
import type { LibFiles } from 'monaco-editor/esm/vs/language/typescript/languageFeatures.js';
import { MaterializingLibFiles } from '#lib/monaco-typescript-extras/materializing-lib-files.client.js';
import { createMonacoWorkspaceFs } from '#lib/monaco-workspace-fs/monaco-workspace-fs.js';
import { drainMonacoPostTestWork } from '#lib/testing/monaco-async-drain.js';

describe('MaterializingLibFiles', () => {
  afterEach(async () => {
    for (const model of monaco.editor.getModels()) {
      model.dispose();
    }
    await drainMonacoPostTestWork();
  });

  it('getOrCreateModel falls through to workspaceFs.peekModel for project files', () => {
    const workspaceFs = createMonacoWorkspaceFs(monaco);
    workspaceFs.registerFileSystemProvider({
      scheme: 'file',
      readText: async () => 'export const n = 1;',
      peekText: () => 'export const n = 1;',
      languageId: () => 'javascript',
      onDidChange: () => ({ dispose: () => undefined }),
    });

    const workerAccessor = vi.fn(async () => ({
      getLibFiles: vi.fn(async () => ({})),
    }));
    const lib = new MaterializingLibFiles(
      workerAccessor as unknown as ConstructorParameters<typeof LibFiles>[0],
      workspaceFs,
    );
    const uri = 'file:///lib/x.js';
    const model = lib.getOrCreateModel(uri);
    expect(model).not.toBeNull();
    expect(model!.uri.path).toBe('/lib/x.js');
    workspaceFs.dispose();
  });

  it('fetchLibFilesIfNecessary materialises project URIs registered on workspaceFs', async () => {
    const workspaceFs = createMonacoWorkspaceFs(monaco);
    const materialiseSpy = vi.spyOn(workspaceFs, 'materialiseUrisForWorkspaceEdit');
    workspaceFs.registerFileSystemProvider({
      scheme: 'file',
      readText: async () => '',
      onDidChange: () => ({ dispose: () => undefined }),
    });

    const workerAccessor = vi.fn(async () => ({
      getLibFiles: vi.fn(async () => ({})),
    }));
    const lib = new MaterializingLibFiles(
      workerAccessor as unknown as ConstructorParameters<typeof LibFiles>[0],
      workspaceFs,
    );
    await lib.fetchLibFilesIfNecessary([monaco.Uri.file('/external/unmounted.js')]);
    const passed = materialiseSpy.mock.calls[0]![0] as monaco.Uri[];
    expect(passed[0]!.path).toBe('/external/unmounted.js');
    workspaceFs.dispose();
  });
});
