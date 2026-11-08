import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { MockProxy } from 'vitest-mock-extended';
import type { FileContentService } from '@taucad/fs-client/file-content-service';
import { lfsPointerFor } from '@taucad/revisions';
import type { EditorLanguageEnvironment } from '#lib/editor-language-environment.js';
import { revisionClients } from '#services/revision-client-registry.js';
import type { RevisionClient } from '#types/revision-client.types.js';
import type * as EditorDocumentSessionModule from '#lib/editor-document-session.js';
import { slowWriteMilliseconds } from '#workbench-records/record-health.js';

const editorRef = vi.hoisted(() => ({ send: vi.fn() }));
const contentService = vi.hoisted(() => ({ current: undefined as FileContentService | undefined }));
const treeService = vi.hoisted(() => ({ getEntry: vi.fn() }));
const fileManager = vi.hoisted(() => ({
  fileManagerRef: { getSnapshot: () => ({ context: {} }) },
  readFile: vi.fn(),
  exists: vi.fn(),
  readdir: vi.fn(),
  getDirectoryStat: vi.fn(),
}));

/* The project's conflict records, which the close producer waits out. */
const records = vi.hoisted(() => ({
  inFlight: false,
  waiting: false,
  settled: undefined as PromiseWithResolvers<void> | undefined,
}));
vi.mock('#lib/editor-document-session.js', async (importOriginal) => {
  const original = await importOriginal<typeof EditorDocumentSessionModule>();
  return {
    ...original,
    isRecordingEditorConflict: () => records.inFlight,
    editorConflictRecordsSettled: async () => {
      records.waiting = true;
      return records.settled?.promise;
    },
  };
});
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'p', editorRef }) }));
vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({ ...fileManager, contentService: contentService.current, treeService }),
}));

const { EditorDocumentSessionProvider, useEditorLanguageEnvironment } =
  await import('#hooks/use-editor-document-session.js');
const { UnloadProvider, useFlushProducers } = await import('#hooks/use-flush-on-close.js');

const openFileCalls = (): unknown[] =>
  editorRef.send.mock.calls.map(([event]) => event as { type: string }).filter((event) => event.type === 'openFile');

async function mountEnvironment(): Promise<EditorLanguageEnvironment> {
  const content = mock<FileContentService>();
  content.onDidContentChange.mockReturnValue(() => undefined);
  content.onDidChangeOutcome.mockReturnValue(() => undefined);
  content.addEditorSaveFlusher.mockReturnValue(() => undefined);
  contentService.current = content;
  let environment: EditorLanguageEnvironment | undefined;
  function Probe(): undefined {
    environment = useEditorLanguageEnvironment();
    return undefined;
  }
  render(
    <UnloadProvider>
      <EditorDocumentSessionProvider>
        <Probe />
      </EditorDocumentSessionProvider>
    </UnloadProvider>,
  );
  await waitFor(() => {
    expect(environment).toBeDefined();
  });
  return environment!;
}

describe('EditorDocumentSessionProvider close cut (D17)', () => {
  const mountWithProducers = async (content: MockProxy<FileContentService>): Promise<() => Promise<void>> => {
    content.onDidContentChange.mockReturnValue(() => undefined);
    content.onDidChangeOutcome.mockReturnValue(() => undefined);
    content.addEditorSaveFlusher.mockReturnValue(() => undefined);
    contentService.current = content;
    let flushProducers: (() => Promise<void>) | undefined;
    function Probe(): undefined {
      flushProducers = useFlushProducers();
      return undefined;
    }
    render(
      <UnloadProvider>
        <EditorDocumentSessionProvider>
          <Probe />
        </EditorDocumentSessionProvider>
      </UnloadProvider>,
    );
    await waitFor(() => {
      expect(flushProducers).toBeDefined();
    });
    return flushProducers!;
  };

  it('settles every editor save as a producer, before the session takes the close revision', async () => {
    const content = mock<FileContentService>();
    const settled = Promise.withResolvers<void>();
    content.settleEditorSaves.mockReturnValue(settled.promise);
    const flushProducers = await mountWithProducers(content);

    let done = false;
    const flushing = (async (): Promise<void> => {
      await flushProducers();
      done = true;
    })();
    await waitFor(() => {
      expect(content.settleEditorSaves).toHaveBeenCalledOnce();
    });
    expect(done).toBe(false);
    settled.resolve();
    await flushing;
    expect(done).toBe(true);
  });

  it('names unsaved editor changes when a save cannot settle', async () => {
    const content = mock<FileContentService>();
    content.settleEditorSaves.mockRejectedValue(new Error('disk full'));
    const flushProducers = await mountWithProducers(content);

    await expect(flushProducers()).rejects.toThrow('Editor changes are not confirmed saved.');
  });

  it('names unsaved editor changes instead of holding the close when a save never settles', async () => {
    const content = mock<FileContentService>();
    content.settleEditorSaves.mockReturnValue(Promise.withResolvers<void>().promise);
    const flushProducers = await mountWithProducers(content);
    vi.useFakeTimers();
    try {
      const flushing = flushProducers();
      const failure = expect(flushing).rejects.toThrow('Editor changes are not confirmed saved.');
      await vi.advanceTimersByTimeAsync(slowWriteMilliseconds);
      await failure;
    } finally {
      vi.useRealTimers();
    }
  });

  it("settles on the session's answer to a refusal, so a conflict being recorded does not fail the close", async () => {
    const content = mock<FileContentService>();
    const answers: unknown[] = [];
    content.settleEditorSaves.mockImplementation(async (options) => {
      /* What a refusal the session does not own gets back: the close reports it. */
      answers.push(options?.resolution?.(new Error('disk full')));
    });
    const flushProducers = await mountWithProducers(content);

    await flushProducers();

    expect(typeof content.settleEditorSaves.mock.calls[0]?.[0]?.resolution).toBe('function');
    expect(answers).toEqual([undefined]);
  });

  it('waits out a conflict record in flight, then settles the saves it made', async () => {
    const content = mock<FileContentService>();
    content.settleEditorSaves.mockResolvedValue(undefined);
    records.inFlight = true;
    records.settled = Promise.withResolvers<void>();
    try {
      const flushProducers = await mountWithProducers(content);
      let done = false;
      const flushing = (async (): Promise<void> => {
        await flushProducers();
        done = true;
      })();
      await vi.waitFor(() => {
        expect(records.waiting).toBe(true);
      });
      expect(content.settleEditorSaves).toHaveBeenCalledOnce();
      expect(done).toBe(false);

      records.inFlight = false;
      records.settled.resolve();
      await flushing;

      expect(content.settleEditorSaves).toHaveBeenCalledTimes(2);
    } finally {
      records.inFlight = false;
      records.waiting = false;
      records.settled = undefined;
    }
  });
});

