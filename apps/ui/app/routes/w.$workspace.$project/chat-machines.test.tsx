// @vitest-environment jsdom
import axe from 'axe-core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { JsonValue } from '@taucad/agent-host';
import { createMachineToolRegistry } from '@taucad/agent-tools/registry';
import type {
  MachineClient,
  MachineDirectoryEntry,
  MachineDirectorySnapshot,
  MachineOperationReceipt,
} from '@taucad/runtime/machine';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import {
  MachinesPanel,
  presentMachine,
  projectMachineDirectoryFrame,
} from '#routes/w.$workspace.$project/chat-machines.js';

vi.mock('#components/geometry/parameters/parameters.js', () => ({
  Parameters: () => <div data-testid='provider-parameters' />,
}));
vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ geometryUnits: new Map(), mainEntryPath: 'main.ts' }),
}));

const timestamp = '2026-09-14T00:00:00.000Z';
const entry = (overrides: Partial<MachineDirectoryEntry> = {}): MachineDirectoryEntry => ({
  machineId: 'machine-1',
  providerId: 'bambu',
  descriptor: {
    id: 'physical-1',
    name: 'Workshop X1C',
    vendor: 'Bambu Lab',
    model: 'X1C',
    technology: 'additive.fff',
    firmware: '01.08.02.00',
    accepts: [],
    operations: ['start', 'pause', 'resume', 'cancel', 'urgent-stop', 'still'],
    ratedEnvelope: { width: 0.256, depth: 0.256, height: 0.256, unit: 'm' },
    printableEnvelope: { width: 0.256, depth: 0.256, height: 0.256, unit: 'm' },
    tools: [],
    materialSystem: { kind: 'ams', slotCount: 4 },
    bedTypes: ['textured-pei'],
  },
  snapshot: {
    connection: 'connected',
    readiness: 'busy',
    activeRunId: 'provider-run-1',
    observedAt: timestamp,
    setup: {
      toolId: '0.4mm',
      bedType: 'textured-pei',
      materials: [{ slot: 0, state: 'loaded', materialId: 'pla-black' }],
    },
    run: { state: 'printing', progress: 42, remainingSeconds: 600 },
  },
  freshness: 'current',
  ...overrides,
});

const directory = (entries: readonly MachineDirectoryEntry[] = [entry()]): MachineDirectorySnapshot => ({
  cursor: {
    hostId: 'host-1',
    authorityId: 'authority-1',
    workspaceId: 'workspace-1',
    generation: 'generation-1',
    position: 1,
    revision: 1,
  },
  entries,
});

const accepted = (input: Parameters<MachineClient['controlRun']>[0]): MachineOperationReceipt => ({
  operationId: input.operationId,
  machineId: input.machineId,
  kind: input.command,
  status: 'accepted',
  providerRunId: input.expectedProviderRunId,
  observedAt: timestamp,
});

const clientFixture = () => {
  const controlRun = vi.fn<MachineClient['controlRun']>(async (input) => accepted(input));
  const captureStill = vi.fn<MachineClient['captureStill']>(async () => ({
    bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
    mediaType: 'image/jpeg',
    capturedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 15_000).toISOString(),
  }));
  const client: MachineClient = {
    listProviders: async () => [],
    async *discover() {
      yield* [];
    },
    beginBinding: async () => ({
      status: 'operator-action-required',
      ceremonyId: 'ceremony-1',
    }),
    preparePrint: async () => {
      throw new Error('not used');
    },
    startPrint: async () => {
      throw new Error('not used');
    },
    reconcileOperation: async () => {
      throw new Error('not used');
    },
    controlRun,
    captureStill,
    list: async () => directory(),
    get: async () => entry(),
    async *watch({ signal }) {
      await new Promise<void>((resolve) => {
        signal?.addEventListener(
          'abort',
          () => {
            resolve();
          },
          { once: true },
        );
      });
      yield* [];
    },
  };
  return { captureStill, client, controlRun };
};

const invoke = async (registry: ReturnType<typeof createMachineToolRegistry>, name: string, input: JsonValue) =>
  registry.invoke({
    toolCallId: 'call-1',
    toolName: name,
    input,
    signal: new AbortController().signal,
  });

