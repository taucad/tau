import { describe, expect, it, vi } from 'vitest';
import type * as Monaco from 'monaco-editor';
import {
  loadKernelStaticTypesFromMount,
  setJsCompilerOptions,
  setTsCompilerOptions,
} from '#lib/typescript-family-shared.js';

type ReadFile = NonNullable<Parameters<typeof loadKernelStaticTypesFromMount>[0]>['readFile'];
const unusedReadFile = (async () => new Uint8Array()) as unknown as ReadFile;

describe('kernel static type loading', () => {
  it('keeps the unavailable dependency mount optional', async () => {
    await expect(loadKernelStaticTypesFromMount(undefined)).resolves.toEqual([]);
    await expect(
      loadKernelStaticTypesFromMount({
        readdir: async () => {
          throw Object.assign(new Error('no dependency mount'), { code: 'ROOT_UNAVAILABLE' });
        },
        readFile: unusedReadFile,
      }),
    ).resolves.toEqual([]);
  });

  it('does not turn an installation failure into empty typings', async () => {
    await expect(
      loadKernelStaticTypesFromMount({
        readdir: async () => {
          throw new Error('OPFS installation failed');
        },
        readFile: unusedReadFile,
      }),
    ).rejects.toThrow('OPFS installation failed');
  });
});

/** Monaco's defaults object: every setter fires `onDidChange`, which stops and restarts the TS worker. */
const languageDefaults = () => {
  let compilerOptions: Record<string, unknown> = {};
  let inlayHintsOptions: Record<string, unknown> = {};
  return {
    getCompilerOptions: () => compilerOptions,
    get inlayHintsOptions() {
      return inlayHintsOptions;
    },
    setCompilerOptions: vi.fn((next: Record<string, unknown>) => {
      compilerOptions = next;
    }),
    setInlayHintsOptions: vi.fn((next: Record<string, unknown>) => {
      inlayHintsOptions = next;
    }),
  };
};

describe('TS family option re-application (B-16, D-UI-30)', () => {
  it('does not re-set unchanged options on reactivation, so the TS worker is not restarted', () => {
    const typescriptDefaults = languageDefaults();
    const javascriptDefaults = languageDefaults();
    const monaco = {
      typescript: {
        typescriptDefaults,
        javascriptDefaults,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- mirrors Monaco's enum names.
        ScriptTarget: { ESNext: 99 },
        // eslint-disable-next-line @typescript-eslint/naming-convention -- mirrors Monaco's enum names.
        ModuleKind: { ESNext: 99 },
      },
    } as unknown as typeof Monaco;

    setTsCompilerOptions(monaco);
    setJsCompilerOptions(monaco);
    /* The project is reopened: its contributions activate again. */
    setTsCompilerOptions(monaco);
    setJsCompilerOptions(monaco);

    expect(typescriptDefaults.setCompilerOptions).toHaveBeenCalledTimes(1);
    expect(typescriptDefaults.setInlayHintsOptions).toHaveBeenCalledTimes(1);
    expect(javascriptDefaults.setCompilerOptions).toHaveBeenCalledTimes(1);
    expect(javascriptDefaults.setInlayHintsOptions).toHaveBeenCalledTimes(1);
  });
});
