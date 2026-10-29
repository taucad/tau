// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import type { Extension } from '@codemirror/state';
import { EditorDocument } from '#lib/editor-document.js';
import type { CodeEditorProps } from '#components/code/code-editor.client.js';
import type { EditorLanguageRequest } from '#lib/editor-language-runtime.js';
import { ChatEditorCodeViewer } from '#routes/w.$workspace.$project/chat-editor-code-viewer.js';

const runtime = vi.hoisted(() => ({ acquire: vi.fn(), dispose: vi.fn(), environment: {} }));
let heldDocument: EditorDocument;

vi.mock('#lib/editor-language-runtime.js', () => ({ acquireEditorLanguage: runtime.acquire }));
vi.mock('#hooks/use-editor-document-session.js', () => ({
  useEditorDocument: () => heldDocument,
  useEditorLanguageEnvironment: () => runtime.environment,
}));
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'project' }) }));
vi.mock('#components/code/code-editor.client.js', () => ({
  markCodeEditorMilestone: () => undefined,
  CodeEditor: ({ document, extensions, onApply }: CodeEditorProps) => (
    <div>
      <output data-testid='language-mode'>{extensions ? 'semantic' : 'basic'}</output>
      <button
        type='button'
        onClick={() =>
          onApply?.({
            origin: 'view',
            expectedVersion: document.version,
            changes: [{ from: document.text.length, to: document.text.length, insert: ' edited' }],
          })
        }
      >
        Type
      </button>
    </div>
  ),
}));

afterEach(() => {
  vi.restoreAllMocks();
  runtime.acquire.mockReset();
  runtime.dispose.mockReset();
});

it('keeps the document editable and offers a fresh semantic lease after worker failure', async () => {
  const user = userEvent.setup();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  heldDocument = new EditorDocument('main.ts', 'base');
  let failure: ((error: Error) => void) | undefined;
  runtime.acquire.mockImplementation(async (request: EditorLanguageRequest) => {
    failure = request.onFailure;
    return { extensions: [{}], dispose: runtime.dispose };
  });
  render(
    <ChatEditorCodeViewer
      paneId='pane'
      filePath='main.ts'
      content='base'
      language='typescript'
      onApply={(document, transaction) => document.apply(transaction)}
      onHistory={(document, kind) => document[kind]('pane')}
    />,
  );
  await waitFor(() => {
    expect(screen.getByTestId('language-mode')).toHaveTextContent('semantic');
  });
  act(() => {
    failure?.(new Error('worker stopped'));
  });
  expect(screen.getByText('Language tools are unavailable. Editing is still available.')).toBeInTheDocument();
  expect(screen.getByTestId('language-mode')).toHaveTextContent('basic');
  await user.click(screen.getByRole('button', { name: 'Type' }));
  expect(heldDocument.text).toBe('base edited');
  await user.click(screen.getByRole('button', { name: 'Retry language tools' }));
  await waitFor(() => {
    expect(runtime.acquire).toHaveBeenCalledTimes(2);
  });
  await waitFor(() => {
    expect(screen.getByTestId('language-mode')).toHaveTextContent('semantic');
  });
  expect(heldDocument.text).toBe('base edited');
  expect(runtime.dispose).toHaveBeenCalled();
});

it('disposes a semantic lease that resolves after its pane closes', async () => {
  heldDocument = new EditorDocument('main.ts', 'base');
  const pending = Promise.withResolvers<{ extensions: Extension; dispose: () => void }>();
  runtime.acquire.mockReturnValue(pending.promise);
  const { unmount } = render(
    <ChatEditorCodeViewer
      paneId='pane'
      filePath='main.ts'
      content='base'
      language='typescript'
      onApply={(document, transaction) => document.apply(transaction)}
      onHistory={(document, kind) => document[kind]('pane')}
    />,
  );
  await waitFor(() => {
    expect(runtime.acquire).toHaveBeenCalledOnce();
  });

  unmount();
  expect(runtime.acquire.mock.calls[0]?.[0]?.signal.aborted).toBe(true);
  pending.resolve({ extensions: [], dispose: runtime.dispose });
  await waitFor(() => {
    expect(runtime.dispose).toHaveBeenCalledOnce();
  });
});
