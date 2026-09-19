import { loader } from '@monaco-editor/react';
import { Topic } from '@taucad/events';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import { shikiToMonaco, textmateThemeToMonacoTheme } from '@shikijs/monaco';
import type { CompletionRegistration } from 'monacopilot';
import type * as Monaco from 'monaco-editor';
import {
  createJsonTokensProvider,
  generateJsonBracketHighlightColors,
  generateJsonThemeRules,
} from '#lib/monaco-json.lib.js';
import { getHighlighter } from '#lib/shiki.lib.js';
import { registry } from '#lib/monaco-language-registry.js';
import { monacoLanguages } from '#lib/monaco.constants.js';
import { createTauLanguageHostInit } from '@taucad/lsp/language-fs-sync-host';
import { kclContribution } from '#lib/kcl-language/kcl-register-language.js';
import { openscadContribution } from '#lib/openscad-language/openscad-register-language.js';
import { stepfileContribution } from '#lib/stepfile-language/stepfile-register-language.js';
import { stlContribution } from '#lib/stl-language/stl-register-language.js';
import { usdContribution } from '#lib/usd-language/usd-register-language.js';
import { sysmlContribution } from '#lib/sysml-language/sysml-register-language.js';
import { markdownContribution } from '#lib/markdown-language/markdown-register-language.js';
import { bashContribution } from '#lib/bash-language/bash-register-language.js';
import { pythonContribution } from '#lib/python-language/python-register-language.js';
import { csharpContribution } from '#lib/csharp-language/csharp-register-language.js';
import { jsContribution } from '#lib/javascript-contribution.js';
import { tsContribution } from '#lib/typescript-contribution.js';

/**
 * Register-eager / activate-lazy contract:
 *
 * Every language contribution below is added to the registry at module load
 * (Phase 1 — `registerAll(monaco)` runs from {@link configureMonaco}, doing
 * only cheap language-metadata wiring). Phase 2 — `registry.activate(...)` —
 * runs from `MonacoModelServiceProvider` and gates each contribution's heavy
 * boot (LSP worker, WASM, ATA) behind the first `monaco.languages.onLanguage`
 * fire for any of its `activationLanguageIds`. A model already open at
 * `activate()` time runs the activation immediately (fast path). The
 * `MonacoModelServiceProvider` additionally calls `registry.prefetch(...)`
 * with the active kernel's source-file Monaco ids to mask first-keystroke
 * latency in the dominant code path.
 */

// Register contributions at module load (idempotent -- safe under HMR)
registry.addContribution(kclContribution);
registry.addContribution(openscadContribution);
registry.addContribution(stepfileContribution);
registry.addContribution(stlContribution);
registry.addContribution(usdContribution);
registry.addContribution(sysmlContribution);
registry.addContribution(markdownContribution);
registry.addContribution(bashContribution);
registry.addContribution(pythonContribution);
registry.addContribution(csharpContribution);
registry.addContribution(tsContribution);
registry.addContribution(jsContribution);

/**
 * Where Monaco's one-time configuration stands.
 *
 * `ready` carries the configured instance; only then has `loader.config` run,
 * so only then may anything call `loader.init()` (directly, through
 * `useMonaco`, or by mounting `Editor`) without the loader fetching a second
 * Monaco from its CDN default.
 */
export type MonacoConfiguration =
  | { readonly status: 'idle' }
  | { readonly status: 'pending' }
  | { readonly status: 'ready'; readonly monaco: typeof Monaco }
  | { readonly status: 'failed'; readonly error: Error };

// Guard to ensure configureMonaco runs only once. shikiToMonaco monkey-patches
// monaco.editor.create and monaco.editor.setTheme, creating chained wrappers
// on repeated calls. This promise prevents that during HMR or multiple call
// sites. A failed attempt (typically an offline chunk load) clears it so the
// next caller retries.
let configuration: Promise<typeof Monaco | undefined> | undefined;
let configurationSnapshot: MonacoConfiguration = { status: 'idle' };
const configurationTopic = new Topic<void>({ name: 'monaco-configuration' });

const publishConfiguration = (next: MonacoConfiguration): void => {
  configurationSnapshot = next;
  configurationTopic.emit();
};

