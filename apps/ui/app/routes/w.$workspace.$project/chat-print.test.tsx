// @vitest-environment jsdom
import axe from 'axe-core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MachineClient } from '@taucad/runtime/machine';
import { writeBambuContainer } from '@taucad/slicer/container';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { fixtureGcode } from '#components/printer/testing/toolpath-fixture.js';
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
  manifest,
  printing,
  provider,
  renderGeometry,
  sliceFixture,
  timestamp,
} from '#routes/w.$workspace.$project/chat-print.fixture.js';
import { submissionDefaults } from '#routes/w.$workspace.$project/chat-print-prepare.js';
import { startBlocker } from '#routes/w.$workspace.$project/chat-print-send.js';
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

/** What the fixture X1C fixes under every slice: its observed plate, nozzle, filament and recommended temperatures. */
const machineSliceOptions = {
  plate: 'textured-pei',
  nozzleDiameter: 0.4,
  filamentDiameter: 1.75,
  nozzleTemperature: 250,
  bedTemperature: 70,
};

/** The Prepare section, whose slice and send buttons share their names with the orientation card's primary action. */
const prepareRegion = (): HTMLElement => screen.getByRole('region', { name: 'Prepare' });

/** The pane's own name for the agent's pending request; the chat banner keeps "Approval required". */
const requestRegionName = 'Print request awaiting you: pyramid.gcode.3mf';

