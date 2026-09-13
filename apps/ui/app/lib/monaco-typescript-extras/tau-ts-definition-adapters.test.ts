import { describe, it, expect, vi, afterEach } from 'vitest';
import * as monaco from 'monaco-editor';
import { createTestCancellationToken } from '#lib/testing/monaco-test-token.js';
import {
  TauImplementationAdapter,
  TauTypeDefinitionAdapter,
} from '#lib/monaco-typescript-extras/tau-ts-definition-adapters.client.js';
import { MaterializingLibFiles } from '#lib/monaco-typescript-extras/materializing-lib-files.client.js';
import { createMonacoWorkspaceFs } from '#lib/monaco-workspace-fs/monaco-workspace-fs.js';
import { drainMonacoPostTestWork } from '#lib/testing/monaco-async-drain.js';

describe('TauImplementationAdapter', () => {
  afterEach(async () => {
    for (const model of monaco.editor.getModels()) {
      model.dispose();
    }
    await drainMonacoPostTestWork();
  });

  it('materialises cross-file URIs and returns a Location', async () => {
    const body = 'export function impl() { return 1; }\n';
    const workspaceFs = createMonacoWorkspaceFs(monaco);
    workspaceFs.registerFileSystemProvider({
      scheme: 'file',
      readText: async () => body,
      peekText: () => body,
      languageId: () => 'typescript',
      onDidChange: () => ({ dispose: () => undefined }),
    });

    const mainUri = monaco.Uri.file('/main.ts');
    const mainModel = monaco.editor.createModel('void 0;\n', 'typescript', mainUri);
    const targetUri = monaco.Uri.file('/lib/impl.ts');
    const offset = 5;

    const mockWorker = {
      getImplementationAtPosition: vi.fn(
        async (): Promise<unknown> => [
          {
            fileName: targetUri.toString(),
            textSpan: { start: body.indexOf('impl'), length: 4 },
          },
        ],
      ),
      getLibFiles: vi.fn(async () => ({})),
    };
    const workerAccessor = vi.fn(async () => mockWorker);
    const lib = new MaterializingLibFiles(workerAccessor, workspaceFs);
    const adapter = new TauImplementationAdapter(lib, workerAccessor);

    const pos = mainModel.getPositionAt(offset);
    const out = await adapter.provideImplementation(mainModel, pos, createTestCancellationToken());
    expect(Array.isArray(out)).toBe(true);
    const loc = (out as monaco.languages.Location[])[0]!;
    expect(loc.uri.path).toBe('/lib/impl.ts');
    await expect(workspaceFs.openTextDocument(loc.uri)).resolves.toBeDefined();

    mainModel.dispose();
    workspaceFs.dispose();
  });
});

describe('TauTypeDefinitionAdapter', () => {
  afterEach(async () => {
    for (const model of monaco.editor.getModels()) {
      model.dispose();
    }
    await drainMonacoPostTestWork();
  });

  it('materialises type-definition targets', async () => {
    const body = 'export type TNum = number;\n';
    const workspaceFs = createMonacoWorkspaceFs(monaco);
    workspaceFs.registerFileSystemProvider({
      scheme: 'file',
      readText: async () => body,
      peekText: () => body,
      languageId: () => 'typescript',
      onDidChange: () => ({ dispose: () => undefined }),
    });

    const mainUri = monaco.Uri.file('/use.ts');
    const mainModel = monaco.editor.createModel('const n: TNum = 1;\n', 'typescript', mainUri);
    const typeUri = monaco.Uri.file('/types.ts');
    const spanStart = body.indexOf('TNum');

    const mockWorker = {
      getTypeDefinitionAtPosition: vi.fn(
        async (): Promise<unknown> => [{ fileName: typeUri.toString(), textSpan: { start: spanStart, length: 4 } }],
      ),
      getLibFiles: vi.fn(async () => ({})),
    };
    const workerAccessor = vi.fn(async () => mockWorker);
    const lib = new MaterializingLibFiles(workerAccessor, workspaceFs);
    const adapter = new TauTypeDefinitionAdapter(lib, workerAccessor);

    const pos = mainModel.getPositionAt(mainModel.getValue().indexOf('TNum'));
    const out = await adapter.provideTypeDefinition(mainModel, pos, createTestCancellationToken());
    const loc = (out as monaco.languages.Location[])[0]!;
    expect(loc.uri.path).toBe('/types.ts');

    mainModel.dispose();
    workspaceFs.dispose();
  });
});
