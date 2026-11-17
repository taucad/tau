import { expect, it, vi } from 'vitest';
import type { Extension } from '@codemirror/state';
import { loadEditorSyntax } from '#lib/editor-syntax.js';

const adapter = vi.hoisted(() => ({
  ready: Promise.withResolvers<Extension>(),
  loadGrammar: vi.fn(async () => adapter.ready.promise),
}));

vi.mock('@taucad/grammars', () => ({
  loadLanguage: adapter.loadGrammar,
  resolveHighlightLanguageId: (id: string) => id,
}));

it('does not schedule a grammar download for a pane that closed before admission', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(loadEditorSyntax('kcl', controller.signal)).rejects.toThrow();
  expect(adapter.loadGrammar).not.toHaveBeenCalled();
});

it('does not hand a grammar to a pane that closed while it loaded', async () => {
  const controller = new AbortController();
  const pending = loadEditorSyntax('kcl', controller.signal);
  expect(adapter.loadGrammar).toHaveBeenCalledOnce();
  controller.abort();
  adapter.ready.resolve([]);
  await expect(pending).rejects.toThrow();
});
