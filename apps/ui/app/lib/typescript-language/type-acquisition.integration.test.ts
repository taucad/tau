// @vitest-environment node
import type { TypeScriptWorkerCommand } from '@taucad/lsp/typescript-worker/protocol';
import { describe, expect, it, vi } from 'vitest';
import { ChangeEventBus, MountTable, ProviderRegistry, ResourceQueue, WorkspaceFileService } from '@taucad/filesystem';
import { TypeScriptProjectService } from '@taucad/lsp/typescript-worker/typescript-service';
import { kinematicsTypes } from '@taucad/api-extractor/authoring-types';
import { populateBundledTypesMount } from '#machines/bundled-types-mount.js';
import { TypeAcquisitionController } from '#lib/typescript-language/type-acquisition.js';
import { EditorDocument } from '#lib/editor-document.js';

describe('bundled authoring acquisition', () => {
  it('loads real kinematics and spatial through the mounted dependency capability without a manifest dependency', async () => {
    vi.useFakeTimers();
    const providers = new ProviderRegistry();
    const mounts = new MountTable();
    const scope = { backend: 'memory', storageRootKey: 'memory:typescript-authoring' } as const;
    mounts.mount('/node_modules', await providers.getProvider(scope), { ...scope, class: 'derived' });
    const filesystem = new WorkspaceFileService({
      providerRegistry: providers,
      mountTable: mounts,
      resourceQueue: new ResourceQueue(),
      eventBus: new ChangeEventBus(),
    });
    await populateBundledTypesMount(
      filesystem.createRootedFileSystem('/node_modules'),
      Object.entries(kinematicsTypes).map(([packageName, definition]) => ({ packageName, ...definition })),
    );
    const worker = new TypeScriptProjectService({
      syncFs: {
        readFileText: () => undefined,
        fileExists: () => false,
        directoryExists: () => false,
        getDirectories: () => [],
        getScriptVersionForPath: () => '0',
      },
      standardLibraries: {},
    });
    const request = vi.fn(async (command: TypeScriptWorkerCommand) => {
      if (command.kind === 'declarationImports') {
        return worker.declarationImports(command.text);
      }
      throw new Error('Unexpected acquisition command');
    });
    const controller = new TypeAcquisitionController({
      client: {
        setExtraLib: async (uri, text) => {
          worker.setExtraLib(uri, text);
        },
        request: async <T>(command: TypeScriptWorkerCommand): Promise<T> => (await request(command)) as T,
      },
      staticTypes: [],
      dynamicTypes: false,
      dependencyReader: {
        readFile: async (path) => filesystem.readFile(path),
        readdir: async (path) => filesystem.readdir(path),
      },
    });
    const document = new EditorDocument(
      'layout.ts',
      "import type {MechanismSource} from '@taucad/kinematics'; export type Mechanism = MechanismSource;",
    );
    worker.open(document.uri, document.text, document.version);
    try {
      expect(worker.getDiagnostics(document.uri).some((row) => row.code === 2307)).toBe(true);
      controller.watch(document);
      await vi.advanceTimersByTimeAsync(500);
      const diagnostics = worker.getDiagnostics(document.uri);
      expect(diagnostics.some((row) => row.code === 2307)).toBe(false);
      worker.open(
        'file:///spatial.ts',
        "import type {SpatialMatrix} from '@taucad/spatial'; export const bad: SpatialMatrix = 'wrong';",
        1,
      );
      expect(worker.getDiagnostics('file:///spatial.ts').map((row) => row.code)).toEqual([2322]);
      expect(
        worker.getDiagnostics('file:///node_modules/@taucad/kinematics/types.d.ts').some((row) => row.code === 2307),
      ).toBe(false);
      worker.open('file:///value.ts', "import {MechanismSource} from '@taucad/kinematics'; MechanismSource();", 1);
      expect(worker.getDiagnostics('file:///value.ts').some((row) => row.code === 2693)).toBe(true);
      expect(document.version).toBe(1);
    } finally {
      controller.dispose();
      worker.dispose();
      filesystem.dispose();
      vi.useRealTimers();
    }
  });
});
