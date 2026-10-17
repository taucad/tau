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
  /* Monaco's defaults keep what was last set; the contributions skip a set that changes nothing. */
  const familyOptions = () => {
    let compilerOptions: unknown = {};
    let inlayHintsOptions: unknown = {};
    return {
      getCompilerOptions: () => compilerOptions,
      get inlayHintsOptions() {
        return inlayHintsOptions;
      },
      setCompilerOptions: vi.fn((next: unknown) => {
        compilerOptions = next;
      }),
      setInlayHintsOptions: vi.fn((next: unknown) => {
        inlayHintsOptions = next;
      }),
    };
  };
  /* Descriptors, not `Object.assign`: the getters must stay getters. */
  const withFamilyOptions = <Extra extends Record<string, unknown>>(extra: Extra) =>
    Object.defineProperties(familyOptions(), Object.getOwnPropertyDescriptors(extra)) as ReturnType<
      typeof familyOptions
    > &
      Extra;
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
      typescriptDefaults: withFamilyOptions({
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
      }),
      javascriptDefaults: withFamilyOptions({
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
      }),
      getTypeScriptWorker: vi.fn(async () => workerFunction),
      getJavaScriptWorker: vi.fn(async () => workerFunction),
      ModuleResolutionKind: { NodeJs: 'NodeJs', Bundler: 'Bundler' },
      ScriptTarget: { ESNext: 'ESNext' },
      ModuleKind: { ESNext: 'ESNext' },
    },
  });
}

/* eslint-enable @typescript-eslint/naming-convention -- mock surface mirrors Monaco PascalCase */
