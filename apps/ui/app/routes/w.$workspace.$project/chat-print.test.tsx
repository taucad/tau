// @vitest-environment jsdom
import axe from 'axe-core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MachineClient } from '@taucad/runtime/machine';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import type { PrintApprovalBridge } from '#hooks/use-machines-approvals.js';
import type * as PrintSummary from '#routes/w.$workspace.$project/chat-print-summary.js';
import {
  accepted,
  agentRequest,
  artifact,
  createBridge,
  createFixture,
  entry,
  gcodeRoute,
  later,
  mockEditorSend,
  mockExport,
  mockSaveRevision,
  mockWriteFiles,
  printing,
  sliceFixture,
  timestamp,
} from '#routes/w.$workspace.$project/chat-print.fixture.js';
import { PrintPanel, nextAction, presentMachine } from '#routes/w.$workspace.$project/chat-print.js';

vi.mock('#hooks/use-project.js', async () => {
  const fixtures = await import('#routes/w.$workspace.$project/chat-print.fixture.js');
  return fixtures.projectMock;
});
vi.mock('#hooks/use-file-manager.js', async () => {
  const fixtures = await import('#routes/w.$workspace.$project/chat-print.fixture.js');
  return fixtures.fileManagerMock;
});
vi.mock('#hooks/use-revision-status.js', async () => {
  const fixtures = await import('#routes/w.$workspace.$project/chat-print.fixture.js');
  return fixtures.revisionMock;
});
vi.mock('#routes/w.$workspace.$project/chat-converter.js', async () => {
  const fixtures = await import('#routes/w.$workspace.$project/chat-print.fixture.js');
  return fixtures.converterMock;
});
vi.mock('#components/geometry/parameters/parameters.js', async () => {
  const fixtures = await import('#routes/w.$workspace.$project/chat-print.fixture.js');
  return { Parameters: fixtures.ParametersFake };
});
vi.mock('#routes/w.$workspace.$project/chat-print-summary.js', async (importOriginal) => {
  const [actual, fixtures] = await Promise.all([
    importOriginal<typeof PrintSummary>(),
    import('#routes/w.$workspace.$project/chat-print.fixture.js'),
  ]);
  return { ...actual, summarizeGcodeContainer: fixtures.summarizeGcodeContainerMock };
});

const renderPane = (client: MachineClient, bridge: PrintApprovalBridge = createBridge().bridge) =>
  render(
    <TooltipProvider>
      <PrintPanel machines={{ available: true, ...client }} bridge={bridge} />
    </TooltipProvider>,
  );

/** The Prepare section, whose slice and send buttons share their names with the orientation card's primary action. */
const prepareRegion = (): HTMLElement => screen.getByRole('region', { name: 'Prepare' });

/** Tick every physical check; the Radix checkbox toggles on click. */
const confirmAll = (card: HTMLElement): void => {
  for (const checkbox of within(card).getAllByRole('checkbox')) {
    fireEvent.click(checkbox);
  }
};

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.localStorage.clear();
});

