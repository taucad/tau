/**
 * Teardown order of the Monaco services when a project closes (B-16, D-UI-19).
 *
 * Disposing the TypeScript contributions restores Monaco's TS defaults, and
 * every defaults change makes Monaco stop the TS worker and re-validate each
 * open TS model, which starts a new worker. With the project's models still
 * open at that moment, the new worker started after the language host was
 * gone: a stock `ts.worker` that outlived the project and ran beside the next
 * project's worker. The models must be gone first.
 */
// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

const order = vi.hoisted((): string[] => []);
const monaco = vi.hoisted(() => ({ editor: {} }));
/* Stable identities: the provider's effect re-runs whenever one changes. */
const fileManager = vi.hoisted(() => ({
  fileManagerRef: { getSnapshot: () => ({ context: {} }) },
  contentService: { id: 'content' },
  treeService: { id: 'tree' },
}));
const project = vi.hoisted(() => ({
  projectId: 'proj_one',
  editorRef: { send: () => undefined },
  geometryUnits: new Map(),
}));

vi.mock('#hooks/use-monaco-configuration.js', () => ({ useMonacoIfConfigured: () => monaco }));
vi.mock('#hooks/use-project.js', () => ({ useProject: () => project }));
vi.mock('#hooks/use-file-manager.js', () => ({ useFileManager: () => fileManager }));
vi.mock('#hooks/use-revision-status.js', () => ({ getRevisionClient: vi.fn() }));
vi.mock('#lib/monaco-marker-service.js', () => ({
  MonacoMarkerService: class {
    public initialize(): void {
      // Stub.
    }

    public dispose(): void {
      order.push('markers');
    }
  },
}));
vi.mock('#lib/monaco-model-service.js', () => ({
  MonacoModelService: class {
    public initialize(): void {
      // Stub.
    }

    public setProjectSession(): void {
      // Stub.
    }

    public dispose(): void {
      order.push('models');
    }
  },
  createWorkspaceContentBinding: () => ({ applyContentChange: vi.fn(), applyOutcomeChange: vi.fn() }),
}));
vi.mock('#lib/monaco-language-registry.js', () => ({
  registry: {
    setActivationErrorHandler: vi.fn(),
    activate: vi.fn(),
    onProjectSessionChange: vi.fn(),
    prefetch: vi.fn(),
    dispose: vi.fn(() => {
      order.push('contributions');
    }),
  },
}));
vi.mock('#lib/monaco-navigation-service.js', () => ({ registerMonacoNavigation: () => ({ dispose: vi.fn() }) }));
vi.mock('#lib/monaco-typescript-extras/register-materializing-typescript-providers.client.js', () => ({
  registerTsFileRenameParticipant: () => ({ dispose: vi.fn() }),
}));
vi.mock('#lib/monaco-workspace-fs/index.js', () => ({
  createMonacoWorkspaceFs: () => ({
    registerFileSystemProvider: vi.fn(),
    bindModelService: vi.fn(),
    dispose: vi.fn(),
  }),
  createExtraLibsFileSystemProvider: vi.fn(),
  createWorkspaceFileSystemProvider: vi.fn(),
  subscribeWorkspaceContentDispatch: () => ({ dispose: vi.fn() }),
}));
vi.mock('@taucad/lsp/language-fs-sync-host', () => ({
  clearTauLanguageHostPortFactory: vi.fn(() => {
    order.push('language-host');
  }),
  openTauLanguageHostPort: vi.fn(),
  setTauLanguageHostPortFactory: vi.fn(),
}));

const { MonacoModelServiceProvider } = await import('#hooks/use-monaco-model-service.js');

describe('MonacoModelServiceProvider teardown', () => {
  it('closes the project models before the language contributions restore the TS defaults', () => {
    const view = render(
      <MonacoModelServiceProvider>
        <span>Workspace</span>
      </MonacoModelServiceProvider>,
    );
    order.length = 0;

    view.unmount();

    expect(order.indexOf('models')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('models')).toBeLessThan(order.indexOf('contributions'));
  });
});
