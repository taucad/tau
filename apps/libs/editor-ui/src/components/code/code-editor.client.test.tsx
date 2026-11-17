import { useLayoutEffect } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { CodeEditorProps } from '#components/code/code-editor.client.js';
import { EditorDocument } from '#lib/editor-document.js';

const mounted = vi.hoisted(() => vi.fn());
const imported = vi.hoisted(() => vi.fn());
/* The mounted view's scroller, as the view's mount hands it to `onMount`. */
const view = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- CodeMirror's own `EditorView` field
  scrollDOM: { scrollTop: 0, scrollLeft: 0 },
  requestMeasure: (request: { write: () => void }) => {
    request.write();
  },
}));
vi.mock('#components/code/code-editor-view.client.js', () => {
  imported();
  return {
    CodeEditorView: ({ document, onMount }: CodeEditorProps) => {
      mounted();
      useLayoutEffect(() => {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the scroll fields are all the mount reads
        onMount?.(view as unknown as Parameters<NonNullable<CodeEditorProps['onMount']>>[0], document.path);
      }, [document.path, onMount]);
      return <div role='textbox' aria-label='Code editor' />;
    },
  };
});

it('loads the editor runtime only for a mounted source pane', async () => {
  const { CodeEditor } = await import('#components/code/code-editor.client.js');
  expect(imported).not.toHaveBeenCalled();
  expect(mounted).not.toHaveBeenCalled();
  const document = new EditorDocument('main.ts', 'let value = 1;');
  render(<CodeEditor document={document} viewId='pane-one' languageId='typescript' />);
  expect(await screen.findByRole('textbox', { name: 'Code editor' })).toBeInTheDocument();
  expect(imported).toHaveBeenCalledOnce();
  expect(mounted).toHaveBeenCalled();
});

it('starts the mounted editor where the person scrolled the file’s text before it mounted', async () => {
  const { CodeEditor } = await import('#components/code/code-editor.client.js');
  const document = new EditorDocument('long.ts', Array.from({ length: 200 }, (_, line) => `line ${line}`).join('\n'));
  const onMount = vi.fn();
  render(<CodeEditor document={document} viewId='pane-scroll' languageId='typescript' onMount={onMount} />);

  const scroller = screen
    .getByRole('group', { name: 'Loading editor' })
    .querySelector<HTMLElement>('[data-slot="editor-pane-scroller"]')!;
  Object.defineProperty(scroller, 'scrollTop', { configurable: true, value: 420 });
  Object.defineProperty(scroller, 'scrollLeft', { configurable: true, value: 12 });
  fireEvent.scroll(scroller);

  expect(await screen.findByRole('textbox', { name: 'Code editor' })).toBeInTheDocument();
  expect(view.scrollDOM).toEqual({ scrollTop: 420, scrollLeft: 12 });
  expect(onMount).toHaveBeenCalledWith(view, 'long.ts');
});
