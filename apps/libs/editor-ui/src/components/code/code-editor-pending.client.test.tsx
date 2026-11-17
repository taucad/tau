// @vitest-environment jsdom
import { useEffect, useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { CodeEditor } from '#components/code/code-editor.client.js';
import { EditorDocument } from '#lib/editor-document.js';

const runtime = vi.hoisted(() => ({ imported: vi.fn() }));
vi.mock('#components/code/code-editor-view.client.js', () => {
  runtime.imported();
  return {
    CodeEditorView: ({ document }: { readonly document: EditorDocument }) => (
      <div role='textbox' aria-label='Code editor'>
        {document.text}
      </div>
    ),
  };
});

it('begins importing the editor while the admitted document promise is still held', async () => {
  const pending = Promise.withResolvers<EditorDocument>();
  function PendingPane(): React.JSX.Element {
    const [document, setDocument] = useState<EditorDocument>();
    useEffect(() => {
      let active = true;
      const load = async (): Promise<void> => {
        const next = await pending.promise;
        if (active) {
          setDocument(next);
        }
      };
      void load();
      return () => {
        active = false;
      };
    }, []);
    return <CodeEditor document={document} viewId='pending-pane' languageId='typescript' />;
  }
  render(<PendingPane />);
  await waitFor(() => {
    expect(runtime.imported).toHaveBeenCalledOnce();
  });
  expect(screen.queryByRole('textbox', { name: 'Code editor' })).not.toBeInTheDocument();
  pending.resolve(new EditorDocument('main.ts', 'ready'));
  expect(await screen.findByRole('textbox', { name: 'Code editor' })).toHaveTextContent('ready');
});
