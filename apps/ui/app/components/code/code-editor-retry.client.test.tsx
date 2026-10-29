import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { EditorDocument } from '#lib/editor-document.js';

const runtime = vi.hoisted(() => ({ attempts: 0 }));
vi.mock('#components/code/code-editor-view.client.js', () => {
  runtime.attempts += 1;
  if (runtime.attempts === 1) {
    throw new Error('chunk unavailable');
  }
  return { CodeEditorView: () => <div role='textbox' aria-label='Code editor' /> };
});

it('shows a pane-scoped load failure and retries the runtime import', async () => {
  const { CodeEditor } = await import('#components/code/code-editor.client.js');
  render(<CodeEditor document={new EditorDocument('main.ts', 'code')} viewId='pane-one' languageId='typescript' />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Code editor could not load.');
  await userEvent.click(screen.getByRole('button', { name: 'Retry editor' }));
  expect(await screen.findByRole('textbox', { name: 'Code editor' })).toBeInTheDocument();
  expect(runtime.attempts).toBe(2);
});
