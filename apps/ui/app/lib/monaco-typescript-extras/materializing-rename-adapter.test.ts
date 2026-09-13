import { describe, it, expect, vi, afterEach } from 'vitest';
import * as monaco from 'monaco-editor';
import { createTestCancellationToken } from '#lib/testing/monaco-test-token.js';
import { MaterializingLibFiles } from '#lib/monaco-typescript-extras/materializing-lib-files.client.js';
import { MaterializingRenameAdapter } from '#lib/monaco-typescript-extras/materializing-rename-adapter.client.js';
import { createMonacoWorkspaceFs } from '#lib/monaco-workspace-fs/monaco-workspace-fs.js';
import { drainMonacoPostTestWork } from '#lib/testing/monaco-async-drain.js';

describe('MaterializingRenameAdapter', () => {
  afterEach(async () => {
    for (const model of monaco.editor.getModels()) {
      model.dispose();
    }
    await drainMonacoPostTestWork();
  });

  it('pre-materialises rename targets before workspace edits are built', async () => {
    const mainText = 'import { v } from "./dep.ts";\n';
    const depText = 'export const v = 1;\n';
    const files = new Map<string, string>([
      ['main.ts', mainText],
      ['dep.ts', depText],
    ]);

    const workspaceFs = createMonacoWorkspaceFs(monaco);
    workspaceFs.registerFileSystemProvider({
      scheme: 'file',
      async readText(uri: monaco.Uri): Promise<string> {
        const p = uri.path.startsWith('/') ? uri.path.slice(1) : uri.path;
        const t = files.get(p);
        if (!t) {
          throw new Error(`missing ${p}`);
        }
        return t;
      },
      peekText(uri: monaco.Uri): string | undefined {
        const p = uri.path.startsWith('/') ? uri.path.slice(1) : uri.path;
        return files.get(p);
      },
      languageId: () => 'typescript',
      onDidChange: () => ({ dispose: () => undefined }),
    });
    const materialiseSpy = vi.spyOn(workspaceFs, 'materialiseUrisForWorkspaceEdit');

    const mainUri = monaco.Uri.file('/main.ts');
    const depUri = monaco.Uri.file('/dep.ts');
    const mainModel = monaco.editor.createModel(mainText, 'typescript', mainUri);

    const vMain = mainText.indexOf('v');
    const vDep = depText.indexOf('v');
    const renameLocs = [
      { fileName: mainUri.toString(), textSpan: { start: vMain, length: 1 } },
      { fileName: depUri.toString(), textSpan: { start: vDep, length: 1 } },
    ];

    const mockWorker = {
      getRenameInfo: vi.fn(async (): Promise<unknown> => ({ canRename: true })),
      findRenameLocations: vi.fn(async (): Promise<typeof renameLocs> => renameLocs),
      getLibFiles: vi.fn(async () => ({})),
    };

    const workerAccessor = vi.fn(async () => mockWorker);
    const lib = new MaterializingLibFiles(workerAccessor, workspaceFs);
    const adapter = new MaterializingRenameAdapter(lib, workerAccessor, workspaceFs);

    const pos = mainModel.getPositionAt(vMain);
    const edit = await adapter.provideRenameEdits(mainModel, pos, 'renamed', createTestCancellationToken());

    expect(materialiseSpy).toHaveBeenCalled();
    expect(edit && 'edits' in edit ? edit.edits.length : 0).toBe(2);

    mainModel.dispose();
    workspaceFs.dispose();
  });
});
