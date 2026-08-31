/**
 * MonacoModelService Tests
 *
 * Verifies:
 * - disposeAllModels only disposes tracked models (not TS lib files, ATA declarations)
 * - Content change event handling creates/updates/deletes Monaco models correctly
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type * as Monaco from 'monaco-editor';
import { createWorkspaceContentBinding, MonacoModelService } from '#lib/monaco-model-service.js';
import type { ModelServiceConfig } from '#lib/monaco-model-service.js';
import type { ContentChangeEvent, FileContentResult, OutcomeChangeEvent } from '@taucad/fs-client/file-content-service';
import { FileContentService } from '@taucad/fs-client/file-content-service';
import type { FileSystemClient } from '@taucad/fs-client/file-system-client';
import type { WorkspaceScope } from '@taucad/filesystem';
import { RefreshGenerationGuard } from '@taucad/fs-client/refresh-generation-guard';
import { WorkerChangeChannel } from '@taucad/fs-client/worker-change-channel';
import { WorkspacePathResolver } from '@taucad/fs-client/workspace-path-resolver';
import {
  createMonacoWorkspaceFs,
  createWorkspaceFileSystemProvider,
  subscribeWorkspaceContentDispatch,
} from '#lib/monaco-workspace-fs/index.js';

function textResult(text: string): FileContentResult {
  return { kind: 'text', content: new TextEncoder().encode(text) };
}

vi.mock('#lib/monaco.constants.js', () => ({
  isJsLikeFile: (path: string) => /\.(js|jsx|ts|tsx|mjs|cjs)$/.test(path),
  getMonacoLanguage(path: string) {
    if (path.endsWith('.ts') || path.endsWith('.tsx')) {
      return 'typescript';
    }
    if (path.endsWith('.js') || path.endsWith('.jsx')) {
      return 'javascript';
    }
    if (path.endsWith('.scad')) {
      return 'openscad';
    }
    if (path.endsWith('.kcl')) {
      return 'kcl';
    }
    if (path.endsWith('.json')) {
      return 'json';
    }
    return undefined;
  },
}));

vi.mock('#utils/filesystem.utils.js', () => ({
  decodeTextFile: (data: Uint8Array<ArrayBuffer>) => new TextDecoder().decode(data),
}));

type MockModel = {
  uri: { toString: () => string; path: string };
  dispose: ReturnType<typeof vi.fn>;
  getValue: () => string;
  setValue: ReturnType<typeof vi.fn<(value: string) => void>>;
  getFullModelRange: () => unknown;
  pushStackElement: ReturnType<typeof vi.fn>;
  pushEditOperations: ReturnType<typeof vi.fn>;
};

type MockMonaco = {
  editor: {
    getModels: () => MockModel[];
    getModel: (uri: { toString: () => string }) => MockModel | undefined;
    createModel: ReturnType<typeof vi.fn>;
    setModelMarkers: ReturnType<typeof vi.fn>;
    onWillDisposeModel: ReturnType<typeof vi.fn>;
  };
  Uri: {
    file: (path: string) => { toString: () => string; path: string };
  };
};

function createMockModel(uriPath: string, content = ''): MockModel {
  const uri = {
    scheme: 'file',
    toString: () => `file://${uriPath}`,
    path: uriPath,
  };
  const setValue = vi.fn((value: string) => {
    content = value;
  });
  const pushEditOperations = vi.fn((_selections: unknown, edits: ReadonlyArray<{ text: string }>) => {
    const latest = edits.at(-1);
    if (latest !== undefined) {
      content = latest.text;
    }
  });
  return {
    uri,
    dispose: vi.fn(),
    getValue: () => content,
    setValue,
    getFullModelRange: () => ({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 1,
    }),
    pushStackElement: vi.fn(),
    pushEditOperations,
  };
}

function createMockMonaco(): {
  monaco: typeof Monaco & MockMonaco;
  models: Map<string, MockModel>;
} {
  const models = new Map<string, MockModel>();

  const monaco: MockMonaco = {
    editor: {
      getModels: () => [...models.values()],
      getModel(uri: { toString: () => string }) {
        for (const [, model] of models) {
          if (model.uri.toString() === uri.toString()) {
            return model;
          }
        }
        return undefined;
      },
      createModel: vi.fn((content: string, _language: string, uri: { toString: () => string; path: string }) => {
        const model = createMockModel(uri.path, content);
        models.set(uri.toString(), model);
        return model;
      }),
      setModelMarkers: vi.fn(),
      onWillDisposeModel: vi.fn(() => ({ dispose: vi.fn() })),
    },
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Monaco API uses PascalCase
    Uri: {
      file: (path: string) => ({
        scheme: 'file',
        toString: () => `file://${path}`,
        path,
      }),
    },
  };

  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- mock<T>() proxy not assignable to typeof Monaco & MockMonaco
  return { monaco: monaco as unknown as typeof Monaco & MockMonaco, models };
}

type MockMarkerService = {
  clearAll: ReturnType<typeof vi.fn>;
  removeUri: ReturnType<typeof vi.fn>;
  migrateUri: ReturnType<typeof vi.fn>;
};

function createMockMarkerService(): MockMarkerService {
  return {
    clearAll: vi.fn(),
    removeUri: vi.fn(),
    migrateUri: vi.fn(),
  };
}

type MockContentService = {
  onDidContentChange: ReturnType<typeof vi.fn>;
  onDidChangeOutcome: ReturnType<typeof vi.fn>;
  resolve: ReturnType<typeof vi.fn>;
  saveEditor: ReturnType<typeof vi.fn>;
  peek: ReturnType<typeof vi.fn>;
  peekOutcome: ReturnType<typeof vi.fn>;
  _handler?: (event: ContentChangeEvent) => void;
  _outcomeHandler?: (event: OutcomeChangeEvent) => void;
};

function createMockContentService(): MockContentService {
  const mock: MockContentService = {
    onDidContentChange: vi.fn((handler: (event: ContentChangeEvent) => void) => {
      mock._handler = handler;
      return () => {
        mock._handler = undefined;
      };
    }),
    onDidChangeOutcome: vi.fn((handler: (event: OutcomeChangeEvent) => void) => {
      mock._outcomeHandler = handler;
      return () => {
        mock._outcomeHandler = undefined;
      };
    }),
    resolve: vi.fn(async (): Promise<FileContentResult> => textResult('')),
    saveEditor: vi.fn(async () => undefined),
    peek: vi.fn(() => undefined),
    peekOutcome: vi.fn(() => ({ kind: 'loading' })),
  };
  return mock;
}

describe('MonacoModelService', () => {
  let service: MonacoModelService;
  let monaco: typeof Monaco & MockMonaco;
  let models: Map<string, MockModel>;
  let contentService: MockContentService;
  let markerService: MockMarkerService;

  beforeEach(() => {
    service = new MonacoModelService();
    ({ monaco, models } = createMockMonaco());
    contentService = createMockContentService();
    markerService = createMockMarkerService();

    const workspaceFs = createMonacoWorkspaceFs(monaco);
    workspaceFs.registerFileSystemProvider(
      createWorkspaceFileSystemProvider({
        monaco,
        contentService: contentService as unknown as ModelServiceConfig['contentService'],
      }),
    );

    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- mock<T>() proxy not assignable to ModelServiceConfig types
    service.initialize({
      monaco,
      workspaceFs,
      contentService: contentService as unknown as ModelServiceConfig['contentService'],
      markerService: markerService as unknown as ModelServiceConfig['markerService'],
    });

    // Mirror `use-monaco-model-service`: content notifications + refresh bridge for workspace `onDidChange`.
    const subscribeContentChanges = contentService.onDidContentChange as unknown as (
      handler: (event: ContentChangeEvent) => void,
    ) => () => void;
    subscribeContentChanges((event: ContentChangeEvent) => {
      service.applyContentChange(event);
    });
    const subscribeOutcomeChanges = contentService.onDidChangeOutcome as unknown as (
      handler: (event: OutcomeChangeEvent) => void,
    ) => () => void;
    subscribeOutcomeChanges((event) => {
      service.applyOutcomeChange(event);
    });
    workspaceFs.bindModelService({
      refreshContent: async (uri) => service.refreshContent(uri),
    });
  });

  describe('disposeAllModels', () => {
    it('should only dispose tracked models, not untracked ones', async () => {
      contentService.resolve.mockResolvedValueOnce(textResult('const x = 1;'));
      await service.getOrEnsureModel('src/app.ts');

      const untrackedModel = createMockModel('/lib.es2015.d.ts', 'declare const Array: any;');
      models.set('file:///lib.es2015.d.ts', untrackedModel);

      expect(monaco.editor.getModels()).toHaveLength(2);

      service.setProjectSession();

      const trackedModel = models.get('file:///src/app.ts');
      expect(trackedModel?.dispose).toHaveBeenCalled();
      expect(untrackedModel.dispose).not.toHaveBeenCalled();
    });

    it('should dispose models from editorHolds', async () => {
      contentService.resolve.mockResolvedValueOnce(textResult('export {};'));
      await service.acquireModel('src/editor-held.ts');

      const model = models.get('file:///src/editor-held.ts');

      service.setProjectSession();

      expect(model?.dispose).toHaveBeenCalled();
    });

    it('should dispose models from backgroundAccessTimes', async () => {
      contentService.resolve.mockResolvedValueOnce(textResult('export {};'));
      await service.getOrEnsureModel('src/background.ts');

      const model = models.get('file:///src/background.ts');

      service.setProjectSession();

      expect(model?.dispose).toHaveBeenCalled();
    });

    it('should leave TypeScript lib models intact after session change', async () => {
      const tsLib = createMockModel('/lib.es5.d.ts', 'declare const Object: any;');
      const tsLibDom = createMockModel('/lib.dom.d.ts', 'declare const document: any;');
      const ataModel = createMockModel('/node_modules/@types/react/index.d.ts', 'declare namespace React {}');
      models.set('file:///lib.es5.d.ts', tsLib);
      models.set('file:///lib.dom.d.ts', tsLibDom);
      models.set('file:///node_modules/@types/react/index.d.ts', ataModel);

      contentService.resolve.mockResolvedValueOnce(textResult('const y = 2;'));
      await service.getOrEnsureModel('src/index.ts');

      service.setProjectSession();

      expect(tsLib.dispose).not.toHaveBeenCalled();
      expect(tsLibDom.dispose).not.toHaveBeenCalled();
      expect(ataModel.dispose).not.toHaveBeenCalled();

      const trackedModel = models.get('file:///src/index.ts');
      expect(trackedModel?.dispose).toHaveBeenCalled();
    });

    it('should handle empty tracking sets gracefully', () => {
      const libModel = createMockModel('/lib.d.ts', '');
      models.set('file:///lib.d.ts', libModel);

      service.setProjectSession();

      expect(libModel.dispose).not.toHaveBeenCalled();
    });

    it('should handle models that have already been disposed externally', async () => {
      contentService.resolve.mockResolvedValueOnce(textResult('export {};'));
      await service.getOrEnsureModel('src/already-gone.ts');

      models.delete('file:///src/already-gone.ts');

      expect(() => {
        service.setProjectSession();
      }).not.toThrow();
    });
  });

  describe('acquireModel / releaseModel', () => {
    it('should create and return a model on first acquire', async () => {
      contentService.resolve.mockResolvedValueOnce(textResult('const x = 1;'));
      const model = await service.acquireModel('src/app.ts');

      expect(model).toBeDefined();
      expect(monaco.editor.createModel).toHaveBeenCalled();
    });

    it('should ref-count multiple acquires', async () => {
      contentService.resolve.mockResolvedValue(textResult('const x = 1;'));
      await service.acquireModel('src/app.ts');
      await service.acquireModel('src/app.ts');

      const diag = service.getDiagnostics();
      expect(diag.editorHeldCount).toBe(1);

      service.releaseModel('src/app.ts');
      const diag2 = service.getDiagnostics();
      expect(diag2.editorHeldCount).toBe(1);

      service.releaseModel('src/app.ts');
      const diag3 = service.getDiagnostics();
      expect(diag3.editorHeldCount).toBe(0);
      expect(diag3.backgroundCount).toBe(1);
    });

    it('should transition model to background on final release', async () => {
      contentService.resolve.mockResolvedValueOnce(textResult('export {};'));
      await service.acquireModel('src/bg.ts');

      service.releaseModel('src/bg.ts');

      const diag = service.getDiagnostics();
      expect(diag.editorHeldCount).toBe(0);
      expect(diag.backgroundCount).toBe(1);
    });

    it('should return the same model for repeated acquires', async () => {
      contentService.resolve.mockResolvedValue(textResult('const x = 1;'));
      const model1 = await service.acquireModel('src/app.ts');
      const model2 = await service.acquireModel('src/app.ts');

      expect(model1).toBe(model2);
      expect(monaco.editor.createModel).toHaveBeenCalledTimes(1);
    });

    it('should return undefined and skip model creation for binary outcomes', async () => {
      contentService.resolve.mockResolvedValueOnce({
        kind: 'binary',
        size: 1024,
        head: new Uint8Array([0, 1, 2]),
        revision: 1,
      });

      const model = await service.getOrEnsureModel('src/asset.ts');

      expect(model).toBeUndefined();
      expect(monaco.editor.createModel).not.toHaveBeenCalled();
    });

    it('should return undefined and skip model creation for too-large outcomes', async () => {
      contentService.resolve.mockResolvedValueOnce({
        kind: 'too-large',
        size: 100_000_000,
        limit: 5_000_000,
      });

      const model = await service.getOrEnsureModel('src/huge.ts');

      expect(model).toBeUndefined();
      expect(monaco.editor.createModel).not.toHaveBeenCalled();
    });

    it('should return undefined and skip model creation for orphaned outcomes', async () => {
      contentService.resolve.mockResolvedValueOnce({ kind: 'orphaned' });

      const model = await service.getOrEnsureModel('src/missing.ts');

      expect(model).toBeUndefined();
      expect(monaco.editor.createModel).not.toHaveBeenCalled();
    });

    it('should return undefined and skip model creation for error outcomes', async () => {
      contentService.resolve.mockResolvedValueOnce({
        kind: 'error',
        cause: new Error('disk failure'),
      });

      const model = await service.getOrEnsureModel('src/broken.ts');

      expect(model).toBeUndefined();
      expect(monaco.editor.createModel).not.toHaveBeenCalled();
    });
  });

  describe('handleContentChange', () => {
    it('should preserve filesystem provenance during a machine-restored held-model edit', async () => {
      contentService.resolve.mockResolvedValueOnce(textResult('cube([20,20,20]);'));
      await service.acquireModel('main.scad');

      const model = models.get('file:///main.scad');
      expect(model).toBeDefined();
      let observedInboundRestore = false;
      model?.pushEditOperations.mockImplementation(() => {
        observedInboundRestore = service.isApplyingFilesystemContent('main.scad');
      });

      contentService.peek.mockReturnValueOnce(new TextEncoder().encode('cube([10,10,10]);'));
      contentService._handler?.({
        type: 'batchWritten',
        paths: ['main.scad'],
        source: 'machine',
      });

      expect(model?.pushEditOperations).toHaveBeenCalledOnce();
      expect(observedInboundRestore).toBe(true);
      expect(service.isApplyingFilesystemContent('main.scad')).toBe(false);
    });

    it('should preserve filesystem provenance while refreshing a held file model', async () => {
      contentService.resolve.mockResolvedValueOnce(textResult('cube([20,20,20]);'));
      await service.acquireModel('main.scad');

      const model = models.get('file:///main.scad');
      let observedInboundRefresh = false;
      model?.pushEditOperations.mockImplementation(() => {
        observedInboundRefresh = service.isApplyingFilesystemContent('main.scad');
      });
      contentService.resolve.mockResolvedValueOnce(textResult('cube([10,10,10]);'));

      await service.refreshContent(monaco.Uri.file('/main.scad'));

      expect(model?.pushEditOperations).toHaveBeenCalledOnce();
      expect(observedInboundRefresh).toBe(true);
      expect(service.isApplyingFilesystemContent('main.scad')).toBe(false);
    });

    it('should clear filesystem provenance when a held-model mutation throws', async () => {
      contentService.resolve.mockResolvedValueOnce(textResult('before'));
      await service.acquireModel('main.scad');

      const model = models.get('file:///main.scad');
      model?.pushEditOperations.mockImplementation(() => {
        expect(service.isApplyingFilesystemContent('main.scad')).toBe(true);
        throw new Error('Monaco mutation failed');
      });

      expect(() => {
        service.applyContentChange({
          type: 'written',
          path: 'main.scad',
          data: new TextEncoder().encode('after'),
          source: 'machine',
        });
      }).toThrow('Monaco mutation failed');
      expect(service.isApplyingFilesystemContent('main.scad')).toBe(false);
    });

    it('should restore the outer path after nested filesystem model mutations', async () => {
      contentService.resolve
        .mockResolvedValueOnce(textResult('outer before'))
        .mockResolvedValueOnce(textResult('inner before'));
      await service.acquireModel('outer.ts');
      await service.acquireModel('inner.ts');

      const outerModel = models.get('file:///outer.ts');
      const innerModel = models.get('file:///inner.ts');
      innerModel?.pushEditOperations.mockImplementation(() => {
        expect(service.isApplyingFilesystemContent('inner.ts')).toBe(true);
        expect(service.isApplyingFilesystemContent('outer.ts')).toBe(false);
      });
      outerModel?.pushEditOperations.mockImplementation(() => {
        expect(service.isApplyingFilesystemContent('outer.ts')).toBe(true);
        service.applyContentChange({
          type: 'written',
          path: 'inner.ts',
          data: new TextEncoder().encode('inner after'),
          source: 'machine',
        });
        expect(service.isApplyingFilesystemContent('outer.ts')).toBe(true);
        expect(service.isApplyingFilesystemContent('inner.ts')).toBe(false);
      });

      service.applyContentChange({
        type: 'written',
        path: 'outer.ts',
        data: new TextEncoder().encode('outer after'),
        source: 'machine',
      });

      expect(outerModel?.pushEditOperations).toHaveBeenCalledOnce();
      expect(innerModel?.pushEditOperations).toHaveBeenCalledOnce();
      expect(service.isApplyingFilesystemContent('outer.ts')).toBe(false);
      expect(service.isApplyingFilesystemContent('inner.ts')).toBe(false);
    });

    it('should preserve the outer guard during a nested same-path mutation', async () => {
      contentService.resolve.mockResolvedValueOnce(textResult('before'));
      await service.acquireModel('main.ts');

      const model = models.get('file:///main.ts');
      let nested = false;
      model?.pushEditOperations.mockImplementation(() => {
        expect(service.isApplyingFilesystemContent('main.ts')).toBe(true);
        if (!nested) {
          nested = true;
          service.applyContentChange({
            type: 'written',
            path: 'main.ts',
            data: new TextEncoder().encode('nested'),
            source: 'machine',
          });
          expect(service.isApplyingFilesystemContent('main.ts')).toBe(true);
        }
      });

      service.applyContentChange({
        type: 'written',
        path: 'main.ts',
        data: new TextEncoder().encode('outer'),
        source: 'machine',
      });

      expect(model?.pushEditOperations).toHaveBeenCalledTimes(2);
      expect(service.isApplyingFilesystemContent('main.ts')).toBe(false);
    });

    it('should retain background setValue synchronization with scoped provenance', async () => {
      contentService.resolve.mockResolvedValueOnce(textResult('before'));
      await service.getOrEnsureModel('background.ts');

      const model = models.get('file:///background.ts');
      let observedInboundUpdate = false;
      model?.setValue.mockImplementation(() => {
        observedInboundUpdate = service.isApplyingFilesystemContent('background.ts');
      });

      service.applyContentChange({
        type: 'written',
        path: 'background.ts',
        data: new TextEncoder().encode('after'),
        source: 'machine',
      });

      expect(model?.setValue).toHaveBeenCalledWith('after');
      expect(model?.pushEditOperations).not.toHaveBeenCalled();
      expect(observedInboundUpdate).toBe(true);
      expect(service.isApplyingFilesystemContent('background.ts')).toBe(false);
    });

    it('should create a model for machine-sourced .scad files', () => {
      contentService._handler?.({
        type: 'written',
        path: 'main.scad',
        data: new TextEncoder().encode('cube([10,10,10]);'),
        source: 'machine',
      });

      expect(monaco.editor.createModel).toHaveBeenCalledWith(
        'cube([10,10,10]);',
        'openscad',
        expect.objectContaining({ path: '/main.scad' }),
      );
    });

    it('should create a model for machine-sourced .kcl files', () => {
      contentService._handler?.({
        type: 'written',
        path: 'main.kcl',
        data: new TextEncoder().encode('fn main() {}'),
        source: 'machine',
      });

      expect(monaco.editor.createModel).toHaveBeenCalledWith(
        'fn main() {}',
        'kcl',
        expect.objectContaining({ path: '/main.kcl' }),
      );
    });

    it('should create a model for machine-sourced .json files', () => {
      contentService._handler?.({
        type: 'written',
        path: 'test.json',
        data: new TextEncoder().encode('{"key": "value"}'),
        source: 'machine',
      });

      expect(monaco.editor.createModel).toHaveBeenCalledWith(
        '{"key": "value"}',
        'json',
        expect.objectContaining({ path: '/test.json' }),
      );
    });

    it('should NOT create a model for machine-sourced files with unknown extensions', () => {
      contentService._handler?.({
        type: 'written',
        path: 'model.stl',
        data: new TextEncoder().encode('binary data'),
        source: 'machine',
      });

      expect(monaco.editor.createModel).not.toHaveBeenCalled();
    });

    it('should NOT create a model for editor-sourced files', () => {
      contentService._handler?.({
        type: 'written',
        path: 'main.ts',
        data: new TextEncoder().encode('const x = 1;'),
        source: 'editor',
      });

      expect(monaco.editor.createModel).not.toHaveBeenCalled();
    });

    it('should NOT create a model for machine-sourced node_modules files', () => {
      contentService._handler?.({
        type: 'written',
        path: 'node_modules/lodash/index.js',
        data: new TextEncoder().encode('module.exports = {};'),
        source: 'machine',
      });

      expect(monaco.editor.createModel).not.toHaveBeenCalled();
    });

    it('should apply a changed authoritative text outcome to an open model', async () => {
      contentService.resolve.mockResolvedValueOnce(textResult('before'));
      await service.acquireModel('main.ts');
      const model = models.get('file:///main.ts');

      contentService._outcomeHandler?.({ path: 'main.ts', result: textResult('after') });

      expect(model?.pushEditOperations).toHaveBeenCalledWith(
        [],
        [expect.objectContaining({ text: 'after' })],
        expect.any(Function),
      );
    });

    it('should defer outcomes while an editor save is active and apply the final durable outcome', async () => {
      contentService.resolve.mockResolvedValueOnce(textResult('before'));
      await service.acquireModel('main.ts');
      const model = models.get('file:///main.ts');
      const save = Promise.withResolvers<void>();
      contentService.saveEditor.mockReturnValueOnce(save.promise);
      contentService.peekOutcome.mockReturnValue(textResult('latest durable'));

      const completion = service.saveEditor('main.ts', new TextEncoder().encode('local'));
      contentService._outcomeHandler?.({ path: 'main.ts', result: textResult('external during save') });
      expect(model?.pushEditOperations).not.toHaveBeenCalled();

      save.resolve();
      await completion;
      await vi.waitFor(() => {
        expect(model?.pushEditOperations).toHaveBeenCalledWith(
          [],
          [expect.objectContaining({ text: 'latest durable' })],
          expect.any(Function),
        );
      });
    });

    it('should preserve the newest model text after a rejected save and accept the next save', async () => {
      contentService.resolve.mockResolvedValueOnce(textResult('before'));
      await service.acquireModel('main.ts');
      const model = models.get('file:///main.ts');
      model?.setValue('newest local text');
      const failedSave = Promise.withResolvers<void>();
      contentService.saveEditor.mockReturnValueOnce(failedSave.promise).mockResolvedValueOnce(undefined);
      contentService.peekOutcome.mockReturnValue(textResult('saved later'));

      const failedCompletion = service.saveEditor('main.ts', new TextEncoder().encode('newest local text'));
      failedSave.reject(new Error('disk full'));
      await expect(failedCompletion).rejects.toThrow('disk full');
      await vi.waitFor(() => {
        expect(model?.getValue()).toBe('newest local text');
      });
      expect(model?.pushEditOperations).not.toHaveBeenCalled();

      model?.setValue('saved later');
      await service.saveEditor('main.ts', new TextEncoder().encode('saved later'));
      await vi.waitFor(() => {
        expect(model?.getValue()).toBe('saved later');
      });
      expect(contentService.saveEditor).toHaveBeenCalledTimes(2);
    });

    it('should dispose an open model when an authoritative outcome becomes non-text', async () => {
      contentService.resolve.mockResolvedValueOnce(textResult('before'));
      await service.acquireModel('main.ts');
      const model = models.get('file:///main.ts');

      contentService._outcomeHandler?.({ path: 'main.ts', result: { kind: 'orphaned' } });

      expect(model?.dispose).toHaveBeenCalledOnce();
      expect(markerService.removeUri).toHaveBeenCalledWith('file:///main.ts');
    });

    it('should preserve an empty open model across rename', async () => {
      contentService.resolve.mockResolvedValueOnce(textResult(''));
      await service.acquireModel('empty.ts');
      monaco.editor.createModel.mockClear();

      service.applyContentChange({ type: 'renamed', oldPath: 'empty.ts', newPath: 'renamed.ts' });

      expect(monaco.editor.createModel).toHaveBeenCalledWith(
        '',
        'typescript',
        expect.objectContaining({ path: '/renamed.ts' }),
      );
    });
  });
});

describe('Monaco external-content production wiring', () => {
  it('delegates refresh, structural removal, and authoritative outcomes', async () => {
    const modelService = {
      refreshContent: vi.fn(async () => undefined),
      applyContentChange: vi.fn(),
      applyOutcomeChange: vi.fn(),
    } as unknown as MonacoModelService;
    const binding = createWorkspaceContentBinding(modelService);
    const uriShape = { scheme: 'file', path: '/main.ts' };
    const uri = uriShape as Monaco.Uri;
    const removal: ContentChangeEvent = { type: 'deleted', path: 'main.ts', source: 'user' };
    const outcome: OutcomeChangeEvent = { path: 'main.ts', result: { kind: 'orphaned' } };

    await binding.refreshContent(uri);
    binding.applyContentChange(removal);
    binding.applyOutcomeChange(outcome);

    expect(modelService.refreshContent).toHaveBeenCalledWith(uri);
    expect(modelService.applyContentChange).toHaveBeenCalledWith(removal);
    expect(modelService.applyOutcomeChange).toHaveBeenCalledWith(outcome);
  });

  it('rereads an external fileWritten notification and updates an open model', async () => {
    let bytes = new TextEncoder().encode('before');
    const readFileMock = vi.fn(async () => bytes);
    function readFile(
      filepath: string,
      options: 'utf8' | { encoding: 'utf8'; scope?: WorkspaceScope },
    ): Promise<string>;
    function readFile(filepath: string, options?: { scope?: WorkspaceScope }): Promise<Uint8Array<ArrayBuffer>>;
    async function readFile(
      _filepath: string,
      options?: 'utf8' | { encoding?: 'utf8'; scope?: WorkspaceScope },
    ): Promise<string | Uint8Array<ArrayBuffer>> {
      const data = await readFileMock();
      return options === 'utf8' || options?.encoding === 'utf8' ? new TextDecoder().decode(data) : data;
    }
    const proxy = mock<FileSystemClient>({ readFile });
    let emitWorkerChange: ((event: unknown) => void) | undefined;
    const paths = new WorkspacePathResolver('/project');
    const channel = new WorkerChangeChannel({
      transport: {
        listen: (_event, handler) => {
          emitWorkerChange = handler;
          return vi.fn();
        },
      },
      paths,
    });
    const contentService = new FileContentService({
      proxy,
      paths,
      channel,
      refreshGuard: new RefreshGenerationGuard(),
    });
    const { monaco, models } = createMockMonaco();
    const markerService = createMockMarkerService();
    const workspaceFs = createMonacoWorkspaceFs(monaco);
    workspaceFs.registerFileSystemProvider(createWorkspaceFileSystemProvider({ monaco, contentService }));
    const modelService = new MonacoModelService();
    modelService.initialize({
      monaco,
      workspaceFs,
      contentService,
      markerService: markerService as unknown as ModelServiceConfig['markerService'],
    });
    const binding = createWorkspaceContentBinding(modelService);
    const subscription = subscribeWorkspaceContentDispatch(
      contentService,
      binding.applyContentChange,
      binding.applyOutcomeChange,
    );

    try {
      await modelService.acquireModel('main.ts');
      expect(models.get('file:///main.ts')?.getValue()).toBe('before');
      bytes = new TextEncoder().encode('after');
      emitWorkerChange?.({ type: 'fileWritten', path: '/project/main.ts', backend: 'indexeddb' });

      await vi.waitFor(() => {
        expect(models.get('file:///main.ts')?.getValue()).toBe('after');
      });
      expect(readFileMock).toHaveBeenCalledTimes(2);
    } finally {
      subscription.dispose();
      modelService.dispose();
      workspaceFs.dispose();
      contentService.dispose();
      channel.dispose();
    }
  });
});