describe('EditorDocumentSessionProvider navigation', () => {
  it.each([
    'file:///__typescript_lib__/lib.es5.d.ts',
    'file:///cdn-types/three/index.d.ts',
    'file:///node_modules/replicad/index.d.ts',
    'file:///__csharp_metadata__/System.Math.cs',
    'file:///__kcl_std__/sketch.kcl',
    'file:///__openscad_builtins__/builtins.scad',
  ])('should open the library declaration %s as a read-only tab at its line and column', async (uri) => {
    editorRef.send.mockClear();
    const environment = await mountEnvironment();
    const path = uri.slice('file:///'.length);

    await environment.navigate({ uri, line: 12, column: 4, declaration: { text: 'declaration source' } });

    expect(editorRef.send).toHaveBeenCalledWith({
      type: 'openFile',
      path,
      source: 'user',
      readOnly: true,
      lineNumber: 12,
      column: 4,
    });
    const opened = await environment.session.acquire(path);
    expect(opened?.text).toBe('declaration source');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(treeService.getEntry).not.toHaveBeenCalled();
  });

  it('should reopen a declaration it already served when a later target carries no text', async () => {
    editorRef.send.mockClear();
    const environment = await mountEnvironment();
    await environment.navigate({
      uri: 'file:///__kcl_std__/sketch.kcl',
      line: 1,
      column: 1,
      declaration: { text: 'x' },
    });
    await environment.navigate({ uri: 'file:///__kcl_std__/sketch.kcl', line: 40, column: 2 });
    await environment.navigate({ uri: 'file:///__kcl_std__/never-served.kcl', line: 1, column: 1 });

    expect(openFileCalls()).toHaveLength(2);
    expect(openFileCalls().at(-1)).toEqual(expect.objectContaining({ lineNumber: 40, column: 2 }));
  });

  it('should ignore declaration text for paths outside a library root', async () => {
    editorRef.send.mockClear();
    const environment = await mountEnvironment();
    await environment.navigate({ uri: 'file:///main.kcl', line: 1, column: 1, declaration: { text: 'x' } });
    expect(openFileCalls()).toEqual([]);
  });
});

describe('EditorDocumentSessionProvider language reads (D9, W4 review 3)', () => {
  it('should make a placeholder its file before a language service reads it, and read any other file as it is', async () => {
    const part = new TextEncoder().encode('solid part');
    const { bytes } = lfsPointerFor(part);
    const disk = new Map<string, Uint8Array<ArrayBuffer>>([
      ['main.kcl', new TextEncoder().encode('x = 1')],
      ['models/part.step', bytes],
    ]);
    fileManager.readFile.mockImplementation(async (path: string) => disk.get(path.replace(/^\/+/u, '')));
    const materialize = vi.fn(async (paths: readonly string[]) => {
      for (const path of paths) {
        disk.set(path, part);
      }
    });
    revisionClients.set('p', {
      client: mock<RevisionClient>({ materialize }),
      worker: mock<Worker>(),
    });
    try {
      const environment = await mountEnvironment();
      expect(await environment.fileManager.readFile('/main.kcl')).toStrictEqual(disk.get('main.kcl'));
      expect(materialize).not.toHaveBeenCalled();
      expect(await environment.fileManager.readFile('/models/part.step')).toStrictEqual(part);
      expect(materialize).toHaveBeenCalledExactlyOnceWith(['models/part.step']);
    } finally {
      revisionClients.delete('p');
    }
  });
});