describe('Print pane orientation', () => {
  it('names the machine state and the one safe next step from the observation alone', () => {
    expect(presentMachine(entry())).toMatchObject({ label: 'Ready' });
    expect(presentMachine(printing())).toMatchObject({ label: 'Printing' });
    expect(presentMachine(entry({ freshness: 'stale' })).nextAction).toContain('before any physical action');
    expect(presentMachine(entry({ snapshot: { ...entry().snapshot, connection: 'unreachable' } })).label).toBe(
      'Unreachable',
    );
  });

  it('offers slice, then send, then review, and never a physical step', () => {
    const prepare: Parameters<typeof nextAction>[0]['prepare'] = {
      slice: undefined,
      isSliceStale: false,
      isSlicing: false,
      route: gcodeRoute,
      sendBlocker: 'x',
    };
    expect(nextAction({ entry: entry(), openRequest: undefined, prepare })).toEqual({
      label: 'Slice and preview',
      kind: 'slice',
    });
    expect(
      nextAction({
        entry: entry(),
        openRequest: undefined,
        prepare: { ...prepare, slice: sliceFixture, sendBlocker: undefined },
      }),
    ).toEqual({ label: 'Send to Workshop X1C', kind: 'send' });
    expect(nextAction({ entry: entry(), openRequest: agentRequest(), prepare })).toEqual({
      label: 'Review the print request',
      kind: 'review',
    });
    expect(nextAction({ entry: entry(), openRequest: agentRequest({ state: 'unknown' }), prepare })).toEqual({
      label: 'Reconcile the start',
      kind: 'review',
    });
    expect(nextAction({ entry: entry({ freshness: 'stale' }), openRequest: undefined, prepare }).kind).toBe('none');
    expect(nextAction({ entry: printing(), openRequest: undefined, prepare }).kind).toBe('none');
  });

  it('renders explicit grant refusals instead of a broken control surface', () => {
    const { bridge } = createBridge();
    const rendered = render(<PrintPanel machines={{ available: false, reason: 'not-granted' }} bridge={bridge} />);
    expect(screen.getByText('Printer access not granted')).toBeInTheDocument();
    rendered.rerender(<PrintPanel machines={{ available: false, reason: 'unsupported' }} bridge={bridge} />);
    expect(screen.getByText('Printing unavailable')).toBeInTheDocument();
  });

  it('marks the simulator as simulated', async () => {
    const fixture = createFixture({ entries: [entry({ providerId: 'bambu-simulator' })] });
    renderPane(fixture.client);
    const card = await screen.findByRole('article', { name: 'Workshop X1C, Ready' });
    expect(within(card).getByText('Simulated')).toBeInTheDocument();
  });
});

