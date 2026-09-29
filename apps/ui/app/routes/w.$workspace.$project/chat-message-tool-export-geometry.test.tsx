// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolInvocation } from '@taucad/chat';
import type { toolName } from '@taucad/chat/constants';
import { awaitFreshRender } from '#machines/await-fresh-render.js';

const mocks = vi.hoisted(() => {
  const exportToDisk = vi.fn();
  const send = vi.fn();
  const toastError = vi.fn();
  const cadActor = {
    getSnapshot: () => ({
      context: { kernelClient: { export: vi.fn() }, activeKernelId: 'replicad' },
    }),
  };
  const geometryUnits = new Map([['other.ts', cadActor]]);
  const projectRef = {
    send,
    getSnapshot: () => ({ context: { geometryUnits } }),
  };
  return { exportToDisk, send, toastError, cadActor, projectRef };
});

vi.mock('@xstate/react', () => ({
  useSelector: (actor: { getSnapshot: () => unknown } | undefined, selector: (state: unknown) => unknown) =>
    selector(actor?.getSnapshot()),
}));
vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({
    geometryUnits: mocks.projectRef.getSnapshot().context.geometryUnits,
    projectRef: mocks.projectRef,
  }),
}));
vi.mock('#hooks/use-file-manager.js', () => ({ useFileManager: () => ({ readFile: vi.fn() }) }));
vi.mock('#routes/w.$workspace.$project/project-workspace-context.js', () => ({
  useProjectWorkspace: () => ({ openPanel: vi.fn() }),
}));
vi.mock('#components/files/use-export-to-disk.js', () => ({
  useExportToDisk: () => ({ exportToDisk: mocks.exportToDisk, isExporting: false }),
}));
vi.mock('#components/files/export-selector.js', () => ({
  ExportFormatComboboxLabel: () => null,
  getExportFormatValue: (item: { format: string }) => item.format,
}));
vi.mock('#components/ui/combobox-responsive.js', () => ({
  ComboBoxResponsive: ({ onSelect, children }: { onSelect: (value: string) => void; children: React.ReactNode }) => (
    <>
      {children}
      <button
        type='button'
        onClick={() => {
          onSelect('stl');
        }}
      >
        Choose STL
      </button>
    </>
  ),
}));
vi.mock('#components/files/viewer-link.js', () => ({
  ViewerLink: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock('@taucad/ui/components/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  TooltipContent: () => null,
}));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }));
vi.mock('#machines/await-fresh-render.js', () => ({ awaitFreshRender: vi.fn() }));
vi.mock('#utils/export-formats.utils.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  deriveAvailableFormats: () => [
    { format: 'glb', fidelity: 'mesh', direct: true },
    { format: 'stl', fidelity: 'mesh', direct: true },
  ],
}));

const { ChatMessageToolExportGeometry } =
  await import('#routes/w.$workspace.$project/chat-message-tool-export-geometry.js');

const part: ToolInvocation<typeof toolName.exportGeometry> = {
  toolCallId: 'export-1',
  state: 'output-available',
  input: { targetFile: 'other.ts', format: 'glb' },
  output: {
    format: 'glb',
    files: [
      { name: 'other.glb', artifactPath: '.tau/artifacts/other.glb', mimeType: 'model/gltf-binary', byteLength: 4 },
    ],
  },
};

describe('chat export geometry download', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refuses retained runtime export after the claimed entry settles with a failed render', async () => {
    // SAFETY: this snapshot retains the old runtime client while the latest render failed.
    vi.mocked(awaitFreshRender).mockResolvedValue({
      context: {
        entryPath: 'other.ts',
        latestGeometryOutcome: 'failure',
        kernelClient: mocks.cadActor.getSnapshot().context.kernelClient,
        kernelIssues: new Map([
          ['other.ts', [{ message: 'radius must be positive', code: 'RUNTIME', type: 'runtime', severity: 'error' }]],
        ]),
      },
      hasTag: () => false,
    } as unknown as Awaited<ReturnType<typeof awaitFreshRender>>);

    const user = userEvent.setup();
    render(<ChatMessageToolExportGeometry part={part} />);
    await user.click(screen.getByRole('button', { name: 'Choose STL' }));
    await user.click(screen.getByRole('button', { name: 'Download STL' }));

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith('radius must be positive');
    });
    expect(mocks.exportToDisk).not.toHaveBeenCalled();
    const claim = mocks.send.mock.calls.find(([event]) => event.type === 'claimGeometryUnit')?.[0] as
      | { claimId: string; entryPath: string }
      | undefined;
    expect(claim?.entryPath).toBe('other.ts');
    expect(mocks.send).toHaveBeenCalledWith({ type: 'releaseGeometryUnit', claimId: claim?.claimId });
  });
});
