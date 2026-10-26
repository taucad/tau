import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { EditorDocument } from '#lib/editor-document.js';

const mounted = vi.hoisted(() => vi.fn());
vi.mock('#components/code/code-editor-view.client.js', () => ({
  CodeEditorView: () => {
    mounted();
    return <div role='textbox' aria-label='Code editor' />;
  },
}));

it('loads the editor runtime only for a mounted source pane', async () => {
  const { CodeEditor } = await import('#components/code/code-editor.client.js');
  expect(mounted).not.toHaveBeenCalled();
  const document = new EditorDocument('main.ts', 'let value = 1;');
  render(<CodeEditor document={document} viewId='pane-one' languageId='typescript' />);
  expect(await screen.findByRole('textbox', { name: 'Code editor' })).toBeInTheDocument();
  expect(mounted).toHaveBeenCalledOnce();
});
