/**
 * @vitest-environment jsdom
 *
 * R17 — TS file-rename participant tests.
 *
 * Verifies the participant subscribes to `FileContentService.onDidContentChange`,
 * invokes the worker's `getEditsForFileRename` for `.ts`/`.tsx`/`.js`/`.jsx`
 * targets only, and applies the returned `FileTextChanges` as one
 * Monaco edit per affected model (so the user observes one undo step).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import * as monaco from 'monaco-editor';
import { createMonacoWorkspaceFs } from '#lib/monaco-workspace-fs/monaco-workspace-fs.js';
import { drainMonacoPostTestWork } from '#lib/testing/monaco-async-drain.js';
import { registerTsRenameParticipant } from '#lib/monaco-typescript-extras/ts-rename-participant.js';
import type { ContentChangeEvent, FileContentService } from '@taucad/fs-client/file-content-service';
import type {
  FileTextChangesLike,
  TauTypeScriptLanguageServiceWorker,
} from '#lib/monaco-typescript-extras/ts-worker-extras.types.js';

type ContentChangeHandler = (event: ContentChangeEvent) => void;

function createFakeContentService(): {
  contentService: FileContentService;
  emit(event: ContentChangeEvent): void;
} {
  const handlers = new Set<ContentChangeHandler>();
  const fake = {
    onDidContentChange(handler: ContentChangeHandler): () => void {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  };
  return {
    contentService: fake as unknown as FileContentService,
    emit(event) {
      for (const handler of handlers) {
        handler(event);
      }
    },
  };
}

function createFakeWorker(changes: readonly FileTextChangesLike[]): Pick<
  TauTypeScriptLanguageServiceWorker,
  'getEditsForFileRename'
> & {
  calls: Array<{ oldFilePath: string; newFilePath: string }>;
} {
  const calls: Array<{ oldFilePath: string; newFilePath: string }> = [];
  return {
    calls,
    async getEditsForFileRename(oldFilePath, newFilePath) {
      calls.push({ oldFilePath, newFilePath });
      return changes;
    },
  };
}

describe('registerTsRenameParticipant', () => {
  afterEach(async () => {
    for (const model of monaco.editor.getModels()) {
      model.dispose();
    }
    await drainMonacoPostTestWork();
  });

  it("applies tsserver edits to consumer files when a '.ts' module is renamed", async () => {
    const consumerText = "import { value } from './a';\nexport const exported = value;\n";
    const consumerUri = monaco.Uri.file('/b.ts');
    monaco.editor.createModel(consumerText, 'typescript', consumerUri);

    const importStart = consumerText.indexOf("'./a'");
    const importEnd = importStart + "'./a'".length;
    const fakeWorker = createFakeWorker([
      {
        fileName: consumerUri.toString(),
        textChanges: [
          {
            span: { start: importStart, length: importEnd - importStart },
            newText: "'./lib/a'",
          },
        ],
      },
    ]);

    const { contentService, emit } = createFakeContentService();
    const workspaceFs = createMonacoWorkspaceFs(monaco);
    workspaceFs.registerFileSystemProvider({
      scheme: 'file',
      async readText(uri) {
        return uri.path === '/b.ts' ? consumerText : '';
      },
      peekText(uri) {
        return uri.path === '/b.ts' ? consumerText : undefined;
      },
      languageId: () => 'typescript',
      onDidChange: () => ({ dispose: () => undefined }),
    });

    const editsApplied = vi.fn<(filesUpdated: number) => void>();
    const participant = registerTsRenameParticipant({
      monaco,
      contentService,
      workspaceFs,
      getWorker: async () => fakeWorker as unknown as TauTypeScriptLanguageServiceWorker,
      onEditsApplied: editsApplied,
    });

    emit({ type: 'renamed', oldPath: 'a.ts', newPath: 'lib/a.ts' });
    await drainMonacoPostTestWork();

    expect(fakeWorker.calls).toEqual([{ oldFilePath: 'file:///a.ts', newFilePath: 'file:///lib/a.ts' }]);
    expect(monaco.editor.getModel(consumerUri)?.getValue()).toBe(
      "import { value } from './lib/a';\nexport const exported = value;\n",
    );
    expect(editsApplied).toHaveBeenCalledWith(1);
    participant.dispose();
  });

  it('skips non-TS/JS renames without calling the worker', async () => {
    const fakeWorker = createFakeWorker([]);
    const { contentService, emit } = createFakeContentService();
    const workspaceFs = createMonacoWorkspaceFs(monaco);

    const participant = registerTsRenameParticipant({
      monaco,
      contentService,
      workspaceFs,
      getWorker: async () => fakeWorker as unknown as TauTypeScriptLanguageServiceWorker,
    });

    emit({ type: 'renamed', oldPath: 'docs/readme.md', newPath: 'docs/intro.md' });
    await drainMonacoPostTestWork();

    expect(fakeWorker.calls).toEqual([]);
    participant.dispose();
  });

  it('does not throw when getEditsForFileRename rejects (rename already landed at FS layer)', async () => {
    const { contentService, emit } = createFakeContentService();
    const workspaceFs = createMonacoWorkspaceFs(monaco);
    const failingWorker = {
      async getEditsForFileRename(): Promise<readonly FileTextChangesLike[] | undefined> {
        throw new Error('worker disposed');
      },
    } as unknown as TauTypeScriptLanguageServiceWorker;

    const participant = registerTsRenameParticipant({
      monaco,
      contentService,
      workspaceFs,
      getWorker: async () => failingWorker,
    });

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    emit({ type: 'renamed', oldPath: 'a.ts', newPath: 'b.ts' });
    await drainMonacoPostTestWork();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    participant.dispose();
  });

  it('disposing the participant stops subsequent events from invoking the worker', async () => {
    const fakeWorker = createFakeWorker([]);
    const { contentService, emit } = createFakeContentService();
    const workspaceFs = createMonacoWorkspaceFs(monaco);
    const participant = registerTsRenameParticipant({
      monaco,
      contentService,
      workspaceFs,
      getWorker: async () => fakeWorker as unknown as TauTypeScriptLanguageServiceWorker,
    });

    participant.dispose();
    emit({ type: 'renamed', oldPath: 'a.ts', newPath: 'b.ts' });
    await drainMonacoPostTestWork();

    expect(fakeWorker.calls).toEqual([]);
  });
});
