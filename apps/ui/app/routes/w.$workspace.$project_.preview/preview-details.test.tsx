import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { ActorRefFrom } from 'xstate';
import type { CapabilitiesManifest, ExportRoute } from '@taucad/runtime';
import type * as FileUtilsModuleType from '@taucad/utils/file';
import type { FileExtension } from '@taucad/types';
import type { cadMachine } from '#machines/cad.machine.js';
import type { PreviewProjectMetadata } from '#routes/w.$workspace.$project_.preview/preview-project-context.js';

vi.mock('@xstate/react', () => ({
  useSelector: (actor: { getSnapshot: () => unknown } | undefined, selector: (state: unknown) => unknown) => {
    if (!actor) {
      return selector(undefined);
    }
    return selector(actor.getSnapshot());
  },
}));

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

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
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

vi.mock('#components/ui/tooltip.js', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
  TooltipContent: () => null,
  TooltipTrigger: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
  TooltipProvider: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
}));

const { PreviewDetails } = await import('./preview-details.js');

function createCapabilities(): CapabilitiesManifest {
  return {
    routes: [
      {
        targetFormat: 'glb',
        kernelId: 'replicad',
        sourceFormat: 'glb',
        fidelity: 'mesh',
        exportOptions: { schema: {}, defaults: {} },
      },
      {
        targetFormat: 'stl',
        kernelId: 'replicad',
        sourceFormat: 'stl',
        fidelity: 'mesh',
        exportOptions: {
          schema: { type: 'object', properties: { binary: { type: 'boolean', default: true } } },
          defaults: { binary: true },
        },
      },
      {
        targetFormat: 'step',
        kernelId: 'replicad',
        sourceFormat: 'step',
        fidelity: 'brep',
        exportOptions: { schema: {}, defaults: {} },
      },
    ],
    renderCapabilities: {},
    plugins: [],
  };
}

const mockExport = vi.fn().mockResolvedValue({
  success: true,
  data: [{ bytes: new Uint8Array([1, 2, 3]), name: 'model.glb', mimeType: 'model/gltf-binary' }],
  issues: [],
});

function createCadActor(capabilities: CapabilitiesManifest): ActorRefFrom<typeof cadMachine> {
  const kernelClient = {
    capabilities,
    bestRouteFor(format: FileExtension): ExportRoute | undefined {
      return capabilities.routes.find((route) => route.targetFormat === format);
    },
    export: mockExport,
  };
  return {
    getSnapshot: () => ({
      context: { kernelClient, activeKernelId: 'replicad', capabilities },
    }),
  } as unknown as ActorRefFrom<typeof cadMachine>;
}

const baseProject: PreviewProjectMetadata = {
  id: 'p1',
  name: 'my-pot',
  description: 'A pot',
  author: { name: 'A', avatar: '' },
  tags: [],
  assets: { main: { entryPath: 'main.ts' } },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PreviewDetails', () => {
  it('should render the dynamic export grid instead of legacy static download buttons', () => {
    const cadRef = createCadActor(createCapabilities());
    try {
      render(<PreviewDetails project={baseProject} hasGeometry={true} cadRef={cadRef} />);

      expect(screen.getByText('Mesh')).toBeInTheDocument();
      expect(screen.getByText('BREP')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /glb/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /stl/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /step/i })).toBeInTheDocument();

      // Legacy static buttons must be gone
      expect(screen.queryByRole('button', { name: /download stl/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /download step/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /download gltf/i })).toBeNull();
    } finally {
      cleanup();
    }
  });

  // oxlint-disable-next-line no-template-curly-in-string -- documenting the produced filename pattern in a sentence
  it('should call kernelClient.export and download as project.name.format when a pill is clicked', async () => {
    const cadRef = createCadActor(createCapabilities());
    try {
      render(<PreviewDetails project={baseProject} hasGeometry={true} cadRef={cadRef} />);

      fireEvent.click(screen.getByRole('button', { name: /stl/i }));

      await vi.waitFor(() => {
        expect(mockExport).toHaveBeenCalledWith('stl', { exportOptions: { binary: true } });
      });
      await vi.waitFor(() => {
        expect(mockDownloadBlob).toHaveBeenCalledTimes(1);
      });
      const [, filename] = mockDownloadBlob.mock.calls[0]!;
      expect(filename).toBe('my-pot.stl');
      expect(mockToastSuccess).toHaveBeenCalledWith('Exported STL');
    } finally {
      cleanup();
    }
  });

  it('should show a placeholder when no geometry is rendered yet', () => {
    const cadRef = createCadActor(createCapabilities());
    try {
      render(<PreviewDetails project={baseProject} hasGeometry={false} cadRef={cadRef} />);

      expect(screen.getByText(/render the geometry to enable export\./i)).toBeInTheDocument();
      expect(screen.queryByText('Mesh')).toBeNull();
    } finally {
      cleanup();
    }
  });

  it('should render the project description when provided', () => {
    const cadRef = createCadActor(createCapabilities());
    try {
      render(<PreviewDetails project={baseProject} hasGeometry={true} cadRef={cadRef} />);

      expect(screen.getByText('A pot')).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('should render the project tags when provided', () => {
    const cadRef = createCadActor(createCapabilities());
    try {
      render(
        <PreviewDetails project={{ ...baseProject, tags: ['ceramic', 'mug'] }} hasGeometry={true} cadRef={cadRef} />,
      );

      expect(screen.getByText('ceramic')).toBeInTheDocument();
      expect(screen.getByText('mug')).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });
});
