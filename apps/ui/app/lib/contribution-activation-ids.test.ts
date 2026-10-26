import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { Extension } from '@codemirror/state';
import { EditorDocument } from '#lib/editor-document.js';
import type { EditorLanguageEnvironment } from '#lib/editor-language-environment.js';
import { acquireEditorLanguage } from '#lib/editor-language-runtime.js';

const calls = vi.hoisted(() => ({
  kcl: vi.fn(),
  openscad: vi.fn(),
  json: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock('#lib/kcl-language/kcl-codemirror.js', () => ({ acquireKclLanguage: calls.kcl }));
vi.mock('#lib/openscad-language/openscad-codemirror.js', () => ({ acquireOpenScadLanguage: calls.openscad }));
vi.mock('#lib/json-language/json-codemirror.js', () => ({ acquireJsonLanguage: calls.json }));

describe('semantic language activation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const factory of [calls.kcl, calls.openscad, calls.json]) {
      factory.mockResolvedValue({ extensions: [], dispose: calls.dispose });
    }
  });

  it.each([
    ['main.kcl', 'kcl', 'kcl'],
    ['main.scad', 'openscad', 'openscad'],
    ['tau.json', 'json', 'json'],
    ['config.jsonc', 'jsonc', 'json'],
  ])('loads only %s semantic service after pane acquisition', async (path, languageId, family) => {
    const document = new EditorDocument(path, '');
    const lease = await acquireEditorLanguage({
      languageId,
      document,
      environment: mock<EditorLanguageEnvironment>(),
      signal: new AbortController().signal,
    });
    expect(calls.kcl).toHaveBeenCalledTimes(family === 'kcl' ? 1 : 0);
    expect(calls.openscad).toHaveBeenCalledTimes(family === 'openscad' ? 1 : 0);
    expect(calls.json).toHaveBeenCalledTimes(family === 'json' ? 1 : 0);
    lease.dispose();
    lease.dispose();
    expect(calls.dispose).toHaveBeenCalledTimes(1);
  });

  it('leaves JSONL syntax-only and refuses activation after abort', async () => {
    const environment = mock<EditorLanguageEnvironment>();
    const jsonl = await acquireEditorLanguage({
      languageId: 'jsonl',
      document: new EditorDocument('rows.jsonl', ''),
      environment,
      signal: new AbortController().signal,
    });
    expect(jsonl.extensions).toEqual([]);
    expect(calls.json).not.toHaveBeenCalled();
    const controller = new AbortController();
    controller.abort();
    await expect(
      acquireEditorLanguage({
        languageId: 'kcl',
        document: new EditorDocument('main.kcl', ''),
        environment,
        signal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(calls.kcl).not.toHaveBeenCalled();
  });

  it('disposes a factory lease when abort arrives during acquisition', async () => {
    const deferred = Promise.withResolvers<{ extensions: Extension[]; dispose(): void }>();
    calls.kcl.mockReturnValueOnce(deferred.promise);
    const controller = new AbortController();
    const acquiring = acquireEditorLanguage({
      languageId: 'kcl',
      document: new EditorDocument('main.kcl', ''),
      environment: mock<EditorLanguageEnvironment>(),
      signal: controller.signal,
    });
    await vi.waitFor(() => {
      expect(calls.kcl).toHaveBeenCalledTimes(1);
    });
    controller.abort();
    deferred.resolve({ extensions: [], dispose: calls.dispose });
    await expect(acquiring).rejects.toThrow();
    expect(calls.dispose).toHaveBeenCalledTimes(1);
  });

  it('releases a live language exactly once on abort or explicit dispose', async () => {
    const controller = new AbortController();
    const lease = await acquireEditorLanguage({
      languageId: 'kcl',
      document: new EditorDocument('main.kcl', ''),
      environment: mock<EditorLanguageEnvironment>(),
      signal: controller.signal,
    });
    controller.abort();
    lease.dispose();
    expect(calls.dispose).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    calls.kcl.mockResolvedValue({ extensions: [], dispose: calls.dispose });
    const second = new AbortController();
    const another = await acquireEditorLanguage({
      languageId: 'kcl',
      document: new EditorDocument('other.kcl', ''),
      environment: mock<EditorLanguageEnvironment>(),
      signal: second.signal,
    });
    another.dispose();
    second.abort();
    expect(calls.dispose).toHaveBeenCalledTimes(1);
  });
});
