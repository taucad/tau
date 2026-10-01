/* eslint-disable @typescript-eslint/naming-convention -- Fixtures retain Bambu Studio wire setting names. */
// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import axe from 'axe-core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MachineClient, MachineDirectoryEntry } from '@taucad/runtime/machine';
import { machineSettingsPath, serializeMachineSettings, readMachineSettings } from '@taucad/runtime/machine/settings';
import type { MachineSettingsRecord, MachineSettingsValue } from '@taucad/types';
import { slicingPreferences } from '@taucad/slicer/preferences';
import { bambuSettingsConfiguration } from '@taucad/bambu/settings';
import { writeBambuContainer } from '@taucad/slicer/container';
import { ToolpathParseError, parseGcode } from '@taucad/slicer/toolpath';
import type * as Toolpath from '@taucad/slicer/toolpath';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { projectFiles } from '#components/print/testing/project-files.js';
import { fixtureGcode } from '#components/printer/testing/toolpath-fixture.js';
import type { PrintApprovalBridge } from '#hooks/use-machines-approvals.js';
import { summarizeGcodeContainer } from '#components/printer/printer-summary.js';
import type { SliceSummary } from '#components/printer/printer-summary.js';
import type * as PrintSummary from '#routes/w.$workspace.$project/chat-print-summary.js';
import {
  accepted,
  agentRequest,
  artifact,
  bambuStudioSliceSummary,
  bambuStudioVersion,
  baseSliceSummary,
  createBambuStudio,
  createBridge,
  createFixture,
  desktopHost,
  entry,
  failedCadSnapshot,
  gcodeRoute,
  later,
  mockEditorSend,
  mockProjectSend,
  mockExport,
  mockWriteFiles,
  manifest,
  printing,
  projectId,
  provider,
  renderGeometry,
  setRestoredPrintEntryPath,
  settledCadSnapshot,
  sliceFixture,
  summarizeGcodeContainerMock,
  timestamp,
} from '#routes/w.$workspace.$project/chat-print.fixture.js';
import { submissionDefaults } from '#routes/w.$workspace.$project/chat-print-prepare.js';
import {
  bambuStudioRequired,
  describeStartConfirmations,
  developerModeRequired,
  startBlocker,
} from '#routes/w.$workspace.$project/chat-print-send.js';
import { PrintPanel, nextAction, presentMachine } from '#routes/w.$workspace.$project/chat-print.js';
import { awaitFreshRender } from '#machines/await-fresh-render.js';

vi.mock('#machines/await-fresh-render.js', () => ({ awaitFreshRender: vi.fn() }));

