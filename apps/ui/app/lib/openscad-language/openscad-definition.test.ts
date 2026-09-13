import { describe, it, expect, afterEach, vi } from 'vitest';
import * as monaco from 'monaco-editor';
import { createDefinitionProvider } from '#lib/openscad-language/openscad-definition.js';
import type { MonacoWorkspaceFs } from '#lib/monaco-workspace-fs/monaco-workspace-fs.types.js';
import { codeLanguages } from '@taucad/types/constants';
import { createTestCancellationToken } from '#lib/testing/monaco-test-token.js';
import { drainMonacoPostTestWork } from '#lib/testing/monaco-async-drain.js';

describe('OpenSCAD definition provider (workspaceFs text, no scratch model)', () => {
  afterEach(async () => {
    for (const model of monaco.editor.getModels()) {
      model.dispose();
    }

    await drainMonacoPostTestWork();
  });

  it('resolves module from use<> via openTextProvider without createModel on import target', async () => {
    const createModelSpy = vi.spyOn(monaco.editor, 'createModel');

    const workspaceFs: MonacoWorkspaceFs = {
      openTextProvider: vi.fn(async (uri: monaco.Uri) => {
        if (uri.toString() === 'file:///project/parts/lib/foo.scad') {
          return {
            text: 'module foo() {\n}\n',
            dispose(): void {
              void 0;
            },
            lineLength(lineNumber1Based: number): number {
              return lineNumber1Based === 1 ? 'module foo() {'.length : 0;
            },
          };
        }

        return undefined;
      }),
    } as unknown as MonacoWorkspaceFs;

    const provider = createDefinitionProvider(monaco, { workspaceFs });
    const mainUri = monaco.Uri.parse('file:///project/parts/main.scad');
    const mainModel = monaco.editor.createModel('use <lib/foo.scad>\nfoo();\n', codeLanguages.openscad, mainUri);
    const token = createTestCancellationToken();
    const posFoo = mainModel.getPositionAt(mainModel.getValue().indexOf('foo();') + 1);

    const definition = await provider.provideDefinition(mainModel, posFoo, token);

    expect(definition).toBeDefined();
    const location = Array.isArray(definition) ? definition[0] : definition;
    expect(location?.uri.toString()).toBe('file:///project/parts/lib/foo.scad');

    expect(
      createModelSpy.mock.calls.some((callArguments) => {
        const uriArgument = callArguments[2];
        return uriArgument?.toString() === 'file:///project/parts/lib/foo.scad';
      }),
    ).toBe(false);

    createModelSpy.mockRestore();
  });

  it('include mode resolves variable in imported file', async () => {
    const workspaceFs: MonacoWorkspaceFs = {
      openTextProvider: vi.fn(async (uri: monaco.Uri) => {
        if (uri.toString() === 'file:///project/inc/bar.scad') {
          return {
            text: 'secret = 42;\n',
            dispose(): void {
              void 0;
            },
            lineLength(lineNumber1Based: number): number {
              if (lineNumber1Based === 1) {
                return 'secret = 42;'.length;
              }

              return 0;
            },
          };
        }

        return undefined;
      }),
    } as unknown as MonacoWorkspaceFs;

    const provider = createDefinitionProvider(monaco, { workspaceFs });
    const mainUri = monaco.Uri.parse('file:///project/main2.scad');
    const mainModel = monaco.editor.createModel(
      'include <inc/bar.scad>\nv = secret + 1;\n',
      codeLanguages.openscad,
      mainUri,
    );
    const token = createTestCancellationToken();
    const secretOffset = mainModel.getValue().indexOf('secret');
    const position = mainModel.getPositionAt(secretOffset + 1);

    const definition = await provider.provideDefinition(mainModel, position, token);

    expect(definition).toBeDefined();
    const location = Array.isArray(definition) ? definition[0] : definition;
    expect(location?.uri.toString()).toBe('file:///project/inc/bar.scad');
    expect(location?.range.startLineNumber).toBe(1);
  });
});
