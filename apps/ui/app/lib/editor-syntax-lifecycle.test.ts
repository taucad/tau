import { expect, it, vi } from 'vitest';
import { loadEditorSyntax } from '#lib/editor-syntax.js';

const adapter = vi.hoisted(() => ({
  ready: Promise.withResolvers<void>(),
  started: vi.fn(),
  loadGrammar: vi.fn(async () => []),
}));

vi.mock('#lib/editor-textmate-syntax.js', async () => {
  adapter.started();
  await adapter.ready.promise;
  return { loadTextMateSyntax: adapter.loadGrammar };
});

it('does not schedule custom grammar downloads after an admitted pane closes during adapter loading', async () => {
  const controller = new AbortController();
  const pending = loadEditorSyntax('kcl', controller.signal);
  await vi.waitFor(() => {
    expect(adapter.started).toHaveBeenCalledOnce();
  });
  controller.abort();
  adapter.ready.resolve();
  await expect(pending).rejects.toThrow();
  expect(adapter.loadGrammar).not.toHaveBeenCalled();
});