const paused = (): ReturnType<typeof entry> => {
  const run = printing();
  return { ...run, snapshot: { ...run.snapshot, run: { ...run.snapshot.run, state: 'paused' } } };
};

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
    expect(
      nextAction({
        entry: entry(),
        openRequest: undefined,
        prepare: { ...prepare, slice: sliceFixture, sendBlocker: 'Workshop X1C is busy. Wait until it reports ready.' },
      }),
    ).toEqual({ label: 'Workshop X1C is busy. Wait until it reports ready.', kind: 'none' });
  });

  it('names the one reason a physical start must wait, in the order a person resolves them', () => {
    const { configuration } = agentRequest();
    expect(startBlocker(configuration, entry(), undefined)).toBeUndefined();
    expect(startBlocker(configuration, entry({ freshness: 'stale' }), undefined)).toBe(
      'Wait for a current observation from Workshop X1C before starting.',
    );
    expect(startBlocker(configuration, printing(), undefined)).toBe(
      'Workshop X1C has a run in progress. Start another print once it ends.',
    );
    expect(startBlocker(configuration, paused(), undefined)).toBe(
      'Workshop X1C has a paused run. Resume or cancel it before starting another print.',
    );
    expect(
      startBlocker(configuration, entry({ snapshot: { ...entry().snapshot, readiness: 'busy' } }), undefined),
    ).toBe('Workshop X1C is busy. Wait until it reports ready.');
    expect(
      startBlocker(configuration, entry({ snapshot: { ...entry().snapshot, readiness: 'not-ready' } }), undefined),
    ).toBe('Workshop X1C is not ready. Wait until it reports ready.');
    expect(startBlocker({ expectedMaterials: [{ slot: 0, materialId: 'pla-white' }] }, entry(), undefined)).toBe(
      'pla-white is not loaded in Slot 1 (pla-black is).',
    );
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
      expect(mockExport).toHaveBeenCalledExactlyOnceWith('gcode.3mf', {
        exportOptions: { ...machineSliceOptions, preset: 'fine' },
      });
    });
    expect(mockWriteFiles).toHaveBeenCalledExactlyOnceWith({
      'exports/main.gcode.3mf': { content: new Uint8Array([0x50, 0x4b, 0x03, 0x04]) },
    });

    const result = await screen.findByLabelText('Slice result');
    expect(within(result).getByText('125')).toBeInTheDocument();
    expect(within(result).getByText('about 42 min')).toBeInTheDocument();
    expect(within(result).getByText('3.2 m')).toBeInTheDocument();
    // The part alone, then every move with the purge line: the plate fit is checked on the latter.
    expect(within(result).getByText('Part').nextElementSibling).toHaveTextContent('50 × 50 × 25 mm');
    expect(within(result).getByText('Toolpath').nextElementSibling).toHaveTextContent(
      '236 × 153 × 35 mm · every nozzle move',
    );
    expect(within(result).getByText('The toolpath fits the plate')).toBeInTheDocument();

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
    expect(screen.queryByRole('region', { name: /^Print request awaiting you/u })).not.toBeInTheDocument();

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
      expect(mockExport).toHaveBeenLastCalledWith('gcode.3mf', {
        exportOptions: { ...machineSliceOptions, layerHeight: 0.16 },
      });
    });
    expect(await within(prepareRegion()).findByRole('button', { name: 'Send to Workshop X1C' })).toBeEnabled();
  });

  it('clears a slice error once the model renders again, since it described the geometry before', async () => {
    const fixture = createFixture();
    const user = userEvent.setup();
    renderPane(fixture.client);
    await screen.findByRole('article', { name: 'Workshop X1C, Ready' });
    mockExport.mockResolvedValueOnce({
      success: false,
      data: [],
      issues: [{ message: 'The GLB carries no triangle primitives.' }],
    } as unknown as Awaited<ReturnType<typeof mockExport>>);

    await user.click(within(prepareRegion()).getByRole('button', { name: 'Slice and preview' }));
    expect(await within(prepareRegion()).findByText('The GLB carries no triangle primitives.')).toBeInTheDocument();

    act(() => {
      renderGeometry();
    });

    expect(within(prepareRegion()).queryByText('The GLB carries no triangle primitives.')).not.toBeInTheDocument();
    expect(within(prepareRegion()).getByRole('button', { name: 'Slice and preview' })).toBeEnabled();
  });

  it('marks a slice stale once the model renders again, so the old toolpath cannot be sent', async () => {
    const fixture = createFixture();
    const user = userEvent.setup();
    renderPane(fixture.client);
    await screen.findByRole('article', { name: 'Workshop X1C, Ready' });

    await user.click(within(prepareRegion()).getByRole('button', { name: 'Slice and preview' }));
    expect(await within(prepareRegion()).findByRole('button', { name: 'Send to Workshop X1C' })).toBeEnabled();

    act(() => {
      renderGeometry();
    });

    expect(within(prepareRegion()).getByRole('button', { name: 'Send to Workshop X1C' })).toBeDisabled();
    expect(
      screen.getByText('The model changed since this slice. Slice again to send the current model.'),
    ).toBeInTheDocument();

    await user.click(within(prepareRegion()).getByRole('button', { name: 'Slice again' }));
    expect(await within(prepareRegion()).findByRole('button', { name: 'Send to Workshop X1C' })).toBeEnabled();
  });

  it("starts the machine mapping from the provider schema's own defaults, so bed leveling and flow calibration show on", async () => {
    // Bambu declares both flags `.default(true)` in its submission schema; its declared defaults stay empty.
    expect(submissionDefaults(provider, entry(), manifest)).toMatchObject({
      bedLeveling: true,
      flowCalibration: true,
      timelapse: false,
      expectedBedType: 'textured-pei',
    });
    const user = userEvent.setup();
    renderPane(createFixture().client);
    await screen.findByRole('article', { name: 'Workshop X1C, Ready' });
    await user.click(screen.getByRole('button', { name: /^Advanced/u }));
    const mapping = await screen.findByLabelText('Machine mapping');
    expect(await within(mapping).findByRole('switch', { name: 'Toggle for Bed Leveling' })).toBeChecked();
    expect(within(mapping).getByRole('switch', { name: 'Toggle for Flow Calibration' })).toBeChecked();
    expect(within(mapping).getByRole('switch', { name: 'Toggle for Timelapse' })).not.toBeChecked();
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

  it('keeps Send disabled with its reason while the machine runs a print or is not ready', async () => {
    const fixture = createFixture();
    const user = userEvent.setup();
    renderPane(fixture.client);
    await screen.findByRole('article', { name: 'Workshop X1C, Ready' });
    await user.click(within(prepareRegion()).getByRole('button', { name: 'Slice and preview' }));
    expect(await within(prepareRegion()).findByRole('button', { name: 'Send to Workshop X1C' })).toBeEnabled();

    const send = (): HTMLElement => within(prepareRegion()).getByRole('button', { name: 'Send to Workshop X1C' });
    const expectSendHeld = async (next: ReturnType<typeof entry>, reason: string): Promise<void> => {
      act(() => {
        fixture.observe(next);
      });
      await waitFor(() => {
        expect(send()).toHaveAccessibleDescription(reason);
      });
      expect(send()).toBeDisabled();
    };

    await expectSendHeld(printing(), 'Workshop X1C has a run in progress. Start another print once it ends.');
    const printingCard = screen.getByRole('article', { name: 'Workshop X1C, Printing' });
    expect(within(printingCard).getByRole('status')).toHaveTextContent('Monitor the run');
    await expectSendHeld(paused(), 'Workshop X1C has a paused run. Resume or cancel it before starting another print.');
    await expectSendHeld(
      entry({ snapshot: { ...entry().snapshot, readiness: 'busy' } }),
      'Workshop X1C is busy. Wait until it reports ready.',
    );
    // The orientation card states the same reason instead of offering to slice again.
    const card = screen.getByRole('article', { name: 'Workshop X1C, Busy' });
    expect(within(card).getByRole('status')).toHaveTextContent('Workshop X1C is busy. Wait until it reports ready.');
    expect(within(card).queryByRole('button', { name: /^Send|^Slice/u })).not.toBeInTheDocument();

    act(() => {
      fixture.observe(entry());
    });
    await waitFor(() => {
      expect(send()).toBeEnabled();
    });
    expect(fixture.requestPrint).not.toHaveBeenCalled();
  });
});

