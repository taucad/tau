import { describe, it, expect, afterEach, vi } from 'vitest';
import * as monaco from 'monaco-editor';
import { createDefinitionProvider } from '#lib/kcl-language/lsp/providers/definition-provider.js';
import type { KclLspClient } from '#lib/kcl-language/lsp/kcl-lsp-client.js';
import type { KclSymbol, KclSymbolService } from '#lib/kcl-language/lsp/kcl-symbol-service.js';
import { createTestCancellationToken } from '#lib/testing/monaco-test-token.js';
import { drainMonacoPostTestWork } from '#lib/testing/monaco-async-drain.js';
import { codeLanguages } from '@taucad/types/constants';

function stubClient(): KclLspClient {
  return {
    textDocumentDefinition: vi.fn().mockResolvedValue(null),
    getFileManager: vi.fn().mockReturnValue(undefined),
  } as unknown as KclLspClient;
}

function minimalSymbol(overrides: Partial<KclSymbol> & Pick<KclSymbol, 'name' | 'kind' | 'uri'>): KclSymbol {
  return {
    name: overrides.name,
    kind: overrides.kind,
    uri: overrides.uri,
    range: overrides.range ?? { start: 0, end: 1 },
    lineNumber: overrides.lineNumber ?? 1,
    column: overrides.column ?? 1,
    value: overrides.value,
    isExported: overrides.isExported ?? false,
    parameters: overrides.parameters,
    returnType: overrides.returnType,
    containingFunction: overrides.containingFunction,
    importPath: overrides.importPath,
  };
}

describe('KCL definition provider', () => {
  afterEach(async () => {
    for (const model of monaco.editor.getModels()) {
      model.dispose();
    }

    await drainMonacoPostTestWork();
  });

  it('returns import target file:// URI for quoted .kcl import (opener materialises model)', async () => {
    const client = stubClient();
    const provider = createDefinitionProvider(monaco, client);
    const mainUri = monaco.Uri.parse('file:///bench/main.kcl');
    const mainModel = monaco.editor.createModel('import "car-wheel.kcl"\n', codeLanguages.kcl, mainUri);
    const position = new monaco.Position(1, 10);
    const token = createTestCancellationToken();

    const definition = await provider.provideDefinition(mainModel, position, token);

    expect(definition).toBeDefined();
    const location = Array.isArray(definition) ? definition[0] : definition;
    expect(location?.uri.toString()).toBe('file:///bench/car-wheel.kcl');
    expect(monaco.editor.getModel(location!.uri)).toBeNull();
  });

  it('returns import target via getImportPathAtPosition when cursor is inside the string', async () => {
    const client = stubClient();
    const provider = createDefinitionProvider(monaco, client);
    const mainUri = monaco.Uri.parse('file:///src/app.kcl');
    const mainModel = monaco.editor.createModel('import * from "nested/part.kcl"\n', codeLanguages.kcl, mainUri);
    const position = new monaco.Position(1, 22);
    const token = createTestCancellationToken();

    const definition = await provider.provideDefinition(mainModel, position, token);

    expect(definition).toBeDefined();
    const location = Array.isArray(definition) ? definition[0] : definition;
    expect(location?.uri.toString()).toBe('file:///src/nested/part.kcl');
  });

  it('returns local symbol location from symbol service', async () => {
    const client = stubClient();
    const documentUri = 'file:///local/main.kcl';
    const symbolService = {
      isInitialized: true,
      findSymbolByName: vi.fn(
        (): KclSymbol =>
          minimalSymbol({
            name: 'myVar',
            kind: 'variable',
            uri: documentUri,
            lineNumber: 3,
            column: 1,
          }),
      ),
    } as unknown as KclSymbolService;

    const provider = createDefinitionProvider(monaco, client, symbolService);
    const mainUri = monaco.Uri.parse(documentUri);
    const mainModel = monaco.editor.createModel('// head\nmyVar = 1\n', codeLanguages.kcl, mainUri);
    const position = new monaco.Position(2, 2);
    const token = createTestCancellationToken();

    const definition = await provider.provideDefinition(mainModel, position, token);

    expect(definition).toBeDefined();
    const location = Array.isArray(definition) ? definition[0] : definition;
    expect(location?.uri.toString()).toBe(documentUri);
    expect(location?.range.startLineNumber).toBe(3);
  });
});
