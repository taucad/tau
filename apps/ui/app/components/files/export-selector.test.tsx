import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ActorRefFrom } from 'xstate';
import type { CapabilitiesManifest, ExportRoute } from '@taucad/runtime';
import type * as FileUtilsModuleType from '@taucad/utils/file';
import type { FileExtension } from '@taucad/types';
import type { cadMachine } from '#machines/cad.machine.js';

vi.mock('@xstate/react', () => ({
  useSelector: (actor: { getSnapshot: () => unknown } | undefined, selector: (state: unknown) => unknown) => {
    if (!actor) {
      return selector(undefined);
    }
    return selector(actor.getSnapshot());
  },
}));

let mockCapabilities: CapabilitiesManifest | undefined;
let mockActiveKernelId: string | undefined = 'replicad';

function fidelityRank(fidelity: ExportRoute['fidelity']): number {
  return fidelity === 'brep' ? 0 : 1;
}

function directnessRank(route: ExportRoute): number {
  return route.transcoderId === undefined ? 0 : 1;
}

const mockExport = vi.fn().mockResolvedValue({
  success: true,
  data: [{ bytes: new Uint8Array([1, 2, 3]), name: 'model.glb', mimeType: 'model/gltf-binary' }],
  issues: [],
});

const mockKernelClient = {
  get capabilities(): CapabilitiesManifest | undefined {
    return mockCapabilities;
  },
  routesFor(format: FileExtension): readonly ExportRoute[] {
    if (!mockCapabilities) {
      return [];
    }
    return mockCapabilities.routes.filter((route) => route.targetFormat === format);
  },
  bestRouteFor(format: FileExtension, options?: { readonly kernelId?: string }): ExportRoute | undefined {
    if (!mockCapabilities) {
      return undefined;
    }
    const matches = mockCapabilities.routes.filter((route) => route.targetFormat === format);
    if (matches.length === 0) {
      return undefined;
    }
    const kernelMatches = options?.kernelId ? matches.filter((route) => route.kernelId === options.kernelId) : matches;
    const candidates = kernelMatches.length > 0 ? kernelMatches : matches;
    const indexed = candidates.map((route, index) => ({ route, index }));
    indexed.sort((a, b) => {
      const fidelityDelta = fidelityRank(a.route.fidelity) - fidelityRank(b.route.fidelity);
      if (fidelityDelta !== 0) {
        return fidelityDelta;
      }
      const directnessDelta = directnessRank(a.route) - directnessRank(b.route);
      if (directnessDelta !== 0) {
        return directnessDelta;
      }
      return a.index - b.index;
    });
    return indexed[0]?.route;
  },
  export: mockExport,
};

const mockCadRef = {
  getSnapshot: vi.fn(() => ({
    context: {
      capabilities: mockCapabilities,
      activeKernelId: mockActiveKernelId,
      kernelClient: mockKernelClient,
    },
  })),
} as unknown as ActorRefFrom<typeof cadMachine>;

const mockCadRef2 = {
  getSnapshot: vi.fn(() => ({
    context: {
      capabilities: mockCapabilities,
      activeKernelId: mockActiveKernelId,
      kernelClient: mockKernelClient,
    },
  })),
} as unknown as ActorRefFrom<typeof cadMachine>;

const mockDownloadBlob = vi.fn();
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

vi.mock('#components/ui/combobox-responsive.js', () => ({
  ComboBoxResponsive: ({
    children,
    onSelect,
  }: {
    children: React.ReactNode;
    onSelect: (value: string) => void;
  }): React.ReactNode => (
    <div data-testid='cu-picker'>
      {children}
      <button
        type='button'
        data-testid='pick-helper'
        onClick={() => {
          onSelect('helper.ts');
        }}
      >
        helper.ts
      </button>
    </div>
  ),
}));

vi.mock('#components/ui/popover.js', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div data-testid='popover'>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('#components/ui/tooltip.js', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
  TooltipContent: () => null,
  TooltipTrigger: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
  TooltipProvider: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
}));

const { ExportSelector } = await import('./export-selector.js');
const { groupExportFormatsByFidelity } = await import('./export-format-groups.js');

function createCapabilities(overrides?: Partial<CapabilitiesManifest>): CapabilitiesManifest {
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
    ...overrides,
    registrations: overrides?.registrations ?? [],
  };
}

