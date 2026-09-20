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
    bash: 'bash',
    python: 'python',
    csharp: 'csharp',
    json: 'json',
    jsonl: 'jsonl',
    jsonc: 'jsonc',
    markdown: 'markdown',
    kcl: 'kcl',
    openscad: 'openscad',
    stepfile: 'stepfile',
    stl: 'stl',
    usd: 'usd',
    sysml: 'sysml',
  },
}));
vi.mock('#lib/kcl-language/kcl-register-language.js', () => ({ kclContribution: {} }));
vi.mock('#lib/openscad-language/openscad-register-language.js', () => ({ openscadContribution: {} }));
vi.mock('#lib/stepfile-language/stepfile-register-language.js', () => ({ stepfileContribution: {} }));
vi.mock('#lib/stl-language/stl-register-language.js', () => ({ stlContribution: {} }));
vi.mock('#lib/usd-language/usd-register-language.js', () => ({ usdContribution: {} }));
vi.mock('#lib/sysml-language/sysml-register-language.js', () => ({ sysmlContribution: {} }));
vi.mock('#lib/markdown-language/markdown-register-language.js', () => ({ markdownContribution: {} }));
vi.mock('#lib/bash-language/bash-register-language.js', () => ({ bashContribution: {} }));
vi.mock('#lib/python-language/python-register-language.js', () => ({ pythonContribution: {} }));
vi.mock('#lib/csharp-language/csharp-register-language.js', () => ({ csharpContribution: {} }));
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
vi.mock('monaco-editor/esm/vs/basic-languages/python/python.contribution.js', () => ({}));
vi.mock('monaco-editor/esm/vs/basic-languages/csharp/csharp.contribution.js', () => ({}));
vi.mock('monaco-editor/esm/vs/language/json/monaco.contribution.js', () => ({
  jsonDefaults: { modeConfiguration: {}, setModeConfiguration: vi.fn() },
}));
vi.mock('monaco-editor/esm/vs/language/typescript/monaco.contribution.js', () => ({}));

describe('configureMonaco', () => {
  /* `configureMonaco` memoizes per module instance; each test gets its own. */
  beforeEach(() => {
    vi.resetModules();
    mockMark.mockClear();
    mockMeasure.mockClear();
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Monaco global
    vi.stubGlobal('self', { MonacoEnvironment: undefined });
  });

  it('should configure Monaco without priming fonts when FontFaceSet is unavailable', async () => {
    const { loader } = await import('@monaco-editor/react');
    const { configureMonaco } = await import('#lib/monaco.lib.client.js');
    const monaco = await import('monaco-editor');
    vi.mocked(loader.config).mockClear();
    Reflect.deleteProperty(document, 'fonts');

    await expect(configureMonaco()).resolves.toBe(monaco);

    expect(loader.config).toHaveBeenCalledWith({ monaco });
  });

  it('should configure workers and all four GitHub themes', async () => {
    const { configureMonaco } = await import('#lib/monaco.lib.client.js');
    const monaco = await import('monaco-editor');
    vi.mocked(monaco.editor.defineTheme).mockClear();
    // Jsdom omits the FontFaceSet API; stub the surface configureMonaco touches
    // (Geist Mono prime + remeasure-on-loadingdone listener).
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: {
        load: vi.fn(async () => []),
        addEventListener: vi.fn(),
      },
    });

    const pending = Promise.withResolvers<FontFace[]>();
    vi.mocked(document.fonts.load).mockReturnValue(pending.promise);
    const first = configureMonaco();
    const second = configureMonaco();
    let completed = false;
    const observing = (async () => {
      await second;
      completed = true;
    })();
    await Promise.resolve();
    expect(completed).toBe(false);
    pending.resolve([]);
    await Promise.all([first, second, observing]);

    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- accessing mock structure
    const { getWorker } = (
      globalThis.self as { MonacoEnvironment: { getWorker: (id: string, label: string) => unknown } }
    ).MonacoEnvironment;
    getWorker('', 'typescript');

    expect(mockMark).toHaveBeenCalledWith('ts-worker:create');
    expect(mockMeasure).toHaveBeenCalledWith('ts-worker:cold-start', 'ts-worker:create');

    const definedThemes = vi.mocked(monaco.editor.defineTheme).mock.calls;
    expect(definedThemes.map(([themeId]) => themeId)).toEqual([
      'github-dark',
      'github-light',
      'github-dark-high-contrast',
      'github-light-high-contrast',
    ]);
    expect(definedThemes.find(([themeId]) => themeId === 'github-dark-high-contrast')?.[1].base).toBe('hc-black');
    expect(definedThemes.find(([themeId]) => themeId === 'github-light-high-contrast')?.[1].base).toBe('hc-light');
  });
});

describe('Monaco configuration state', () => {
  const stubFonts = (): void => {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Monaco global
    vi.stubGlobal('self', { MonacoEnvironment: undefined });
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { load: vi.fn(async () => []), addEventListener: vi.fn() },
    });
  };

  beforeEach(() => {
    vi.resetModules();
    stubFonts();
  });

  /* Subscribing is what starts configuration (from a commit-phase effect), and
   * `ready` is published only after `loader.config` has run, so a reader of
   * `ready` can mount `Editor` without the loader reaching for its CDN. */
  it('starts on first subscription and publishes the instance after the loader is configured', async () => {
    const { loader } = await import('@monaco-editor/react');
    const { getMonacoConfiguration, subscribeMonacoConfiguration } = await import('#lib/monaco.lib.client.js');
    const monaco = await import('monaco-editor');
    vi.mocked(loader.config).mockClear();
    expect(getMonacoConfiguration()).toEqual({ status: 'idle' });

    const seen: string[] = [];
    const unsubscribe = subscribeMonacoConfiguration(() => {
      const state = getMonacoConfiguration();
      seen.push(state.status);
      if (state.status === 'ready') {
        expect(loader.config).toHaveBeenCalledWith({ monaco });
      }
    });
    expect(getMonacoConfiguration()).toEqual({ status: 'pending' });
    await vi.waitFor(() => {
      expect(getMonacoConfiguration()).toEqual({ status: 'ready', monaco });
    });
    expect(seen).toEqual(['pending', 'ready']);

    const snapshot = getMonacoConfiguration();
    const late = vi.fn();
    subscribeMonacoConfiguration(late);
    expect(getMonacoConfiguration()).toBe(snapshot);
    expect(late).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('publishes a failure and retries on the next subscription', async () => {
    const { getHighlighter } = await import('#lib/shiki.lib.js');
    vi.mocked(getHighlighter).mockRejectedValueOnce(new Error('chunk failed'));
    const { getMonacoConfiguration, subscribeMonacoConfiguration } = await import('#lib/monaco.lib.client.js');

    const first = subscribeMonacoConfiguration(() => undefined);
    await vi.waitFor(() => {
      expect(getMonacoConfiguration()).toMatchObject({ status: 'failed', error: new Error('chunk failed') });
    });

    const second = subscribeMonacoConfiguration(() => undefined);
    await vi.waitFor(() => {
      expect(getMonacoConfiguration().status).toBe('ready');
    });
    first();
    second();
  });
});
