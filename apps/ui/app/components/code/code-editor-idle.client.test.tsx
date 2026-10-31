// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { EditorDocument } from '#lib/editor-document.js';

const runtime = vi.hoisted(() => ({ imported: vi.fn() }));
vi.mock('#components/code/code-editor-view.client.js', () => {
  runtime.imported();
  return { CodeEditorView: () => <div role='textbox' aria-label='Code editor' /> };
});
const syntax = vi.hoisted(() => ({ loaded: vi.fn() }));
vi.mock('#lib/editor-syntax.js', () => ({
  loadEditorSyntax: async () => {
    syntax.loaded();
    return [];
  },
}));

/**
 * Opening a project mounts the source pane as soon as the project's file services publish, and the
 * runtime used to be requested in a microtask of that same task, so its chunk compiled in front of
 * the chat composer. The pane must wait for a gap, and must still get one on a page that never
 * goes idle.
 */
it('requests the editor runtime and its syntax from a bounded idle gap, not from the mounting task', async () => {
  const callbacks: Array<{ start: IdleRequestCallback; options?: IdleRequestOptions }> = [];
  Reflect.set(globalThis, 'requestIdleCallback', (start: IdleRequestCallback, options?: IdleRequestOptions) => {
    callbacks.push({ start, options });
    return callbacks.length;
  });
  Reflect.set(globalThis, 'cancelIdleCallback', vi.fn());
  const { CodeEditor } = await import('#components/code/code-editor.client.js');
  render(<CodeEditor document={new EditorDocument('main.ts', 'code')} viewId='pane-idle' languageId='typescript' />);

  expect(runtime.imported).not.toHaveBeenCalled();
  expect(syntax.loaded).not.toHaveBeenCalled();
  expect(callbacks).toHaveLength(2);
  for (const { options } of callbacks) {
    expect(options?.timeout).toBe(2000);
  }

  for (const { start } of callbacks) {
    start({ didTimeout: true, timeRemaining: () => 0 });
  }
  expect(await screen.findByRole('textbox', { name: 'Code editor' })).toBeInTheDocument();
  expect(runtime.imported).toHaveBeenCalledOnce();
  expect(syntax.loaded).toHaveBeenCalledOnce();
});
