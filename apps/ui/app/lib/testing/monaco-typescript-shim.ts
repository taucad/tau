/**
 * Minimal `monaco.typescript` surface for JS/TS contribution unit tests.
 */

import type { MonacoTestStub } from '#lib/testing/monaco-language-stub.js';
import { vi } from 'vitest';

/* eslint-disable @typescript-eslint/naming-convention -- mocks mirror PascalCase exports from Monaco */

export function attachTypescriptShim(stub: MonacoTestStub): void {
  const fullModeConfiguration = {
    completionItems: true,
    hovers: true,
    documentSymbols: true,
    definitions: true,
    references: true,
    documentHighlights: true,
    rename: true,
    diagnostics: true,
    documentRangeFormattingEdits: true,
    signatureHelp: true,
    onTypeFormattingEdits: true,
    codeActions: true,
    inlayHints: true,
  };
  let tsModeConfiguration = { ...fullModeConfiguration };
  let jsModeConfiguration = { ...fullModeConfiguration };
  const mockWorker = {
    getLibFiles: vi.fn(async (): Promise<Record<string, string>> => ({})),
    getDefinitionAtPosition: vi.fn(),
    getReferencesAtPosition: vi.fn(),
    getRenameInfo: vi.fn(async (): Promise<unknown> => ({ canRename: true })),
    findRenameLocations: vi.fn(),
    getImplementationAtPosition: vi.fn(),
    getTypeDefinitionAtPosition: vi.fn(),
    getNavigateToItems: vi.fn(),
    prepareCallHierarchy: vi.fn(),
    provideCallHierarchyIncomingCalls: vi.fn(),
    provideCallHierarchyOutgoingCalls: vi.fn(),
  };
  const workerFunction = async (..._uris: unknown[]): Promise<typeof mockWorker> => mockWorker;

  Object.assign(stub.monaco, {
    typescript: {
      typescriptDefaults: {
        setCompilerOptions: vi.fn(),
        setInlayHintsOptions: vi.fn(),
        setEagerModelSync: vi.fn(),
        addExtraLib: vi.fn(() => ({ dispose: vi.fn() })),
        get modeConfiguration() {
          return tsModeConfiguration;
        },
        setModeConfiguration: vi.fn((next: typeof tsModeConfiguration) => {
          tsModeConfiguration = { ...tsModeConfiguration, ...next };
        }),
        getExtraLibs: vi.fn(() => ({})),
        onDidExtraLibsChange: vi.fn(() => ({ dispose: vi.fn() })),
      },
      javascriptDefaults: {
        setCompilerOptions: vi.fn(),
        setInlayHintsOptions: vi.fn(),
        setEagerModelSync: vi.fn(),
        addExtraLib: vi.fn(() => ({ dispose: vi.fn() })),
        get modeConfiguration() {
          return jsModeConfiguration;
        },
        setModeConfiguration: vi.fn((next: typeof jsModeConfiguration) => {
          jsModeConfiguration = { ...jsModeConfiguration, ...next };
        }),
        getExtraLibs: vi.fn(() => ({})),
        onDidExtraLibsChange: vi.fn(() => ({ dispose: vi.fn() })),
      },
      getTypeScriptWorker: vi.fn(async () => workerFunction),
      getJavaScriptWorker: vi.fn(async () => workerFunction),
      ModuleResolutionKind: { NodeJs: 'NodeJs', Bundler: 'Bundler' },
      ScriptTarget: { ESNext: 'ESNext' },
      ModuleKind: { ESNext: 'ESNext' },
    },
  });
}

/* eslint-enable @typescript-eslint/naming-convention -- mock surface mirrors Monaco PascalCase */
