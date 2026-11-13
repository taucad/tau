// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
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

afterEach(() => {
  // Unmount while the stubbed idle API still exists, so the pane's cancel finds it.
  cleanup();
  runtime.imported.mockClear();
  syntax.loaded.mockClear();
  Reflect.deleteProperty(HTMLElement.prototype, 'checkVisibility');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/**
 * Opening a project mounts the source pane as soon as the project's file services publish, and the
 * runtime used to be requested in a microtask of that same task, so its chunk compiled in front of
 * the chat composer. A pane that is not on screen must wait for a gap, and must still get one on a
 * page that never goes idle. jsdom lays nothing out, so its pane has no layout box: it is not shown.
 */
it('requests the editor runtime and its syntax from a bounded idle gap for a pane not on screen', async () => {
  const callbacks: Array<{ start: IdleRequestCallback; options?: IdleRequestOptions }> = [];
  vi.stubGlobal('requestIdleCallback', (start: IdleRequestCallback, options?: IdleRequestOptions) => {
    callbacks.push({ start, options });
    return callbacks.length;
  });
  vi.stubGlobal('cancelIdleCallback', vi.fn());
  const { CodeEditor } = await import('#components/code/code-editor.client.js');
  render(<CodeEditor document={new EditorDocument('main.ts', 'code')} viewId='pane-idle' languageId='typescript' />);

  expect(runtime.imported).not.toHaveBeenCalled();
  expect(syntax.loaded).not.toHaveBeenCalled();
  // One gap requests both, so the syntax never lands on a view that mounted without it.
  expect(callbacks).toHaveLength(1);
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

/**
 * A pane on screen at open already shows its file's text; its editor is the next thing the person
 * uses, so the runtime is requested from the mounting task without waiting for a gap (loading
 * states UX blueprint, P-i; audit R10).
 */
it('requests the editor runtime and its syntax at once, with no idle gap, for a pane on screen', async () => {
  const requestIdle = vi.fn();
  vi.stubGlobal('requestIdleCallback', requestIdle);
  vi.stubGlobal('cancelIdleCallback', vi.fn());
  Reflect.set(HTMLElement.prototype, 'checkVisibility', () => true);
  const { CodeEditor } = await import('#components/code/code-editor.client.js');
  render(<CodeEditor document={new EditorDocument('main.ts', 'code')} viewId='pane-shown' languageId='typescript' />);

  // The file's text is on screen before the editor is.
  expect(screen.getByRole('group', { name: 'Loading editor' })).toHaveTextContent('code');
  expect(await screen.findByRole('textbox', { name: 'Code editor' })).toBeInTheDocument();
  expect(requestIdle).not.toHaveBeenCalled();
  expect(syntax.loaded).toHaveBeenCalledOnce();
});

it('keeps the idle gap for a shown pane in a page that is not visible', async () => {
  const requestIdle = vi.fn(() => 1);
  vi.stubGlobal('requestIdleCallback', requestIdle);
  vi.stubGlobal('cancelIdleCallback', vi.fn());
  Reflect.set(HTMLElement.prototype, 'checkVisibility', () => true);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  const { CodeEditor } = await import('#components/code/code-editor.client.js');
  render(
    <CodeEditor document={new EditorDocument('main.ts', 'code')} viewId='pane-background' languageId='typescript' />,
  );

  await Promise.resolve();
  expect(requestIdle).toHaveBeenCalledOnce();
  expect(syntax.loaded).not.toHaveBeenCalled();
});
