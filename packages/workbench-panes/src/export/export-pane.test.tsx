import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import type { FileExtension } from '@taucad/types';
import { WorkbenchPanesHostProvider } from '#host/workbench-host.jsx';
import type { WorkbenchPanesHost } from '#host/workbench-host.jsx';
import { ExportPane } from '#export/export-pane.jsx';
import type {
  ExportEntryState,
  ExportFormatEntry,
  ExportOutcome,
  ExportPreferences,
  ExportPreferencesState,
  ExportRequest,
  ExportSource,
} from '#export/export-source.js';
import { defaultExportPreferences } from '#export/export-source.js';

vi.mock('@taucad/ui/hooks/use-mobile', () => ({
  useIsMobile: (): boolean => false,
}));

const formats: ExportFormatEntry[] = [
  { format: 'glb', fidelity: 'mesh', direct: true, provider: 'replicad' },
  {
    format: 'stl',
    fidelity: 'mesh',
    direct: true,
    provider: 'replicad',
    exportOptions: {
      schema: {
        type: 'object',
        properties: { binary: { type: 'boolean', default: true } },
      },
      defaults: { binary: true },
    },
  },
  { format: 'step', fidelity: 'brep', direct: true, provider: 'replicad' },
];

type SourceOverrides = Partial<Omit<ExportSource, 'useEntry'>> & {
  readonly entry?: ExportEntryState;
};

const createSource = (overrides: SourceOverrides = {}) => {
  const exported = vi.fn<(request: ExportRequest) => Promise<ExportOutcome>>(async (request) => ({
    succeeded: request.formats,
    failed: [],
  }));
  const entry: ExportEntryState = overrides.entry ?? {
    hasGeometry: true,
    formats,
  };
  const source: ExportSource = {
    destinations: ['project'],
    export: exported,
    ...overrides,
    useEntry: () => entry,
  };
  return { source, exported };
};

const renderPane = (
  source: ExportSource,
  options: {
    readonly units?: readonly string[];
    readonly claimUnits?: WorkbenchPanesHost['claimUnits'];
  } = {},
) => {
  const units = (options.units ?? ['model.ts']).map((entryPath) => ({
    entryPath,
    graphicsRef: undefined,
  }));
  const host: WorkbenchPanesHost = {
    useUnits: () => units,
    ...(options.claimUnits === undefined ? {} : { claimUnits: options.claimUnits }),
    export: source,
  };
  return render(
    <TooltipProvider>
      <WorkbenchPanesHostProvider value={host}>
        <ExportPane />
      </WorkbenchPanesHostProvider>
    </TooltipProvider>,
  );
};

