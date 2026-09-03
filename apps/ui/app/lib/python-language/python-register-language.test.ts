import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Monaco from 'monaco-editor';
import type { ActivationContext } from '#lib/monaco-language-registry.js';
import { pythonContribution } from '#lib/python-language/python-register-language.js';
import { createMonacoTestStub } from '#lib/testing/monaco-language-stub.js';

describe('Python language contribution', () => {
  const stub = createMonacoTestStub();

  beforeEach(() => {
    stub.__reset();
  });

  it('registers bounded Build123d authoring completions only in Build123d expressions', async () => {
    const register = vi.fn(
      (_languageId: string, _provider: Monaco.languages.CompletionItemProvider): Monaco.IDisposable => ({
        dispose: vi.fn(),
      }),
    );
    Object.assign(stub.monaco.languages, {
      CompletionItemKind: { Class: 7, Function: 1 },
      registerCompletionItemProvider: register,
    });
    const result = pythonContribution.activate({ monaco: stub.monaco } as ActivationContext);
    expect(result.disposables).toHaveLength(1);
    expect(register).toHaveBeenCalledWith('python', expect.any(Object));
    const provider = register.mock.calls[0]![1] as Monaco.languages.CompletionItemProvider;
    const model = {
      getLineContent: () => 'from build123d import Bo',
      getWordUntilPosition: () => ({ word: 'Bo', startColumn: 24, endColumn: 26 }),
    } as unknown as Monaco.editor.ITextModel;
    const completionContext = {
      triggerKind: 0,
    } as Monaco.languages.CompletionContext;
    const cancellationToken = {
      isCancellationRequested: false,
      onCancellationRequested: () => ({ dispose: () => undefined }),
    } as Monaco.CancellationToken;
    const completion = await provider.provideCompletionItems(
      model,
      { lineNumber: 1, column: 26 } as Monaco.Position,
      completionContext,
      cancellationToken,
    );
    expect(completion?.suggestions.map(({ label }) => label)).toEqual(
      expect.arrayContaining(['Shape', 'Box', 'Compound', 'Color', 'export_step']),
    );

    const unrelated = {
      ...model,
      getLineContent: () => 'print(Bo)',
    } as unknown as Monaco.editor.ITextModel;
    expect(
      await provider.provideCompletionItems(
        unrelated,
        { lineNumber: 1, column: 9 } as Monaco.Position,
        completionContext,
        cancellationToken,
      ),
    ).toEqual({ suggestions: [] });
  });
});
