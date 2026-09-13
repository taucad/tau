import { describe, it, expect, vi } from 'vitest';
import type * as Monaco from 'monaco-editor';

import { bindMonacoModelsToLspConnection } from '#monaco-lsp-binding.js';

const lang = 'test-lang';

type LangChangeEvent = {
  readonly model: Monaco.editor.ITextModel;
  readonly oldLanguage: string;
  readonly newLanguage: string;
};

function createBindingHarness(options?: {
  readonly seed?: ReadonlyArray<{ readonly uri: string; readonly languageId: string; readonly text?: string }>;
}) {
  const didOpen = vi.fn();
  const didChange = vi.fn();
  const didClose = vi.fn();

  type CreateHandler = (m: Monaco.editor.ITextModel) => void;
  const createModelListeners = new Set<CreateHandler>();
  const willDisposeListeners = new Set<(m: Monaco.editor.ITextModel) => void>();
  const langChangeListeners = new Set<(event: LangChangeEvent) => void>();
  const models = new Map<string, FakeModel>();

  class FakeModel {
    public readonly uri: { toString(): string };
    private languageIdField: string;
    private text: string;
    private readonly changeListeners = new Set<() => void>();

    public constructor(uriString: string, languageId: string, text: string) {
      this.uri = { toString: () => uriString };
      this.languageIdField = languageId;
      this.text = text;
    }

    public getLanguageId(): string {
      return this.languageIdField;
    }

    public getValue(): string {
      return this.text;
    }

    public setValue(next: string): void {
      this.text = next;
      for (const listener of this.changeListeners) {
        listener();
      }
    }

    public setLanguageId(next: string): void {
      const old = this.languageIdField;
      this.languageIdField = next;
      for (const listener of langChangeListeners) {
        listener({
          model: this as unknown as Monaco.editor.ITextModel,
          oldLanguage: old,
          newLanguage: next,
        });
      }
    }

    public onDidChangeContent(handler: () => void): Monaco.IDisposable {
      this.changeListeners.add(handler);
      return {
        dispose: () => {
          this.changeListeners.delete(handler);
        },
      };
    }

    public disposeModel(): void {
      for (const listener of willDisposeListeners) {
        listener(this as unknown as Monaco.editor.ITextModel);
      }
      models.delete(this.uri.toString());
    }
  }

  function addModel(uri: string, languageId: string, text = ''): FakeModel {
    const model = new FakeModel(uri, languageId, text);
    models.set(uri, model);
    for (const listener of createModelListeners) {
      listener(model as unknown as Monaco.editor.ITextModel);
    }
    return model;
  }

  if (options?.seed) {
    for (const entry of options.seed) {
      const model = new FakeModel(entry.uri, entry.languageId, entry.text ?? '');
      models.set(entry.uri, model);
    }
  }

  const monaco = {
    editor: {
      getModels(): Monaco.editor.ITextModel[] {
        return [...models.values()] as unknown as Monaco.editor.ITextModel[];
      },
      onDidCreateModel(handler: CreateHandler): Monaco.IDisposable {
        createModelListeners.add(handler);
        return {
          dispose: () => {
            createModelListeners.delete(handler);
          },
        };
      },
      onWillDisposeModel(handler: (m: Monaco.editor.ITextModel) => void): Monaco.IDisposable {
        willDisposeListeners.add(handler);
        return {
          dispose: () => {
            willDisposeListeners.delete(handler);
          },
        };
      },
      onDidChangeModelLanguage(handler: (event: LangChangeEvent) => void): Monaco.IDisposable {
        langChangeListeners.add(handler);
        return {
          dispose: () => {
            langChangeListeners.delete(handler);
          },
        };
      },
    },
  } as unknown as typeof Monaco;

  const binding = bindMonacoModelsToLspConnection({
    monaco,
    languageId: lang,
    lsp: {
      didOpen: (...args) => {
        didOpen(...args);
      },
      didChange: (...args) => {
        didChange(...args);
      },
      didClose: (...args) => {
        didClose(...args);
      },
    },
  });

  return {
    binding,
    addModel,
    models,
    didOpen,
    didChange,
    didClose,
  };
}

describe('bindMonacoModelsToLspConnection', () => {
  it('opens existing models for the language id on bind', () => {
    const h = createBindingHarness({
      seed: [{ uri: 'file:///a.txt', languageId: lang, text: 'hi' }],
    });

    expect(h.didOpen).toHaveBeenCalledTimes(1);
    expect(h.didOpen.mock.calls[0]![0]!.textDocument).toMatchObject({
      uri: 'file:///a.txt',
      languageId: lang,
      version: 1,
      text: 'hi',
    });

    h.binding.dispose();
  });

  it('tracks content changes with a monotonic version', () => {
    const h = createBindingHarness();
    const model = h.addModel('file:///a.txt', lang, 'hi');

    h.didChange.mockClear();
    model.setValue('bye');

    expect(h.didChange).toHaveBeenCalledTimes(1);
    expect(h.didChange.mock.calls[0]![0]!.textDocument.version).toBe(2);
    expect(h.didChange.mock.calls[0]![0]!.contentChanges[0]!.text).toBe('bye');

    h.binding.dispose();
  });

  it('closes on dispose and stops emitting changes', () => {
    const h = createBindingHarness();
    const model = h.addModel('file:///b.txt', lang, 'x');
    h.didClose.mockClear();

    model.disposeModel();

    expect(h.didClose).toHaveBeenCalledWith({ textDocument: { uri: 'file:///b.txt' } });

    h.didChange.mockClear();
    model.setValue('z');
    expect(h.didChange).not.toHaveBeenCalled();

    h.binding.dispose();
  });

  it('closes then opens when the model language crosses the bound id', () => {
    const h = createBindingHarness();
    const model = h.addModel('file:///c.txt', 'plain', '');

    expect(h.didOpen).not.toHaveBeenCalled();

    model.setLanguageId(lang);
    expect(h.didOpen).toHaveBeenCalledTimes(1);

    model.setLanguageId('plain');
    expect(h.didClose).toHaveBeenCalledWith({ textDocument: { uri: 'file:///c.txt' } });

    h.binding.dispose();
  });
});