describe('ExportSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCapabilities = createCapabilities();
    mockActiveKernelId = 'replicad';
  });

  it('should group BREP formats before mesh formats for combobox menus', () => {
    const groups = groupExportFormatsByFidelity([
      { format: 'glb', fidelity: 'mesh', direct: true },
      { format: 'step', fidelity: 'brep', direct: true },
    ]);

    expect(groups.map((group) => group.name)).toEqual(['BREP', 'Mesh']);
    expect(groups[0]?.items.map((entry) => entry.format)).toEqual(['step']);
    expect(groups[1]?.items.map((entry) => entry.format)).toEqual(['glb']);
  });

  it('should render the format grid for a single cad actor', () => {
    render(<ExportSelector cadActor={mockCadRef} filenameBase='test-project' variant='inline' />);

    expect(screen.getByRole('button', { name: /glb/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /stl/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /step/i })).toBeDefined();
  });

  it('should hide the geometry unit picker in single-geometry-unit mode', () => {
    render(<ExportSelector cadActor={mockCadRef} filenameBase='test-project' variant='inline' />);

    expect(screen.queryByTestId('cu-picker')).toBeNull();
  });

  it('should show the geometry unit picker in multi-geometry-unit mode with more than one entry', () => {
    const geometryUnits = new Map<string, ActorRefFrom<typeof cadMachine>>();
    geometryUnits.set('main.ts', mockCadRef);
    geometryUnits.set('helper.ts', mockCadRef2);

    render(
      <ExportSelector
        geometryUnits={geometryUnits}
        filenameBase='test-project'
        mainEntryPath='main.ts'
        variant='inline'
      />,
    );

    expect(screen.getByTestId('cu-picker')).toBeDefined();
  });

  it('should trigger export and download on format click using route defaults', async () => {
    render(<ExportSelector cadActor={mockCadRef} filenameBase='test-project' variant='inline' />);

    fireEvent.click(screen.getByRole('button', { name: /stl/i }));

    await vi.waitFor(() => {
      expect(mockExport).toHaveBeenCalledWith('stl', { exportOptions: { binary: true } });
    });

    await vi.waitFor(() => {
      expect(mockDownloadBlob).toHaveBeenCalledTimes(1);
    });
    const firstCall = mockDownloadBlob.mock.calls[0] as [Blob, string];
    expect(firstCall[1]).toBe('test-project.stl');
    expect(mockToastSuccess).toHaveBeenCalledWith('Exported STL');
  });

  it('should show an error toast when the export fails', async () => {
    mockExport.mockResolvedValueOnce({
      success: false,
      issues: [{ message: 'kernel exploded' }],
    });

    render(<ExportSelector cadActor={mockCadRef} filenameBase='test-project' variant='inline' />);

    fireEvent.click(screen.getByRole('button', { name: /glb/i }));

    await vi.waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('kernel exploded');
    });
    expect(mockDownloadBlob).not.toHaveBeenCalled();
  });

  it('should call onExport callback after a successful export', async () => {
    const onExport = vi.fn();
    render(
      <ExportSelector
        cadActor={mockCadRef}
        filenameBase='test-project'
        variant='inline'
        defaultEntryPath='main.ts'
        onExport={onExport}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /glb/i }));

    await vi.waitFor(() => {
      expect(onExport).toHaveBeenCalledWith('main.ts', 'glb');
    });
  });

  it('should show a placeholder message when no export formats are available', () => {
    mockCapabilities = createCapabilities({ routes: [] });
    render(<ExportSelector cadActor={mockCadRef} filenameBase='test-project' variant='inline' />);

    expect(screen.getByText(/No export formats available/)).toBeDefined();
  });

  it('should switch the active geometry unit when the picker selects a different file', async () => {
    const geometryUnits = new Map<string, ActorRefFrom<typeof cadMachine>>();
    geometryUnits.set('main.ts', mockCadRef);
    geometryUnits.set('helper.ts', mockCadRef2);

    const onExport = vi.fn();
    render(
      <ExportSelector
        geometryUnits={geometryUnits}
        filenameBase='test-project'
        mainEntryPath='main.ts'
        variant='inline'
        onExport={onExport}
      />,
    );

    fireEvent.click(screen.getByTestId('pick-helper'));
    fireEvent.click(screen.getByRole('button', { name: /glb/i }));

    await vi.waitFor(() => {
      expect(onExport).toHaveBeenCalledWith('helper.ts', 'glb');
    });
  });

  it('should render without throwing when no project context is available', () => {
    // Simulates the preview route, which lacks `useProject()` entirely. The refactored
    // component is prop-driven and must not depend on any project-context hook.
    expect(() => {
      render(<ExportSelector cadActor={mockCadRef} filenameBase='preview-name' variant='inline' />);
    }).not.toThrow();
    expect(screen.getByRole('button', { name: /glb/i })).toBeDefined();
  });
});
