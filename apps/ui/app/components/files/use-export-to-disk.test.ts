import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ActorRefFrom } from 'xstate';
import type { CapabilitiesManifest, ExportRoute } from '@taucad/runtime';
import type * as FileUtilsModuleType from '@taucad/utils/file';
import type { FileExtension } from '@taucad/types';
import type { cadMachine } from '#machines/cad.machine.js';

const mockDownloadBlob = vi.fn<(blob: Blob, filename: string) => void>();
vi.mock('@taucad/utils/file', async () => {
  const actual = await vi.importActual<typeof FileUtilsModuleType>('@taucad/utils/file');
  return {
    ...actual,
    downloadBlob: (blob: Blob, filename: string) => {
      mockDownloadBlob(blob, filename);
    },
  };
});

const mockToastSuccess = vi.fn<(message: string) => void>();
const mockToastError = vi.fn<(message: string) => void>();
vi.mock('#components/ui/sonner.js', () => ({
  toast: {
    success: (message: string) => {
      mockToastSuccess(message);
    },
    error: (message: string) => {
      mockToastError(message);
    },
  },
}));

const { useExportToDisk } = await import('./use-export-to-disk.js');

type ExportResult =
  | {
      success: true;
      data: Array<{ bytes: Uint8Array<ArrayBuffer>; name: string; mimeType: string }>;
      issues: never[];
    }
  | { success: false; issues: Array<{ message: string }> };

function createCapabilities(): CapabilitiesManifest {
  return {
    routes: [
      {
        targetFormat: 'glb',
        kernelId: 'replicad',
        sourceFormat: 'glb',
        fidelity: 'mesh',
        schema: {},
        defaults: {},
      },
      {
        targetFormat: 'stl',
        kernelId: 'replicad',
        sourceFormat: 'stl',
        fidelity: 'mesh',
        schema: { type: 'object', properties: { binary: { type: 'boolean', default: true } } },
        defaults: { binary: true },
      },
    ],
    renderSchemas: {},
  };
}

function createCadActor(options: {
  capabilities?: CapabilitiesManifest | undefined;
  activeKernelId?: string | undefined;
  exportImplementation?: (format: FileExtension, options: Record<string, unknown>) => Promise<ExportResult>;
}): { actor: ActorRefFrom<typeof cadMachine>; mockExport: ReturnType<typeof vi.fn> } {
  const capabilities = options.capabilities ?? createCapabilities();
  const activeKernelId = options.activeKernelId ?? 'replicad';
  const defaultExport = vi.fn(
    async (): Promise<ExportResult> => ({
      success: true,
      data: [{ bytes: new Uint8Array([1, 2, 3]), name: 'model.glb', mimeType: 'model/gltf-binary' }],
      issues: [],
    }),
  );
  const mockExport = options.exportImplementation ? vi.fn(options.exportImplementation) : defaultExport;

  const kernelClient = {
    capabilities,
    bestRouteFor(format: FileExtension): ExportRoute | undefined {
      return capabilities.routes.find((route) => route.targetFormat === format);
    },
    export: mockExport,
  };

  const actor = {
    getSnapshot: () => ({
      context: { kernelClient, activeKernelId, capabilities },
    }),
  } as unknown as ActorRefFrom<typeof cadMachine>;

  return { actor, mockExport };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useExportToDisk', () => {
  it('should call kernelClient.export with the route defaults for the active kernel', async () => {
    const { actor, mockExport } = createCadActor({});
    const { result } = renderHook(() => useExportToDisk('test-project'));

    await act(async () => {
      await result.current.exportToDisk(actor, 'stl');
    });

    expect(mockExport).toHaveBeenCalledWith('stl', { exportOptions: { binary: true } });
  });

  // oxlint-disable-next-line no-template-curly-in-string -- documenting the produced filename pattern in a sentence
  it('should download the blob as filenameBase.format on success', async () => {
    const { actor } = createCadActor({});
    const { result } = renderHook(() => useExportToDisk('my-pot'));

    await act(async () => {
      await result.current.exportToDisk(actor, 'glb');
    });

    expect(mockDownloadBlob).toHaveBeenCalledTimes(1);
    const [blob, filename] = mockDownloadBlob.mock.calls[0]!;
    expect(filename).toBe('my-pot.glb');
    expect(blob).toBeInstanceOf(Blob);
    expect(mockToastSuccess).toHaveBeenCalledWith('Exported GLB');
  });

  it('should surface a toast error and skip download when the export result is not successful', async () => {
    const { actor } = createCadActor({
      exportImplementation: async () => ({ success: false, issues: [{ message: 'kernel exploded' }] }),
    });
    const { result } = renderHook(() => useExportToDisk('test-project'));

    await act(async () => {
      await result.current.exportToDisk(actor, 'glb');
    });

    expect(mockToastError).toHaveBeenCalledWith('kernel exploded');
    expect(mockDownloadBlob).not.toHaveBeenCalled();
  });

  it('should surface a toast error and skip download when kernelClient.export rejects', async () => {
    const { actor } = createCadActor({
      exportImplementation: async () => {
        throw new Error('worker died');
      },
    });
    const { result } = renderHook(() => useExportToDisk('test-project'));

    await act(async () => {
      await result.current.exportToDisk(actor, 'glb');
    });

    expect(mockToastError).toHaveBeenCalledWith('worker died');
    expect(mockDownloadBlob).not.toHaveBeenCalled();
  });

  it('should expose isExporting=true while in flight and revert to false after settle', async () => {
    let releaseExport: (() => void) | undefined;
    const { actor } = createCadActor({
      exportImplementation: async () => {
        await new Promise<void>((resolve) => {
          releaseExport = resolve;
        });
        return {
          success: true,
          data: [{ bytes: new Uint8Array([1]), name: 'model.glb', mimeType: 'model/gltf-binary' }],
          issues: [],
        };
      },
    });

    const { result } = renderHook(() => useExportToDisk('test-project'));
    expect(result.current.isExporting).toBe(false);

    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = result.current.exportToDisk(actor, 'glb');
    });

    expect(result.current.isExporting).toBe(true);

    await act(async () => {
      releaseExport?.();
      await pending;
    });

    expect(result.current.isExporting).toBe(false);
  });

  it('should keep exportToDisk referentially stable across rerenders when filenameBase is unchanged', () => {
    const { result, rerender } = renderHook(({ name }) => useExportToDisk(name), {
      initialProps: { name: 'test-project' },
    });
    const first = result.current.exportToDisk;
    rerender({ name: 'test-project' });
    expect(result.current.exportToDisk).toBe(first);
  });

  it('should toast error and skip export when the actor has no kernelClient', async () => {
    const actor = {
      getSnapshot: () => ({ context: { kernelClient: undefined, activeKernelId: undefined, capabilities: undefined } }),
    } as unknown as ActorRefFrom<typeof cadMachine>;

    const { result } = renderHook(() => useExportToDisk('test-project'));

    await act(async () => {
      await result.current.exportToDisk(actor, 'glb');
    });

    expect(mockToastError).toHaveBeenCalledWith('Export failed');
    expect(mockDownloadBlob).not.toHaveBeenCalled();
  });
});
