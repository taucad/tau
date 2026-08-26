import { describe, it, expect, vi, afterEach } from 'vitest';
import * as monaco from 'monaco-editor';
import type { FileStatEntry } from '@taucad/types';
import type { FileContentResult, FileContentService } from '@taucad/fs-client/file-content-service';
import {
  createWorkspaceFileSystemProvider,
  subscribeWorkspaceContentDispatch,
} from '#lib/monaco-workspace-fs/workspace-file-system-provider.js';
import { createMonacoWorkspaceFs } from '#lib/monaco-workspace-fs/monaco-workspace-fs.js';
import { MonacoWorkspaceFileNotFoundError } from '#lib/monaco-workspace-fs/file-not-found-error.js';
import { drainMonacoPostTestWork } from '#lib/testing/monaco-async-drain.js';

function textResult(text: string): FileContentResult {
  return { kind: 'text', content: new TextEncoder().encode(text) };
}

function textFileStatEntry(path: string): FileStatEntry {
  return {
    path,
    name: path.split('/').pop() ?? path,
    type: 'file',
    size: 0,
    mtimeMs: 0,
    contentKind: 'text',
    lineCount: 1,
  };
}

describe('createWorkspaceFileSystemProvider', () => {
  afterEach(async () => {
    for (const model of monaco.editor.getModels()) {
      model.dispose();
    }
    await drainMonacoPostTestWork();
  });

  it('readText resolves workspace-relative path via content service', async () => {
    const resolve = vi.fn(async (path: string) => {
      if (path === 'src/a.ts') {
        return textResult('export const x = 1;');
      }
      throw new Error('missing');
    });
    const peekOutcome = vi.fn(() => ({ kind: 'loading' }));
    const contentService = {
      resolve,
      peekOutcome,
    } as unknown as FileContentService;

    const provider = createWorkspaceFileSystemProvider({ monaco, contentService });
    const uri = monaco.Uri.file('/src/a.ts');
    const text = await provider.readText(uri);
    expect(text).toBe('export const x = 1;');
    expect(resolve).toHaveBeenCalledWith('src/a.ts');
  });

  it('peekText returns decoded text for text outcomes', () => {
    const resolve = vi.fn();
    const contentService = {
      resolve,
      peekOutcome(path: string) {
        if (path === 'readme.md') {
          return textResult('hello');
        }
        return { kind: 'loading' };
      },
    } as unknown as FileContentService;

    const provider = createWorkspaceFileSystemProvider({ monaco, contentService });
    const peeked = provider.peekText?.(monaco.Uri.file('/readme.md'));
    expect(peeked).toBe('hello');
  });

  it('peekModel returns undefined instead of throwing for a malformed file URI', () => {
    const contentService = {
      resolve: vi.fn(),
      peekOutcome: vi.fn(() => ({ kind: 'loading' })),
    } as unknown as FileContentService;
    const workspaceFs = createMonacoWorkspaceFs(monaco);
    workspaceFs.registerFileSystemProvider(createWorkspaceFileSystemProvider({ monaco, contentService }));
    const uri = monaco.Uri.from({ scheme: 'file', path: '/../outside.ts' });

    expect(uri.path).toBe('/../outside.ts');
    expect(workspaceFs.peekModel(uri)).toBeUndefined();
    expect(contentService.peekOutcome).toHaveBeenCalledWith('../outside.ts');
    workspaceFs.dispose();
  });

  it('isReadOnly is true for node_modules paths', () => {
    const contentService = {
      resolve: vi.fn(),
      peekOutcome: vi.fn(),
    } as unknown as FileContentService;
    const provider = createWorkspaceFileSystemProvider({ monaco, contentService });
    expect(provider.isReadOnly?.(monaco.Uri.file('/node_modules'))).toBe(true);
    expect(provider.isReadOnly?.(monaco.Uri.file('/node_modules/foo/index.js'))).toBe(true);
    expect(provider.isReadOnly?.(monaco.Uri.file('/src/node_modules/foo/index.js'))).toBe(false);
    expect(provider.isReadOnly?.(monaco.Uri.file('/src/main.ts'))).toBe(false);
  });

  it('readText throws MonacoWorkspaceFileNotFoundError for non-text outcomes', async () => {
    const contentService = {
      resolve: vi.fn(async () => ({ kind: 'binary', content: new Uint8Array([1]) })),
      peekOutcome: vi.fn(),
    } as unknown as FileContentService;
    const provider = createWorkspaceFileSystemProvider({ monaco, contentService });
    const uri = monaco.Uri.file('/blob.bin');
    await expect(provider.readText(uri)).rejects.toBeInstanceOf(MonacoWorkspaceFileNotFoundError);
  });

  it('findFiles delegates to searchFiles and maps stat paths to file URIs', async () => {
    const searchFiles = vi.fn(
      async (): Promise<readonly FileStatEntry[]> => [textFileStatEntry('a.ts'), textFileStatEntry('/b.ts')],
    );
    const contentService = {
      resolve: vi.fn(),
      peekOutcome: vi.fn(),
    } as unknown as FileContentService;
    const provider = createWorkspaceFileSystemProvider({
      monaco,
      contentService,
      searchFiles,
    });
    const uris = await provider.findFiles?.('.ts', { maxResults: 10 });
    expect(searchFiles).toHaveBeenCalledWith('.ts', { maxResults: 10, includeDirectories: false });
    expect(uris?.map((u) => u.path)).toEqual(['/a.ts', '/b.ts']);
  });

  it('readText prefers workspace text from content service when present', async () => {
    const contentService = {
      resolve: vi.fn(async () => textResult('export declare const x: string;')),
      peekOutcome: vi.fn(),
    } as unknown as FileContentService;
    const provider = createWorkspaceFileSystemProvider({
      monaco,
      contentService,
    });
    const uri = monaco.Uri.file('/node_modules/replicad/index.d.ts');
    const text = await provider.readText(uri);
    expect(text).toBe('export declare const x: string;');
  });

  it('readText throws when content service returns orphaned', async () => {
    const contentService = {
      resolve: vi.fn(async () => ({ kind: 'orphaned' })),
      peekOutcome: vi.fn(),
    } as unknown as FileContentService;
    const provider = createWorkspaceFileSystemProvider({ monaco, contentService });
    const uri = monaco.Uri.file('/node_modules/missing/index.d.ts');
    await expect(provider.readText(uri)).rejects.toBeInstanceOf(MonacoWorkspaceFileNotFoundError);
  });

  it('findFiles returns only searchFiles hits (no addExtraLib fan-in)', async () => {
    const searchFiles = vi.fn(
      async (): Promise<readonly FileStatEntry[]> => [textFileStatEntry('node_modules/replicad/index.d.ts')],
    );
    const contentService = {
      resolve: vi.fn(),
      peekOutcome: vi.fn(),
    } as unknown as FileContentService;
    const provider = createWorkspaceFileSystemProvider({
      monaco,
      contentService,
      searchFiles,
    });
    const uris = await provider.findFiles?.('replicad', { maxResults: 10 });
    expect(searchFiles).toHaveBeenCalledWith('replicad', { maxResults: 10, includeDirectories: false });
    expect(uris?.map((u) => u.path)).toEqual(['/node_modules/replicad/index.d.ts']);
  });

  it('subscribes and disposes both structural and outcome dispatch', () => {
    const unsubscribeContent = vi.fn();
    const unsubscribeOutcome = vi.fn();
    const contentService = {
      onDidContentChange: vi.fn(() => unsubscribeContent),
      onDidChangeOutcome: vi.fn(() => unsubscribeOutcome),
    } as unknown as FileContentService;
    const dispatch = vi.fn();
    const dispatchOutcome = vi.fn();

    const subscription = subscribeWorkspaceContentDispatch(contentService, dispatch, dispatchOutcome);
    expect(contentService.onDidContentChange).toHaveBeenCalledWith(dispatch);
    expect(contentService.onDidChangeOutcome).toHaveBeenCalledWith(dispatchOutcome);

    subscription.dispose();
    expect(unsubscribeContent).toHaveBeenCalledOnce();
    expect(unsubscribeOutcome).toHaveBeenCalledOnce();
  });
});
