/**
 * Language workers follow the code pane (B-16).
 *
 * Link intent configures Monaco ahead of the project route, and that is all it
 * may do: a project whose code pane is never opened runs no TypeScript,
 * JavaScript, JSON, editor or KCL LSP worker. Opening a code pane starts the
 * workers its files need.
 *
 * Runs the real Monaco, the real `configureMonaco` worker factory, the real
 * contribution registry and the real provider; only the worker scripts, Shiki
 * and the project's file system are stand-ins.
 */
// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { AppCapabilitiesManifest } from '#types/runtime-client.alias.js';

/** Every worker the page started, by Monaco label or worker name. */
const startedWorkers = vi.hoisted((): string[] => []);

vi.mock('monaco-editor/esm/vs/editor/editor.worker?worker', async () => {
  const { createWorkerStub } = await import('#lib/testing/worker-stub.js');
  return { default: createWorkerStub(startedWorkers, 'editor') };
});
vi.mock('monaco-editor/esm/vs/language/json/json.worker?worker', async () => {
  const { createWorkerStub } = await import('#lib/testing/worker-stub.js');
  return { default: createWorkerStub(startedWorkers, 'json') };
});
vi.mock('monaco-editor/esm/vs/language/typescript/ts.worker?worker', async () => {
  const { createWorkerStub } = await import('#lib/testing/worker-stub.js');
  return { default: createWorkerStub(startedWorkers, 'typescript') };
});
/* Shiki's grammars are not under test; tokenization stays Monaco's own. */
vi.mock('@shikijs/monaco', () => ({
  shikiToMonaco: vi.fn(),
  textmateThemeToMonacoTheme: vi.fn(() => ({ base: 'vs', inherit: true, rules: [], colors: {} })),
}));
vi.mock('#lib/shiki.lib.js', () => ({
  getHighlighter: vi.fn(async () => ({ getLanguage: vi.fn(() => ({})), getTheme: vi.fn(() => ({ settings: [] })) })),
}));
vi.mock('#lib/monaco-json.lib.js', () => ({
  createJsonTokensProvider: vi.fn(() => ({ getInitialState: () => ({}), tokenize: () => ({ tokens: [] }) })),
  generateJsonBracketHighlightColors: vi.fn(() => ({})),
  generateJsonThemeRules: vi.fn(() => []),
}));

const capabilities = vi.hoisted(
  (): Pick<AppCapabilitiesManifest, 'registrations'> => ({
    registrations: [
      { kind: 'kernel', id: 'replicad', extensions: ['ts', 'js'] },
      { kind: 'kernel', id: 'zoo', extensions: ['kcl'] },
    ],
  }),
);
/* Two geometry units whose kernels settle at once: a TypeScript one and a KCL one. */
const project = vi.hoisted(() => {
  const unit = (activeKernelId: string) => ({
    subscribe(listener: (snapshot: unknown) => void) {
      listener({ context: { activeKernelId, capabilities } });
      return { unsubscribe: () => undefined };
    },
  });
  return {
    projectId: 'proj_workers',
    editorRef: { send: () => undefined, on: () => ({ unsubscribe: () => undefined }) },
    geometryUnits: new Map([
      ['/main.ts', unit('replicad')],
      ['/part.kcl', unit('zoo')],
    ]),
  };
});
vi.mock('#hooks/use-project.js', () => ({ useProject: () => project }));

/* Stable identities: the provider's effect re-runs whenever one changes. */
const fileManager = vi.hoisted(() => {
  const snapshot = {
    matches: () => false,
    context: { proxy: {}, rootDirectory: '/', filePoolBuffer: undefined, worker: undefined, viewClient: undefined },
  };
  return {
    fileManagerRef: { getSnapshot: () => snapshot, subscribe: () => ({ unsubscribe: () => undefined }) },
    contentService: {
      resolve: async () => ({ kind: 'loading' }),
      peekOutcome: () => undefined,
      onDidContentChange: () => () => undefined,
      onDidChangeOutcome: () => () => undefined,
    },
    treeService: { searchFiles: async () => [] },
    readFile: async () => new Uint8Array(),
    exists: async () => false,
    readdir: async () => [],
    getDirectoryStat: async () => undefined,
  };
});
vi.mock('#hooks/use-file-manager.js', () => ({ useFileManager: () => fileManager }));

const { configureMonaco } = await import('#lib/monaco.lib.client.js');
const { MonacoModelServiceProvider } = await import('#hooks/use-monaco-model-service.js');
const { CodeEditor } = await import('#components/code/code-editor.client.js');

/* The KCL client starts its LSP as a module worker. */
const { createWorkerStub } = await import('#lib/testing/worker-stub.js');
vi.stubGlobal('Worker', createWorkerStub(startedWorkers));

/** Milliseconds: long enough for Monaco's diagnostics to ask for a worker once a model exists. */
const settleTime = 3000;
const settle = async (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, settleTime);
  });

function Workspace({ children }: { readonly children?: ReactNode }): React.JSX.Element {
  return (
    <MonacoModelServiceProvider>
      <span>Workspace</span>
      {children}
    </MonacoModelServiceProvider>
  );
}

afterEach(async () => {
  cleanup();
  const monaco = await configureMonaco();
  for (const model of monaco?.editor.getModels() ?? []) {
    model.dispose();
  }
  startedWorkers.length = 0;
});

describe('MonacoModelServiceProvider language workers', () => {
  it('should start no language worker when Monaco is warmed and no code pane is open', async () => {
    /* Link intent warms Monaco before the route renders (`warmMonaco`). */
    await configureMonaco();

    render(<Workspace />);
    await settle();

    expect(startedWorkers).toStrictEqual([]);
  }, 60_000);

  it('should start the TypeScript and KCL workers once a code pane opens', async () => {
    await configureMonaco();
    const view = render(<Workspace />);
    await settle();
    expect(startedWorkers).toStrictEqual([]);

    view.rerender(
      <Workspace>
        <CodeEditor
          path='file:///main.ts'
          defaultLanguage='typescript'
          defaultValue='export const width = 10;'
          onChange={() => undefined}
        />
      </Workspace>,
    );

    await vi.waitFor(
      () => {
        expect(startedWorkers).toContain('typescript');
        expect(startedWorkers).toContain('kcl-lsp');
      },
      { timeout: 10_000 },
    );
  }, 60_000);
});