/**
 * Configure the Monaco editor.
 *
 * This custom loader supports Vite bundling and ensures a minimal
 * bundle size. Idempotent -- safe to call from multiple entry points.
 * Call it from effects or event handlers, never at module evaluation: its
 * dynamic imports can resolve to the chunk that is still evaluating the caller.
 *
 * @returns The configured Monaco instance, or `undefined` outside a browser.
 */
export const configureMonaco = async (): Promise<typeof Monaco | undefined> => {
  // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- can be undefined in SSR
  if (globalThis.self === undefined) {
    return undefined;
  }
  configuration ??= startConfiguration();
  return configuration;
};

const startConfiguration = async (): Promise<typeof Monaco> => {
  publishConfiguration({ status: 'pending' });
  try {
    const monaco = await initializeMonaco();
    publishConfiguration({ status: 'ready', monaco });
    return monaco;
  } catch (error) {
    configuration = undefined;
    publishConfiguration({ status: 'failed', error: error instanceof Error ? error : new Error(String(error)) });
    throw error;
  }
};

/**
 * The current configuration state, for `useSyncExternalStore`.
 *
 * @returns The latest snapshot; a new object only when the state changes.
 */
export const getMonacoConfiguration = (): MonacoConfiguration => configurationSnapshot;

/**
 * Subscribe to configuration changes, starting configuration if it has not
 * started (or retrying it after a failure). Subscribing happens in React's
 * commit phase, so configuration never starts during module evaluation.
 *
 * @param listener - Called after every state change.
 * @returns The unsubscribe function.
 */
export const subscribeMonacoConfiguration = (listener: () => void): (() => void) => {
  const unsubscribe = configurationTopic.subscribe(listener);
  if (configurationSnapshot.status !== 'ready') {
    void configureMonaco().catch(() => undefined);
  }
  return unsubscribe;
};