describe('ExportPane', () => {
  it('should draw an empty slot when the host offers no export source', () => {
    const { container } = render(
      <WorkbenchPanesHostProvider value={{ useUnits: () => [] }}>
        <ExportPane />
      </WorkbenchPanesHostProvider>,
    );
    expect(container.querySelector('[data-slot="export-pane"]')).toBeEmptyDOMElement();
  });

  it('should name the single entry and group formats by fidelity, BREP first', () => {
    const { source } = createSource();
    renderPane(source);

    expect(screen.getByRole('region', { name: 'Source' })).toMatchTextContent('model.ts');
    expect(screen.getByRole('region', { name: 'Source' })).toMatchTextContent('Main');
    const groups = within(screen.getByRole('region', { name: 'Formats' })).getAllByText(/^(BREP|Mesh)$/u);
    expect(groups.map((group) => group.textContent)).toEqual(['BREP', 'Mesh']);
  });

  it('should fix the only destination a host offers and export to it', async () => {
    const { source, exported } = createSource({ destinations: ['project'] });
    renderPane(source);

    expect(screen.queryByRole('checkbox', { name: 'Download to disk' })).toBeNull();
    const save = screen.getByRole('checkbox', { name: 'Save to project' });
    expect(save).toBeChecked();
    expect(save).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /step/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Export STEP' }));

    await waitFor(() => {
      expect(exported).toHaveBeenCalledWith({
        entryPath: 'model.ts',
        formats: ['step'],
        formatOptions: {},
        formatContent: {},
        download: false,
        saveToProject: true,
        zipMultiple: false,
      });
    });
    expect(await screen.findByRole('status')).toMatchTextContent('Exported STEP');
  });

  it('should offer zip only to a host that can zip several downloads', () => {
    const preferences: ExportPreferences = {
      ...defaultExportPreferences,
      selectedFormats: ['glb', 'step'],
    };
    const usePreferences = (): ExportPreferencesState => [preferences, vi.fn(), { retry: vi.fn() }];
    const zipless = createSource({
      destinations: ['download', 'project'],
      usePreferences,
    });
    const view = renderPane(zipless.source);
    expect(screen.queryByRole('checkbox', { name: 'Zip multiple exports' })).toBeNull();
    view.unmount();

    const zipping = createSource({
      destinations: ['download', 'project'],
      usePreferences,
      canZip: true,
    });
    renderPane(zipping.source);
    expect(screen.getByRole('checkbox', { name: 'Zip multiple exports' })).toBeDefined();
  });

  it('should hand outcomes to host notices instead of the status line', async () => {
    const notices = { success: vi.fn(), error: vi.fn() };
    const { source, exported } = createSource({
      destinations: ['download'],
      notices,
    });
    exported.mockResolvedValueOnce({ succeeded: ['glb'], failed: ['step'] });
    renderPane(source);

    fireEvent.click(screen.getByRole('button', { name: /glb/i }));
    fireEvent.click(screen.getByRole('button', { name: /step/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Export 2 formats' }));

    await waitFor(() => {
      expect(notices.success).toHaveBeenCalledWith('Exported GLB');
      expect(notices.error).toHaveBeenCalledWith('Failed to export STEP');
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('should report a rejected export as an error', async () => {
    const { source, exported } = createSource();
    exported.mockRejectedValueOnce(new Error('radius must be positive'));
    renderPane(source);

    fireEvent.click(screen.getByRole('button', { name: /glb/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Export GLB' }));

    expect(await screen.findByRole('alert')).toMatchTextContent('radius must be positive');
  });

  it('should show why there is nothing to export yet', () => {
    const loading = createSource({
      entry: { hasGeometry: true, formats: undefined },
    });
    const view = renderPane(loading.source);
    expect(screen.getByRole('status', { name: 'Export formats are still loading' })).toBeDefined();
    view.unmount();

    const empty = createSource({
      entry: { hasGeometry: false, formats: undefined },
    });
    renderPane(empty.source);
    expect(screen.getByText('No geometry to export for this file')).toBeDefined();
  });

  it('should say why the formats could not be loaded, with a retry only when asking again can help', () => {
    const retry = vi.fn();
    const failed = createSource({
      entry: {
        hasGeometry: true,
        formats: undefined,
        unavailable: { code: 'NO_KERNEL', message: 'No kernel exports model.ts.', retry },
      },
    });
    const view = renderPane(failed.source);
    const alert = screen.getByRole('alert', { name: 'Export formats could not be loaded' });
    expect(alert).toMatchTextContent('No kernel exports model.ts.');
    expect(screen.queryByRole('status', { name: 'Export formats are still loading' })).toBeNull();
    expect(screen.queryByText('No geometry to export for this file')).toBeNull();
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledOnce();
    view.unmount();

    const message =
      'This Tau server has no export formats; plugin 1.2.3 needs the same version: npm install -g @taucad/cli@1.2.3, then restart the Tau server or your agent';
    const mismatched = createSource({
      entry: {
        hasGeometry: true,
        formats: undefined,
        unavailable: { code: 'UNKNOWN_TOOL', message, retry: undefined },
      },
    });
    renderPane(mismatched.source);
    const mismatch = screen.getByRole('alert', { name: 'Export formats could not be loaded' });
    expect(mismatch).toMatchTextContent(message);
    expect(within(mismatch).queryByRole('button')).toBeNull();
  });

  it('should claim the selected entry while it is shown', () => {
    const release = vi.fn();
    const claimUnits = vi.fn(() => release);
    const { source } = createSource();
    const view = renderPane(source, { claimUnits });

    expect(claimUnits).toHaveBeenCalledWith(['model.ts']);
    view.unmount();
    expect(release).toHaveBeenCalledOnce();
  });

  it('should keep option values without a store and pass them to the export', async () => {
    const { source, exported } = createSource();
    renderPane(source);

    fireEvent.click(screen.getByRole('button', { name: /stl/i }));
    expect(await screen.findByRole('heading', { name: 'STL options' })).toBeDefined();
    const binary = await screen.findByRole('switch', { name: /binary/i });
    await act(async () => {
      fireEvent.click(binary);
    });
    await waitFor(() => {
      expect(screen.getByText('Modified')).toBeDefined();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Export STL' }));

    await waitFor(() => {
      expect(exported).toHaveBeenCalledWith(expect.objectContaining({ formatOptions: { stl: { binary: false } } }));
    });
  });

  it('should drop kept options for formats the kernel no longer offers', async () => {
    const persist = vi.fn();
    const preferences: ExportPreferences = {
      ...defaultExportPreferences,
      formatOptions: {
        stl: { binary: false, unknown: 1 },
        ['3mf' as FileExtension]: { color: true },
      },
    };
    const { source } = createSource({
      usePreferences: (): ExportPreferencesState => [preferences, persist, { retry: vi.fn() }],
    });
    renderPane(source);

    await waitFor(() => {
      expect(persist).toHaveBeenCalledWith(expect.objectContaining({ formatOptions: { stl: { binary: false } } }));
    });
  });
});