describe('Print pane slice summary', () => {
  it('should measure the part apart from the purge line and end lift and check the plate fit on every move', async () => {
    const summary = await vi.importActual<typeof PrintSummary>('#routes/w.$workspace.$project/chat-print-summary.js');
    const bytes = writeBambuContainer({
      gcode: fixtureGcode({ layers: 10, size: 40 }),
      modelName: 'tube',
      plate: 'textured-pei',
    });

    const result = summary.summarizeGcodeContainer(bytes);

    expect(result.bounds).toEqual({ min: [0, 0, 0], max: [148, 148, 50] });
    expect(result.partBounds).toEqual({ min: [108, 108, 0], max: [148, 148, 2] });
    expect(summary.formatSize(result.bounds)).toBe('148 × 148 × 50 mm');
    expect(result.partBounds && summary.formatSize(result.partBounds)).toBe('40 × 40 × 2 mm');
    expect(summary.fitsBuildVolume(result.bounds, manifest.geometry.buildVolume)).toEqual({ fits: true });
  });
});

describe('Print pane agent requests', () => {
  it('does not say Tau is waiting when an external agent asked and no chat is paused on it', async () => {
    const external = agentRequest({ requestedBy: { kind: 'agent', id: 'external-agent', label: 'External agent' } });
    const fixture = createFixture({ requests: [external] });
    renderPane(fixture.client);

    const region = await screen.findByRole('region', { name: requestRegionName });
    expect(within(region).getByRole('heading', { name: 'Waiting for your approval' })).toBeInTheDocument();
    expect(within(region).getByText('Requested by External agent')).toBeInTheDocument();
    expect(within(region).queryByText('Answering here also answers the chat.')).not.toBeInTheDocument();
  });

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

    const region = await screen.findByRole('region', { name: requestRegionName });
    // The chat banner owns "Approval required"; the pane never reuses it.
    expect(screen.queryByRole('region', { name: 'Approval required' })).not.toBeInTheDocument();
    expect(within(region).getByRole('heading', { name: 'Tau is waiting for approval' })).toBeInTheDocument();
    expect(
      within(region).getByText('Print pyramid.gcode.3mf on Workshop X1C? 125 layers, about 42 min.'),
    ).toBeInTheDocument();
    expect(within(region).getByText('Requested by Tau agent')).toBeInTheDocument();
    expect(within(region).getByText('Answering here also answers the chat.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review the print request' })).toBeInTheDocument();
    expect(fixture.uploadPrint).not.toHaveBeenCalled();

    // Preview the exact recorded artifact before deciding, the way Prepare opens a fresh slice.
    await user.click(within(region).getByRole('button', { name: 'Open printer preview' }));
    expect(mockEditorSend).toHaveBeenCalledExactlyOnceWith({
      type: 'openFile',
      path: 'exports/pyramid.gcode.3mf',
      source: 'user',
    });
    expect(respond).not.toHaveBeenCalled();

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

    const region = await screen.findByRole('region', { name: requestRegionName });
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
      expect(screen.queryByRole('region', { name: requestRegionName })).not.toBeInTheDocument();
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

    const region = await screen.findByRole('region', { name: requestRegionName });
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

  it('stops calling a started request "Started" once the machine reports idle after an urgent stop', async () => {
    // The request ends at "started" by contract; the run's outcome lives in the observation and the receipts.
    const started = agentRequest({
      state: 'started',
      receipt: {
        operationId: 'operation-start-1',
        machineId: 'machine-1',
        kind: 'start',
        status: 'accepted',
        providerRunId: 'provider-run-1',
        observedAt: timestamp,
      },
    });
    const fixture = createFixture({
      entries: [{ ...printing(), snapshot: { ...printing().snapshot, observedAt: later } }],
      requests: [started],
    });
    const user = userEvent.setup();
    renderPane(fixture.client);
    await screen.findByRole('article', { name: 'Workshop X1C, Printing' });
    await user.click(screen.getByRole('button', { name: /^Activity/u }));
    const activity = screen.getByRole('list', { name: 'Print requests' });
    expect(within(activity).getByRole('listitem')).toHaveTextContent(/^Printingpyramid\.gcode\.3mf/u);

    await user.click(screen.getByRole('button', { name: 'Urgent stop' }));
    await user.click(
      within(screen.getByRole('alertdialog', { name: 'Confirm urgent stop' })).getByRole('button', {
        name: 'Confirm urgent stop',
      }),
    );
    expect(await screen.findByText('urgent-stop accepted for machine-1')).toBeInTheDocument();
    act(() => {
      fixture.observe(entry({ snapshot: { ...entry().snapshot, observedAt: later } }));
    });

    await screen.findByRole('article', { name: 'Workshop X1C, Ready' });
    const item = within(screen.getByRole('list', { name: 'Print requests' })).getByRole('listitem');
    expect(item).toHaveTextContent(/^Stoppedpyramid\.gcode\.3mf/u);
    expect(within(item).queryByText('Started')).not.toBeInTheDocument();
  });

  it("names the run by the file the person approved, not the printer's upload name", async () => {
    const started = agentRequest({
      state: 'started',
      receipt: {
        operationId: 'operation-start-1',
        machineId: 'machine-1',
        kind: 'start',
        status: 'accepted',
        providerRunId: 'provider-run-1',
        observedAt: timestamp,
      },
    });
    const uploaded = printing();
    const fixture = createFixture({
      entries: [
        {
          ...uploaded,
          snapshot: { ...uploaded.snapshot, run: { ...uploaded.snapshot.run!, file: 'tau-3f2a9c.gcode.3mf' } },
        },
      ],
      requests: [started],
    });
    const user = userEvent.setup();
    renderPane(fixture.client);
    await screen.findByRole('article', { name: 'Workshop X1C, Printing' });

    await waitFor(() => {
      expect(screen.getByText('File').nextElementSibling).toHaveTextContent('pyramid.gcode.3mf');
    });
    await user.click(screen.getByRole('button', { name: 'Urgent stop' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Confirm urgent stop' });
    expect(dialog).toHaveTextContent('current run (pyramid.gcode.3mf)?');
    expect(dialog).not.toHaveTextContent('tau-3f2a9c');
  });

  it('holds an accepted start while a run is in progress and disables every physical action while stale', async () => {
    const fixture = createFixture({ requests: [agentRequest()] });
    const user = userEvent.setup();
    renderPane(fixture.client);

    const region = await screen.findByRole('region', { name: requestRegionName });
    await user.click(within(region).getByRole('button', { name: 'Accept' }));
    const confirmation = within(region).getByRole('group', { name: 'Confirm before starting' });
    confirmAll(confirmation);
    const start = within(confirmation).getByRole('button', { name: 'Start print on Workshop X1C' });
    expect(start).toBeEnabled();

    act(() => {
      fixture.observe(printing());
    });
    await waitFor(() => {
      expect(start).toBeDisabled();
    });
    expect(
      within(confirmation).getByText('Workshop X1C has a run in progress. Start another print once it ends.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeEnabled();

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