describe('Print pane prepare and send', () => {
  it('slices with the chosen preset, previews, confirms once, and starts only through the approved request', async () => {
    const fixture = createFixture();
    const user = userEvent.setup();
    const { container } = renderPane(fixture.client);

    expect(await screen.findByRole('article', { name: 'Workshop X1C, Ready' })).toBeInTheDocument();
    expect(container.querySelector('[data-slot="print-panel-body"]')).toHaveClass('min-w-0', 'flex-col');

    const presets = screen.getByRole('group', { name: 'Quality preset' });
    expect(
      within(presets)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Fast0.28 mm', 'Standard0.2 mm', 'Fine0.12 mm']);
    await user.click(within(presets).getByRole('button', { name: /Fine/u }));
    expect(within(presets).getByRole('button', { name: /Fine/u })).toHaveAttribute('aria-pressed', 'true');

    const material = screen.getByRole('group', { name: 'Material' });
    expect(within(material).getByRole('button', { name: /A1/u })).toHaveAttribute('aria-pressed', 'true');
    expect(within(material).getByRole('button', { name: /A2/u })).toBeDisabled();

    const slice = within(prepareRegion()).getByRole('button', { name: 'Slice and preview' });
    slice.focus();
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(mockExport).toHaveBeenCalledExactlyOnceWith('gcode.3mf', { exportOptions: { preset: 'fine' } });
    });
    expect(mockWriteFiles).toHaveBeenCalledExactlyOnceWith({
      'exports/main.gcode.3mf': { content: new Uint8Array([0x50, 0x4b, 0x03, 0x04]) },
    });

    const result = await screen.findByLabelText('Slice result');
    expect(within(result).getByText('125')).toBeInTheDocument();
    expect(within(result).getByText('about 42 min')).toBeInTheDocument();
    expect(within(result).getByText('3.2 m')).toBeInTheDocument();
    expect(within(result).getByText('50 × 50 × 20 mm')).toBeInTheDocument();
    expect(within(result).getByText('Fits the plate')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open printer preview' }));
    expect(mockEditorSend).toHaveBeenCalledExactlyOnceWith({
      type: 'openFile',
      path: 'exports/main.gcode.3mf',
      source: 'user',
    });

    expect(within(prepareRegion()).getByRole('button', { name: 'Send to Workshop X1C' })).toBeEnabled();
    await user.click(within(prepareRegion()).getByRole('button', { name: 'Send to Workshop X1C' }));
    const confirmation = screen.getByRole('group', { name: 'Confirm before starting' });
    expect(fixture.requestPrint).not.toHaveBeenCalled();
    expect(within(confirmation).getByText(/^sha256:[0-9a-f]{64}$/u)).toBeInTheDocument();
    expect(within(confirmation).getAllByRole('checkbox')).toHaveLength(3);
    expect(
      within(confirmation).getByText('The build plate is clear and the Textured PEI plate is installed'),
    ).toBeInTheDocument();
    expect(within(confirmation).getByText('pla-black is loaded in A1')).toBeInTheDocument();
    expect(within(confirmation).getByText('A 0.4 mm nozzle is installed')).toBeInTheDocument();
    const start = within(confirmation).getByRole('button', { name: 'Start print on Workshop X1C' });
    expect(start).toBeDisabled();

    confirmAll(confirmation);
    expect(start).toBeEnabled();
    await user.click(start);
    await waitFor(() => {
      expect(fixture.resolvePrintRequest).toHaveBeenCalledOnce();
    });
    expect(mockSaveRevision).toHaveBeenCalledExactlyOnceWith('save');
    expect(fixture.requestPrint).toHaveBeenCalledOnce();
    const requestInput = fixture.requestPrint.mock.calls.at(0)?.[0];
    expect(requestInput?.machineId).toBe('machine-1');
    expect(requestInput?.requestedBy.kind).toBe('user');
    expect(requestInput?.summary).toEqual({
      fileName: 'main.gcode.3mf',
      layers: 125,
      estimatedDuration: 2520,
      filamentLength: 3200,
    });
    expect(requestInput?.configuration).toMatchObject({
      expectedBedType: 'textured-pei',
      expectedMaterials: [{ slot: 0, materialId: 'pla-black' }],
      amsMapping: [0],
      expectedModel: 'X1C',
    });
    expect(requestInput?.artifact).toMatchObject({
      path: 'exports/main.gcode.3mf',
      mediaType: accepted.mediaType,
      contract: accepted.contract,
      selectedMember: 'Metadata/plate_1.gcode',
      revision: { authorityId: 'authority-1', workspaceId: 'workspace-1', revisionId: 'revision-1' },
    });
    expect(requestInput?.artifact.digest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    const resolveInput = fixture.resolvePrintRequest.mock.calls.at(0)?.[0];
    expect(resolveInput?.requestId).toBe(requestInput?.requestId);
    expect(resolveInput?.decision).toBe('approve');
    expect(resolveInput?.resolvedBy.kind).toBe('user');
    expect(typeof resolveInput?.uploadOperationId).toBe('string');
    expect(typeof resolveInput?.startOperationId).toBe('string');
    expect(fixture.uploadPrint).not.toHaveBeenCalled();
    expect(fixture.startPrint).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByRole('group', { name: 'Confirm before starting' })).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('region', { name: 'Approval required' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Activity/u }));
    expect(within(screen.getByRole('list', { name: 'Print requests' })).getByText('Started')).toBeInTheDocument();

    const accessibility = await axe.run(container, { rules: { region: { enabled: false } } });
    expect(accessibility.violations).toEqual([]);
  });

  it('reaches every prepare control by keyboard in reading order', async () => {
    const fixture = createFixture();
    const user = userEvent.setup();
    renderPane(fixture.client);
    await screen.findByRole('article', { name: 'Workshop X1C, Ready' });

    const names: string[] = [];
    for (let index = 0; index < 20 && names.filter((name) => name === 'Slice and preview').length < 2; index += 1) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Tab order is sequential by definition.
      await user.tab();
      const active = document.activeElement;
      names.push(active?.getAttribute('aria-label') ?? active?.textContent.trim() ?? '');
    }
    const order = [
      'Refresh',
      'Slice and preview',
      'Fast0.28 mm',
      'Standard0.2 mm',
      'Fine0.12 mm',
      'A1pla-black',
      'Slice and preview',
    ];
    expect(names.filter((name) => order.includes(name))).toEqual(order);
  });

  it('keeps advanced drafts across telemetry and marks the slice stale until sliced again', async () => {
    const fixture = createFixture();
    const user = userEvent.setup();
    renderPane(fixture.client);
    await screen.findByRole('article', { name: 'Workshop X1C, Ready' });

    await user.click(within(prepareRegion()).getByRole('button', { name: 'Slice and preview' }));
    expect(await within(prepareRegion()).findByRole('button', { name: 'Send to Workshop X1C' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: /^Advanced/u }));
    const options = await screen.findByLabelText('Slicer options');
    await user.click(await within(options).findByRole('button', { name: 'Set layer height' }));
    expect(within(options).getByTestId('parameters')).toHaveTextContent('{"layerHeight":0.16}');
    expect(screen.getByText(/Options changed since this slice/u)).toBeInTheDocument();
    expect(within(prepareRegion()).getByRole('button', { name: 'Send to Workshop X1C' })).toBeDisabled();

    act(() => {
      fixture.observe(entry({ snapshot: { ...entry().snapshot, observedAt: later } }));
    });
    await screen.findByText(/Observed/u);
    expect(within(screen.getByLabelText('Slicer options')).getByTestId('parameters')).toHaveTextContent(
      '{"layerHeight":0.16}',
    );
    expect(screen.getByText(/Options changed since this slice/u)).toBeInTheDocument();

    await user.click(within(prepareRegion()).getByRole('button', { name: 'Slice again' }));
    await waitFor(() => {
      expect(mockExport).toHaveBeenLastCalledWith('gcode.3mf', { exportOptions: { layerHeight: 0.16 } });
    });
    expect(await within(prepareRegion()).findByRole('button', { name: 'Send to Workshop X1C' })).toBeEnabled();
  });

  it('disables sending, not slicing, when the chosen material is no longer the loaded one', async () => {
    const fixture = createFixture();
    const user = userEvent.setup();
    renderPane(fixture.client);
    await screen.findByRole('article', { name: 'Workshop X1C, Ready' });
    await user.click(within(screen.getByRole('group', { name: 'Material' })).getByRole('button', { name: /A1/u }));
    await user.click(within(prepareRegion()).getByRole('button', { name: 'Slice and preview' }));
    expect(await within(prepareRegion()).findByRole('button', { name: 'Send to Workshop X1C' })).toBeEnabled();

    act(() => {
      fixture.observe(
        entry({
          snapshot: {
            ...entry().snapshot,
            observedAt: later,
            setup: { ...entry().snapshot.setup, materials: [{ slot: 0, state: 'loaded', materialId: 'petg-red' }] },
          },
        }),
      );
    });

    const send = await within(prepareRegion()).findByRole('button', { name: 'Send to Workshop X1C' });
    await waitFor(() => {
      expect(send).toBeDisabled();
    });
    expect(send).toHaveAccessibleDescription('pla-black is not loaded in A1 (petg-red is).');
    expect(within(prepareRegion()).getByRole('button', { name: 'Slice again' })).toBeEnabled();
  });
});