const initializeMonaco = async (): Promise<typeof Monaco> => {
  // Prime Geist Mono before Monaco's first DomCharWidthReader pass.
  //
  // Monaco caches char-width measurements as "trusted" on the first read
  // (see node_modules/monaco-editor/.../fontMeasurements.js readFontInfo).
  // With `font-display: swap`, a cold load measures the SF Mono fallback
  // and never re-measures, so block decorations (selectionHighlight,
  // wordHighlight) drift left as columns grow once Geist Mono swaps in.
  // Awaiting `document.fonts.load(...)` before measurement guarantees the
  // first reading uses Geist Mono advances. `.catch` keeps offline users
  // working with fallback metrics (no worse than today).
  // Sizes mirror code-editor.client.tsx (14 desktop, 16 mobile).
  // `document.fonts` is absent under jsdom, where there is nothing to prime.
  const fontSet = Reflect.get(document, 'fonts') as FontFaceSet | undefined;
  await Promise.all(
    fontSet === undefined ? [] : [fontSet.load("14px 'Geist Mono'"), fontSet.load("16px 'Geist Mono'")],
  ).catch(() => undefined);

  globalThis.self.MonacoEnvironment = {
    getWorker(_, label) {
      if (label === 'json' || label === 'jsonc') {
        return new JsonWorker();
      }

      if (label === 'typescript' || label === 'javascript') {
        performance.mark('ts-worker:create');
        const init = createTauLanguageHostInit();
        if (init) {
          const worker = new Worker(
            new URL('../../node_modules/@taucad/lsp/src/monaco-ts-worker/monaco-ts-worker.entry.ts', import.meta.url),
            {
              type: 'module',
              name: 'tau-ts-worker',
            },
          );
          worker.postMessage(
            {
              type: 'tau:init',
              port: init.port,
              slotSab: init.slotSab,
              arenaSab: init.arenaSab,
              filePoolBuffer: init.filePoolBuffer,
              workspaceRootAbsolute: init.workspaceRootAbsolute,
            },
            [init.port],
          );
          performance.measure('ts-worker:cold-start', 'ts-worker:create');
          return worker;
        }
        const worker = new TsWorker();
        performance.measure('ts-worker:cold-start', 'ts-worker:create');
        return worker;
      }

      return new EditorWorker();
    },
  };

  const monaco = await import('monaco-editor');

  loader.config({
    monaco,
  });

  // Remeasure on every subsequent web-font load. Even after priming Geist
  // Mono above, additional weights/styles or HMR re-injection can change
  // the cached advances; `monaco.editor.remeasureFonts()` clears
  // FontMeasurementsImpl._cache and triggers per-editor re-render.
  fontSet?.addEventListener('loadingdone', () => {
    monaco.editor.remeasureFonts();
  });

  // Core Editor features, like auto-completion.
  // @ts-expect-error -- no declaration file
  await import('monaco-editor/esm/vs/editor/edcore.main.js');

  // Languages
  await import('monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution.js');
  await import('monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution.js');
  // Capture jsonDefaults to disable the built-in JSON tokenizer below.
  // Monaco's ESM .d.ts for this contribution declares only `export {}`, but
  // the module exposes `jsonDefaults` at runtime.
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- empty .d.ts from third-party
  const { jsonDefaults } = (await import('monaco-editor/esm/vs/language/json/monaco.contribution.js')) as unknown as {
    jsonDefaults: {
      readonly modeConfiguration: Record<string, boolean>;
      setModeConfiguration(config: Record<string, boolean>): void;
    };
  };
  await import('monaco-editor/esm/vs/language/typescript/monaco.contribution.js');

  // Disable Monaco's built-in JSON tokenizer. The JSON mode contribution
  // lazily calls setupMode → registerProviders on first language encounter
  // (via `languages.onLanguage("json", ...)`), which registers a competing
  // tokenizer via setTokensProvider when `tokens: true`. This overrides our
  // Shiki-based tokenizer asynchronously, causing a visible flicker from
  // correct colors back to the default palette.
  jsonDefaults.setModeConfiguration({
    ...jsonDefaults.modeConfiguration,
    tokens: false,
  });

  // Phase 1: Register language metadata for all contributions (idempotent)
  registry.registerAll(monaco);

  // JSONL is deliberately metadata-only: Shiki owns tokenization, and there is
  // no JSON language service validation for multi-root newline-delimited JSON.
  monaco.languages.register({ id: monacoLanguages.jsonl, aliases: ['JSON Lines', 'jsonl'], extensions: ['.jsonl'] });

  const highlighter = await getHighlighter();

  // Register Shiki highlighter globally. The idempotency guard above ensures
  // this only runs once, preventing monkey-patch wrapper multiplication on
  // monaco.editor.create and monaco.editor.setTheme.
  shikiToMonaco(highlighter, monaco);

  // Override Shiki's JSON tokenizer to preserve TextMate scope granularity
  // and add depth-based key colorization.
  const jsonGrammar = highlighter.getLanguage('json');
  const jsonTokensProvider = createJsonTokensProvider(jsonGrammar);
  monaco.languages.setTokensProvider('json', jsonTokensProvider);

  // Augment GitHub themes with JSON-specific depth and value rules
  // derived from each theme's own scope colors.
  for (const themeId of [
    'github-dark',
    'github-light',
    'github-dark-high-contrast',
    'github-light-high-contrast',
  ] as const) {
    const shikiTheme = highlighter.getTheme(themeId);
    // MonacoTheme extends monaco-editor-core's IStandaloneThemeData which is
    // structurally identical to monaco-editor's but TypeScript can't unify
    // the two package namespaces.
    const monacoTheme = textmateThemeToMonacoTheme(shikiTheme) as unknown as Monaco.editor.IStandaloneThemeData;
    if (themeId === 'github-dark-high-contrast') {
      monacoTheme.base = 'hc-black';
    } else if (themeId === 'github-light-high-contrast') {
      monacoTheme.base = 'hc-light';
    }
    monacoTheme.rules.push(...generateJsonThemeRules(shikiTheme));
    Object.assign(monacoTheme.colors, generateJsonBracketHighlightColors(shikiTheme));
    monaco.editor.defineTheme(themeId, monacoTheme);
  }

  return monaco;
};

/**
 * Return the disabled AI-completion lifecycle registration.
 *
 * @returns A no-op registration while AI completion is disabled.
 */
export const registerCompletions = (): CompletionRegistration => {
  const registrations: CompletionRegistration[] = [];

  return {
    trigger() {
      for (const registration of registrations) {
        registration.trigger();
      }
    },
    deregister() {
      for (const registration of registrations) {
        registration.deregister();
      }
    },
    updateOptions(callback) {
      for (const registration of registrations) {
        registration.updateOptions(callback);
      }
    },
  };
};
