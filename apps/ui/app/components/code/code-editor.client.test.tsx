import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type * as CodeEditorModule from '#components/code/code-editor.client.js';
import type * as ThemeModule from '#hooks/use-theme.js';

const configuration = vi.hoisted(() => {
  type Snapshot =
    | { readonly status: 'idle' | 'pending' }
    | { readonly status: 'ready'; readonly monaco: unknown }
    | { readonly status: 'failed'; readonly error: Error };
  const listeners = new Set<() => void>();
  let snapshot: Snapshot = { status: 'idle' };
  const publish = (next: Snapshot): void => {
    snapshot = next;
    for (const listener of listeners) {
      listener();
    }
  };
  return {
    configure: vi.fn(async () => {
      publish({ status: 'pending' });
      return undefined;
    }),
    subscribe: vi.fn((listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    get: () => snapshot,
    publish,
  };
});
vi.mock('#lib/monaco.lib.client.js', () => ({
  configureMonaco: configuration.configure,
  getMonacoConfiguration: configuration.get,
  subscribeMonacoConfiguration: configuration.subscribe,
  registerCompletions: vi.fn(),
}));
vi.mock('#hooks/use-theme.js', async (importOriginal) => ({
  ...(await importOriginal<typeof ThemeModule>()),
  useTheme: () => ({ theme: 'light', isHighContrast: false }),
}));
vi.mock('#hooks/use-cookie.js', () => ({ useCookie: () => [false] }));
vi.mock('@taucad/ui/hooks/use-mobile', () => ({ useIsMobile: () => false }));
const editorMounts = vi.hoisted(() => vi.fn());
vi.mock('@monaco-editor/react', () => ({
  Editor: () => {
    editorMounts();
    return <textarea aria-label='Code' />;
  },
}));

const loadCodeEditor = async (): Promise<typeof CodeEditorModule> => import('#components/code/code-editor.client.js');

beforeEach(() => {
  configuration.publish({ status: 'idle' });
  configuration.configure.mockClear();
  editorMounts.mockClear();
});

/* Configuration may import the chunk that holds this module, so importing it
 * must not start configuration; only a mounted editor's subscription does. */
it('does not start configuration when the module loads', async () => {
  await loadCodeEditor();
  expect(configuration.configure).not.toHaveBeenCalled();
  expect(configuration.subscribe).not.toHaveBeenCalled();
});

/* `Editor` runs `loader.init()` on mount, so it must wait for `ready` (I1). */
it('shows the pane placeholder until Monaco is configured, then mounts the editor', async () => {
  const { CodeEditor } = await loadCodeEditor();
  configuration.publish({ status: 'pending' });
  render(<CodeEditor onChange={() => undefined} />);

  const placeholder = screen.getByRole('status');
  expect(placeholder).toHaveAttribute('aria-busy', 'true');
  expect(placeholder).toHaveAttribute('data-slot', 'editor-pane-placeholder');
  expect(placeholder).toHaveTextContent('Loading editor');
  expect(editorMounts).not.toHaveBeenCalled();

  await act(async () => {
    configuration.publish({ status: 'ready', monaco: {} });
  });
  expect(screen.getByRole('textbox', { name: 'Code' })).toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it("uses the caller's loading node in place of the default placeholder", async () => {
  const { CodeEditor } = await loadCodeEditor();
  configuration.publish({ status: 'pending' });
  render(<CodeEditor onChange={() => undefined} loading={<p>Opening conflict</p>} />);
  expect(screen.getByText('Opening conflict')).toBeInTheDocument();
  expect(editorMounts).not.toHaveBeenCalled();
});

it('mounts at once when Monaco is already configured', async () => {
  const { CodeEditor } = await loadCodeEditor();
  configuration.publish({ status: 'ready', monaco: {} });
  render(<CodeEditor onChange={() => undefined} />);
  expect(screen.getByRole('textbox', { name: 'Code' })).toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('offers a retry in the pane when configuration fails', async () => {
  const { CodeEditor } = await loadCodeEditor();
  configuration.publish({ status: 'failed', error: new Error('chunk failed') });
  render(<CodeEditor onChange={() => undefined} />);

  expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load the code editor");
  expect(editorMounts).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(configuration.configure).toHaveBeenCalledTimes(1);
  expect(await screen.findByRole('status')).toHaveTextContent('Loading editor');
});
