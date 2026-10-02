import { describe, it, expect, vi, afterEach } from 'vitest';
import * as monaco from 'monaco-editor';
import { searchTauWorkspaceSymbols } from '#lib/monaco-typescript-extras/tau-workspace-symbol-search.client.js';
import { createMonacoWorkspaceFs } from '#lib/monaco-workspace-fs/monaco-workspace-fs.js';
import { drainMonacoPostTestWork } from '#lib/testing/monaco-async-drain.js';

describe('searchTauWorkspaceSymbols', () => {
  afterEach(async () => {
    for (const m of monaco.editor.getModels()) {
      m.dispose();
    }
    await drainMonacoPostTestWork();
  });

  it('warms files via findFiles + materialise then returns symbols from worker', async () => {
    const workspaceFs = createMonacoWorkspaceFs(monaco);
    const findSpy = vi.spyOn(workspaceFs, 'findFiles').mockImplementation(async () => [monaco.Uri.file('/a.ts')]);
    const matSpy = vi.spyOn(workspaceFs, 'materialiseUrisForWorkspaceEdit').mockResolvedValue(undefined);

    const fileText = 'export const uniqueSym = 1;\n';
    monaco.editor.createModel(fileText, 'typescript', monaco.Uri.file('/a.ts'));

    const mockWorker = {
      getNavigateToItems: vi.fn(
        async (): Promise<unknown> => [
          {
            name: 'uniqueSym',
            kind: 'var',
            fileName: monaco.Uri.file('/a.ts').toString(),
            textSpan: { start: fileText.indexOf('uniqueSym'), length: 'uniqueSym'.length },
          },
        ],
      ),
    };

    const symbols = await searchTauWorkspaceSymbols({
      monaco,
      workspaceFs,
      getTsWorker: async () => async (_primary: monaco.Uri) => mockWorker,
      query: 'unique',
    });

    expect(findSpy).toHaveBeenCalled();
    expect(matSpy).toHaveBeenCalled();
    expect(symbols[0]!.name).toBe('uniqueSym');
    expect(symbols[0]!.uri.path).toBe('/a.ts');
    workspaceFs.dispose();
  });
});
