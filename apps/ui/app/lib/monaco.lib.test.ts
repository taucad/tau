import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockMark = vi.fn();
const mockMeasure = vi.fn();
vi.stubGlobal('performance', { mark: mockMark, measure: mockMeasure });

vi.mock('@monaco-editor/react', () => ({ loader: { config: vi.fn() } }));
vi.mock('monaco-editor/esm/vs/editor/editor.worker?worker', () => ({ default: vi.fn() }));
vi.mock('monaco-editor/esm/vs/language/json/json.worker?worker', () => ({ default: vi.fn() }));
vi.mock('monaco-editor/esm/vs/language/typescript/ts.worker?worker', () => ({
  // oxlint-disable-next-line @typescript-eslint/no-extraneous-class -- mock class must be constructable
  default: class TsWorker {},
}));
vi.mock('@shikijs/monaco', () => ({
  shikiToMonaco: vi.fn(),
  textmateThemeToMonacoTheme: vi.fn(() => ({ rules: [], colors: {} })),
}));
vi.mock('monacopilot', () => ({ registerCompletion: vi.fn() }));
vi.mock('#lib/shiki.lib.js', () => ({
  getHighlighter: vi.fn(async () => ({
    getLanguage: vi.fn(() => ({})),
    getTheme: vi.fn(() => ({ settings: [] })),
  })),
}));
vi.mock('#lib/monaco-json.lib.js', () => ({
  createJsonTokensProvider: vi.fn(() => ({})),
  generateJsonBracketHighlightColors: vi.fn(() => ({})),
  generateJsonThemeRules: vi.fn(() => []),
}));
vi.mock('#lib/monaco-language-registry.js', () => ({
  registry: { addContribution: vi.fn(), registerAll: vi.fn() },
}));
vi.mock('#lib/monaco.constants.js', () => ({
  monacoLanguages: {
    typescript: 'typescript',
    typescriptreact: 'typescriptreact',
    javascript: 'javascript',
    javascriptreact: 'javascriptreact',
    json: 'json',
  },
}));
vi.mock('#lib/kcl-language/kcl-register-language.js', () => ({ kclContribution: {} }));
vi.mock('#lib/openscad-language/openscad-register-language.js', () => ({ openscadContribution: {} }));
vi.mock('#lib/stepfile-language/stepfile-register-language.js', () => ({ stepfileContribution: {} }));
vi.mock('#lib/stl-language/stl-register-language.js', () => ({ stlContribution: {} }));
vi.mock('#lib/usd-language/usd-register-language.js', () => ({ usdContribution: {} }));
vi.mock('#lib/javascript-contribution.js', () => ({ jsContribution: {} }));
vi.mock('#lib/typescript-contribution.js', () => ({ tsContribution: {} }));
vi.mock('@taucad/lsp/language-fs-sync-host', () => ({
  createTauLanguageHostInit: vi.fn(() => undefined),
}));
vi.mock('monaco-editor', () => ({
  languages: { setTokensProvider: vi.fn(), register: vi.fn() },
  editor: { defineTheme: vi.fn() },
}));
vi.mock('monaco-editor/esm/vs/editor/edcore.main.js', () => ({}));
vi.mock('monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution.js', () => ({}));
vi.mock('monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution.js', () => ({}));
vi.mock('monaco-editor/esm/vs/language/json/monaco.contribution.js', () => ({
  jsonDefaults: { modeConfiguration: {}, setModeConfiguration: vi.fn() },
}));
vi.mock('monaco-editor/esm/vs/language/typescript/monaco.contribution.js', () => ({}));

describe('configureMonaco', () => {
  beforeEach(() => {
    mockMark.mockClear();
    mockMeasure.mockClear();
  });

  it('should emit performance marks when creating TS worker', async () => {
    const { configureMonaco } = await import('#lib/monaco.lib.client.js');

    // eslint-disable-next-line @typescript-eslint/naming-convention -- Monaco global
    vi.stubGlobal('self', { MonacoEnvironment: undefined });
    // Jsdom omits the FontFaceSet API; stub the surface configureMonaco touches
    // (Geist Mono prime + remeasure-on-loadingdone listener).
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: {
        load: vi.fn(async () => []),
        addEventListener: vi.fn(),
      },
    });

    await configureMonaco();

    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- accessing mock structure
    const { getWorker } = (
      globalThis.self as { MonacoEnvironment: { getWorker: (id: string, label: string) => unknown } }
    ).MonacoEnvironment;
    getWorker('', 'typescript');

    expect(mockMark).toHaveBeenCalledWith('ts-worker:create');
    expect(mockMeasure).toHaveBeenCalledWith('ts-worker:cold-start', 'ts-worker:create');
  });
});