describe('Print pane agent requests', () => {
  it('shows the interrupt prompt verbatim and accepts through it after one confirmation', async () => {
    const fixture = createFixture({ requests: [agentRequest()] });
    const { bridge, respond } = createBridge({
      interruptId: 'interrupt-1',
      kind: 'approval',
      prompt: 'Print pyramid.gcode.3mf on Workshop X1C? 125 layers, about 42 min.',
      options: [],
      messageId: 'assistant-1',
      approvalId: 'interrupt-1',
      context: { requestId: 'request-agent-1' },
    });
    const user = userEvent.setup();
    renderPane(fixture.client, bridge);

    const region = await screen.findByRole('region', { name: 'Approval required' });
    expect(within(region).getByRole('heading', { name: 'Tau is waiting for approval' })).toBeInTheDocument();
    expect(
      within(region).getByText('Print pyramid.gcode.3mf on Workshop X1C? 125 layers, about 42 min.'),
    ).toBeInTheDocument();
    expect(within(region).getByText('Requested by Tau agent')).toBeInTheDocument();
    expect(within(region).getByText('Answering here also answers the chat.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review the print request' })).toBeInTheDocument();
    expect(fixture.uploadPrint).not.toHaveBeenCalled();

    await user.click(within(region).getByRole('button', { name: 'Accept' }));
    const confirmation = within(region).getByRole('group', { name: 'Confirm before starting' });
    expect(within(confirmation).getByText(artifact.digest)).toBeInTheDocument();
    const start = within(confirmation).getByRole('button', { name: 'Start print on Workshop X1C' });
    expect(start).toBeDisabled();
    expect(respond).not.toHaveBeenCalled();

    confirmAll(confirmation);
    await user.click(start);
    await waitFor(() => {
      expect(respond).toHaveBeenCalledExactlyOnceWith('interrupt-1', true);
    });
    expect(fixture.resolvePrintRequest).not.toHaveBeenCalled();
    expect(fixture.startPrint).not.toHaveBeenCalled();
  });

  it('composes the same prompt without a chat run, resolves directly, and denies without confirmations', async () => {
    const fixture = createFixture({ requests: [agentRequest()] });
    const { bridge, respond } = createBridge();
    const user = userEvent.setup();
    renderPane(fixture.client, bridge);

    const region = await screen.findByRole('region', { name: 'Approval required' });
    expect(
      within(region).getByText('Print pyramid.gcode.3mf on Workshop X1C? 125 layers, about 42 min.'),
    ).toBeInTheDocument();
    expect(within(region).queryByText('Answering here also answers the chat.')).not.toBeInTheDocument();
    await user.click(within(region).getByRole('button', { name: 'Deny' }));
    await waitFor(() => {
      expect(fixture.resolvePrintRequest).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ requestId: 'request-agent-1', decision: 'deny' }),
      );
    });
    expect(respond).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Approval required' })).not.toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /^Activity/u }));
    expect(within(screen.getByRole('list', { name: 'Print requests' })).getByText('Denied')).toBeInTheDocument();
  });

  it('blocks acceptance while the requested material is not the loaded one', async () => {
    const fixture = createFixture({
      requests: [
        agentRequest({
          configuration: { expectedBedType: 'textured-pei', expectedMaterials: [{ slot: 0, materialId: 'pla-white' }] },
        }),
      ],
    });
    const user = userEvent.setup();
    renderPane(fixture.client);

    const region = await screen.findByRole('region', { name: 'Approval required' });
    expect(within(region).getByText('pla-white is not loaded in A1 (pla-black is).')).toBeInTheDocument();
    await user.click(within(region).getByRole('button', { name: 'Accept' }));
    const confirmation = within(region).getByRole('group', { name: 'Confirm before starting' });
    confirmAll(confirmation);
    expect(within(confirmation).getByRole('button', { name: 'Start print on Workshop X1C' })).toBeDisabled();
    expect(fixture.resolvePrintRequest).not.toHaveBeenCalled();
  });

  it('offers only Reconcile for an unconfirmed start, never Retry', async () => {
    const fixture = createFixture({
      requests: [
        agentRequest({
          state: 'unknown',
          uploadOperationId: 'operation-upload-1',
          startOperationId: 'operation-start-1',
          receipt: {
            operationId: 'operation-start-1',
            machineId: 'machine-1',
            kind: 'start',
            status: 'unknown',
            reason: 'The MQTT reply timed out',
            observedAt: timestamp,
          },
        }),
      ],
    });
    const user = userEvent.setup();
    renderPane(fixture.client);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The printer did not confirm the start of pyramid.gcode.3mf.');
    expect(alert).toHaveTextContent('The MQTT reply timed out');
    expect(within(alert).getByRole('button', { name: 'Reconcile' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry/iu })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(Start|Accept)/u })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reconcile the start' })).toBeInTheDocument();

    await user.click(within(alert).getByRole('button', { name: 'Reconcile' }));
    await waitFor(() => {
      expect(fixture.reconcileOperation).toHaveBeenCalledExactlyOnceWith({
        machineId: 'machine-1',
        operationId: 'operation-start-1',
      });
    });
    expect(await within(alert).findByText('Reconciled: accepted · run provider-run-9')).toBeInTheDocument();
    expect(fixture.startPrint).not.toHaveBeenCalled();
  });
});

