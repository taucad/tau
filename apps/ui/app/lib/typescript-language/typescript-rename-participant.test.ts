import { describe, expect, it, vi } from 'vitest';
import type { ContentChangeEvent } from '@taucad/fs-client/file-content-service';
import type { EditorLanguageEnvironment } from '#lib/editor-language-environment.js';
import { registerTypeScriptRenameParticipant } from '#lib/typescript-language/typescript-rename-participant.js';
import type { TypeScriptService } from '#lib/typescript-language/typescript-service.js';

describe('TypeScript file rename participant', () => {
  it('asks the real worker command for script moves and expands directory moves from the project tree', async () => {
    let emit = (_event: ContentChangeEvent): void => undefined;
    const unsubscribe = vi.fn();
    const request = vi.fn(async () => []);
    const environment = {
      contentService: {
        onDidContentChange: (handler: typeof emit) => {
          emit = handler;
          return unsubscribe;
        },
      },
      session: { get: () => undefined },
      treeService: {
        getTreeSnapshot: () =>
          new Map([
            ['new/src/main.ts', {}],
            ['new/src/data.json', {}],
          ]),
      },
    } as unknown as EditorLanguageEnvironment;
    const service = { client: { request } } as unknown as TypeScriptService;
    const dispose = registerTypeScriptRenameParticipant(environment, service);
    emit({ type: 'directoryRenamed', oldPath: 'old', newPath: 'new' });
    await vi.waitFor(() => {
      expect(request).toHaveBeenCalledWith({
        kind: 'fileRenameEditsWithBases',
        oldUri: 'file:///old/src/main.ts',
        newUri: 'file:///new/src/main.ts',
      });
    });
    expect(request).toHaveBeenCalledTimes(1);
    dispose();
    emit({ type: 'renamed', oldPath: 'new/src/main.ts', newPath: 'new/src/other.ts' });
    expect(request).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