describe('Machines workbench projection', () => {
  it('projects directory resync, stale, removal, and upsert frames without parallel state', () => {
    const current = directory();
    const stale = projectMachineDirectoryFrame(current, {
      type: 'event',
      cursor: { ...current.cursor, position: 2, revision: 2 },
      event: {
        type: 'machine-directory-stale',
        hostId: 'host-1',
        authorityId: 'authority-1',
        workspaceId: 'workspace-1',
        revision: 2,
      },
    });
    expect(stale.entries[0]?.freshness).toBe('stale');
    expect(presentMachine(stale.entries[0]!).nextAction).toContain('before any physical action');

    const removed = projectMachineDirectoryFrame(stale, {
      type: 'event',
      cursor: { ...current.cursor, position: 3, revision: 3 },
      event: {
        type: 'machine-directory-removed',
        hostId: 'host-1',
        authorityId: 'authority-1',
        workspaceId: 'workspace-1',
        revision: 3,
        machineId: 'machine-1',
      },
    });
    expect(removed.entries).toEqual([]);
  });

  it('renders explicit grant refusals instead of a broken control surface', () => {
    const rendered = render(<MachinesPanel machines={{ available: false, reason: 'not-granted' }} />);
    expect(screen.getByText('Machines access not granted')).toBeInTheDocument();
    rendered.rerender(<MachinesPanel machines={{ available: false, reason: 'unsupported' }} />);
    expect(screen.getByText('Machines unavailable')).toBeInTheDocument();
  });

  it('uses one client for keyboard UI control and agent receipts, with no selected axe violations', async () => {
    const { client, controlRun } = clientFixture();
    const user = userEvent.setup();
    const { container } = render(
      <TooltipProvider>
        <MachinesPanel machines={{ available: true, ...client }} />
      </TooltipProvider>,
    );

    const pause = await screen.findByRole('button', { name: 'Pause' });
    expect(screen.getByRole('article', { name: 'Workshop X1C, Printing' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Workshop X1C print progress' })).toHaveAttribute(
      'aria-valuenow',
      '42',
    );
    expect(screen.getByText(/Monitor the exact active run/u)).toBeInTheDocument();
    expect(container.querySelector('[data-slot="machines-panel-body"]')).toHaveClass('min-w-0');
    expect(screen.getByRole('list', { name: 'Machines' }).className).toContain('minmax(min(100%,18rem),1fr)');

    pause.focus();
    await user.keyboard('{Enter}');
    expect(document.activeElement).toBe(pause);
    await waitFor(() => {
      expect(controlRun).toHaveBeenCalledOnce();
    });
    expect(controlRun).toHaveBeenLastCalledWith(
      expect.objectContaining({
        machineId: 'machine-1',
        command: 'pause',
        expectedProviderRunId: 'provider-run-1',
      }),
    );
    expect(screen.getByText('pause accepted')).toBeInTheDocument();

    const registry = createMachineToolRegistry(client);
    const toolResult = await invoke(registry, 'control_machine_run', {
      machineId: 'machine-1',
      operationId: 'operation-agent-1',
      command: 'pause',
      expectedProviderRunId: 'provider-run-1',
    });
    expect(toolResult).toMatchObject({
      isError: false,
      content: { kind: 'pause', status: 'accepted' },
    });
    expect(controlRun).toHaveBeenCalledTimes(2);

    const accessibility = await axe.run(container, {
      rules: { region: { enabled: false } },
    });
    expect(accessibility.violations).toEqual([]);
  });

  it('requires explicit confirmation for destructive exact-run controls', async () => {
    const { client, controlRun } = clientFixture();
    const user = userEvent.setup();
    render(<MachinesPanel machines={{ available: true, ...client }} />);

    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Confirm cancel' })).toBeInTheDocument();
    expect(controlRun).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Keep printing' }));
    expect(screen.queryByRole('button', { name: 'Confirm cancel' })).not.toBeInTheDocument();
  });

  it('disposes short-lived stills and isolates camera failure from run controls', async () => {
    const createObjectURL = vi.fn(() => 'blob:machine-still');
    const revokeObjectURL = vi.fn();
    Object.defineProperties(URL, {
      createObjectURL: { configurable: true, value: createObjectURL },
      revokeObjectURL: { configurable: true, value: revokeObjectURL },
    });
    const { captureStill, client, controlRun } = clientFixture();
    const user = userEvent.setup();
    const rendered = render(<MachinesPanel machines={{ available: true, ...client }} />);

    await user.click(await screen.findByRole('button', { name: 'Capture still' }));
    expect(
      await screen.findByRole('img', {
        name: 'Latest still from Workshop X1C',
      }),
    ).toHaveAttribute('src', 'blob:machine-still');
    expect(createObjectURL).toHaveBeenCalledOnce();

    captureStill.mockRejectedValueOnce(new Error('BAMBU_CAMERA_UNAVAILABLE'));
    await user.click(screen.getByRole('button', { name: 'Capture still' }));
    expect(await screen.findByText('BAMBU_CAMERA_UNAVAILABLE')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    await waitFor(() => {
      expect(controlRun).toHaveBeenCalledOnce();
    });

    rendered.unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:machine-still');
  });
});