/* The real parser, which one test makes refuse a plate too large to preview. */
vi.mock('@taucad/slicer/toolpath', async (importOriginal) => {
  const actual = await importOriginal<typeof Toolpath>();
  return { ...actual, parseGcode: vi.fn(actual.parseGcode) };
});
vi.mock('#hooks/use-project.js', async () => {
  const fixtures = await import('#routes/w.$workspace.$project/chat-print.fixture.js');
  return fixtures.projectMock;
});
vi.mock('#hooks/use-file-manager.js', async () => {
  const fixtures = await import('#routes/w.$workspace.$project/chat-print.fixture.js');
  return fixtures.fileManagerMock;
});
vi.mock('#routes/w.$workspace.$project/chat-converter.js', async (importOriginal) => {
  const fixtures = await import('#routes/w.$workspace.$project/chat-print.fixture.js');
  return fixtures.converterMock(await importOriginal());
});
vi.mock('#components/geometry/parameters/parameters.js', async (importOriginal) => {
  const fixtures = await import('#routes/w.$workspace.$project/chat-print.fixture.js');
  return fixtures.parametersMock(await importOriginal());
});
vi.mock('#filesystem/desktop-bridge.js', async (importOriginal) => {
  const [actual, fixtures] = await Promise.all([
    importOriginal<Record<string, unknown>>(),
    import('#routes/w.$workspace.$project/chat-print.fixture.js'),
  ]);
  return { ...actual, ...fixtures.desktopBridgeMock };
});
// Slice UI fixtures deliberately use only a ZIP signature; preserve their existing summary seam.
vi.mock('#components/printer/printer-preparation.js', async () => {
  const fixtures = await import('#routes/w.$workspace.$project/chat-print.fixture.js');
  return {
    printerPreparation: {
      prepare: async ({ signal }: { bytes: Uint8Array<ArrayBuffer>; signal: AbortSignal }) => {
        signal.throwIfAborted();
        return { kind: 'refused', summary: fixtures.summarizeGcodeContainerMock(), preparationDuration: 0 };
      },
    },
  };
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

/* Lane M's two-colour slice records a red part (filament 1) and a blue one. */
// oxlint-disable-next-line tau-lint/no-hardcoded-color -- the colours Bambu Studio records for the model
const [red, blue] = ['#FF0000', '#0000FF'] as const;
// oxlint-disable-next-line tau-lint/no-hardcoded-color -- the RGBA a machine reports for a red and a blue spool
const [redTray, blueTray] = ['#FF0000FF', '#0000FFFF'] as const;

/** The next print folds during a run; opening it keeps the preparation assertions about its actual controls. */
const prepareRegion = (): HTMLElement => {
  const folded = screen.queryByRole('button', { name: 'Prepare the next print' });
  if (folded?.getAttribute('aria-expanded') === 'false') {
    fireEvent.click(folded);
  }
  return screen.getByRole('region', { name: 'Prepare' });
};

const openMoreSettings = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
  const trigger = screen.getByRole('button', { name: 'More settings' });
  if (trigger.getAttribute('aria-expanded') !== 'true') {
    await user.click(trigger);
  }
};

const shortPreset = (name: string): string => name.replace(/ @BBL X1C$/u, '');
const selectedLabel = (value: string): string =>
  value === 'cool'
    ? 'Cool plate'
    : value === 'textured-pei'
      ? 'Textured PEI plate'
      : /^\d$/u.test(value)
        ? `A${String(Number(value) + 1)}`
        : value === ''
          ? 'Choose a slot'
          : shortPreset(value);

const chooseOption = async (
  user: ReturnType<typeof userEvent.setup>,
  trigger: HTMLElement,
  label: string,
): Promise<void> => {
  await user.click(trigger);
  const optionName = /^\d$/u.test(label) ? `A${String(Number(label) + 1)}` : shortPreset(label);
  const option = screen.getAllByRole('option').find((candidate) => candidate.textContent.includes(optionName));
  if (!option) {
    throw new Error(`Missing select option: ${optionName}`);
  }
  await user.click(option);
};

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

/** The fixture slice's bytes (`PK\x03\x04`) name its file: `.tau/artifacts/<sha256>/` (blueprint D5). */
const sliceHex = '8dcc7e601606217f3b754766511182a916b17e9a26a94c9d887104eba92e9bb2';
const slicePath = `.tau/artifacts/${sliceHex}/main.gcode.3mf`;

const settingsPath = machineSettingsPath({ typeId: 'bambu.x1c' });
const preferencesRecord = (
  preferences: Record<string, unknown>,
  typeId: MachineSettingsRecord['typeId'] = 'bambu.x1c',
): MachineSettingsRecord => {
  const { plate, ...values } = preferences;
  // SAFETY: fixture values are admitted by serializeMachineSettings before use.
  return {
    version: 1,
    typeId,
    activeProfile: 'default',
    profiles: {
      default: {
        name: 'Default',
        configurations: {
          [slicingPreferences.manifest.source.id]: {
            version: slicingPreferences.manifest.source.version,
            values: values as Record<string, MachineSettingsValue>,
          },
          ...(plate === undefined
            ? {}
            : {
                [bambuSettingsConfiguration.manifest.source.id]: {
                  version: bambuSettingsConfiguration.manifest.source.version,
                  values: { plate: plate as string },
                },
              }),
        },
      },
    },
  };
};
const preferencesBytes = (preferences: Record<string, unknown>): string =>
  serializeMachineSettings({ record: preferencesRecord(preferences) });
/** Read effective sparse values from the actual source-versioned envelope. */
const preferencesText = (): string | undefined => {
  const text = projectFiles.read(settingsPath);
  if (!text) {
    return undefined;
  }
  const read = readMachineSettings({
    bytes: new TextEncoder().encode(text),
    typeId: 'bambu.x1c',
  });
  if (read.status !== 'current') {
    throw new Error(read.message);
  }
  const blocks = read.record.profiles[read.record.activeProfile]!.configurations;
  const values = {
    ...blocks[slicingPreferences.manifest.source.id]?.values,
    ...blocks[bambuSettingsConfiguration.manifest.source.id]?.values,
  };
  return `${JSON.stringify(values, (_key, value: unknown) => (value !== null && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).toSorted(([a], [b]) => a.localeCompare(b))) : value), 2)}\n`;
};
const expectPreferences = async (expected: Record<string, unknown>): Promise<void> => {
  await waitFor(() => {
    expect(JSON.parse(preferencesText() ?? 'null')).toEqual(expected);
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  vi.mocked(awaitFreshRender).mockImplementation(async (actor) => actor.getSnapshot());
  globalThis.localStorage.clear();
  desktopHost.bambuStudio = undefined;
  projectFiles.clear();
  setRestoredPrintEntryPath(undefined);
});

const signalMatcher: unknown = expect.any(AbortSignal);

describe('Print pane orientation', () => {
  it('lists a restored secondary model without waking its parked CAD unit', async () => {
    setRestoredPrintEntryPath('other.ts');
    const { client } = createFixture();
    const { bridge } = createBridge();
    render(
      <TooltipProvider>
        <PrintPanel machines={{ available: true, ...client }} bridge={bridge} isShown={false} />
      </TooltipProvider>,
    );

    fireEvent.click(await screen.findByRole('combobox', { name: 'Model' }));
    expect(screen.getByRole('option', { name: 'other.ts' })).toBeInTheDocument();
    expect(mockProjectSend).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'claimGeometryUnit', entryPath: 'other.ts' }),
    );
  });

  it('claims the selected geometry only while the Print panel is shown', async () => {
    const { client } = createFixture();
    const { bridge } = createBridge();
    const view = render(
      <TooltipProvider>
        <PrintPanel machines={{ available: true, ...client }} bridge={bridge} isShown={false} />
      </TooltipProvider>,
    );
    expect(mockProjectSend).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'claimGeometryUnit' }));

    view.rerender(
      <TooltipProvider>
        <PrintPanel machines={{ available: true, ...client }} bridge={bridge} isShown />
      </TooltipProvider>,
    );
    await waitFor(() => {
      expect(mockProjectSend).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'claimGeometryUnit', entryPath: 'main.ts', renderTimeout: undefined }),
      );
    });
    const claim = mockProjectSend.mock.calls.find(([event]) => event.type === 'claimGeometryUnit')?.[0] as unknown as {
      claimId: string;
    };
    expect(typeof claim.claimId).toBe('string');

    view.rerender(
      <TooltipProvider>
        <PrintPanel machines={{ available: true, ...client }} bridge={bridge} isShown={false} />
      </TooltipProvider>,
    );
    expect(mockProjectSend).toHaveBeenCalledWith({ type: 'releaseGeometryUnit', claimId: claim.claimId });
  });

  it('holds a separate slice claim after hide and waits for the resumed render', async () => {
    let resolveFresh: (snapshot: Awaited<ReturnType<typeof awaitFreshRender>>) => void = () => undefined;
    vi.mocked(awaitFreshRender).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFresh = resolve;
      }),
    );
    const { client } = createFixture();
    const { bridge } = createBridge();
    const view = render(
      <TooltipProvider>
        <PrintPanel machines={{ available: true, ...client }} bridge={bridge} isShown />
      </TooltipProvider>,
    );
    await screen.findByRole('article', { name: 'Workshop X1C, Ready' });
    fireEvent.click(within(prepareRegion()).getByRole('button', { name: 'Slice and preview' }));
    const claims = mockProjectSend.mock.calls
      .map(([event]) => event as { type: string; claimId: string })
      .filter((event) => event.type === 'claimGeometryUnit');
    expect(claims).toHaveLength(2);
    expect(claims[1]?.claimId).not.toBe(claims[0]?.claimId);

    view.rerender(
      <TooltipProvider>
        <PrintPanel machines={{ available: true, ...client }} bridge={bridge} isShown={false} />
      </TooltipProvider>,
    );
    expect(mockProjectSend).toHaveBeenCalledWith({ type: 'releaseGeometryUnit', claimId: claims[0]?.claimId });
    expect(mockProjectSend).not.toHaveBeenCalledWith({ type: 'releaseGeometryUnit', claimId: claims[1]?.claimId });
    expect(mockExport).not.toHaveBeenCalled();

    // SAFETY: the fixture CAD snapshot intentionally implements only the state read by Print prepare.
    resolveFresh(settledCadSnapshot() as unknown as Awaited<ReturnType<typeof awaitFreshRender>>);
    await waitFor(() => {
      expect(mockExport).toHaveBeenCalled();
      expect(mockProjectSend).toHaveBeenCalledWith({ type: 'releaseGeometryUnit', claimId: claims[1]?.claimId });
    });
  });

  it('refuses to slice retained geometry after the latest CAD render fails', async () => {
    // SAFETY: the fixture snapshot contains the CAD state read by Print prepare.
    vi.mocked(awaitFreshRender).mockResolvedValueOnce(
      failedCadSnapshot() as unknown as Awaited<ReturnType<typeof awaitFreshRender>>,
    );
    renderPane(createFixture().client);
    await screen.findByRole('article', { name: 'Workshop X1C, Ready' });
    const beforeSlice = mockProjectSend.mock.calls.length;
    fireEvent.click(within(prepareRegion()).getByRole('button', { name: 'Slice and preview' }));

    expect(await within(prepareRegion()).findByText('radius must be positive')).toBeInTheDocument();
    expect(mockExport).not.toHaveBeenCalled();
    const operationClaim = mockProjectSend.mock.calls
      .slice(beforeSlice)
      .map(([event]) => event as { type: string; claimId: string })
      .find((event) => event.type === 'claimGeometryUnit');
    expect(operationClaim).toBeDefined();
    expect(mockProjectSend).toHaveBeenCalledWith({ type: 'releaseGeometryUnit', claimId: operationClaim?.claimId });
  });

  it('confirms the numeric nozzle requested for this print', () => {
    expect(describeStartConfirmations({ expectedNozzleDiameter: 0.6 }, entry(), manifest)).toContainEqual({
      id: 'nozzle',
      label: 'A 0.6 mm nozzle is installed',
    });
  });
  it('names the machine state and the one safe next step from the observation alone', () => {
    expect(presentMachine(entry())).toMatchObject({ label: 'Ready' });
    expect(presentMachine(printing())).toMatchObject({ label: 'Printing' });
    expect(presentMachine(entry({ freshness: 'stale' })).nextAction).toContain('before any physical action');
    expect(presentMachine(entry({ snapshot: { ...entry().snapshot, connection: 'unreachable' } })).label).toBe(
      'Unreachable',
    );
  });

  it('lists machines by the names people gave them, not the names the devices report', async () => {
    const attic = entry({ machineId: 'attic-p1s', name: 'Attic P1S' });
    renderPane(createFixture({ entries: [entry(), attic] }).client);

    const picker = await screen.findByRole('combobox', { name: 'Machine' });
    fireEvent.click(picker);
    expect(screen.getAllByRole('option').map((option) => option.textContent.trim())).toEqual([
      'Attic P1SReady',
      'Workshop X1CReady',
    ]);
    expect(screen.queryByText(entry().descriptor.name)).not.toBeInTheDocument();
  });

  it('should abort a camera capture when selecting another machine and discard its late image', async () => {
    const first = entry();
    const mini = entry({ machineId: 'mini', name: 'Mini' });
    const { client } = createFixture({ entries: [first, mini] });
    const pending = Promise.withResolvers<Awaited<ReturnType<MachineClient['captureStill']>>>();
    let captureSignal: AbortSignal | undefined;
    const captureClient: MachineClient = {
      ...client,
      captureStill: vi.fn(async ({ signal }: Parameters<MachineClient['captureStill']>[0]) => {
        captureSignal = signal;
        return pending.promise;
      }),
    };
    globalThis.localStorage.setItem(`tau:print:selected-machine:${projectId}`, first.machineId);
    renderPane(captureClient);
    fireEvent.click(await screen.findByRole('button', { name: /^Environment and camera/u }));
    fireEvent.click(await screen.findByRole('button', { name: 'Capture still' }));
    await waitFor(() => {
      expect(captureSignal).toBeDefined();
    });
    const user = userEvent.setup();
    await chooseOption(user, screen.getByRole('combobox', { name: 'Machine' }), 'Mini');
    expect(captureSignal?.aborted).toBe(true);
    fireEvent.click(await screen.findByRole('button', { name: /^Environment and camera/u }));
    expect(screen.getByRole('button', { name: 'Capture still' })).toBeEnabled();
    await act(async () => {
      pending.resolve({
        bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
        mediaType: 'image/jpeg',
        capturedAt: timestamp,
        expiresAt: later,
      });
    });
    expect(screen.queryByRole('img', { name: /Latest still/u })).not.toBeInTheDocument();
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
  it('should cancel slicing immediately and discard a late successful export before writing or publishing it', async () => {
    let finish!: () => void;
    mockExport.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return {
        success: true,
        data: [
          {
            name: 'main.gcode.3mf',
            bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
            mimeType: 'application/vnd.bambulab.gcode-3mf',
          },
        ],
        issues: [],
      };
    });
    const user = userEvent.setup();
    renderPane(createFixture().client);
    await screen.findByRole('article', { name: 'Workshop X1C, Ready' });
    await user.click(within(prepareRegion()).getByRole('button', { name: 'Slice and preview' }));
    await waitFor(() => {
      expect(mockExport).toHaveBeenCalledOnce();
    });
    await user.click(within(prepareRegion()).getByRole('button', { name: 'Cancel slicing' }));
    expect(within(prepareRegion()).getByRole('button', { name: 'Slice and preview' })).toBeEnabled();
    const sent = mockProjectSend.mock.calls.length;
    finish();
    await waitFor(() => {
      expect(mockProjectSend.mock.calls.length).toBeGreaterThan(sent);
    });
    expect(mockWriteFiles).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Slice result')).not.toBeInTheDocument();
  });

  it('slices with the chosen preset, previews, confirms once, and starts only through the approved request', async () => {
    const fixture = createFixture();
    const user = userEvent.setup();
    const { container } = renderPane(fixture.client);

    expect(await screen.findByRole('article', { name: 'Workshop X1C, Ready' })).toBeInTheDocument();
    expect(container.querySelector('[data-slot="print-panel-body"]')).toHaveClass('min-w-0', 'flex-col');

    const presets = screen.getByRole('radiogroup', { name: 'Quality' });
    expect(
      within(presets)
        .getAllByRole('radio')
        .map((button) => button.textContent),
    ).toEqual(['Fast0.28 mm', 'Standard0.2 mm', 'Fine0.12 mm']);
    await user.click(within(presets).getByRole('radio', { name: /Fine/u }));
    await waitFor(() => {
      expect(within(presets).getByRole('radio', { name: /Fine/u })).toHaveAttribute('aria-checked', 'true');
    });
    // The choice is the project's: saved as the only changed key beside the printer model.
    expect(preferencesText()).toBe('{\n  "preset": "fine"\n}\n');

    const material = screen.getByRole('group', { name: 'Material' });
    expect(within(material).getByRole('combobox', { name: 'Material' })).toHaveTextContent('A1');
    await user.click(within(material).getByRole('combobox', { name: 'Material' }));
    expect(screen.getByRole('option', { name: /A2/u })).toHaveAttribute('data-disabled');
    await user.keyboard('{Escape}');

    const slice = within(prepareRegion()).getByRole('button', { name: 'Slice and preview' });
    slice.focus();
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(mockExport).toHaveBeenCalledExactlyOnceWith('gcode.3mf', {
        signal: signalMatcher,
        exportOptions: { ...machineSliceOptions, preset: 'fine' },
      });
    });
    expect(mockWriteFiles).toHaveBeenCalledExactlyOnceWith({
      [slicePath]: { content: new Uint8Array([0x50, 0x4b, 0x03, 0x04]) },
    });

    const result = await screen.findByLabelText('Slice result');
    expect(within(result).getByText('125')).toBeInTheDocument();
    expect(within(result).getByText('about 42 min')).toBeInTheDocument();
    expect(within(result).getByText('3.2 m')).toBeInTheDocument();
    // The part alone decides the plate fit; every move, start routine included, is shown beside it.
    expect(within(result).getByText('Part').nextElementSibling).toHaveTextContent('50 × 50 × 25 mm');
    expect(within(result).getByText('Toolpath').nextElementSibling).toHaveTextContent(
      "236 × 153 × 35 mm · every nozzle move, including the printer's start routine",
    );
    expect(within(result).getByText('The part fits the plate')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open printer preview' }));
    expect(mockEditorSend).toHaveBeenCalledExactlyOnceWith({ type: 'openFile', path: slicePath, source: 'user' });

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
    expect(fixture.requestPrint).toHaveBeenCalledOnce();
    const requestInput = fixture.requestPrint.mock.calls.at(0)?.[0];
    expect(requestInput?.machineId).toBe('machine-1');
    expect(requestInput?.requestedBy.kind).toBe('user');
    expect(requestInput?.summary).toMatchObject({
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
      expectedNozzleDiameter: 0.4,
      expectedFilamentDiameter: 1.75,
    });
    // Blueprint D5: the project, the path and the digest the host re-verifies; no revision.
    expect(requestInput?.artifact).toEqual({
      projectId,
      path: slicePath,
      digest: `sha256:${sliceHex}`,
      length: 4,
      mediaType: accepted.mediaType,
      contract: accepted.contract,
      selectedMember: 'Metadata/plate_1.gcode',
    });
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
    for (let index = 0; index < 20 && !names.includes('Slice and preview'); index += 1) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Tab order is sequential by definition.
      await user.tab();
      const active = document.activeElement;
      names.push(active?.getAttribute('aria-label') ?? active?.textContent.trim() ?? '');
    }
    expect(names).toContain('Machine');
    expect(names).toContain('Plate');
    expect(names).toContain('Material');
    expect(names.at(-1)).toBe('Slice and preview');
    expect(names.indexOf('Plate')).toBeLessThan(names.indexOf('Material'));
  });

  it('should name the plate select by its label and slice for the plate chosen there', async () => {
    const user = userEvent.setup();
    renderPane(createFixture().client);
    await screen.findByRole('article', { name: 'Workshop X1C, Ready' });

    const plate = within(prepareRegion()).getByRole('combobox', { name: 'Plate' });
    // Playwright reads a wrapping label's whole text, options included, so only an explicit name keeps
    // `getByLabel('Plate', { exact: true })` finding it; jsdom and Chromium already name it "Plate" either way.
    expect(plate).toHaveAttribute('aria-label', 'Plate');
    expect(plate).toHaveTextContent('Textured PEI plate');
    await chooseOption(user, plate, 'Cool plate');
    await waitFor(() => {
      expect(plate).toHaveTextContent('Cool plate');
    });
    await expectPreferences({ plate: 'cool' });
    await user.click(within(prepareRegion()).getByRole('button', { name: 'Slice and preview' }));

    await waitFor(() => {
      expect(mockExport).toHaveBeenCalledExactlyOnceWith('gcode.3mf', {
        signal: signalMatcher,
        exportOptions: { ...machineSliceOptions, plate: 'cool' },
      });
    });
  });

  it('keeps advanced drafts across telemetry and marks the slice stale until sliced again', async () => {
    const fixture = createFixture();
    const user = userEvent.setup();
    renderPane(fixture.client);
    await screen.findByRole('article', { name: 'Workshop X1C, Ready' });

    await user.click(within(prepareRegion()).getByRole('button', { name: 'Slice and preview' }));
    expect(await within(prepareRegion()).findByRole('button', { name: 'Send to Workshop X1C' })).toBeEnabled();

    await openMoreSettings(user);
    const options = await screen.findByLabelText('Slicer options');
    await user.click(await within(options).findByRole('button', { name: 'Set layer height' }));
    await waitFor(() => {
      expect(within(options).getByTestId('parameters')).toHaveTextContent('{"layerHeight":0.16}');
    });
    await expectPreferences({ options: { layerHeight: 0.16 } });
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
        signal: signalMatcher,
        exportOptions: { ...machineSliceOptions, layerHeight: 0.16 },
      });
    });
    expect(await within(prepareRegion()).findByRole('button', { name: 'Send to Workshop X1C' })).toBeEnabled();
  });

  it('should discard a prepared slice when switching printers and prepare again for the selected machine', async () => {
    const first = entry();
    const mini = entry({ machineId: 'mini', name: 'Mini' });
    const fixture = createFixture({ entries: [first, mini] });
    globalThis.localStorage.setItem(`tau:print:selected-machine:${projectId}`, first.machineId);
    const user = userEvent.setup();
    renderPane(fixture.client);
    await screen.findByRole('article', { name: 'Workshop X1C, Ready' });
    await user.click(within(prepareRegion()).getByRole('button', { name: 'Slice and preview' }));
    expect(await within(prepareRegion()).findByRole('button', { name: 'Send to Workshop X1C' })).toBeEnabled();
    await chooseOption(user, screen.getByRole('combobox', { name: 'Machine' }), 'Mini');
    expect(screen.queryByRole('button', { name: 'Send to Mini' })).not.toBeInTheDocument();
    expect(within(prepareRegion()).getByRole('button', { name: 'Slice and preview' })).toBeEnabled();
    expect(fixture.requestPrint).not.toHaveBeenCalled();
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
    expect(submissionDefaults(provider, entry(), { manifest })).toMatchObject({
      bedLeveling: true,
      flowCalibration: true,
      timelapse: false,
      expectedBedType: 'textured-pei',
    });
    const user = userEvent.setup();
    renderPane(createFixture().client);
    await screen.findByRole('article', { name: 'Workshop X1C, Ready' });
    await openMoreSettings(user);
    const mapping = await screen.findByLabelText('Machine mapping');
    expect(await screen.findByRole('switch', { name: 'Toggle for Bed levelling' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Toggle for Flow calibration' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Toggle for Timelapse' })).not.toBeChecked();
    expect(within(mapping).getByRole('spinbutton', { name: 'Input for Expected Filament Diameter' })).toHaveValue(
      '1.75',
    );
    expect(within(mapping).getByRole('spinbutton', { name: 'Input for Expected Nozzle Diameter' })).toHaveValue('0.4');
    for (const label of [
      'Kind',
      'Space',
      'Unit',
      'Ams Mapping',
      'Expected Materials',
      'Expected Bed Type',
      'Expected Model',
    ]) {
      expect(within(mapping).queryByLabelText(`Parameter: ${label}`)).not.toBeInTheDocument();
    }
  });

  it('invalidates a slice when a prestart choice changes and submits the new value', async () => {
    const fixture = createFixture();
    const user = userEvent.setup();
    renderPane(fixture.client);
    await screen.findByRole('article', { name: 'Workshop X1C, Ready' });
    await user.click(within(prepareRegion()).getByRole('button', { name: 'Slice and preview' }));
    expect(await within(prepareRegion()).findByRole('button', { name: 'Send to Workshop X1C' })).toBeEnabled();

    const bed = screen.getByRole('switch', { name: 'Toggle for Bed levelling' });
    await user.click(bed);
    expect(bed).not.toBeChecked();
    expect(within(prepareRegion()).getByRole('button', { name: 'Send to Workshop X1C' })).toBeDisabled();
    await user.click(within(prepareRegion()).getByRole('button', { name: 'Slice again' }));
    const send = await within(prepareRegion()).findByRole('button', { name: 'Send to Workshop X1C' });
    await waitFor(() => {
      expect(send).toBeEnabled();
    });
    await user.click(send);
    const confirmation = screen.getByRole('group', { name: 'Confirm before starting' });
    confirmAll(confirmation);
    await user.click(within(confirmation).getByRole('button', { name: 'Start print on Workshop X1C' }));
    await waitFor(() => {
      expect(fixture.requestPrint).toHaveBeenCalledOnce();
    });
    expect(fixture.requestPrint.mock.calls[0]?.[0].configuration).toMatchObject({ bedLeveling: false });
  });

  it('disables sending, not slicing, when the chosen material is no longer the loaded one', async () => {
    const fixture = createFixture();
    const user = userEvent.setup();
    renderPane(fixture.client);
    await screen.findByRole('article', { name: 'Workshop X1C, Ready' });
    expect(screen.getByRole('combobox', { name: 'Material' })).toHaveTextContent('A1');
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
    expect(screen.getByRole('region', { name: 'Monitor' })).toBeInTheDocument();
    await expectSendHeld(paused(), 'Workshop X1C has a paused run. Resume or cancel it before starting another print.');
    await expectSendHeld(
      entry({ snapshot: { ...entry().snapshot, readiness: 'busy' } }),
      'Workshop X1C is busy. Wait until it reports ready.',
    );
    // The orientation card stays a summary; the Send control carries the actionable reason.
    const card = screen.getByRole('article', { name: 'Workshop X1C, Busy' });
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

describe('Print pane external spool', () => {
  /** The fixture printer with its external spool holding white PETG beside the AMS trays. */
  const withExternalSpool = (external: MachineDirectoryEntry['snapshot']['setup']['materials'][number]) => {
    const base = entry();
    return entry({
      snapshot: {
        ...base.snapshot,
        setup: { ...base.snapshot.setup, materials: [...base.snapshot.setup.materials, external] },
      },
    });
  };
  // oxlint-disable-next-line tau-lint/no-hardcoded-color -- the colour the printer reports for a white spool
  const whitePetg = {
    slot: 254,
    state: 'loaded',
    materialId: 'petg-white',
    profileId: 'GFG99',
    color: '#FFFFFF',
  } as const;

  it('offers the external spool as Ext and sends from it with the external-spool checks', async () => {
    const fixture = createFixture({ entries: [withExternalSpool(whitePetg)] });
    const user = userEvent.setup();
    renderPane(fixture.client);

    const material = await screen.findByRole('group', { name: 'Material' });
    const selector = within(material).getByRole('combobox', { name: 'Material' });
    // The AMS stays the default; the external spool is chosen on purpose.
    expect(selector).toHaveTextContent('A1');
    await chooseOption(user, selector, 'Ext');
    expect(selector).toHaveTextContent('Ext');

    await user.click(within(prepareRegion()).getByRole('button', { name: 'Slice and preview' }));
    const send = await within(prepareRegion()).findByRole('button', { name: 'Send to Workshop X1C' });
    await user.click(send);
    const confirmation = screen.getByRole('group', { name: 'Confirm before starting' });
    expect(within(confirmation).getByText('petg-white is loaded on the external spool')).toBeInTheDocument();
    confirmAll(confirmation);
    await user.click(within(confirmation).getByRole('button', { name: 'Start print on Workshop X1C' }));
    await waitFor(() => {
      expect(fixture.requestPrint).toHaveBeenCalledOnce();
    });
    expect(fixture.requestPrint.mock.calls.at(0)?.[0].configuration).toMatchObject({
      amsMapping: [254],
      expectedMaterials: [{ slot: 254, materialId: 'petg-white' }],
    });
  });

  it('cannot choose an empty or unset external holder', async () => {
    renderPane(createFixture({ entries: [withExternalSpool({ slot: 254, state: 'empty' })] }).client);
    const material = await screen.findByRole('group', { name: 'Material' });
    fireEvent.click(within(material).getByRole('combobox', { name: 'Material' }));
    const externalSpool = screen.getByRole('option', { name: /^Ext/u });
    expect(externalSpool).toHaveTextContent('Ext · Empty');
    expect(externalSpool).toHaveAttribute('data-disabled');
  });

  it('names the external spool when the material there no longer matches, and in the checks', () => {
    const configuration = { expectedMaterials: [{ slot: 254, materialId: 'petg-white' }] };
    expect(startBlocker(configuration, withExternalSpool({ ...whitePetg, materialId: 'pla-white' }), manifest)).toBe(
      'petg-white is not loaded on the external spool (pla-white is).',
    );
    expect(startBlocker(configuration, withExternalSpool(whitePetg), manifest)).toBeUndefined();
    expect(describeStartConfirmations(configuration, withExternalSpool(whitePetg), manifest)).toContainEqual({
      id: 'material',
      label: 'petg-white is loaded on the external spool',
    });
  });

  it('shows Ext in the monitor, in use while the printer feeds from it', async () => {
    const run = printing();
    const machine = entry({
      snapshot: {
        ...run.snapshot,
        setup: { ...run.snapshot.setup, materials: [...run.snapshot.setup.materials, whitePetg] },
        materialSystem: { currentSlot: 254, units: [] },
      },
    });
    renderPane(createFixture({ entries: [machine] }).client);
    const slots = await screen.findByRole('list', { name: 'Material slots' });
    const external = within(slots).getByText('Ext').closest('li');
    expect(external).toHaveTextContent('Extpetg-white, in use');
  });
});

describe('Print pane slice summary', () => {
  it('should measure the part apart from the purge line and end lift and check the plate fit on the part', async () => {
    const summary = await vi.importActual<typeof PrintSummary>('#routes/w.$workspace.$project/chat-print-summary.js');
    const bytes = writeBambuContainer({
      gcode: fixtureGcode({ layers: 10, size: 40 }),
      modelName: 'tube',
      plate: 'textured-pei',
    });

    const result = summarizeGcodeContainer(bytes);

    expect(result.bounds).toEqual({ min: [0, 0, 0], max: [148, 148, 50] });
    expect(result.partBounds).toEqual({ min: [108, 108, 0], max: [148, 148, 2] });
    expect(result.bounds && summary.formatSize(result.bounds)).toBe('148 × 148 × 50 mm');
    expect(result.partBounds && summary.formatSize(result.partBounds)).toBe('40 × 40 × 2 mm');
    expect(
      result.bounds &&
        summary.fitsPlate({ bounds: result.bounds, partBounds: result.partBounds }, manifest.geometry.buildVolume),
    ).toEqual({
      fits: true,
      message: 'The part fits the plate',
    });
  });

  it("should read the colours of lane M's real two-colour Bambu Studio slice in filament order", async () => {
    const gcode = readFileSync(
      join(process.cwd(), '../../packages/plugins/slicer/src/__fixtures__/two-colour-cubes.gcode'),
    );
    const result = summarizeGcodeContainer(writeBambuContainer({ gcode: gcode.toString(), modelName: 'cubes' }));
    expect(result.filamentColors).toEqual([red, blue]);
    expect(result.filamentWeightGrams).toBeCloseTo(28.41);
  });

  it("should summarize a plate too large to preview from Bambu Studio's header", async () => {
    const gcode = readFileSync(
      join(process.cwd(), '../../packages/plugins/slicer/src/__fixtures__/two-colour-cubes.gcode'),
    );
    const refusal = 'This G-code is too large to preview. The printer can still print it as it is.';
    vi.mocked(parseGcode).mockImplementationOnce(() => {
      throw new ToolpathParseError('TOOLPATH_SEGMENT_LIMIT', refusal, 2_000_001);
    });
    expect(summarizeGcodeContainer(writeBambuContainer({ gcode: gcode.toString(), modelName: 'cubes' }))).toEqual({
      layers: 50,
      estimatedDuration: 6411,
      isSlicerEstimate: true,
      producer: undefined,
      filamentLength: 9372.5,
      filamentWeightGrams: 28.41,
      bounds: undefined,
      partBounds: undefined,
      coverageComplete: false,
      filamentColors: [red, blue],
      previewRefusal: refusal,
    });
  });

  it('should check every nozzle move and say so when the G-code labels no part', async () => {
    const summary = await vi.importActual<typeof PrintSummary>('#routes/w.$workspace.$project/chat-print-summary.js');
    const { buildVolume } = manifest.geometry;

    expect(
      summary.fitsPlate({ bounds: { min: [0, -3, 0], max: [236, 153, 35] }, partBounds: undefined }, buildVolume),
    ).toEqual({
      fits: false,
      axis: 'Y',
      reason: '3 mm past the plate edge on Y',
      message: 'The toolpath does not fit the plate: 3 mm past the plate edge on Y.',
    });
    expect(
      baseSliceSummary.bounds &&
        summary.fitsPlate({ bounds: baseSliceSummary.bounds, partBounds: undefined }, buildVolume),
    ).toEqual({
      fits: true,
      message: 'The toolpath fits the plate',
    });
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
    expect(fixture.uploadPrint).not.toHaveBeenCalled();

    // Preview the exact recorded artifact before deciding, the way Prepare opens a fresh slice.
    await user.click(within(region).getByRole('button', { name: 'Open printer preview' }));
    expect(mockEditorSend).toHaveBeenCalledExactlyOnceWith({ type: 'openFile', path: artifact.path, source: 'user' });
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

describe('Print pane Bambu Studio mode', () => {
  const x1c = 'Bambu Lab X1 Carbon 0.4 nozzle';
  const standard = '0.20mm Standard @BBL X1C';
  const plaMatte = 'Bambu PLA Matte @BBL X1C';
  const hints = {
    model: 'X1C',
    nozzleDiameter: 0.4,
    plate: 'textured-pei',
    materials: [{ slot: 0, materialId: 'pla-black', profileId: 'GFA01' }],
  };
  /** The real printer, which takes only Bambu Studio archives. */
  const realPrinter = (): ReturnType<typeof entry> => entry({ providerId: 'bambu' });
  const combobox = (name: string): HTMLElement => {
    if (name === 'Printer preset' && screen.queryByRole('combobox', { name }) === null) {
      fireEvent.click(screen.getByRole('button', { name: 'More settings' }));
    }
    return screen.getByRole('combobox', { name });
  };

  const renderStudio = async (
    machine = realPrinter(),
  ): Promise<Readonly<{ fixture: ReturnType<typeof createFixture>; studio: ReturnType<typeof createBambuStudio> }>> => {
    const studio = createBambuStudio();
    desktopHost.bambuStudio = studio;
    const fixture = createFixture({ entries: [machine] });
    renderPane(fixture.client);
    expect(await screen.findByText(`Slicing with Bambu Studio ${bambuStudioVersion}`)).toBeInTheDocument();
    await waitFor(() => {
      expect(combobox('Process')).toHaveTextContent(selectedLabel(standard));
    });
    return { fixture, studio };
  };

  /** Open Advanced and one settings group of the shared Parameters form. */
  const openGroup = async (user: ReturnType<typeof userEvent.setup>, group: string): Promise<void> => {
    if (screen.queryByRole('group', { name: 'Bambu Studio settings' }) === null) {
      await openMoreSettings(user);
    }
    const settings = await screen.findByRole('group', { name: 'Bambu Studio settings' });
    const trigger = within(settings).getByRole('button', { name: `Group: ${group}` });
    if (trigger.getAttribute('aria-expanded') !== 'true') {
      await user.click(trigger);
    }
  };

  /** Type a value into a number or text setting and commit it the way a person does: leave the field. */
  const enter = (name: string, value: string): void => {
    // Numbers are spin buttons; a number-or-percent setting is a text field.
    const field =
      screen.queryByRole('spinbutton', { name: `Input for ${name}` }) ??
      screen.getByRole('textbox', { name: `Input for ${name}` });
    fireEvent.change(field, { target: { value } });
    fireEvent.blur(field);
  };

  it("loads Bambu Studio's defaults for the bound printer and slices with its presets", async () => {
    const user = userEvent.setup();
    const { fixture, studio } = await renderStudio();

    expect(studio.catalog).toHaveBeenCalledWith({ model: 'X1C', nozzleDiameter: 0.4 });
    expect(studio.resolveSelection).toHaveBeenLastCalledWith({ hints, partial: { plate: 'textured-pei' } });
    expect(studio.settings).toHaveBeenLastCalledWith({ printer: x1c, process: standard, filaments: [plaMatte] });
    expect(combobox('Printer preset')).toHaveTextContent(selectedLabel(x1c));
    // The tray's Bambu filament id picks the preset; the tray's own type and colour sit beside it.
    expect(combobox('Filament A1')).toHaveTextContent(selectedLabel(plaMatte));
    // Compatible processes only, with the person's presets apart from the system ones.
    await user.click(combobox('Process'));
    expect(screen.getByRole('group', { name: 'Your presets' })).toHaveTextContent('0.20mm Standard Gyroid PETG');
    expect(screen.queryByRole('option', { name: '0.20mm Standard @BBL P1P' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');

    summarizeGcodeContainerMock.mockReturnValueOnce(bambuStudioSliceSummary);
    await user.click(within(prepareRegion()).getByRole('button', { name: 'Slice and preview' }));
    await waitFor(() => {
      expect(mockExport).toHaveBeenCalledExactlyOnceWith('gcode.3mf', {
        signal: signalMatcher,
        exportOptions: {
          engine: 'bambu-studio',
          bambuStudio: { printer: x1c, process: standard, filaments: [plaMatte], plate: 'textured-pei' },
        },
      });
    });
    const result = await screen.findByLabelText('Slice result');
    expect(within(result).getByText(`Sliced by Bambu Studio ${bambuStudioVersion}`)).toBeInTheDocument();
    expect(within(result).getByText('Time').nextElementSibling).toHaveTextContent(
      'about 28 min (Bambu Studio estimate)',
    );

    // A Bambu Studio archive is what the real printer takes: the request names its producer.
    await user.click(within(prepareRegion()).getByRole('button', { name: 'Send to Workshop X1C' }));
    const confirmation = screen.getByRole('group', { name: 'Confirm before starting' });
    confirmAll(confirmation);
    await user.click(within(confirmation).getByRole('button', { name: 'Start print on Workshop X1C' }));
    await waitFor(() => {
      expect(fixture.resolvePrintRequest).toHaveBeenCalledOnce();
    });
    expect(fixture.requestPrint.mock.calls.at(0)?.[0].summary).toMatchObject({
      fileName: 'main.gcode.3mf',
      layers: 125,
      estimatedDuration: 1703,
      filamentLength: 3200,
      producer: { name: 'Bambu Studio', version: bambuStudioVersion },
    });
    expect(fixture.requestPrint.mock.calls.at(0)?.[0].configuration).toMatchObject({
      expectedBedType: 'textured-pei',
      expectedMaterials: [{ slot: 0, materialId: 'pla-black' }],
      amsMapping: [0],
    });
  });

  it('marks a changed setting as parameters do, and resets one setting or all of them', async () => {
    const user = userEvent.setup();
    await renderStudio();
    await openGroup(user, 'Strength');
    const settings = screen.getByRole('group', { name: 'Bambu Studio settings' });
    const wallLoops = (): HTMLElement => screen.getByRole('spinbutton', { name: 'Input for Wall Loops' });
    expect(wallLoops()).toHaveValue('2');
    expect(screen.queryByRole('button', { name: 'Reset Wall Loops' })).not.toBeInTheDocument();

    enter('Wall Loops', '3');
    expect(await screen.findByRole('button', { name: 'Reset Wall Loops' })).toBeInTheDocument();
    expect(wallLoops()).toHaveValue('3');
    await expectPreferences({ settings: { wall_loops: 3 } });
    // The pane's own vocabulary is gone: no count, dot, "(changed)" or reset-all of its own.
    expect(within(settings).queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText('(changed)')).not.toBeInTheDocument();
    expect(within(settings).queryByRole('button', { name: 'Reset all' })).not.toBeInTheDocument();
    expect(within(settings).getByRole('button', { name: 'Group: Strength' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More settings' })).toHaveTextContent('More settings');
    await user.click(screen.getByRole('button', { name: 'Reset Wall Loops' }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Reset Wall Loops' })).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(wallLoops()).toHaveValue('2');
    });
    expect(preferencesText()).toBe('{}\n');

    // Enumerations, switches and out-of-range numbers; the Prepare header resets them together.
    // Radix Select captures the pointer, which jsdom does not implement.
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.scrollIntoView = vi.fn();
    await user.click(screen.getByRole('combobox', { name: 'Select for Sparse Infill Pattern' }));
    await user.click(screen.getByRole('option', { name: 'Gyroid' }));
    await openGroup(user, 'Support');
    await user.click(screen.getByRole('switch', { name: 'Toggle for Enable Support' }));
    // Out of range: the field says why, and nothing reaches the print intent.
    enter('Wall Loops', '-1');

    await expectPreferences({
      settings: { enable_support: true, sparse_infill_pattern: 'gyroid' },
    });
    expect(screen.getByRole('button', { name: 'Reset Enable Support' })).toBeInTheDocument();
    await user.click(within(prepareRegion()).getByRole('button', { name: 'Reset print settings' }));
    await expectPreferences({});
    expect(screen.queryByRole('button', { name: 'Reset Enable Support' })).not.toBeInTheDocument();
    expect(within(prepareRegion()).queryByRole('button', { name: 'Reset print settings' })).not.toBeInTheDocument();
  });

  it('slices with only the changed keys, and a setting changed after slicing makes the slice stale', async () => {
    const user = userEvent.setup();
    await renderStudio();
    await openGroup(user, 'Strength');
    const settings = screen.getByRole('group', { name: 'Bambu Studio settings' });

    // The filter opens every group with a match; a number-or-percent setting keeps its percent.
    await user.type(screen.getByRole('searchbox', { name: 'Filter settings' }), 'bridge');
    expect(within(settings).queryByRole('spinbutton', { name: 'Input for Wall Loops' })).not.toBeInTheDocument();
    enter('Bridge Flow', 'lots');
    expect(screen.getByRole('textbox', { name: 'Input for Bridge Flow' })).toHaveValue('1');
    enter('Bridge Flow', '95%');
    await expectPreferences({ settings: { bridge_flow: '95%' } });

    await user.click(within(prepareRegion()).getByRole('button', { name: 'Slice and preview' }));
    await waitFor(() => {
      expect(mockExport).toHaveBeenCalledExactlyOnceWith('gcode.3mf', {
        signal: signalMatcher,
        exportOptions: {
          engine: 'bambu-studio',
          bambuStudio: {
            printer: x1c,
            process: standard,
            filaments: [plaMatte],
            plate: 'textured-pei',
            settings: { bridge_flow: '95%' },
          },
        },
      });
    });
    expect(await within(prepareRegion()).findByRole('button', { name: 'Send to Workshop X1C' })).toBeInTheDocument();

    // A changed setting after slicing makes the slice stale, as a changed option does.
    await user.clear(screen.getByRole('searchbox', { name: 'Filter settings' }));
    await openGroup(user, 'Strength');
    enter('Wall Loops', '4');
    expect(
      await screen.findByText('Options changed since this slice. Slice again to send the current settings.'),
    ).toBeInTheDocument();
    expect(within(prepareRegion()).getByRole('button', { name: 'Send to Workshop X1C' })).toBeDisabled();

    const accessibility = await axe.run(document.body, { rules: { region: { enabled: false } } });
    expect(accessibility.violations).toEqual([]);
  });

  it('blocks sending the previous slice when a new filament choice fails to resolve', async () => {
    const user = userEvent.setup();
    const { studio } = await renderStudio();
    summarizeGcodeContainerMock.mockReturnValueOnce(bambuStudioSliceSummary);
    await user.click(within(prepareRegion()).getByRole('button', { name: 'Slice and preview' }));
    const sendButton = await within(prepareRegion()).findByRole('button', { name: 'Send to Workshop X1C' });
    expect(sendButton).toBeEnabled();

    studio.resolveSelection.mockRejectedValueOnce(new Error('No compatible process for Bambu PETG Basic @BBL X1C.'));
    await chooseOption(user, combobox('Filament A1'), 'Bambu PETG Basic @BBL X1C');
    expect(await screen.findByText('No compatible process for Bambu PETG Basic @BBL X1C.')).toBeInTheDocument();
    expect(within(prepareRegion()).getByRole('button', { name: 'Send to Workshop X1C' })).toBeDisabled();
  });

  describe('with a model of several colours', () => {
    const petg = 'Bambu PETG Basic @BBL X1C';
    /** The real printer with a red and a blue PLA tray and a blue PETG one, colours as the printer reports them. */
    const colourful = (materials?: ReturnType<typeof entry>['snapshot']['setup']['materials']) => {
      const base = realPrinter();
      return {
        ...base,
        snapshot: {
          ...base.snapshot,
          setup: {
            ...base.snapshot.setup,
            materials: materials ?? [
              { slot: 0, state: 'loaded', materialId: 'PLA', profileId: 'GFA01', color: redTray },
              { slot: 1, state: 'loaded', materialId: 'PLA', profileId: 'GFA01', color: blueTray },
              { slot: 2, state: 'loaded', materialId: 'PETG', profileId: 'GFG00', color: blueTray },
            ],
          },
        },
      } satisfies ReturnType<typeof entry>;
    };
    /** Bambu Studio's slice of a blue part (filament 1) and a red one (filament 2). */
    const twoColours = { ...bambuStudioSliceSummary, filamentColors: [blue, red] };
    const slot = (filament: number): HTMLElement => combobox(`Slot for Filament ${String(filament)}`);

    const sliceTwoColours = async (
      user: ReturnType<typeof userEvent.setup>,
      machine: ReturnType<typeof entry>,
    ): Promise<ReturnType<typeof createFixture>> => {
      const { fixture } = await renderStudio(machine);
      summarizeGcodeContainerMock.mockReturnValueOnce(twoColours);
      await user.click(within(prepareRegion()).getByRole('button', { name: 'Slice and preview' }));
      await screen.findByRole('group', { name: 'Filaments' });
      return fixture;
    };

    it('never maps a filament to the external spool, and says why it is not offered', async () => {
      const user = userEvent.setup();
      // oxlint-disable-next-line tau-lint/no-hardcoded-color -- the RGBA a machine reports for a blue spool
      const externalBlue = {
        slot: 254,
        state: 'loaded',
        materialId: 'PLA',
        profileId: 'GFA01',
        color: blueTray,
      } as const;
      await sliceTwoColours(user, colourful([externalBlue, ...colourful().snapshot.setup.materials]));
      // Blue PLA on the external spool, listed first, still loses to the AMS tray that can change filament.
      expect(slot(1)).toHaveTextContent(selectedLabel('1'));
      expect(slot(2)).toHaveTextContent(selectedLabel('0'));
      await user.click(slot(1));
      expect(screen.getAllByRole('option').map(({ textContent }) => textContent.trim())).toEqual([
        'A1 · PLA',
        'A2 · PLA',
        'A3 · PETG',
      ]);
      await user.keyboard('{Escape}');
      expect(
        within(prepareRegion()).getByText('The external spool feeds one-filament prints only.'),
      ).toBeInTheDocument();
    });

    it('maps each filament to a tray of its colour and sends without slicing again when the presets agree', async () => {
      const user = userEvent.setup();
      const fixture = await sliceTwoColours(user, colourful());
      // One row per filament replaces the material chips.
      expect(screen.queryByRole('group', { name: 'Material' })).not.toBeInTheDocument();
      expect(slot(1)).toHaveTextContent(selectedLabel('1'));
      expect(slot(2)).toHaveTextContent(selectedLabel('0'));
      await user.click(slot(1));
      expect(screen.getAllByRole('option').map(({ textContent }) => textContent.trim())).toEqual([
        'A1 · PLA',
        'A2 · PLA',
        'A3 · PETG',
      ]);
      await user.keyboard('{Escape}');
      // Both trays hold Bambu PLA Matte, which the slice already printed both filaments with.
      const send = await within(prepareRegion()).findByRole('button', { name: 'Send to Workshop X1C' });
      await waitFor(() => {
        expect(send).toBeEnabled();
      });
      expect(mockExport).toHaveBeenCalledOnce();
      const accessibility = await axe.run(document.body, { rules: { region: { enabled: false } } });
      expect(accessibility.violations).toEqual([]);

      await user.click(send);
      const confirmation = screen.getByRole('group', { name: 'Confirm before starting' });
      expect(within(confirmation).getByText('PLA is loaded in A2 and A1')).toBeInTheDocument();
      confirmAll(confirmation);
      await user.click(within(confirmation).getByRole('button', { name: 'Start print on Workshop X1C' }));
      await waitFor(() => {
        expect(fixture.resolvePrintRequest).toHaveBeenCalledOnce();
      });
      expect(fixture.requestPrint.mock.calls.at(0)?.[0].configuration).toMatchObject({
        expectedMaterials: [
          { slot: 1, materialId: 'PLA' },
          { slot: 0, materialId: 'PLA' },
        ],
        amsMapping: [1, 0],
      });
    });

    it("slices again when a remap changes a filament's preset, and swaps a slot another filament holds", async () => {
      const user = userEvent.setup();
      await sliceTwoColours(user, colourful());
      await waitFor(() => {
        expect(within(prepareRegion()).getByRole('button', { name: 'Send to Workshop X1C' })).toBeEnabled();
      });

      await chooseOption(user, slot(1), '2');
      expect(
        await screen.findByText('Options changed since this slice. Slice again to send the current settings.'),
      ).toBeInTheDocument();
      expect(within(prepareRegion()).getByRole('button', { name: 'Send to Workshop X1C' })).toBeDisabled();
      // Presets per tray, as Bambu Studio resolves them.
      await waitFor(() => {
        expect(combobox('Filament A3')).toHaveTextContent(selectedLabel(petg));
      });
      summarizeGcodeContainerMock.mockReturnValueOnce(twoColours);
      await user.click(within(prepareRegion()).getByRole('button', { name: 'Slice again' }));
      await waitFor(() => {
        expect(mockExport).toHaveBeenLastCalledWith('gcode.3mf', {
          signal: signalMatcher,
          exportOptions: {
            engine: 'bambu-studio',
            // In filament order: filament 1 from A3, filament 2 from A1.
            bambuStudio: { printer: x1c, process: standard, filaments: [petg, plaMatte], plate: 'textured-pei' },
          },
        });
      });

      // A1 is filament 2's, so filament 2 takes A3 in exchange.
      await chooseOption(user, slot(1), '0');
      expect(slot(1)).toHaveTextContent(selectedLabel('0'));
      expect(slot(2)).toHaveTextContent(selectedLabel('2'));
    });

    it('holds Send until a filament no free tray could take has a slot', async () => {
      const user = userEvent.setup();
      await sliceTwoColours(
        user,
        colourful([
          { slot: 0, state: 'loaded', materialId: 'PLA', profileId: 'GFA01', color: redTray },
          { slot: 1, state: 'empty' },
        ]),
      );
      expect(slot(1)).toHaveTextContent(selectedLabel(''));
      expect(slot(2)).toHaveTextContent(selectedLabel('0'));
      expect(
        await within(prepareRegion()).findByText('Filament 1 has no slot. Choose a loaded slot for it before sending.'),
      ).toBeInTheDocument();
      expect(within(prepareRegion()).getByRole('button', { name: 'Send to Workshop X1C' })).toBeDisabled();
    });
  });

  it('sends a slice too large to preview, saying why there is no preview or plate check', async () => {
    const user = userEvent.setup();
    await renderStudio();
    const refusal = 'This G-code is too large to preview. The printer can still print it as it is.';
    summarizeGcodeContainerMock.mockReturnValueOnce({
      ...bambuStudioSliceSummary,
      bounds: undefined,
      partBounds: undefined,
      previewRefusal: refusal,
    });
    await user.click(within(prepareRegion()).getByRole('button', { name: 'Slice and preview' }));
    const result = await screen.findByLabelText('Slice result');
    expect(within(result).getByRole('status')).toHaveTextContent(refusal);
    expect(within(result).queryByText('Toolpath')).not.toBeInTheDocument();
    expect(within(result).queryByText(/fits the plate/u)).not.toBeInTheDocument();
    expect(within(prepareRegion()).getByRole('button', { name: 'Send to Workshop X1C' })).toBeEnabled();
  });

  it('shows what the slicer warned about a slice it still made', async () => {
    const user = userEvent.setup();
    await renderStudio();
    summarizeGcodeContainerMock.mockReturnValueOnce(bambuStudioSliceSummary);
    const merged = `The printer loads at most 4 filaments, so the model's 5 colours print as one, in ${red}.`;
    mockExport.mockResolvedValueOnce({
      success: true,
      data: [{ name: 'main.gcode.3mf', bytes: new Uint8Array([1]), mimeType: 'application/vnd.bambulab.gcode-3mf' }],
      issues: [{ message: merged, code: 'REPRESENTATION_UNSUPPORTED', severity: 'warning' }],
    });
    await user.click(within(prepareRegion()).getByRole('button', { name: 'Slice and preview' }));
    const result = await screen.findByLabelText('Slice result');
    expect(within(result).getByText(merged)).toBeInTheDocument();
    // One colour prints as the material chips choose it.
    expect(screen.getByRole('group', { name: 'Material' })).toBeInTheDocument();
  });

  /**
   * The 20 mm cube Bambu Studio sliced for the X1C on 2026-09-26: the printer's start routine travels to Y −3 and
   * purges at Y 265, so every nozzle move spans 240 × 268 × 121.5 mm around a centred 19.6 × 19.6 × 20 mm part.
   */
  const cubeOnX1c: SliceSummary = {
    ...bambuStudioSliceSummary,
    bounds: { min: [8, -3, 0], max: [248, 265, 121.5] },
    partBounds: { min: [118.2, 118.2, 0], max: [137.8, 137.8, 20] },
  };

  it('should send an archive whose start routine leaves the plate while the part stands on it', async () => {
    const user = userEvent.setup();
    await renderStudio();
    summarizeGcodeContainerMock.mockReturnValueOnce(cubeOnX1c);
    await user.click(within(prepareRegion()).getByRole('button', { name: 'Slice and preview' }));

    const result = await screen.findByLabelText('Slice result');
    expect(within(result).getByText('Part').nextElementSibling).toHaveTextContent('19.6 × 19.6 × 20 mm');
    expect(within(result).getByText('Toolpath').nextElementSibling).toHaveTextContent(
      "240 × 268 × 121.5 mm · every nozzle move, including the printer's start routine",
    );
    expect(within(result).getByText('The part fits the plate')).toBeInTheDocument();
    expect(within(result).queryByRole('alert')).not.toBeInTheDocument();
    const send = within(prepareRegion()).getByRole('button', { name: 'Send to Workshop X1C' });
    expect(send).toBeEnabled();
    expect(send).not.toHaveAccessibleDescription();
  });

  it('should hold Send with a part-worded reason when the part itself leaves the plate', async () => {
    const user = userEvent.setup();
    await renderStudio();
    summarizeGcodeContainerMock.mockReturnValueOnce({
      ...cubeOnX1c,
      partBounds: { min: [240.4, 118.2, 0], max: [260, 137.8, 20] },
    });
    await user.click(within(prepareRegion()).getByRole('button', { name: 'Slice and preview' }));

    const reason = 'The part does not fit the plate: 260 mm is larger than the 256 mm plate on X.';
    const send = await within(prepareRegion()).findByRole('button', { name: 'Send to Workshop X1C' });
    expect(send).toBeDisabled();
    expect(send).toHaveAccessibleDescription(reason);
    expect(within(screen.getByLabelText('Slice result')).getByRole('alert')).toHaveTextContent(reason);
  });

  it('reloads the settings for another process or filament and drops overrides the new presets lack', async () => {
    const user = userEvent.setup();
    const { studio } = await renderStudio();
    await openGroup(user, 'Quality');
    enter('Ironing Speed', '40');
    enter('Layer Height', '0.16');

    await expectPreferences({
      settings: { ironing_speed: 40, layer_height: 0.16 },
    });

    // Fine is one Process choice; it has no ironing, so that override goes.
    await chooseOption(user, combobox('Process'), '0.12mm Fine @BBL X1C');
    await waitFor(() => {
      expect(combobox('Process')).toHaveTextContent(selectedLabel('0.12mm Fine @BBL X1C'));
    });
    expect(studio.settings).toHaveBeenLastCalledWith({
      printer: x1c,
      process: '0.12mm Fine @BBL X1C',
      filaments: [plaMatte],
    });
    expect(
      await screen.findByText('1 changed setting does not exist in these presets and was dropped.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset Layer Height' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Input for Layer Height' })).toHaveValue('0.16');
    await waitFor(() => {
      expect(screen.queryByRole('spinbutton', { name: 'Input for Ironing Speed' })).not.toBeInTheDocument();
    });
    // Fine lacks ironing, so the slice leaves it out; the project's file keeps it for presets that have it.
    await expectPreferences({
      process: '0.12mm Fine @BBL X1C',
      settings: { ironing_speed: 40, layer_height: 0.16 },
    });
    expect(combobox('Process')).toHaveTextContent('0.12mm Fine');

    // Picking a process by name keeps the person's choice through the next resolution.
    await chooseOption(user, combobox('Process'), '0.20mm Standard Gyroid PETG @BBL X1C');
    await waitFor(() => {
      expect(studio.resolveSelection).toHaveBeenLastCalledWith({
        hints,
        partial: { process: '0.20mm Standard Gyroid PETG @BBL X1C', plate: 'textured-pei' },
      });
    });

    await chooseOption(user, combobox('Filament A1'), 'Bambu PETG Basic @BBL X1C');
    await waitFor(() => {
      expect(studio.settings).toHaveBeenLastCalledWith({
        printer: x1c,
        process: '0.20mm Standard Gyroid PETG @BBL X1C',
        filaments: ['Bambu PETG Basic @BBL X1C'],
      });
    });
    await openGroup(user, 'Filament · Temperatures');
    await waitFor(() => {
      expect(screen.getByRole('spinbutton', { name: 'Input for Nozzle Temperature' })).toHaveValue('255');
    });
  });

  it('asks the real printer for a Bambu Studio slice when Bambu Studio is unavailable, and keeps the simulator sendable', async () => {
    const user = userEvent.setup();
    const unavailable = createBambuStudio(false);
    desktopHost.bambuStudio = unavailable;
    const fixture = createFixture({ entries: [realPrinter()] });
    const { unmount } = renderPane(fixture.client);
    await screen.findByRole('article', { name: 'Workshop X1C, Ready' });
    expect(await within(prepareRegion()).findByText(bambuStudioRequired)).toBeInTheDocument();
    expect(unavailable.catalog).not.toHaveBeenCalled();

    // The reference engine still slices and previews; only Send waits.
    await user.click(within(prepareRegion()).getByRole('button', { name: 'Slice and preview' }));
    await waitFor(() => {
      expect(mockExport).toHaveBeenCalledExactlyOnceWith('gcode.3mf', {
        signal: signalMatcher,
        exportOptions: machineSliceOptions,
      });
    });
    const send = await within(prepareRegion()).findByRole('button', { name: 'Send to Workshop X1C' });
    expect(send).toBeDisabled();
    expect(send).toHaveAccessibleDescription(bambuStudioRequired);
    unmount();

    // The web build has no bridge; the simulator takes the reference slice.
    desktopHost.bambuStudio = undefined;
    renderPane(createFixture().client);
    expect(
      await screen.findByText("Slicing with Tau's reference slicer: Bambu Studio is not available here."),
    ).toBeInTheDocument();
    await user.click(within(prepareRegion()).getByRole('button', { name: 'Slice and preview' }));
    expect(await within(prepareRegion()).findByRole('button', { name: 'Send to Workshop X1C' })).toBeEnabled();
  });

  it("names the slicer on an agent's request and states a producer refusal plainly", async () => {
    const fixture = createFixture({
      requests: [
        agentRequest({
          summary: {
            fileName: 'pyramid.gcode.3mf',
            layers: 125,
            estimatedDuration: 2520,
            producer: { name: 'Bambu Studio', version: bambuStudioVersion },
          },
        }),
      ],
    });
    const rendered = renderPane(fixture.client);
    const region = await screen.findByRole('region', { name: requestRegionName });
    expect(within(region).getByText(`Sliced by Bambu Studio ${bambuStudioVersion}`)).toBeInTheDocument();
    rendered.unmount();

    const refused = createFixture({
      requests: [
        agentRequest({
          state: 'failed',
          failure: { code: 'ARTIFACT_UNQUALIFIED', message: 'This file was not sliced by Bambu Studio.' },
        }),
      ],
    });
    renderPane(refused.client);
    expect(await screen.findByText(bambuStudioRequired)).toBeInTheDocument();
    expect(screen.queryByText('This file was not sliced by Bambu Studio.')).not.toBeInTheDocument();
  });

  it("should keep the printer's reason and say how to allow the start when it refuses an unsigned command", async () => {
    const reason = 'mqtt message verify failed';
    const refused = createFixture({
      entries: [realPrinter()],
      requests: [
        agentRequest({
          state: 'rejected',
          startOperationId: 'operation-start-1',
          receipt: {
            operationId: 'operation-start-1',
            machineId: 'machine-1',
            kind: 'start',
            status: 'rejected',
            code: 'PROVIDER_REJECTED',
            message: reason,
            observedAt: timestamp,
          },
          failure: { code: 'PROVIDER_REJECTED', message: reason },
        }),
      ],
    });
    renderPane(refused.client);

    const send = await screen.findByRole('region', { name: 'Send' });
    const failure = within(send).getByRole('alert');
    expect(failure).toHaveTextContent('The printer rejected the start (PROVIDER_REJECTED)');
    expect(failure).toHaveTextContent(`${reason}. ${developerModeRequired}`);
  });
});

describe('Print pane print settings file', () => {
  const x1c = 'Bambu Lab X1 Carbon 0.4 nozzle';
  const fine = '0.12mm Fine @BBL X1C';
  const gyroid = '0.20mm Standard Gyroid PETG @BBL X1C';
  const petg = 'Bambu PETG Basic @BBL X1C';
  const combobox = (name: string): HTMLElement => {
    if (name === 'Printer preset' && screen.queryByRole('combobox', { name }) === null) {
      fireEvent.click(screen.getByRole('button', { name: 'More settings' }));
    }
    return screen.getByRole('combobox', { name });
  };
  const reset = (name: string): HTMLElement => screen.getByRole('button', { name: `Reset ${name}` });
  const queryReset = (name: string) => screen.queryByRole('button', { name: `Reset ${name}` });

  /** The real printer with Bambu Studio installed, once its presets have resolved to `process`. */
  const renderStudio = async (process: string): Promise<ReturnType<typeof createBambuStudio>> => {
    const studio = createBambuStudio();
    desktopHost.bambuStudio = studio;
    renderPane(createFixture({ entries: [entry({ providerId: 'bambu' })] }).client);
    expect(await screen.findByText(`Slicing with Bambu Studio ${bambuStudioVersion}`)).toBeInTheDocument();
    await waitFor(() => {
      expect(combobox('Process')).toHaveTextContent(selectedLabel(process));
    });
    return studio;
  };

  it('should start from the project print settings when they name this printer model', async () => {
    const user = userEvent.setup();
    projectFiles.write(
      settingsPath,
      preferencesBytes({
        preset: 'fine',
        filaments: { 0: petg },
        plate: 'cool',
        settings: { wall_loops: 3 },
      }),
    );
    const studio = await renderStudio(fine);

    expect(studio.resolveSelection).toHaveBeenLastCalledWith({
      hints: {
        model: 'X1C',
        nozzleDiameter: 0.4,
        preset: 'fine',
        plate: 'cool',
        materials: [{ slot: 0, materialId: 'pla-black', profileId: 'GFA01' }],
      },
      partial: { filaments: [petg], plate: 'cool' },
    });
    expect(combobox('Filament A1')).toHaveTextContent(selectedLabel(petg));
    expect(combobox('Plate')).toHaveTextContent(selectedLabel('cool'));
    expect(combobox('Process')).toHaveTextContent('0.12mm Fine');
    // Marks follow the keys in the file: the picks it names, and nothing Bambu Studio resolved on its own.
    for (const name of ['Process', 'Plate', 'Filament A1', 'print settings']) {
      expect(reset(name)).toBeInTheDocument();
    }
    expect(queryReset('Printer preset')).not.toBeInTheDocument();
    await openMoreSettings(user);
    await user.click(
      within(await screen.findByRole('group', { name: 'Bambu Studio settings' })).getByRole('button', {
        name: 'Group: Strength',
      }),
    );
    expect(screen.getByRole('spinbutton', { name: 'Input for Wall Loops' })).toHaveValue('3');
    expect(reset('Wall Loops')).toBeInTheDocument();

    summarizeGcodeContainerMock.mockReturnValueOnce(bambuStudioSliceSummary);
    await user.click(within(prepareRegion()).getByRole('button', { name: 'Slice and preview' }));
    await waitFor(() => {
      expect(mockExport).toHaveBeenCalledExactlyOnceWith('gcode.3mf', {
        signal: signalMatcher,
        exportOptions: {
          engine: 'bambu-studio',
          bambuStudio: {
            printer: x1c,
            process: fine,
            filaments: [petg],
            plate: 'cool',
            settings: { wall_loops: 3 },
          },
        },
      });
    });
  });

  it('should mark each choice once the file holds it and reset exactly that key', async () => {
    const user = userEvent.setup();
    await renderStudio('0.20mm Standard @BBL X1C');
    expect(preferencesText()).toBeUndefined();
    for (const name of ['Plate', 'Printer preset', 'Process', 'Filament A1']) {
      expect(queryReset(name)).not.toBeInTheDocument();
    }
    expect(queryReset('print settings')).not.toBeInTheDocument();

    await chooseOption(user, combobox('Process'), fine);
    await waitFor(() => {
      expect(combobox('Process')).toHaveTextContent(selectedLabel(fine));
    });
    await chooseOption(user, combobox('Process'), gyroid);
    await chooseOption(user, combobox('Filament A1'), petg);
    await chooseOption(user, combobox('Plate'), 'Cool plate');
    await waitFor(() => {
      expect(reset('Plate')).toBeInTheDocument();
    });
    // Only the changed keys, sorted, two-space indented, with a trailing newline.
    expect(preferencesText()).toBe(
      [
        '{',
        '  "filaments": {',
        `    "0": "${petg}"`,
        '  },',
        '  "plate": "cool",',
        `  "process": "${gyroid}"`,
        '}',
        '',
      ].join('\n'),
    );
    for (const name of ['Process', 'Filament A1', 'print settings']) {
      expect(reset(name)).toBeInTheDocument();
    }
    expect(within(prepareRegion()).getByText('Plate').parentElement).toHaveClass('font-medium', 'text-foreground');

    await user.click(reset('Process'));
    await expectPreferences({ plate: 'cool', filaments: { 0: petg } });
    await user.click(reset('Filament A1'));
    await expectPreferences({ plate: 'cool' });
    await user.click(reset('Plate'));
    await expectPreferences({});
    expect(combobox('Plate')).toHaveTextContent(selectedLabel('textured-pei'));
    expect(queryReset('print settings')).not.toBeInTheDocument();

    // Another printer preset has its own processes and filaments, so choosing one clears those picks.
    await chooseOption(user, combobox('Process'), gyroid);
    await chooseOption(user, combobox('Filament A1'), petg);
    await expectPreferences({ process: gyroid, filaments: { 0: petg } });
    await chooseOption(user, combobox('Printer preset'), 'My X1C');
    await expectPreferences({ printer: 'My X1C' });
    await user.click(reset('Printer preset'));
    await expectPreferences({});

    // Reset print settings, beside the Prepare heading, leaves only the printer model.
    await chooseOption(user, combobox('Plate'), 'Cool plate');
    await chooseOption(user, combobox('Process'), '0.28mm Extra Draft @BBL X1C');
    await expectPreferences({
      plate: 'cool',
      process: '0.28mm Extra Draft @BBL X1C',
    });
    await user.click(within(prepareRegion()).getByRole('button', { name: 'Reset print settings' }));
    await waitFor(() => {
      expect(preferencesText()).toBe('{}\n');
    });
    expect(queryReset('Plate')).not.toBeInTheDocument();
  });

  it("should save the slicer's options but keep the machine's own on screen, and reset one option alone", async () => {
    const user = userEvent.setup();
    renderPane(createFixture().client);
    await screen.findByRole('article', { name: 'Workshop X1C, Ready' });
    await openMoreSettings(user);
    const options = await screen.findByLabelText('Slicer options');

    await user.click(await within(options).findByRole('button', { name: 'Set layer height' }));
    await expectPreferences({ options: { layerHeight: 0.16 } });
    await user.click(within(options).getByRole('button', { name: 'Set nozzle diameter' }));
    await waitFor(() => {
      expect(within(options).getByTestId('parameters')).toHaveTextContent('{"nozzleDiameter":0.6,"layerHeight":0.16}');
    });
    // The nozzle belongs to the machine, never to the project's file, so no save was even tried.
    expect(JSON.parse(preferencesText() ?? 'null')).toEqual({
      options: { layerHeight: 0.16 },
    });
    expect(projectFiles.writes).toHaveLength(1);
    expect(within(prepareRegion()).queryByRole('alert')).not.toBeInTheDocument();

    await user.click(within(prepareRegion()).getByRole('button', { name: 'Slice and preview' }));
    await waitFor(() => {
      expect(mockExport).toHaveBeenCalledExactlyOnceWith('gcode.3mf', {
        signal: signalMatcher,
        exportOptions: { ...machineSliceOptions, nozzleDiameter: 0.6, layerHeight: 0.16 },
      });
    });

    await user.click(within(options).getByRole('button', { name: 'Reset layer height' }));
    await expectPreferences({});
    expect(within(options).getByTestId('parameters')).toHaveTextContent('{"nozzleDiameter":0.6}');
  });

  it('should preserve malformed and future records, blocking preparation and management', async () => {
    const unreadable = '{"version":2,"typeId":"bambu.x1c"}';
    projectFiles.write(settingsPath, unreadable);
    renderPane(createFixture().client);
    await screen.findByRole('article', { name: 'Workshop X1C, Ready' });

    expect(await within(prepareRegion()).findByRole('alert')).toHaveTextContent(/newer|unsupported/iu);
    expect(within(prepareRegion()).getByRole('combobox', { name: 'Profile' })).toBeDisabled();
    expect(
      within(prepareRegion()).getByRole('button', {
        name: 'Slice and preview',
      }),
    ).toBeDisabled();
    expect(projectFiles.read(settingsPath)).toBe(unreadable);
    expect(projectFiles.writes).toHaveLength(0);
  });

  it('should preserve another type while saving this type without a reset notice', async () => {
    const otherPath = machineSettingsPath({ typeId: 'bambu.a1-mini' });
    const other = serializeMachineSettings({
      record: preferencesRecord({ preset: 'fast' }, 'bambu.a1-mini'),
    });
    projectFiles.write(otherPath, other);
    const user = userEvent.setup();
    renderPane(createFixture().client);
    await screen.findByRole('article', { name: 'Workshop X1C, Ready' });

    await user.click(within(screen.getByRole('radiogroup', { name: 'Quality' })).getByRole('radio', { name: /Fine/u }));
    await expectPreferences({ preset: 'fine' });
    expect(projectFiles.read(otherPath)).toBe(other);
    expect(within(prepareRegion()).queryByText(/another printer model/u)).not.toBeInTheDocument();
  });

  it('should rebase a disjoint external edit and refuse a concurrent change to the same preference', async () => {
    const user = userEvent.setup();
    renderPane(createFixture().client);
    await screen.findByRole('article', { name: 'Workshop X1C, Ready' });
    const presets = screen.getByRole('radiogroup', { name: 'Quality' });
    // First create the profile so subsequent conflicts refer to its captured fields.
    await user.click(within(presets).getByRole('radio', { name: /Standard/u }));
    await expectPreferences({ preset: 'standard' });
    projectFiles.race(preferencesBytes({ plate: 'cool', preset: 'standard' }));
    await user.click(within(presets).getByRole('radio', { name: /Fine/u }));
    await expectPreferences({ plate: 'cool', preset: 'fine' });
    projectFiles.race(preferencesBytes({ plate: 'cool', preset: 'standard' }));
    await user.click(within(presets).getByRole('radio', { name: /Fast/u }));
    expect(await within(prepareRegion()).findByRole('alert')).toHaveTextContent(/changed|conflict/iu);
    await user.click(
      within(prepareRegion()).getByRole('button', {
        name: 'Use latest saved settings',
      }),
    );
    await expectPreferences({ plate: 'cool', preset: 'standard' });
  });
});

describe('Saved machine profiles', () => {
  it('should copy, rename, switch, reset, delete and restore profiles across same-type machines and pane reloads', async () => {
    const user = userEvent.setup();
    const first = entry();
    const second = entry({ machineId: 'second-x1c', name: 'Second X1C' });
    const fixture = createFixture({ entries: [first, second] });
    globalThis.localStorage.setItem(`tau:print:selected-machine:${projectId}`, first.machineId);
    const pane = renderPane(fixture.client);
    await screen.findByRole('article', { name: 'Workshop X1C, Ready' });
    const profile = () => within(prepareRegion()).getByRole('combobox', { name: 'Profile' });
    await waitFor(() => {
      expect(profile()).toBeEnabled();
    });
    expect(projectFiles.read(settingsPath)).toBeUndefined();
    await user.click(within(screen.getByRole('radiogroup', { name: 'Quality' })).getByRole('radio', { name: /Fine/u }));
    await expectPreferences({ preset: 'fine' });
    await user.click(screen.getByRole('button', { name: 'Manage profiles' }));
    await user.clear(screen.getByRole('textbox', { name: 'Profile name' }));
    await user.type(screen.getByRole('textbox', { name: 'Profile name' }), 'Production');
    await user.click(screen.getByRole('button', { name: 'Save a copy' }));
    await waitFor(() => {
      expect(profile()).toHaveTextContent('Production');
    });
    await user.click(within(screen.getByRole('radiogroup', { name: 'Quality' })).getByRole('radio', { name: /Fast/u }));
    await expectPreferences({ preset: 'fast' });
    await chooseOption(user, screen.getByRole('combobox', { name: 'Machine' }), 'Second X1C');
    await waitFor(() => {
      expect(profile()).toHaveTextContent('Production');
    });
    await expectPreferences({ preset: 'fast' });
    await chooseOption(user, profile(), 'Default');
    await expectPreferences({ preset: 'fine' });
    await chooseOption(user, profile(), 'Production');
    await user.click(screen.getByRole('button', { name: 'Manage profiles' }));
    await user.clear(screen.getByRole('textbox', { name: 'Profile name' }));
    await user.type(screen.getByRole('textbox', { name: 'Profile name' }), 'Batch');
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    await waitFor(() => {
      expect(profile()).toHaveTextContent('Batch');
    });
    await waitFor(() => {
      expect(projectFiles.read(settingsPath)).toContain('Batch');
    });
    await user.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    await user.click(screen.getByRole('button', { name: 'Confirm reset' }));
    await expectPreferences({});
    await user.click(screen.getByRole('button', { name: 'Delete profile' }));
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }));
    await waitFor(() => {
      expect(profile()).toHaveTextContent('Default');
    });
    await expectPreferences({ preset: 'fine' });
    pane.unmount();
    renderPane(fixture.client);
    await waitFor(() => {
      expect(profile()).toHaveTextContent('Default');
    });
    await expectPreferences({ preset: 'fine' });
    const savedFile = readMachineSettings({
      bytes: new TextEncoder().encode(projectFiles.read(settingsPath)),
      typeId: 'bambu.x1c',
    });
    if (savedFile.status !== 'current') {
      throw new Error('Expected saved profiles');
    }
    const saved = savedFile.record;
    expect(saved).toMatchObject({
      version: 1,
      typeId: 'bambu.x1c',
      activeProfile: 'default',
    });
    expect(saved.profiles).not.toHaveProperty('production');
  });

  it('should switch types independently and validate each destination while retaining profile preferences', async () => {
    const user = userEvent.setup();
    const first = entry();
    const mini = entry({
      machineId: 'mini',
      name: 'Mini',
      providerId: 'mini-provider',
    });
    const fixture = createFixture({ entries: [first, mini] });
    const client: MachineClient = {
      ...fixture.client,
      listProviders: async () => [
        provider,
        { ...provider, id: 'bambu-simulator' },
        {
          ...provider,
          id: 'mini-provider',
          manifest: {
            ...manifest,
            identity: { ...manifest.identity, typeId: 'bambu.a1-mini' },
          },
        },
      ],
    };
    globalThis.localStorage.setItem(`tau:print:selected-machine:${projectId}`, first.machineId);
    renderPane(client);
    await screen.findByRole('article', { name: 'Workshop X1C, Ready' });
    await user.click(within(screen.getByRole('radiogroup', { name: 'Quality' })).getByRole('radio', { name: /Fine/u }));
    await expectPreferences({ preset: 'fine' });
    await chooseOption(user, screen.getByRole('combobox', { name: 'Machine' }), 'Mini');
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Profile' })).toBeEnabled();
    });
    await user.click(within(screen.getByRole('radiogroup', { name: 'Quality' })).getByRole('radio', { name: /Fast/u }));
    const miniPath = machineSettingsPath({ typeId: 'bambu.a1-mini' });
    await waitFor(() => {
      expect(
        JSON.parse(projectFiles.read(miniPath)!).profiles.default.configurations[slicingPreferences.manifest.source.id]
          .values.preset,
      ).toBe('fast');
    });
    await chooseOption(user, screen.getByRole('combobox', { name: 'Machine' }), 'Workshop X1C');
    await waitFor(() => {
      expect(
        within(screen.getByRole('radiogroup', { name: 'Quality' })).getByRole('radio', { name: /Fine/u }),
      ).toHaveAttribute('aria-checked', 'true');
    });
    await expectPreferences({ preset: 'fine' });
    expect(within(prepareRegion()).queryByText(/another printer model/u)).not.toBeInTheDocument();
  });
});

describe('Print pane artifacts and history', () => {
  /** Another project's `tau.json` id. */
  const otherProjectId = 'proj_000000000000000000002';

  it('writes a slice once under its digest, replacing only a file that does not hold it', async () => {
    projectFiles.write(slicePath, 'not the slice');
    const user = userEvent.setup();
    renderPane(createFixture().client);
    expect(await screen.findByRole('article', { name: 'Workshop X1C, Ready' })).toBeInTheDocument();
    const slice = within(prepareRegion()).getByRole('button', { name: 'Slice and preview' });

    await user.click(slice);
    await waitFor(() => {
      expect(slice).toHaveTextContent('Slice again');
    });
    expect(mockWriteFiles).toHaveBeenCalledOnce();
    expect(projectFiles.read(slicePath)).toBe('PK\u0003\u0004');

    // The same bytes again: the file already holds them, so nothing is written.
    await user.click(slice);
    await waitFor(() => {
      expect(mockExport).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(slice).toHaveTextContent('Slice again');
    });
    expect(mockWriteFiles).toHaveBeenCalledOnce();
  });

  it("lists only this project's requests, as the host filters them by the project their artifacts name", async () => {
    const user = userEvent.setup();
    const { summary } = agentRequest();
    const ours = agentRequest({
      requestId: 'request-ours',
      state: 'denied',
      summary: { ...summary, fileName: 'ours.gcode.3mf' },
    });
    const theirs = agentRequest({
      requestId: 'request-theirs',
      state: 'denied',
      artifact: { ...artifact, projectId: otherProjectId },
      summary: { ...summary, fileName: 'theirs.gcode.3mf' },
    });
    renderPane(createFixture({ requests: [ours, theirs] }).client);

    await user.click(await screen.findByRole('button', { name: /^Activity/u }));

    const list = screen.getByRole('list', { name: 'Print requests' });
    expect(within(list).getByText('ours.gcode.3mf')).toBeInTheDocument();
    expect(within(list).queryByText('theirs.gcode.3mf')).not.toBeInTheDocument();
  });

  it("offers no preview of another project's request, whose file is not in this project", async () => {
    const theirs = agentRequest({ artifact: { ...artifact, projectId: otherProjectId } });
    const { client } = createFixture();
    // A host that answers every project's requests, as one that predates the filter does.
    renderPane({ ...client, listPrintRequests: async () => [theirs] });

    const region = await screen.findByRole('region', { name: requestRegionName });
    expect(within(region).getByText('From another project')).toBeInTheDocument();
    expect(within(region).queryByRole('button', { name: 'Open printer preview' })).not.toBeInTheDocument();
  });
});

describe('Print pane without printers', () => {
  it('sends the person to Settings › Machines to set one up, instead of asking for binding fields', async () => {
    const fixture = createFixture({ entries: [] });
    function Location(): React.JSX.Element {
      return <output aria-label='location'>{useLocation().search}</output>;
    }
    render(
      <MemoryRouter initialEntries={['/w/workspace/project']}>
        <TooltipProvider>
          <PrintPanel machines={{ available: true, ...fixture.client }} bridge={createBridge().bridge} />
        </TooltipProvider>
        <Location />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'No printers yet' })).toBeInTheDocument();
    /* Printers belong to the computer, so the pane never speaks of this project's printers. */
    expect(
      screen.getByText(
        'Find a Bambu Lab printer on your network or add the simulated X1C in Settings. Printers set up there are available in every project on this computer.',
      ),
    ).toBeInTheDocument();
    /* Discovery and the access-code ceremony live in settings; the pane offers no binding form of its own. */
    expect(screen.queryByRole('button', { name: 'Discover' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Logical Id/u)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Set up a printer' }));

    expect(screen.getByRole('status', { name: 'location' })).toHaveTextContent('?settings=machines');
  });
});
