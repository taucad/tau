/**
 * MonacoModelService Tests
 *
 * Verifies:
 * - disposeAllModels only disposes tracked models (not TS lib files, ATA declarations)
 * - Content change event handling creates/updates/deletes Monaco models correctly
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as Monaco from 'monaco-editor';
import { MonacoModelService } from '#lib/monaco-model-service.js';
import type { ModelServiceConfig } from '#lib/monaco-model-service.js';
import type { ContentChangeEvent, FileContentResult } from '@taucad/fs-client/file-content-service';
import { createMonacoWorkspaceFs, createWorkspaceFileSystemProvider } from '#lib/monaco-workspace-fs/index.js';

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
  setValue: ReturnType<typeof vi.fn>;
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
  return {
    uri,
    dispose: vi.fn(),
    getValue: () => content,
    setValue: vi.fn(),
    getFullModelRange: () => ({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 1,
    }),
    pushStackElement: vi.fn(),
    pushEditOperations: vi.fn(),
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
  resolve: ReturnType<typeof vi.fn>;
  peek: ReturnType<typeof vi.fn>;
  peekOutcome: ReturnType<typeof vi.fn>;
  _handler?: (event: ContentChangeEvent) => void;
};

function createMockContentService(): MockContentService {
  const mock: MockContentService = {
    onDidContentChange: vi.fn((handler: (event: ContentChangeEvent) => void) => {
      mock._handler = handler;
      return () => {
        mock._handler = undefined;
      };
    }),
    resolve: vi.fn(async (): Promise<FileContentResult> => textResult('')),
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
  });
});