describe('Print pane monitor and controls', () => {
  it('states the run plainly and confirms every run command against the exact observed run', async () => {
    const fixture = createFixture({ entries: [printing()] });
    const user = userEvent.setup();
    renderPane(fixture.client);

    expect(await screen.findByRole('article', { name: 'Workshop X1C, Printing' })).toBeInTheDocument();
    expect(screen.getAllByText('Printing layer 42 of 125 · 9 min left').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('progressbar', { name: 'Workshop X1C print progress' })[0]).toHaveAttribute(
      'aria-valuenow',
      '42',
    );

    const urgentStop = screen.getByRole('button', { name: 'Urgent stop' });
    expect(urgentStop).toBeEnabled();
    await user.click(urgentStop);
    const urgentDialog = screen.getByRole('alertdialog', { name: 'Confirm urgent stop' });
    expect(urgentDialog).toHaveTextContent('not a certified emergency stop');
    await user.click(within(urgentDialog).getByRole('button', { name: 'Keep going' }));
    expect(fixture.controlRun).not.toHaveBeenCalled();

    const pause = screen.getByRole('button', { name: 'Pause' });
    pause.focus();
    await user.keyboard('{Enter}');
    const dialog = screen.getByRole('alertdialog', { name: 'Confirm pause' });
    expect(fixture.controlRun).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Keep going' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel run' }));
    await user.click(
      within(screen.getByRole('alertdialog', { name: 'Confirm cancel run' })).getByRole('button', {
        name: 'Confirm cancel run',
      }),
    );
    await waitFor(() => {
      expect(fixture.controlRun).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ machineId: 'machine-1', command: 'cancel', expectedProviderRunId: 'provider-run-1' }),
      );
    });
    expect(await screen.findByText('cancel accepted for machine-1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Other actions/u }));
    const light = await screen.findByRole('button', { name: 'Chamber light' });
    expect(light).toBeDisabled();
    expect(light).toHaveAccessibleDescription('Designed, not yet qualified on this machine');
    expect(screen.getByRole('button', { name: 'Format storage' })).toHaveAccessibleDescription('Not supported');
  });

  it('disables every physical action while the observation is stale', async () => {
    const fixture = createFixture({ entries: [printing()], requests: [agentRequest()] });
    const user = userEvent.setup();
    renderPane(fixture.client);

    const region = await screen.findByRole('region', { name: 'Approval required' });
    expect(screen.getByRole('button', { name: 'Pause' })).toBeEnabled();
    await user.click(within(region).getByRole('button', { name: 'Accept' }));
    const confirmation = within(region).getByRole('group', { name: 'Confirm before starting' });
    confirmAll(confirmation);
    const start = within(confirmation).getByRole('button', { name: 'Start print on Workshop X1C' });
    expect(start).toBeEnabled();

    act(() => {
      fixture.goStale();
    });

    expect(await screen.findByRole('article', { name: 'Workshop X1C, Stale observation' })).toBeInTheDocument();
    expect(screen.getByText('Run controls wait for a current observation from the machine.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Urgent stop' })).toBeDisabled();
    expect(start).toBeDisabled();
    expect(
      within(confirmation).getByText('Wait for a current observation from Workshop X1C before starting.'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Stale').length).toBeGreaterThan(0);
  });
});
