import { describe, it, expect, vi, afterEach } from 'vitest';
import * as monaco from 'monaco-editor';
import { DefinitionAdapter } from 'monaco-editor/esm/vs/language/typescript/languageFeatures.js';
import { createTestCancellationToken } from '#lib/testing/monaco-test-token.js';
import { MaterializingLibFiles } from '#lib/monaco-typescript-extras/materializing-lib-files.client.js';
import { createMonacoWorkspaceFs } from '#lib/monaco-workspace-fs/monaco-workspace-fs.js';

import { drainMonacoPostTestWork } from '#lib/testing/monaco-async-drain.js';

/**
 * Cmd+Click / go-to-definition: DefinitionAdapter must resolve `./lib/cube.js` via workspaceFs
 * when the target file was never opened.
 */
describe('JS/TS definition materialisation (workspace FS)', () => {
  afterEach(async () => {
    for (const model of monaco.editor.getModels()) {
      model.dispose();
    }
    await drainMonacoPostTestWork();
  });

  it('provideDefinition returns a Location whose URI matches /lib/cube.js', async () => {
    const cubeJs = 'export function makeCube() {\n  return 1;\n}\n';
    const files = new Map<string, string>([
      ['main.ts', `import { makeCube } from './lib/cube.js';\nmakeCube();\n`],
      ['lib/cube.js', cubeJs],
    ]);

    const workspaceFs = createMonacoWorkspaceFs(monaco);
    workspaceFs.registerFileSystemProvider({
      scheme: 'file',
      async readText(uri: monaco.Uri): Promise<string> {
        const workspaceRelativePath = uri.path.startsWith('/') ? uri.path.slice(1) : uri.path;
        const t = files.get(workspaceRelativePath);
        if (!t) {
          throw new Error(`missing ${workspaceRelativePath}`);
        }
        return t;
      },
      peekText(uri: monaco.Uri): string | undefined {
        const workspaceRelativePath = uri.path.startsWith('/') ? uri.path.slice(1) : uri.path;
        return files.get(workspaceRelativePath);
      },
      languageId: (uri) => (uri.path.endsWith('.ts') ? 'typescript' : 'javascript'),
      onDidChange: () => ({ dispose: () => undefined }),
    });

    const mainUri = monaco.Uri.file('/main.ts');
    const mainText = files.get('main.ts')!;
    const mainModel = monaco.editor.createModel(mainText, 'typescript', mainUri);

    const cubeKey = monaco.Uri.file('/lib/cube.js').toString();
    const makeCubeIndex = mainText.indexOf('makeCube');
    const clickPosition = mainModel.getPositionAt(makeCubeIndex);
    const expectedOffset = mainModel.getOffsetAt(clickPosition);
    const spanStart = cubeJs.indexOf('makeCube');

    const mockWorker = {
      getDefinitionAtPosition: vi.fn(async (fileName: string, offset: number) => {
        expect(fileName).toBe(mainUri.toString());
        expect(offset).toBe(expectedOffset);
        return [{ fileName: cubeKey, textSpan: { start: spanStart, length: 'makeCube'.length } }];
      }),
      getLibFiles: vi.fn(async () => ({})),
    };

    const workerAccessor = vi.fn(async () => mockWorker);
    const lib = new MaterializingLibFiles(workerAccessor, workspaceFs);
    const adapter = new DefinitionAdapter(lib, workerAccessor);

    const position = clickPosition;
    const defs = await adapter.provideDefinition(mainModel, position, createTestCancellationToken());

    expect(defs).toBeDefined();
    const loc = (defs as monaco.languages.Location[])[0]!;
    expect(loc.uri.path).toBe('/lib/cube.js');
    expect(loc.range.startLineNumber).toBeGreaterThan(0);

    mainModel.dispose();
    workspaceFs.dispose();
  });
});
