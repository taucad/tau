/* eslint-disable @typescript-eslint/naming-convention -- Fixtures retain Bambu Studio wire setting names. */
// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import axe from 'axe-core';
import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import type { BoundFunctions, queries } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fffProcessOf } from '@taucad/runtime/machine';
import type { MachineClient, MachineDirectoryEntry, MaterialSlotSnapshot } from '@taucad/runtime/machine';
import { machineSettingsPath, serializeMachineSettings, readMachineSettings } from '@taucad/runtime/machine/settings';
import type { MachineSettingsRecord, MachineSettingsValue } from '@taucad/types';
import { slicingPreferences } from '@taucad/slicer/preferences';
import { bambuSettingsConfiguration } from '@taucad/bambu/settings';
import { writeBambuContainer } from '@taucad/slicer/container';
import { ToolpathParseError, parseGcode } from '@taucad/slicer/toolpath';
import type * as Toolpath from '@taucad/slicer/toolpath';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { projectFiles } from '#components/print/testing/project-files.js';
import {
  bambuPreferencesOf,
  bambuSubmissionSlots,
  chosenBambuFilament,
  savedBambuSlots,
  withBambuSubmissionSlots,
} from '#components/print/use-bambu-studio.js';
import { pendingMachineActionOf } from '#components/print/machine-action-approval.js';
import { useMachineSettings } from '#components/print/use-machine-settings.js';
import {
  bambuContainer,
  fffSlots,
  machineEntry,
  machineSnapshot,
  carveraManifest,
  millingComponents,
  routerManifest,
  x1cManifest,
} from '#components/print/testing/machines.fixture.js';
import { bambuA1MiniManifest, bambuX1cManifest } from '@taucad/bambu';
import { fixtureGcode } from '#components/printer/testing/toolpath-fixture.js';
import type { MachineApprovalBridge } from '#hooks/use-machines-approvals.js';
import type { MachineControl } from '#hooks/use-machine-control.js';
import { summarizeGcodeContainer } from '#components/printer/printer-summary.js';
import type { SliceSummary } from '#components/printer/printer-summary.js';
import type * as PrintSummary from '#routes/w.$workspace.$project/chat-print-summary.js';
import {
  agentJob,
  artifact,
  bambuStudioSliceSummary,
  bambuStudioVersion,
  baseSliceSummary,
  createBambuStudio,
  createBridge,
  createFixture,
  desktopHost,
  emptySlot,
  entry,
  failedCadSnapshot,
  loadedSlot,
  withSlots,
  gcodeRoute,
  later,
  mockEditorSend,
  mockProjectSend,
  mockExport,
  mockWriteFiles,
  printing,
  printingRun,
  projectId,
  provider,
  renderGeometry,
  setRestoredPrintEntryPath,
  settledCadSnapshot,
  simulatorProvider,
  sliceFixture,
  summarizeGcodeContainerMock,
  timestamp,
} from '#routes/w.$workspace.$project/chat-print.fixture.js';
import { submissionDefaults } from '#routes/w.$workspace.$project/chat-print-prepare.js';
import { programExtensions } from '#routes/w.$workspace.$project/chat-print-program.js';
import { startBlocker } from '#routes/w.$workspace.$project/chat-print-send.js';
import {
  PrintPanel,
  hasSomethingToStop,
  nextAction,
  presentMachine,
} from '#routes/w.$workspace.$project/chat-print.js';
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

const renderPane = (client: MachineClient, bridge: MachineApprovalBridge = createBridge().bridge) =>
  render(
    <TooltipProvider>
      <PrintPanel machines={{ available: true, ...client }} bridge={bridge} />
    </TooltipProvider>,
  );

/**
 * What the fixture X1C fixes under every slice: its observed plate, nozzle, filament, the material of the tray the
 * print feeds from (recorded so the printer's filament check can read it) and recommended temperatures.
 */
const machineSliceOptions = {
  plate: 'textured-pei',
  nozzleDiameter: 0.4,
  filamentDiameter: 1.75,
  filamentType: 'PLA',
  nozzleTemperature: 220,
  bedTemperature: 55,
};

/* Lane M's two-colour slice records a red part (filament 1) and a blue one. */
// oxlint-disable-next-line tau-lint/no-hardcoded-color -- the colours Bambu Studio records for the model
const [red, blue] = ['#FF0000', '#0000FF'] as const;
// oxlint-disable-next-line tau-lint/no-hardcoded-color -- the RGBA a machine reports for a red and a blue spool
const [redTray, blueTray] = ['#FF0000FF', '#0000FFFF'] as const;

/**
 * The header's Machine select is the pane's only machine heading: it names the chosen printer and its status.
 *
 * @param status - The status label the select shows beside the name.
 * @param name - The printer's name.
 * @returns The select.
 */
const findMachine = async (status: string, name = 'Workshop X1C'): Promise<HTMLElement> => {
  await waitFor(() => {
    expect(screen.getByRole('combobox', { name: 'Machine' })).toHaveTextContent(`${name}${status}`);
  });
  return screen.getByRole('combobox', { name: 'Machine' });
};

/** Open a folded disclosure by its trigger, whose name starts with the title and continues with its summary. */
const openDisclosure = (name: RegExp): HTMLElement => {
  const trigger = screen.getByRole('button', { name });
  if (trigger.getAttribute('aria-expanded') !== 'true') {
    fireEvent.click(trigger);
  }
  return trigger;
};

/** Prepare's stage, opened: during a run or an open request it starts closed and ends with its own actions. */
const prepareRegion = (): HTMLElement => {
  const region = screen.getByRole('region', { name: 'Prepare' });
  const trigger = within(region).getByRole('button', { name: /^Prepare/u });
  if (trigger.getAttribute('aria-expanded') !== 'true') {
    fireEvent.click(trigger);
  }
  return region;
};

/** Where Prepare's one primary action (slice or send) sits: the pane's action bar, or the end of Prepare. */
const prepareActions = (): BoundFunctions<typeof queries> => {
  const bar = document.querySelector<HTMLElement>('[data-slot="print-action-bar"]');
  return within(bar ?? prepareRegion());
};

/** Review print once the machine has checked the fresh slice and it can be sent. */
const reviewPrint = async (): Promise<HTMLElement> => {
  await waitFor(() => {
    expect(prepareActions().getByRole('button', { name: 'Review print' })).toBeEnabled();
  });
  return prepareActions().getByRole('button', { name: 'Review print' });
};

/** The slice result with its folded details open. */
const sliceDetails = async (): Promise<HTMLElement> => {
  const result = await screen.findByRole('group', { name: 'Slice result' });
  const trigger = within(result).getByRole('button', { name: /^Details/u });
  if (trigger.getAttribute('aria-expanded') !== 'true') {
    fireEvent.click(trigger);
  }
  return result;
};

const openAdvancedSettings = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
  const trigger = screen.getByRole('button', { name: /^Advanced settings/u });
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

/** The pane's own name for the agent's pending job; the chat banner keeps "Approval required". */
const jobRegionName = 'Job awaiting you: pyramid.gcode.3mf';

const paused = (): ReturnType<typeof entry> => {
  const run = printing();
  return {
    ...run,
    snapshot: { ...run.snapshot, state: { status: 'held' }, run: { ...printingRun, state: 'paused' } },
  };
};

/** The fixture slice's bytes (`PK\x03\x04`) name its file: `.tau/artifacts/<sha256>/` (blueprint D5). */
const sliceHex = '8dcc7e601606217f3b754766511182a916b17e9a26a94c9d887104eba92e9bb2';
const slicePath = `.tau/artifacts/${sliceHex}/main.gcode.3mf`;

const settingsPath = machineSettingsPath({ typeId: 'bambu.x1c' });
const preferencesRecord = (
  preferences: Record<string, unknown>,
  typeId: MachineSettingsRecord['typeId'] = 'bambu.x1c',
): MachineSettingsRecord => {
  const { plate, material, ...values } = preferences;
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
          ...(plate === undefined && material === undefined
            ? {}
            : {
                [bambuSettingsConfiguration.manifest.source.id]: {
                  version: bambuSettingsConfiguration.manifest.source.version,
                  values: {
                    ...(plate === undefined ? {} : { plate: plate as string }),
                    ...(material === undefined ? {} : { material: material as MachineSettingsValue }),
                  },
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
  renderGeometry();
});

const signalMatcher: unknown = expect.any(AbortSignal);
const byPerson: unknown = expect.objectContaining({ kind: 'user' });
const anyText: unknown = expect.any(String);
const x1cBuildVolume = fffProcessOf(x1cManifest)!.geometry.buildVolume;

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
        expect.objectContaining({ type: 'claimGeometryUnit', entryPath: 'main.ts', operationTimeout: undefined }),
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
    await findMachine('Ready');
    fireEvent.click(prepareActions().getByRole('button', { name: 'Slice and preview' }));
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
    await findMachine('Ready');
    const beforeSlice = mockProjectSend.mock.calls.length;
    fireEvent.click(prepareActions().getByRole('button', { name: 'Slice and preview' }));

    expect(await within(prepareRegion()).findByText('radius must be positive')).toBeInTheDocument();
    expect(mockExport).not.toHaveBeenCalled();
    const operationClaim = mockProjectSend.mock.calls
      .slice(beforeSlice)
      .map(([event]) => event as { type: string; claimId: string })
      .find((event) => event.type === 'claimGeometryUnit');
    expect(operationClaim).toBeDefined();
    expect(mockProjectSend).toHaveBeenCalledWith({ type: 'releaseGeometryUnit', claimId: operationClaim?.claimId });
  });

  it('names the machine state and the one safe next step from the observation alone', async () => {
    expect(presentMachine(entry())).toMatchObject({ label: 'Ready' });
    expect(presentMachine(printing())).toMatchObject({ label: 'Printing' });
    expect(presentMachine(entry({ freshness: 'stale' })).label).toBe('Stale observation');
    expect(presentMachine(entry({ snapshot: { ...entry().snapshot, connection: 'unreachable' } })).label).toBe(
      'Unreachable',
    );

    // One notice says what waits on a machine the pane cannot trust, and what still works.
    const unreachable = entry({ snapshot: { ...entry().snapshot, connection: 'unreachable' } });
    const view = renderPane(createFixture({ entries: [unreachable] }).client);
    await findMachine('Unreachable');
    expect(
      screen.getByText(
        'Workshop X1C is unreachable. Controls and jobs wait until the host reconnects. Use its own stop if it is moving.',
      ),
    ).toBeInTheDocument();
    expect(prepareActions().getByRole('button', { name: 'Slice and preview' })).toBeEnabled();
    view.unmount();

    renderPane(createFixture({ entries: [entry({ freshness: 'stale' })] }).client);
    await findMachine('Stale observation');
    expect(
      screen.getByText(
        'No current observation from Workshop X1C. Controls and jobs wait until it reports again; slicing still works.',
      ),
    ).toBeInTheDocument();
  });

  it('names a send in flight while the printer still reports the moment before it', () => {
    expect(presentMachine(entry(), agentJob({ state: 'transferring' })).label).toBe('Sending');
    expect(presentMachine(entry(), agentJob({ state: 'confirming' }))).toMatchObject({ label: 'Starting' });
    expect(presentMachine(entry(), agentJob({ state: 'awaiting-start' })).label).toBe(
      'Waiting for the start at the machine',
    );
    // An unconfirmed start is past that moment: the printer's own report speaks again.
    expect(presentMachine(entry(), agentJob({ state: 'unknown' })).label).toBe('Ready');
    expect(presentMachine(entry({ freshness: 'stale' }), agentJob({ state: 'confirming' })).label).toBe(
      'Stale observation',
    );
  });

  it('lists machines by the names people gave them, not the names the devices report, marking simulators', async () => {
    const attic = entry({ machineId: 'attic-p1s', name: 'Attic P1S', providerId: provider.id });
    renderPane(createFixture({ entries: [entry(), attic] }).client);

    const picker = await screen.findByRole('combobox', { name: 'Machine' });
    fireEvent.click(picker);
    expect(screen.getAllByRole('option').map((option) => option.textContent.trim())).toEqual([
      'Attic P1SReady',
      'Workshop X1CReady · Simulated',
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
    // The camera leads Control, which an idle printer keeps closed.
    await findMachine('Ready');
    openDisclosure(/^Control/u);
    fireEvent.click(await screen.findByRole('button', { name: 'Capture still' }));
    await waitFor(() => {
      expect(captureSignal).toBeDefined();
    });
    const user = userEvent.setup();
    await chooseOption(user, screen.getByRole('combobox', { name: 'Machine' }), 'Mini');
    expect(captureSignal?.aborted).toBe(true);
    await findMachine('Ready', 'Mini');
    openDisclosure(/^Control/u);
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
      sliceBlocker: undefined,
      sendBlocker: 'x',
    };
    expect(nextAction({ entry: entry(), openJob: undefined, prepare })).toEqual({
      label: 'Slice and preview',
      kind: 'slice',
    });
    expect(
      nextAction({
        entry: entry(),
        openJob: undefined,
        prepare: { ...prepare, slice: sliceFixture, sendBlocker: undefined },
      }),
    ).toEqual({ label: 'Review print', kind: 'send' });
    expect(nextAction({ entry: entry(), openJob: agentJob(), prepare })).toEqual({
      label: 'Review the agent’s job',
      kind: 'review',
    });
    expect(nextAction({ entry: entry(), openJob: agentJob({ state: 'confirming' }), prepare })).toEqual({
      label: 'Waiting for the machine to confirm',
      kind: 'none',
    });
    expect(nextAction({ entry: entry(), openJob: agentJob({ state: 'awaiting-start' }), prepare })).toEqual({
      label: 'Press start at the machine',
      kind: 'none',
    });
    expect(nextAction({ entry: entry(), openJob: agentJob({ state: 'unknown' }), prepare })).toEqual({
      label: 'Check the machine',
      kind: 'review',
    });
    // A stale machine still slices; only sending waits, and its blocker says why.
    expect(nextAction({ entry: entry({ freshness: 'stale' }), openJob: undefined, prepare })).toEqual({
      label: 'Slice and preview',
      kind: 'slice',
    });
    expect(
      nextAction({
        entry: entry({ freshness: 'stale' }),
        openJob: undefined,
        prepare: {
          ...prepare,
          slice: sliceFixture,
          sendBlocker: 'Wait for a current observation from Workshop X1C before starting.',
        },
      }),
    ).toEqual({
      label: 'Review print',
      kind: 'send',
      blocker: 'Wait for a current observation from Workshop X1C before starting.',
    });
    expect(nextAction({ entry: printing(), openJob: undefined, prepare }).kind).toBe('none');
    expect(nextAction({ entry: entry(), openJob: undefined, prepare: { ...prepare, isSlicing: true } })).toEqual({
      label: 'Slicing…',
      kind: 'slice',
    });
    expect(
      nextAction({ entry: entry(), openJob: undefined, prepare: { ...prepare, sliceBlocker: 'Loading presets…' } }),
    ).toEqual({ label: 'Slice and preview', kind: 'slice', blocker: 'Loading presets…' });
    // A fresh slice that cannot be sent says why, rather than offering to slice again.
    expect(
      nextAction({
        entry: entry(),
        openJob: undefined,
        prepare: { ...prepare, slice: sliceFixture, sendBlocker: 'Workshop X1C is busy. Wait until it reports ready.' },
      }),
    ).toEqual({
      label: 'Review print',
      kind: 'send',
      blocker: 'Workshop X1C is busy. Wait until it reports ready.',
    });
    expect(nextAction({ entry: entry(), openJob: undefined, prepare: { ...prepare, route: undefined } })).toEqual({
      label: 'Slicing unavailable',
      kind: 'none',
    });
  });

  it('names the one reason a physical start must wait, in the order a person resolves them', () => {
    expect(startBlocker(entry())).toBeUndefined();
    expect(startBlocker(entry({ freshness: 'stale' }))).toBe(
      'Wait for a current observation from Workshop X1C before starting.',
    );
    expect(startBlocker(printing())).toBe('Workshop X1C has a run in progress. Start another once it ends.');
    expect(startBlocker(paused())).toBe('Workshop X1C has a paused run. Resume or cancel it before starting another.');
    expect(
      startBlocker(entry({ snapshot: { ...entry().snapshot, state: { status: 'active', reason: 'calibrating' } } })),
    ).toBe('Workshop X1C is not ready: calibrating. Wait until it reports ready.');
  });

  it('renders explicit grant refusals instead of a broken control surface', () => {
    const { bridge } = createBridge();
    const rendered = render(<PrintPanel machines={{ available: false, reason: 'not-granted' }} bridge={bridge} />);
    expect(screen.getByText('Machine access not granted')).toBeInTheDocument();
    rendered.rerender(<PrintPanel machines={{ available: false, reason: 'unsupported' }} bridge={bridge} />);
    expect(screen.getByText('Machines unavailable')).toBeInTheDocument();
  });

  it("marks the simulator as simulated from its own entry, not from a provider's manifest", async () => {
    const fixture = createFixture({ entries: [entry({ providerId: 'bambu-simulator' })] });
    // No provider manifest to read: the host-stamped qualifications on the entry alone say it is simulated.
    renderPane({ ...fixture.client, listProviders: async () => [] });
    // The header names the printer once, with its status and the Simulated mark beside the picker.
    const picker = await findMachine('Ready');
    expect(picker.parentElement?.parentElement).toContainElement(screen.getByText('Simulated'));
  });
});

describe('Print pane prepare and send', () => {
  it('should abort only the old slice when options change while its export is pending', async () => {
    const oldExport = Promise.withResolvers<void>();
    const currentExport = Promise.withResolvers<void>();
    const sliceResult: Awaited<ReturnType<typeof mockExport>> = {
      success: true,
      exportId: 'gcode.3mf',
      evaluationId: 'mock-evaluation',
      files: [
        {
          name: 'main.gcode.3mf',
          bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
          mimeType: 'application/vnd.bambulab.gcode-3mf',
        },
      ],
      issues: [],
    };
    mockExport
      .mockImplementationOnce(async () => {
        await oldExport.promise;
        return sliceResult;
      })
      .mockImplementationOnce(async () => {
        await currentExport.promise;
        return sliceResult;
      });
    const signalAt = (index: number): AbortSignal => {
      const args: readonly unknown[] | undefined = mockExport.mock.calls[index];
      const options = args?.[1];
      if (
        !options ||
        typeof options !== 'object' ||
        !('signal' in options) ||
        !(options.signal instanceof AbortSignal)
      ) {
        throw new Error('Expected a slice export with an AbortSignal.');
      }
      return options.signal;
    };
    const user = userEvent.setup();
    try {
      renderPane(createFixture().client);
      await findMachine('Ready');
      await user.click(prepareActions().getByRole('button', { name: 'Slice and preview' }));
      await waitFor(() => {
        expect(mockExport).toHaveBeenCalledOnce();
      });
      const oldSignal = signalAt(0);
      await chooseOption(user, within(prepareRegion()).getByRole('combobox', { name: 'Plate' }), 'Cool plate');
      expect(oldSignal.aborted).toBe(true);
      await user.click(prepareActions().getByRole('button', { name: 'Slice and preview' }));
      await waitFor(() => {
        expect(mockExport).toHaveBeenCalledTimes(2);
      });
      const currentSignal = signalAt(1);
      expect(currentSignal.aborted).toBe(false);
      await act(async () => {
        oldExport.resolve();
      });
      expect(mockWriteFiles).not.toHaveBeenCalled();
      expect(within(prepareRegion()).queryByLabelText('Slice result')).not.toBeInTheDocument();
      expect(currentSignal.aborted).toBe(false);
      await act(async () => {
        currentExport.resolve();
      });
      expect(await within(prepareRegion()).findByLabelText('Slice result')).toBeInTheDocument();
      expect(currentSignal.aborted).toBe(false);
      await waitFor(() => {
        expect(mockWriteFiles).toHaveBeenCalledOnce();
      });
    } finally {
      await act(async () => {
        oldExport.resolve();
        currentExport.resolve();
      });
    }
  });

  it('should cancel slicing immediately and discard a late successful export before writing or publishing it', async () => {
    let finish!: () => void;
    mockExport.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return {
        success: true,
        exportId: 'gcode.3mf',
        evaluationId: 'mock-evaluation',
        files: [
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
    await findMachine('Ready');
    await user.click(prepareActions().getByRole('button', { name: 'Slice and preview' }));
    await waitFor(() => {
      expect(mockExport).toHaveBeenCalledOnce();
    });
    await user.click(prepareActions().getByRole('button', { name: 'Cancel slicing' }));
    expect(prepareActions().getByRole('button', { name: 'Slice and preview' })).toBeEnabled();
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

    await findMachine('Ready');
    expect(container.querySelector('[data-slot="print-panel-body"]')).toHaveClass('min-w-0', 'flex-col');
    expect(screen.getByRole('button', { name: /^History/u })).toHaveTextContent('Nothing yet');

    const quality = screen.getByRole('combobox', { name: 'Quality' });
    await user.click(quality);
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Fast0.28 mm',
      'Standard0.2 mm',
      'Fine0.12 mm',
    ]);
    await user.keyboard('{Escape}');
    await chooseOption(user, quality, 'Fine');
    await waitFor(() => {
      expect(quality).toHaveTextContent('Fine0.12 mm');
    });
    // The choice is the project's: saved as the only changed key beside the printer model.
    expect(preferencesText()).toBe('{\n  "preset": "fine"\n}\n');

    const material = screen.getByRole('group', { name: 'Material' });
    expect(within(material).getByRole('combobox', { name: 'Material' })).toHaveTextContent('A1');
    await user.click(within(material).getByRole('combobox', { name: 'Material' }));
    expect(screen.getByRole('option', { name: /A2/u })).toHaveAttribute('data-disabled');
    await user.keyboard('{Escape}');

    const slice = prepareActions().getByRole('button', { name: 'Slice and preview' });
    slice.focus();
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(mockExport).toHaveBeenCalledExactlyOnceWith('gcode.3mf', {
        signal: signalMatcher,
        options: { ...machineSliceOptions, preset: 'fine' },
      });
    });
    expect(mockWriteFiles).toHaveBeenCalledExactlyOnceWith({
      [slicePath]: { content: new Uint8Array([0x50, 0x4b, 0x03, 0x04]) },
    });

    // The numbers people read stay in view; the rest folds into Details, summarised by the part's size.
    const result = await screen.findByRole('group', { name: 'Slice result' });
    expect(within(result).getByText('125 layers · about 42 min · 3.2 m')).toBeInTheDocument();
    expect(within(result).getByRole('button', { name: /^Details/u })).toHaveTextContent('50 × 50 × 25 mm');
    await sliceDetails();
    // The part alone decides the plate fit; every move, start routine included, is shown beside it.
    expect(within(result).getByText('Part').nextElementSibling).toHaveTextContent('50 × 50 × 25 mm');
    expect(within(result).getByText('Toolpath').nextElementSibling).toHaveTextContent(
      "236 × 153 × 35 mm · every nozzle move, including the printer's start routine",
    );
    expect(within(result).getByText('Plate').nextElementSibling).toHaveTextContent('The part fits the plate');

    await user.click(prepareActions().getByRole('button', { name: 'Preview' }));
    expect(mockEditorSend).toHaveBeenCalledExactlyOnceWith({ type: 'openFile', path: slicePath, source: 'user' });

    await user.click(await reviewPrint());
    // Review asks the machine for a job; nothing reaches the printer until the person starts it.
    await waitFor(() => {
      expect(fixture.requestJob).toHaveBeenCalledOnce();
    });
    const requestInput = fixture.requestJob.mock.calls.at(0)?.[0];
    expect(requestInput?.machineId).toBe('machine-1');
    expect(requestInput?.requestedBy.kind).toBe('user');
    expect(requestInput?.program).toMatchObject({
      name: 'main.gcode.3mf',
      estimatedDuration: 2_520_000,
      facts: { process: 'fff', layers: 125, filamentLength: 3200 },
    });
    expect(requestInput?.configuration).toMatchObject({
      expectedBedType: 'textured-pei',
      expectedMaterials: [{ slot: 0, materialId: 'PLA' }],
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
      mediaType: bambuContainer.mediaType,
      contract: bambuContainer.contract,
      selectedMember: 'Metadata/plate_1.gcode',
    });

    const review = await screen.findByRole('region', { name: 'Job awaiting you: main.gcode.3mf' });
    expect(
      within(review).getByText('125 layers · 3.2 m of filament · about 42 min · stored on the machine'),
    ).toBeInTheDocument();
    const start = within(review).getByRole('button', { name: 'Start print' });
    // The manifest's attestation is the person's to make before Start.
    expect(start).toBeDisabled();
    fireEvent.click(within(review).getByRole('checkbox', { name: 'The build plate is clear' }));
    expect(start).toBeEnabled();
    await user.click(start);
    await waitFor(() => {
      expect(fixture.resolveJob).toHaveBeenCalledOnce();
    });
    const resolveInput = fixture.resolveJob.mock.calls.at(0)?.[0];
    expect(resolveInput).toMatchObject({
      jobId: requestInput?.jobId,
      decision: 'approve',
      resolvedBy: { kind: 'user' },
      attestations: ['work-area-clear'],
      attended: false,
    });
    expect(typeof resolveInput?.transferOperationId).toBe('string');
    expect(typeof resolveInput?.startOperationId).toBe('string');
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: /^Job awaiting you/u })).not.toBeInTheDocument();
    });

    openDisclosure(/^History/u);
    expect(within(screen.getByRole('list', { name: 'Jobs' })).getByText('Started')).toBeInTheDocument();

    const accessibility = await axe.run(container, { rules: { region: { enabled: false } } });
    expect(accessibility.violations).toEqual([]);
  });

  it('reaches every prepare control by keyboard in reading order', async () => {
    const fixture = createFixture();
    const user = userEvent.setup();
    renderPane(fixture.client);
    await findMachine('Ready');

    const names: string[] = [];
    for (let index = 0; index < 60 && !names.includes('Slice and preview'); index += 1) {
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
    await findMachine('Ready');

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
    await user.click(prepareActions().getByRole('button', { name: 'Slice and preview' }));

    await waitFor(() => {
      expect(mockExport).toHaveBeenCalledExactlyOnceWith('gcode.3mf', {
        signal: signalMatcher,
        options: { ...machineSliceOptions, plate: 'cool' },
      });
    });
  });

  it('keeps advanced drafts across telemetry and marks the slice stale until sliced again', async () => {
    const fixture = createFixture();
    const user = userEvent.setup();
    renderPane(fixture.client);
    await findMachine('Ready');

    await user.click(prepareActions().getByRole('button', { name: 'Slice and preview' }));
    await reviewPrint();

    await openAdvancedSettings(user);
    const options = await screen.findByLabelText('Slicer options');
    await user.click(await within(options).findByRole('button', { name: 'Set layer height' }));
    await waitFor(() => {
      expect(within(options).getByTestId('parameters')).toHaveTextContent('{"layerHeight":0.16}');
    });
    await expectPreferences({ options: { layerHeight: 0.16 } });
    expect(screen.getByText(/Options changed since this slice/u)).toBeInTheDocument();
    // A stale slice is never offered for sending: Slice again takes Send's place.
    expect(prepareActions().queryByRole('button', { name: 'Review print' })).not.toBeInTheDocument();
    expect(prepareActions().getByRole('button', { name: 'Slice again' })).toBeEnabled();

    act(() => {
      fixture.observe(entry({ snapshot: { ...entry().snapshot, observedAt: later } }));
    });
    await screen.findByText(/Observed/u);
    expect(within(screen.getByLabelText('Slicer options')).getByTestId('parameters')).toHaveTextContent(
      '{"layerHeight":0.16}',
    );
    expect(screen.getByText(/Options changed since this slice/u)).toBeInTheDocument();

    await user.click(prepareActions().getByRole('button', { name: 'Slice again' }));
    await waitFor(() => {
      expect(mockExport).toHaveBeenLastCalledWith('gcode.3mf', {
        signal: signalMatcher,
        options: { ...machineSliceOptions, layerHeight: 0.16 },
      });
    });
    await reviewPrint();
  });

  it('should discard a prepared slice when switching printers and prepare again for the selected machine', async () => {
    const first = entry();
    const mini = entry({ machineId: 'mini', name: 'Mini' });
    const fixture = createFixture({ entries: [first, mini] });
    globalThis.localStorage.setItem(`tau:print:selected-machine:${projectId}`, first.machineId);
    const user = userEvent.setup();
    renderPane(fixture.client);
    await findMachine('Ready');
    await user.click(prepareActions().getByRole('button', { name: 'Slice and preview' }));
    await reviewPrint();
    await chooseOption(user, screen.getByRole('combobox', { name: 'Machine' }), 'Mini');
    expect(screen.queryByRole('button', { name: 'Send to Mini' })).not.toBeInTheDocument();
    expect(prepareActions().getByRole('button', { name: 'Slice and preview' })).toBeEnabled();
    expect(fixture.requestJob).not.toHaveBeenCalled();
  });

  it('clears a slice error once the model renders again, since it described the geometry before', async () => {
    const fixture = createFixture();
    const user = userEvent.setup();
    renderPane(fixture.client);
    await findMachine('Ready');
    mockExport.mockResolvedValueOnce({
      success: false,
      issues: [{ code: 'GEOMETRY_INVALID', severity: 'error', message: 'The GLB carries no triangle primitives.' }],
    });

    await user.click(prepareActions().getByRole('button', { name: 'Slice and preview' }));
    expect(await within(prepareRegion()).findByText('The GLB carries no triangle primitives.')).toBeInTheDocument();

    act(() => {
      renderGeometry();
    });

    expect(within(prepareRegion()).queryByText('The GLB carries no triangle primitives.')).not.toBeInTheDocument();
    expect(prepareActions().getByRole('button', { name: 'Slice and preview' })).toBeEnabled();
  });

  it('marks a slice stale once the model renders again, so the old toolpath cannot be sent', async () => {
    const fixture = createFixture();
    const user = userEvent.setup();
    renderPane(fixture.client);
    await findMachine('Ready');

    await user.click(prepareActions().getByRole('button', { name: 'Slice and preview' }));
    await reviewPrint();

    act(() => {
      renderGeometry();
    });

    // A stale slice is never offered for sending: Slice again takes Send's place.
    expect(prepareActions().queryByRole('button', { name: 'Review print' })).not.toBeInTheDocument();
    expect(prepareActions().getByRole('button', { name: 'Slice again' })).toBeEnabled();
    expect(
      screen.getByText('The model changed since this slice. Slice again to send the current model.'),
    ).toBeInTheDocument();

    await user.click(prepareActions().getByRole('button', { name: 'Slice again' }));
    await reviewPrint();
  });

  it("starts the machine mapping from the provider schema's own defaults, so bed leveling and flow calibration show on", async () => {
    // Bambu declares both flags `.default(true)` in its submission schema; its declared defaults stay empty.
    const defaults = submissionDefaults(provider, entry(), {});
    expect(defaults).toMatchObject({ bedLeveling: true, flowCalibration: true, timelapse: false });
    // The plate the slice was made for is the provider's to read from the program (R5), never a default here.
    expect(defaults).not.toHaveProperty('expectedBedType');
    const user = userEvent.setup();
    renderPane(createFixture().client);
    await findMachine('Ready');
    // Start options fold, summarised by what is on.
    const startOptions = screen.getByRole('button', { name: /^Start options/u });
    expect(startOptions).toHaveTextContent(/^Start options\s*Levelling, flow$/u);
    openDisclosure(/^Start options/u);
    await openAdvancedSettings(user);
    const mapping = await screen.findByLabelText('Machine mapping');
    expect(await screen.findByRole('switch', { name: 'Toggle for Bed levelling' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Toggle for Flow calibration' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Toggle for Timelapse' })).not.toBeChecked();
    // The diameters are the machine's to fill once it checks a slice (CB-6); the send flow asserts what it fills.
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

  it("keeps a start option on a provider whose settings form is not Bambu's", async () => {
    // The same submission form with no Bambu settings: nothing remembers its flags but the choice itself.
    const fixture = createFixture();
    const user = userEvent.setup();
    renderPane({
      ...fixture.client,
      listProviders: async () => [{ ...simulatorProvider, settingsConfiguration: undefined }],
    });
    await findMachine('Ready');
    openDisclosure(/^Start options/u);
    const timelapse = screen.getByRole('switch', { name: 'Toggle for Timelapse' });
    await user.click(timelapse);

    expect(timelapse).toBeChecked();
    expect(screen.getByRole('button', { name: /^Start options/u })).toHaveTextContent(/timelapse/u);
  });

  it('invalidates a slice when a prestart choice changes and submits the new value', async () => {
    const fixture = createFixture();
    const user = userEvent.setup();
    renderPane(fixture.client);
    await findMachine('Ready');
    await user.click(prepareActions().getByRole('button', { name: 'Slice and preview' }));
    await reviewPrint();

    openDisclosure(/^Start options/u);
    const bed = screen.getByRole('switch', { name: 'Toggle for Bed levelling' });
    await user.click(bed);
    expect(bed).not.toBeChecked();
    expect(screen.getByRole('button', { name: /^Start options/u })).toHaveTextContent(/^Start options\s*Flow$/u);
    // A stale slice is never offered for sending: Slice again takes Send's place.
    expect(prepareActions().queryByRole('button', { name: 'Review print' })).not.toBeInTheDocument();
    await user.click(prepareActions().getByRole('button', { name: 'Slice again' }));
    const send = await prepareActions().findByRole('button', { name: 'Review print' });
    await waitFor(() => {
      expect(send).toBeEnabled();
    });
    await user.click(send);
    await waitFor(() => {
      expect(fixture.requestJob).toHaveBeenCalledOnce();
    });
    expect(fixture.requestJob.mock.calls[0]?.[0].configuration).toMatchObject({ bedLeveling: false });
  });

  it("checks the job again when a spool changes, and disables sending, not slicing, on the machine's answer", async () => {
    const fixture = createFixture();
    const user = userEvent.setup();
    renderPane(fixture.client);
    await findMachine('Ready');
    expect(screen.getByRole('combobox', { name: 'Material' })).toHaveTextContent('A1');
    await user.click(prepareActions().getByRole('button', { name: 'Slice and preview' }));
    await reviewPrint();
    const checks = fixture.checkJob.mock.calls.length;
    fixture.checkJob.mockResolvedValue({
      status: 'blocked',
      program: { name: 'main.gcode.3mf', facts: { process: 'fff' } },
      checks: [
        {
          id: 'material',
          label: 'Material',
          state: 'blocked',
          source: 'observed',
          detail: 'PLA is not loaded in A1 (PETG is).',
        },
      ],
      configuration: {},
    });

    act(() => {
      fixture.observe(
        withSlots(entry({ snapshot: { ...entry().snapshot, observedAt: later } }), [loadedSlot('ams-a/a1', 'PETG')]),
      );
    });

    const send = await prepareActions().findByRole('button', { name: 'Review print' });
    await waitFor(() => {
      expect(send).toHaveAccessibleDescription('Material: PLA is not loaded in A1 (PETG is).');
    });
    expect(send).toBeDisabled();
    expect(fixture.checkJob.mock.calls.length).toBe(checks + 1);
    expect(within(prepareRegion()).getByRole('button', { name: 'Slice again' })).toBeEnabled();
  });

  it('keeps Send disabled with its reason while the machine runs a print or is not ready', async () => {
    const fixture = createFixture();
    const user = userEvent.setup();
    renderPane(fixture.client);
    await findMachine('Ready');
    await user.click(prepareActions().getByRole('button', { name: 'Slice and preview' }));
    await reviewPrint();

    const send = (): HTMLElement => prepareActions().getByRole('button', { name: 'Review print' });
    const expectSendHeld = async (next: ReturnType<typeof entry>, reason: string): Promise<void> => {
      act(() => {
        fixture.observe(next);
      });
      await waitFor(() => {
        expect(send()).toHaveAccessibleDescription(reason);
      });
      expect(send()).toBeDisabled();
    };

    await expectSendHeld(printing(), 'Workshop X1C has a run in progress. Start another once it ends.');
    expect(screen.getByRole('region', { name: 'Monitor' })).toBeInTheDocument();
    await expectSendHeld(paused(), 'Workshop X1C has a paused run. Resume or cancel it before starting another.');
    await expectSendHeld(
      entry({ snapshot: { ...entry().snapshot, state: { status: 'active' } } }),
      'Workshop X1C is not ready. Wait until it reports ready.',
    );
    // The header's status stays a summary; the one Send control carries the actionable reason.
    await findMachine('Busy');
    expect(screen.getAllByRole('button', { name: /^Review print/u })).toEqual([send()]);

    act(() => {
      fixture.observe(entry());
    });
    await waitFor(() => {
      expect(send()).toBeEnabled();
    });
    expect(fixture.requestJob).not.toHaveBeenCalled();
  });
});

describe('Print pane external spool', () => {
  /** The fixture printer with its external spool holding white PETG beside the AMS trays. */
  const withExternalSpool = (external: MaterialSlotSnapshot, base = entry()) =>
    withSlots(base, [...fffSlots.filter((slot) => slot.slot.unitId !== 'external'), external]);
  // oxlint-disable-next-line tau-lint/no-hardcoded-color -- the colour the printer reports for a white spool
  const whitePetg = loadedSlot('external/spool', 'PETG', { color: '#FFFFFFFF', profileId: 'GFG99' });

  it('falls back to the loaded tray when the saved one is not on this printer', async () => {
    // Another printer of this type saved A4; this one (a simulator, say) has only A1 loaded.
    projectFiles.write(settingsPath, preferencesBytes({ material: { defaultSlot: 3 } }));
    renderPane(createFixture().client);

    const material = await screen.findByRole('group', { name: 'Material' });
    expect(within(material).getByRole('combobox', { name: 'Material' })).toHaveTextContent('A1');
    expect(within(material).queryByRole('button', { name: 'Reset Material' })).not.toBeInTheDocument();
  });

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

    await user.click(prepareActions().getByRole('button', { name: 'Slice and preview' }));
    await user.click(await reviewPrint());
    await waitFor(() => {
      expect(fixture.requestJob).toHaveBeenCalledOnce();
    });
    expect(fixture.requestJob.mock.calls.at(0)?.[0].configuration).toMatchObject({
      amsMapping: [254],
      expectedMaterials: [{ slot: 254, materialId: 'PETG' }],
    });
  });

  it('cannot choose an empty or unset external holder', async () => {
    renderPane(createFixture({ entries: [withExternalSpool(emptySlot('external/spool'))] }).client);
    const material = await screen.findByRole('group', { name: 'Material' });
    fireEvent.click(within(material).getByRole('combobox', { name: 'Material' }));
    const externalSpool = screen.getByRole('option', { name: /^Ext/u });
    expect(externalSpool).toHaveTextContent('Ext · Empty');
    expect(externalSpool).toHaveAttribute('data-disabled');
  });

  it("holds sending on the machine's own check and offers its remedy, never its own guess", async () => {
    const fixture = createFixture({ entries: [withExternalSpool(loadedSlot('external/spool', 'PLA'))] });
    fixture.checkJob.mockResolvedValue({
      status: 'blocked',
      program: { name: 'main.gcode.3mf', facts: { process: 'fff', layers: 125, filamentLength: 3200 } },
      checks: [
        {
          id: 'materials',
          label: 'Material matches',
          state: 'blocked',
          source: 'observed',
          detail: 'PETG is not loaded in Ext (PLA is).',
          remedy: { type: 'person', instruction: 'Load PETG on the external spool.' },
        },
      ],
      configuration: { amsMapping: [254] },
    });
    const user = userEvent.setup();
    renderPane(fixture.client);
    await findMachine('Ready');
    await user.click(prepareActions().getByRole('button', { name: 'Slice and preview' }));

    const send = await prepareActions().findByRole('button', { name: 'Review print' });
    await waitFor(() => {
      expect(send).toHaveAccessibleDescription('Material matches: PETG is not loaded in Ext (PLA is).');
    });
    expect(send).toBeDisabled();
    const checks = prepareActions().getByRole('list', { name: 'Checks' });
    expect(checks).toHaveTextContent('At the machine: Load PETG on the external spool.');
    // The machine was asked with the person's choices only: what the slice was made for it reads from the program.
    const asked = fixture.checkJob.mock.lastCall?.[0];
    expect(asked?.machineId).toBe('machine-1');
    expect(Object.keys(asked?.configuration ?? {}).filter((key) => key.startsWith('expected'))).toEqual([]);
    expect(fixture.requestJob).not.toHaveBeenCalled();
  });

  it('shows Ext in the monitor, in use while the printer feeds from it', async () => {
    const machine = withSlots(
      printing(),
      [...fffSlots.filter((slot) => slot.slot.unitId !== 'external'), whitePetg],
      whitePetg.slot,
    );
    renderPane(createFixture({ entries: [machine] }).client);
    const slots = await screen.findByRole('list', { name: 'Material slots' });
    const external = within(slots).getByText('Ext').closest('li');
    expect(external).toHaveTextContent(/^ExtPETG.*In use/u);
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
      result.bounds && summary.fitsPlate({ bounds: result.bounds, partBounds: result.partBounds }, x1cBuildVolume),
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
    const buildVolume = x1cBuildVolume;

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

describe('Print pane jobs', () => {
  it('does not say Tau is waiting when an external agent asked and no chat is paused on it', async () => {
    const external = agentJob({ requestedBy: { kind: 'agent', id: 'external-agent', label: 'External agent' } });
    renderPane(createFixture({ jobs: [external] }).client);

    const region = await screen.findByRole('region', { name: jobRegionName });
    expect(within(region).getByText('Requested by External agent')).toBeInTheDocument();
    expect(within(region).queryByText('Answering here also answers the chat.')).not.toBeInTheDocument();
  });

  it('starts an agent job with the attestation, then answers the paused chat as approved', async () => {
    const fixture = createFixture({ jobs: [agentJob()] });
    const { bridge, respond } = createBridge({
      interruptId: 'interrupt-1',
      kind: 'approval',
      prompt: 'Print pyramid.gcode.3mf on Workshop X1C? 125 layers, about 42 min.',
      options: [],
      messageId: 'assistant-1',
      approvalId: 'interrupt-1',
      context: { jobId: 'job-agent-1' },
    });
    const user = userEvent.setup();
    renderPane(fixture.client, bridge);

    const region = await screen.findByRole('region', { name: jobRegionName });
    // The chat banner owns "Approval required"; the pane never reuses it.
    expect(screen.queryByRole('region', { name: 'Approval required' })).not.toBeInTheDocument();
    expect(
      within(region).getByText('Print pyramid.gcode.3mf on Workshop X1C? 125 layers, about 42 min.'),
    ).toBeInTheDocument();
    expect(within(region).getByText('Requested by Tau agent')).toBeInTheDocument();
    expect(within(region).getByText('Answering here also answers the chat.')).toBeInTheDocument();

    // Preview the exact recorded artifact before deciding, the way Prepare opens a fresh slice.
    await user.click(within(region).getByRole('button', { name: 'Preview' }));
    expect(mockEditorSend).toHaveBeenCalledExactlyOnceWith({ type: 'openFile', path: artifact.path, source: 'user' });

    const start = within(region).getByRole('button', { name: 'Start print' });
    expect(start).toBeDisabled();
    fireEvent.click(within(region).getByRole('checkbox', { name: 'The build plate is clear' }));
    await user.click(start);
    // The person's attestation travels with their own approval; the paused tool then finds the job resolved.
    await waitFor(() => {
      expect(respond).toHaveBeenCalledExactlyOnceWith('interrupt-1', true);
    });
    expect(fixture.resolveJob).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        jobId: 'job-agent-1',
        decision: 'approve',
        resolvedBy: byPerson,
        attestations: ['work-area-clear'],
        attended: false,
      }),
    );
    expect(fixture.resolveJob.mock.invocationCallOrder[0]).toBeLessThan(respond.mock.invocationCallOrder[0]!);
  });

  it('denies on the person’s session, then answers the paused chat, or denies directly when no chat waits', async () => {
    const paused = createBridge({
      interruptId: 'interrupt-1',
      kind: 'approval',
      prompt: 'Print pyramid.gcode.3mf on Workshop X1C?',
      options: [],
      messageId: 'assistant-1',
      approvalId: 'interrupt-1',
      context: { jobId: 'job-agent-1' },
    });
    const first = createFixture({ jobs: [agentJob()] });
    const user = userEvent.setup();
    const view = renderPane(first.client, paused.bridge);
    await user.click(
      within(await screen.findByRole('region', { name: jobRegionName })).getByRole('button', { name: 'Deny' }),
    );
    await waitFor(() => {
      expect(paused.respond).toHaveBeenCalledExactlyOnceWith('interrupt-1', false);
    });
    // The person's own session records the denial before the chat is answered (R16), so the job ends denied by them.
    expect(first.resolveJob).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ jobId: 'job-agent-1', decision: 'deny', resolvedBy: byPerson }),
    );
    expect(first.resolveJob.mock.invocationCallOrder[0]).toBeLessThan(paused.respond.mock.invocationCallOrder[0]!);
    await expect(first.resolveJob.mock.results[0]?.value).resolves.toMatchObject({
      state: 'denied',
      resolvedBy: { kind: 'user', id: 'operator' },
    });
    view.unmount();

    const fixture = createFixture({ jobs: [agentJob()] });
    renderPane(fixture.client);
    await user.click(
      within(await screen.findByRole('region', { name: jobRegionName })).getByRole('button', { name: 'Deny' }),
    );
    await waitFor(() => {
      expect(fixture.resolveJob).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ jobId: 'job-agent-1', decision: 'deny' }),
      );
    });
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: jobRegionName })).not.toBeInTheDocument();
    });
    openDisclosure(/^History/u);
    expect(within(screen.getByRole('list', { name: 'Jobs' })).getByText('Denied')).toBeInTheDocument();
  });

  it('holds Start on a blocked check and offers its remedy as the action that clears it', async () => {
    const fixture = createFixture({
      jobs: [
        agentJob({
          checks: [
            {
              id: 'material',
              label: 'PETG is loaded in A1',
              state: 'blocked',
              source: 'observed',
              detail: 'A1 holds PLA.',
              remedy: { type: 'person', instruction: 'Load PETG in A1.' },
            },
            { id: 'plate', label: 'Textured PEI plate', state: 'passed', source: 'observed' },
          ],
        }),
      ],
    });
    renderPane(fixture.client);

    const region = await screen.findByRole('region', { name: jobRegionName });
    const checks = within(region).getByRole('list', { name: 'Checks' });
    expect(checks).toHaveTextContent('PETG is loaded in A1 (blocked)');
    expect(checks).toHaveTextContent('At the machine: Load PETG in A1.');
    fireEvent.click(within(region).getByRole('checkbox', { name: 'The build plate is clear' }));
    expect(within(region).getByRole('button', { name: 'Start print' })).toBeDisabled();
    expect(fixture.resolveJob).not.toHaveBeenCalled();
  });

  it('shows a sent start waiting for the printer to confirm it, with nothing to click', async () => {
    renderPane(
      createFixture({
        jobs: [
          agentJob({
            state: 'confirming',
            resolvedBy: { kind: 'user', id: 'operator', label: 'You' },
            transferOperationId: 'operation-transfer-1',
            startOperationId: 'operation-start-1',
            receipt: {
              operationId: 'operation-start-1',
              machineId: 'machine-1',
              kind: 'start',
              status: 'unknown',
              reason: 'reply-lost-after-possible-acceptance',
              observedAt: timestamp,
            },
          }),
        ],
      }).client,
    );

    const progress = await screen.findByRole('status', { name: 'Waiting for Workshop X1C to confirm the start…' });
    expect(progress).toHaveTextContent("Tau confirms it from the machine's own report");
    expect(screen.queryByText(/reply-lost/u)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry|check again|reconcile/iu })).not.toBeInTheDocument();
  });

  it('offers only Check again for an unconfirmed start, never Retry', async () => {
    const fixture = createFixture({
      jobs: [
        agentJob({
          state: 'unknown',
          transferOperationId: 'operation-transfer-1',
          startOperationId: 'operation-start-1',
        }),
      ],
    });
    const user = userEvent.setup();
    renderPane(fixture.client);

    const alert = await screen.findByRole('region', { name: 'Start not confirmed' });
    // One live region announces the headline; the card around it is not a second one.
    expect(within(alert).getByRole('alert')).toHaveTextContent(
      "The machine hasn't confirmed the start of pyramid.gcode.3mf.",
    );
    expect(alert).toHaveTextContent('Nothing is resent.');
    expect(screen.queryByRole('button', { name: /retry/iu })).not.toBeInTheDocument();
    await user.click(within(alert).getByRole('button', { name: 'Check again' }));
    await waitFor(() => {
      expect(fixture.reconcileOperation).toHaveBeenCalledExactlyOnceWith({
        machineId: 'machine-1',
        operationId: 'operation-start-1',
      });
    });
    expect(await within(alert).findByText('Checked: the machine took it')).toBeInTheDocument();
    expect(fixture.resolveJob).not.toHaveBeenCalled();
  });

  it('asks for the press at the machine once an at-machine job is loaded, and can withdraw it', async () => {
    const fixture = createFixture({
      jobs: [agentJob({ state: 'awaiting-start', resolvedBy: { kind: 'user', id: 'operator', label: 'You' } })],
    });
    const user = userEvent.setup();
    renderPane(fixture.client);

    const job = await screen.findByRole('region', { name: 'Job' });
    expect(within(job).getByRole('status')).toHaveTextContent('Press start on Workshop X1C to begin pyramid.gcode.3mf');
    await user.click(within(job).getByRole('button', { name: 'Withdraw' }));
    await waitFor(() => {
      expect(fixture.withdrawJob).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ jobId: 'job-agent-1' }));
    });
  });
});

/** The X1C with its chamber light qualified, as an agent may be approved to switch it. */
const qualifiedLight = (): MachineDirectoryEntry => {
  const base = entry();
  const { capabilities } = base.descriptor;
  const pause = capabilities.actions.find((descriptor) => descriptor.id === 'run.pause');
  return {
    ...base,
    descriptor: {
      ...base.descriptor,
      capabilities: {
        ...capabilities,
        actions: capabilities.actions.map((descriptor) =>
          descriptor.componentId === 'chamber-light' && pause !== undefined
            ? { ...descriptor, qualification: pause.qualification }
            : descriptor,
        ),
      },
    },
  };
};

describe('Print pane monitor and controls', () => {
  it('states the run plainly and sends Pause and Cancel against the exact observed run', async () => {
    const fixture = createFixture({ entries: [printing()] });
    const user = userEvent.setup();
    renderPane(fixture.client);

    await findMachine('Printing');
    const run = screen.getByRole('region', { name: 'Run' });
    expect(run).toHaveTextContent(/^pyramid\.gcode\.3mf · /u);
    expect(within(run).getByRole('progressbar', { name: 'Workshop X1C run progress' })).toHaveAttribute(
      'aria-valuenow',
      '42',
    );
    expect(run).toHaveTextContent('Layer 42 of 125');
    // Pause and Cancel say what they leave the printer doing before they are pressed.
    expect(run).toHaveTextContent('The nozzle parks and stays hot.');

    await user.click(within(run).getByRole('button', { name: 'Pause' }));
    await waitFor(() => {
      expect(fixture.applyAction).toHaveBeenCalledOnce();
    });
    expect(fixture.applyAction).toHaveBeenCalledWith(
      expect.objectContaining({
        machineId: 'machine-1',
        componentId: 'controller',
        action: 'run.pause',
        capabilityRevision: 'capabilities-1',
        expectedRunId: 'provider-run-1',
        requestedBy: byPerson,
        operationId: anyText,
      }),
    );

    await user.click(within(run).getByRole('button', { name: 'Cancel print' }));
    const question = 'Cancel print pyramid.gcode.3mf on Workshop X1C?';
    const dialog = screen.getByRole('alertdialog', { name: question });
    expect(dialog).toHaveAccessibleDescription(/^The print cannot be continued\./u);
    // The confirmation takes focus, so a keyboard user lands on its first choice.
    await waitFor(() => {
      expect(within(dialog).getByRole('button', { name: 'Confirm cancel print' })).toHaveFocus();
    });
    await user.click(within(dialog).getByRole('button', { name: 'Keep going' }));
    expect(fixture.applyAction).toHaveBeenCalledOnce();
    await user.click(within(run).getByRole('button', { name: 'Cancel print' }));
    // Escape keeps going, as the button does.
    fireEvent.keyDown(screen.getByRole('alertdialog', { name: question }), { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await user.click(within(run).getByRole('button', { name: 'Cancel print' }));
    await user.click(
      within(screen.getByRole('alertdialog', { name: question })).getByRole('button', {
        name: 'Confirm cancel print',
      }),
    );
    await waitFor(() => {
      expect(fixture.applyAction).toHaveBeenLastCalledWith(
        expect.objectContaining({ action: 'run.cancel', expectedRunId: 'provider-run-1' }),
      );
    });
    // Two presses, two distinct operations.
    const [first, second] = fixture.applyAction.mock.calls.map(([input]) => input.operationId);
    expect(first).not.toBe(second);
  });

  it('keeps Stop one press away, says what it does, and sends it without a run check', async () => {
    const fixture = createFixture({ entries: [printing()] });
    const user = userEvent.setup();
    renderPane(fixture.client);
    await findMachine('Printing');

    const stop = screen.getByRole('button', { name: 'Stop' });
    expect(stop).toHaveAccessibleDescription(
      'Stop: Motion halts at once, heaters turn off, the position is kept. Not an emergency stop.',
    );
    await user.click(stop);
    await waitFor(() => {
      expect(fixture.stop).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ machineId: 'machine-1', requestedBy: byPerson }),
      );
    });
    // Stop is the whole act: no job is resolved and no action follows its receipt.
    expect(fixture.applyAction).not.toHaveBeenCalled();
    expect(fixture.resolveJob).not.toHaveBeenCalled();
  });

  /* During a filament change, a tag read or a busy AMS the stop receipt can be `unknown` until a report settles it. */
  const unconfirmedStop = async () => {
    const fixture = createFixture({ entries: [printing()] });
    fixture.stop.mockResolvedValueOnce({
      operationId: 'stop-1',
      machineId: 'machine-1',
      kind: 'stop',
      status: 'unknown',
      reason: 'timeout',
      observedAt: later,
    });
    const user = userEvent.setup();
    renderPane(fixture.client);
    await findMachine('Printing');
    await user.click(screen.getByRole('button', { name: 'Stop' }));
    expect(await screen.findByText('Stopping…')).toHaveAttribute('role', 'status');
    expect(screen.queryByText(/did not confirm the stop/u)).not.toBeInTheDocument();
    const settle = (state: 'confirming' | 'accepted' | 'attention'): void => {
      const current = printing();
      fixture.observe({
        ...current,
        snapshot: {
          ...current.snapshot,
          operations: [
            {
              operationId: 'stop-1',
              machineId: 'machine-1',
              kind: 'stop',
              inputDigest: artifact.digest,
              state,
              updatedAt: later,
            },
          ],
        },
      });
    };
    return settle;
  };

  it('reads Stopping… for an unconfirmed Stop until a report settles it, then nothing', async () => {
    const settle = await unconfirmedStop();
    settle('confirming');
    expect(await screen.findByText('Stopping…')).toBeInTheDocument();
    settle('accepted');
    await waitFor(() => {
      expect(screen.queryByText('Stopping…')).not.toBeInTheDocument();
    });
    expect(screen.queryByText(/did not confirm the stop/u)).not.toBeInTheDocument();
  });

  it('says plainly when the host gives up confirming a Stop', async () => {
    const settle = await unconfirmedStop();
    settle('attention');
    expect(
      await screen.findByText(
        'Workshop X1C did not confirm the stop. Use the machine’s own stop if it is still moving.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Stopping…')).not.toBeInTheDocument();
  });

  it.each([
    { when: 'nothing while the printer is idle', snapshot: {}, status: 'Ready', isShown: false },
    { when: 'while it is held', snapshot: { state: { status: 'held' } }, status: 'Paused', isShown: true },
    {
      when: 'while an activity is in progress',
      snapshot: {
        activities: [
          {
            activityId: 'load-1',
            componentId: 'filament',
            kind: 'load',
            label: 'Loading filament',
            state: 'in-progress',
            steps: [],
          },
        ],
      },
      status: 'Loading filament',
      isShown: true,
    },
    {
      when: 'while an operation Tau sent is in flight',
      snapshot: {
        operations: [
          {
            operationId: 'operation-light',
            machineId: 'machine-1',
            kind: 'action',
            inputDigest: artifact.digest,
            state: 'sending',
            updatedAt: later,
            action: { componentId: 'chamber-light', id: 'switch.set', label: 'Chamber light' },
          },
        ],
      },
      status: 'Ready',
      isShown: true,
    },
  ] as const)('offers Stop $when', async ({ snapshot, status, isShown }) => {
    const idle = entry();
    renderPane(createFixture({ entries: [entry({ snapshot: { ...idle.snapshot, ...snapshot } })] }).client);
    await findMachine(status);
    expect(screen.queryByRole('button', { name: 'Stop' }) !== null).toBe(isShown);
  });

  it('leads a stop remedy to the one Stop control and says what stopping costs', async () => {
    const consequence = 'The machine halts and loses its position, so home it after.';
    const busy = entry({
      snapshot: {
        ...entry().snapshot,
        state: { status: 'active' },
        alerts: [
          {
            code: 'TIMED_RUN',
            severity: 'info',
            message: 'The spindle is on a timed run and stops by itself.',
            blocks: 'nothing',
            remedies: [{ type: 'stop', consequence }],
          },
        ],
      },
    });
    const user = userEvent.setup();
    renderPane(createFixture({ entries: [busy] }).client);
    await findMachine('Busy');
    const alert = screen.getByRole('alert', { name: 'Machine alert' });
    expect(alert).toHaveTextContent(`Go to Stop${consequence}`);
    // One Stop: the remedy leads to it rather than offering its own.
    expect(screen.getAllByRole('button', { name: 'Stop' })).toHaveLength(1);

    await user.click(within(alert).getByRole('button', { name: 'Go to Stop' }));

    expect(screen.getByRole('button', { name: 'Stop' })).toHaveFocus();
  });

  it.each([
    { name: 'finished', state: 'completed', origin: 'tau', line: 'Last run: Finished · pyramid.gcode.3mf' },
    { name: 'failed external', state: 'failed', origin: 'external', line: 'Last run: Failed · pyramid.gcode.3mf' },
    { name: 'cancelled', state: 'cancelled', origin: 'tau', line: 'Last run: Cancelled · pyramid.gcode.3mf' },
  ] as const)(
    'reads a $name run the printer still reports as one quiet line, never as live',
    async ({ state, origin, line }) => {
      const run = printing();
      // The X1C reported its failed run as layer 0 of 0 with a full bar until the next print.
      const progress = {
        ...printingRun.progress,
        fraction: 1,
        counters: [{ id: 'layer', label: 'Layer', current: 0, total: 0 }],
      };
      renderPane(
        createFixture({
          entries: [
            {
              ...run,
              snapshot: {
                ...run.snapshot,
                state: { status: 'ready' },
                run: { ...printingRun, state, origin, progress },
              },
            },
          ],
        }).client,
      );
      await findMachine('Ready');
      const ended = await screen.findByRole('region', { name: 'Run' });
      expect(ended).toHaveTextContent(new RegExp(`^${line}$`, 'u'));
      expect(within(ended).queryByRole('progressbar')).not.toBeInTheDocument();
      expect(within(ended).queryByRole('button')).not.toBeInTheDocument();
    },
  );

  it('says a live run was not started from Tau rather than where it was started', async () => {
    const run = printing();
    renderPane(
      createFixture({
        entries: [{ ...run, snapshot: { ...run.snapshot, run: { ...printingRun, origin: 'external' } } }],
      }).client,
    );
    await findMachine('Printing');
    const live = screen.getByRole('region', { name: 'Run' });
    expect(live).toHaveTextContent('not started from Tau');
    expect(live).not.toHaveTextContent('started at the machine');
  });

  it("names the run by the program the person approved, not the printer's upload name", async () => {
    const started = agentJob({ state: 'started', run: { runId: 'provider-run-1', outcome: 'running' } });
    const uploaded = printing();
    renderPane(
      createFixture({
        entries: [
          {
            ...uploaded,
            snapshot: { ...uploaded.snapshot, run: { ...printingRun, program: { name: 'tau-3f2a9c.gcode.3mf' } } },
          },
        ],
        jobs: [started],
      }).client,
    );
    await findMachine('Printing');
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Run' })).toHaveTextContent(/^pyramid\.gcode\.3mf · /u);
    });
    expect(screen.getByRole('region', { name: 'Run' })).not.toHaveTextContent('tau-3f2a9c');
  });

  it('holds an open job while a run is in progress and disables every control while stale', async () => {
    const fixture = createFixture({ jobs: [agentJob()] });
    renderPane(fixture.client);

    const region = await screen.findByRole('region', { name: jobRegionName });
    fireEvent.click(within(region).getByRole('checkbox', { name: 'The build plate is clear' }));
    const start = within(region).getByRole('button', { name: 'Start print' });
    expect(start).toBeEnabled();

    act(() => {
      fixture.observe(printing());
    });
    await waitFor(() => {
      expect(start).toBeDisabled();
    });
    expect(
      within(region).getByText('Workshop X1C has a run in progress. Start another once it ends.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeEnabled();

    act(() => {
      fixture.goStale();
    });
    await findMachine('Stale observation');
    expect(screen.getByRole('button', { name: 'Pause' })).toBeDisabled();
    expect(start).toBeDisabled();
    expect(
      within(region).getByText('Wait for a current observation from Workshop X1C before starting.'),
    ).toBeInTheDocument();
  });

  it('lists the operations Tau sent with how the machine confirmed each', async () => {
    const idle = entry();
    const machine = entry({
      snapshot: {
        ...idle.snapshot,
        operations: [
          {
            operationId: 'operation-light',
            machineId: 'machine-1',
            kind: 'action',
            inputDigest: artifact.digest,
            state: 'accepted',
            updatedAt: later,
            requestedBy: { kind: 'agent', id: 'agent-1', label: 'Tau agent' },
            action: { componentId: 'filament', id: 'material.set', label: 'Set material' },
          },
          {
            operationId: 'operation-fan',
            machineId: 'machine-1',
            kind: 'action',
            inputDigest: artifact.digest,
            state: 'confirming',
            updatedAt: timestamp,
            action: { componentId: 'part-fan', id: 'level.set', label: 'Part fan' },
          },
        ],
      },
    });
    renderPane(createFixture({ entries: [machine] }).client);
    await findMachine('Ready');
    openDisclosure(/^History/u);
    const operations = screen.getByRole('list', { name: 'Operations' });
    const [setMaterial, fan] = within(operations).getAllByRole('listitem');
    expect(setMaterial).toHaveTextContent('Set materialDone · seen');
    expect(within(setMaterial!).getByLabelText('by Tau agent')).toBeInTheDocument();
    expect(fan).toHaveTextContent('Part fanWaiting for the report');
  });

  it('holds an agent’s request for a control not yet qualified, even while a person tests it', async () => {
    const approval = {
      interruptId: 'interrupt-2',
      kind: 'approval',
      prompt: 'Load filament from A2?',
      options: [],
      messageId: 'assistant-1',
      approvalId: 'interrupt-2',
      context: { machineId: 'machine-1', componentId: 'filament', action: 'material.load', operationId: 'op-9' },
    } as const;
    const { bridge } = createBridge(undefined, [
      {
        approval,
        machineId: 'machine-1',
        componentId: 'filament',
        action: 'material.load',
        operationId: 'op-9',
        label: 'Load',
        parameters: {},
        version: 1,
        expectedRunId: null,
        prompt: approval.prompt,
      },
    ]);
    renderPane(createFixture({ entries: [entry({ testing: true })] }).client, bridge);
    const card = await screen.findByRole('region', { name: 'Agent request' });
    expect(card).toHaveTextContent('The agent asks to: LoadUnqualified');
    expect(card).toHaveTextContent('The printer heats the nozzle and feeds filament.');
    expect(card).toHaveTextContent('Load is not yet qualified on this machine; only a person testing it may try it.');
    expect(within(card).getByRole('button', { name: 'Approve' })).toBeDisabled();
  });

  it('records an agent’s approved action on the host, then answers the chat', async () => {
    const approval = {
      interruptId: 'interrupt-2',
      kind: 'approval',
      prompt: 'Chamber light ({"on":true}) on Workshop X1C?',
      options: [],
      messageId: 'assistant-1',
      approvalId: 'interrupt-2',
      context: { machineId: 'machine-1', componentId: 'chamber-light', action: 'switch.set', operationId: 'op-9' },
    } as const;
    const { bridge, respond } = createBridge(undefined, [
      {
        approval,
        machineId: 'machine-1',
        componentId: 'chamber-light',
        action: 'switch.set',
        operationId: 'op-9',
        label: 'Chamber light',
        parameters: { on: true },
        version: 1,
        expectedRunId: 'provider-run-1',
        prompt: approval.prompt,
      },
    ]);
    const fixture = createFixture({ entries: [qualifiedLight()] });
    const user = userEvent.setup();
    renderPane(fixture.client, bridge);

    const card = await screen.findByRole('region', { name: 'Agent request' });
    await user.click(within(card).getByRole('button', { name: 'Approve' }));
    await waitFor(() => {
      expect(respond).toHaveBeenCalledExactlyOnceWith('interrupt-2', true);
    });
    // The person's own session records the approval for this exact intent before the chat is answered (R15).
    expect(fixture.approveAction).toHaveBeenCalledExactlyOnceWith({
      machineId: 'machine-1',
      operationId: 'op-9',
      intent: {
        componentId: 'chamber-light',
        action: 'switch.set',
        version: 1,
        expectedRunId: 'provider-run-1',
        parameters: { on: true },
      },
      decision: 'approve',
      approvedBy: { kind: 'user', id: 'operator', label: 'You' },
    });
    expect(fixture.approveAction.mock.invocationCallOrder[0]).toBeLessThan(respond.mock.invocationCallOrder[0]!);
    // The paused tool sends the action; the pane never applies the agent's intent itself.
    expect(fixture.applyAction).not.toHaveBeenCalled();
  });

  it('records a decline on the host before answering, and leaves the chat unanswered when the host refuses', async () => {
    const approval = {
      interruptId: 'interrupt-4',
      kind: 'approval',
      prompt: 'Chamber light ({"on":true}) on Workshop X1C?',
      options: [],
      messageId: 'assistant-1',
      approvalId: 'interrupt-4',
      context: { machineId: 'machine-1', componentId: 'chamber-light', action: 'switch.set', operationId: 'op-11' },
    } as const;
    const { bridge, respond } = createBridge(undefined, [
      {
        approval,
        machineId: 'machine-1',
        componentId: 'chamber-light',
        action: 'switch.set',
        operationId: 'op-11',
        label: 'Chamber light',
        parameters: { on: true },
        version: 1,
        expectedRunId: null,
        prompt: approval.prompt,
      },
    ]);
    const fixture = createFixture({ entries: [qualifiedLight()] });
    fixture.approveAction.mockResolvedValueOnce({
      status: 'refused',
      code: 'MACHINE_ACTION_APPROVAL_REQUIRED',
      message: 'This approval has expired; ask the agent again.',
    });
    const user = userEvent.setup();
    renderPane(fixture.client, bridge);
    const card = await screen.findByRole('region', { name: 'Agent request' });

    await user.click(within(card).getByRole('button', { name: 'Approve' }));
    expect(await within(card).findByText('This approval has expired; ask the agent again.')).toBeVisible();
    expect(respond).not.toHaveBeenCalled();

    await user.click(within(card).getByRole('button', { name: 'Decline' }));
    await waitFor(() => {
      expect(respond).toHaveBeenCalledExactlyOnceWith('interrupt-4', false);
    });
    expect(fixture.approveAction).toHaveBeenLastCalledWith(expect.objectContaining({ decision: 'deny' }));
  });

  it('shows the values of the exact intent an agent asks to apply before it can be approved', async () => {
    const approval = {
      interruptId: 'interrupt-3',
      kind: 'approval',
      prompt: 'Chamber light ({"on":false}) on Workshop X1C?',
      options: [],
      messageId: 'assistant-1',
      approvalId: 'interrupt-3',
      context: {
        machineId: 'machine-1',
        componentId: 'chamber-light',
        action: 'switch.set',
        operationId: 'op-10',
        label: 'Chamber light',
      },
    } as const;
    const { bridge } = createBridge(undefined, [
      {
        approval,
        machineId: 'machine-1',
        componentId: 'chamber-light',
        action: 'switch.set',
        operationId: 'op-10',
        label: 'Chamber light',
        parameters: { on: false },
        version: 1,
        expectedRunId: null,
        prompt: approval.prompt,
      },
    ]);
    renderPane(createFixture({ entries: [qualifiedLight()] }).client, bridge);
    const card = await screen.findByRole('region', { name: 'Agent request' });
    const values = within(card).getByRole('definition');
    expect(values).toHaveTextContent('false');
    expect(within(card).getByText('On')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Approve' })).toBeEnabled();
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
    materials: [{ slot: 0, materialId: 'PLA', profileId: 'GFA01' }],
  };
  /** The real printer, which takes only Bambu Studio archives. */
  const realPrinter = (): ReturnType<typeof entry> => entry({ providerId: 'bambu' });
  /** The printer and filament presets are overrides under Advanced settings; the process stays in Prepare. */
  const combobox = (name: string): HTMLElement => {
    if (
      (name === 'Printer preset' || name.startsWith('Filament ')) &&
      screen.queryByRole('combobox', { name }) === null
    ) {
      fireEvent.click(screen.getByRole('button', { name: /^Advanced settings/u }));
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
    // Bambu Studio working as expected needs no line of its own: its process preset is the sign.
    await waitFor(() => {
      expect(combobox('Process')).toHaveTextContent(selectedLabel(standard));
    });
    return { fixture, studio };
  };

  /** Open Advanced and one settings group of the shared Parameters form. */
  const openGroup = async (user: ReturnType<typeof userEvent.setup>, group: string): Promise<void> => {
    if (screen.queryByRole('group', { name: 'Bambu Studio settings' }) === null) {
      await openAdvancedSettings(user);
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
    // The slicer and its version are inspection detail.
    openDisclosure(/^Inspect/u);
    expect(screen.getByText('Slicer').nextElementSibling).toHaveTextContent(`Bambu Studio ${bambuStudioVersion}`);
    expect(screen.queryByText(/^Slicing with/u)).not.toBeInTheDocument();
    expect(combobox('Printer preset')).toHaveTextContent(selectedLabel(x1c));
    // The tray's Bambu filament id picks the preset; the tray's own type and colour sit beside it.
    expect(combobox('Filament A1')).toHaveTextContent(selectedLabel(plaMatte));
    // Compatible processes only, with the person's presets apart from the system ones.
    await user.click(combobox('Process'));
    expect(screen.getByRole('group', { name: 'Your presets' })).toHaveTextContent('0.20mm Standard Gyroid PETG');
    expect(screen.queryByRole('option', { name: '0.20mm Standard @BBL P1P' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');

    summarizeGcodeContainerMock.mockReturnValueOnce(bambuStudioSliceSummary);
    await user.click(prepareActions().getByRole('button', { name: 'Slice and preview' }));
    await waitFor(() => {
      expect(mockExport).toHaveBeenCalledExactlyOnceWith('gcode.3mf', {
        signal: signalMatcher,
        options: {
          engine: 'bambu-studio',
          bambuStudio: { printer: x1c, process: standard, filaments: [plaMatte], plate: 'textured-pei' },
        },
      });
    });
    const result = await sliceDetails();
    expect(within(result).getByText('Sliced by').nextElementSibling).toHaveTextContent(
      `Bambu Studio ${bambuStudioVersion}`,
    );
    expect(within(result).getByText('Time').nextElementSibling).toHaveTextContent(
      'about 28 min (Bambu Studio estimate)',
    );

    // A Bambu Studio archive is what the real printer takes: the request names its producer.
    await user.click(await reviewPrint());
    await waitFor(() => {
      expect(fixture.requestJob).toHaveBeenCalledOnce();
    });
    expect(fixture.requestJob.mock.calls.at(0)?.[0].program).toMatchObject({
      name: 'main.gcode.3mf',
      estimatedDuration: 1_703_000,
      producer: { name: 'Bambu Studio', version: bambuStudioVersion },
      facts: { process: 'fff', layers: 125, filamentLength: 3200 },
    });
    expect(fixture.requestJob.mock.calls.at(0)?.[0].configuration).toMatchObject({
      expectedBedType: 'textured-pei',
      expectedMaterials: [{ slot: 0, materialId: 'PLA' }],
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
    expect(screen.getByRole('button', { name: /^Advanced settings/u })).toHaveTextContent(/^Advanced settings$/u);
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

    await user.click(prepareActions().getByRole('button', { name: 'Slice and preview' }));
    await waitFor(() => {
      expect(mockExport).toHaveBeenCalledExactlyOnceWith('gcode.3mf', {
        signal: signalMatcher,
        options: {
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
    expect(await prepareActions().findByRole('button', { name: 'Review print' })).toBeInTheDocument();

    // A changed setting after slicing makes the slice stale, as a changed option does.
    await user.clear(screen.getByRole('searchbox', { name: 'Filter settings' }));
    await openGroup(user, 'Strength');
    enter('Wall Loops', '4');
    expect(
      await screen.findByText('Options changed since this slice. Slice again to send the current settings.'),
    ).toBeInTheDocument();
    // A stale slice is never offered for sending: Slice again takes Send's place.
    expect(prepareActions().queryByRole('button', { name: 'Review print' })).not.toBeInTheDocument();
    expect(prepareActions().getByRole('button', { name: 'Slice again' })).toBeEnabled();

    const accessibility = await axe.run(document.body, { rules: { region: { enabled: false } } });
    expect(accessibility.violations).toEqual([]);
  });

  it('blocks sending the previous slice when a new filament choice fails to resolve', async () => {
    const user = userEvent.setup();
    const { studio } = await renderStudio();
    summarizeGcodeContainerMock.mockReturnValueOnce(bambuStudioSliceSummary);
    await user.click(prepareActions().getByRole('button', { name: 'Slice and preview' }));
    await reviewPrint();

    studio.resolveSelection.mockRejectedValueOnce(new Error('No compatible process for Bambu PETG Basic @BBL X1C.'));
    await chooseOption(user, combobox('Filament A1'), 'Bambu PETG Basic @BBL X1C');
    expect(await screen.findByText('No compatible process for Bambu PETG Basic @BBL X1C.')).toBeInTheDocument();
    // The previous slice no longer matches the chosen filament: it is never offered for sending, and
    // slicing again waits until the presets resolve.
    expect(prepareActions().queryByRole('button', { name: 'Review print' })).not.toBeInTheDocument();
    expect(prepareActions().getByRole('button', { name: 'Slice again' })).toBeDisabled();
  });

  describe('with a model of several colours', () => {
    const petg = 'Bambu PETG Basic @BBL X1C';
    /** The real printer with a red and a blue PLA tray and a blue PETG one, colours as the printer reports them. */
    const colourful = (slots?: readonly MaterialSlotSnapshot[]) =>
      withSlots(
        realPrinter(),
        slots ?? [
          loadedSlot('ams-a/a1', 'PLA', { color: redTray }),
          loadedSlot('ams-a/a2', 'PLA', { color: blueTray }),
          loadedSlot('ams-a/a3', 'PETG', { color: blueTray, profileId: 'GFG00' }),
        ],
      );
    /** Bambu Studio's slice of a blue part (filament 1) and a red one (filament 2). */
    const twoColours = { ...bambuStudioSliceSummary, filamentColors: [blue, red] };
    const slot = (filament: number): HTMLElement => combobox(`Slot for Filament ${String(filament)}`);

    const sliceTwoColours = async (
      user: ReturnType<typeof userEvent.setup>,
      machine: ReturnType<typeof entry>,
    ): Promise<ReturnType<typeof createFixture>> => {
      const { fixture } = await renderStudio(machine);
      summarizeGcodeContainerMock.mockReturnValueOnce(twoColours);
      await user.click(prepareActions().getByRole('button', { name: 'Slice and preview' }));
      await screen.findByRole('group', { name: 'Filaments' });
      return fixture;
    };

    it('reads the colours of the model before a slice and maps each to a tray of its colour', async () => {
      await renderStudio(colourful());
      /* A red part and a blue part, as the kernel renders them: one glTF material each. */
      const twoParts = new TextEncoder().encode(
        JSON.stringify({
          nodes: [{ mesh: 0 }, { mesh: 1 }],
          meshes: [{ primitives: [{ material: 0 }] }, { primitives: [{ material: 1 }] }],
          materials: [
            { pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1] } },
            { pbrMetallicRoughness: { baseColorFactor: [0, 0, 1, 1] } },
          ],
        }),
      );
      act(() => {
        renderGeometry(twoParts);
      });

      await screen.findByRole('group', { name: 'Filaments' });
      expect(screen.queryByRole('group', { name: 'Material' })).not.toBeInTheDocument();
      expect(slot(1)).toHaveTextContent(selectedLabel('0'));
      expect(slot(2)).toHaveTextContent(selectedLabel('1'));
      expect(mockExport).not.toHaveBeenCalled();
    });

    it('never maps a filament to the external spool, and says why it is not offered', async () => {
      const user = userEvent.setup();
      // oxlint-disable-next-line tau-lint/no-hardcoded-color -- the RGBA a machine reports for a blue spool
      const externalBlue = loadedSlot('external/spool', 'PLA', { color: blueTray });
      await sliceTwoColours(
        user,
        colourful([
          externalBlue,
          loadedSlot('ams-a/a1', 'PLA', { color: redTray }),
          loadedSlot('ams-a/a2', 'PLA', { color: blueTray }),
          loadedSlot('ams-a/a3', 'PETG', { color: blueTray, profileId: 'GFG00' }),
        ]),
      );
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
      const send = await prepareActions().findByRole('button', { name: 'Review print' });
      await waitFor(() => {
        expect(send).toBeEnabled();
      });
      expect(mockExport).toHaveBeenCalledOnce();
      const accessibility = await axe.run(document.body, { rules: { region: { enabled: false } } });
      expect(accessibility.violations).toEqual([]);

      await user.click(send);
      await waitFor(() => {
        expect(fixture.requestJob).toHaveBeenCalledOnce();
      });
      expect(fixture.requestJob.mock.calls.at(0)?.[0].configuration).toMatchObject({
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
        expect(prepareActions().getByRole('button', { name: 'Review print' })).toBeEnabled();
      });

      await chooseOption(user, slot(1), '2');
      expect(
        await screen.findByText('Options changed since this slice. Slice again to send the current settings.'),
      ).toBeInTheDocument();
      // A stale slice is never offered for sending: Slice again takes Send's place.
      expect(prepareActions().queryByRole('button', { name: 'Review print' })).not.toBeInTheDocument();
      expect(prepareActions().getByRole('button', { name: 'Slice again' })).toBeEnabled();
      // Presets per tray, as Bambu Studio resolves them.
      await waitFor(() => {
        expect(combobox('Filament A3')).toHaveTextContent(selectedLabel(petg));
      });
      summarizeGcodeContainerMock.mockReturnValueOnce(twoColours);
      await user.click(prepareActions().getByRole('button', { name: 'Slice again' }));
      await waitFor(() => {
        expect(mockExport).toHaveBeenLastCalledWith('gcode.3mf', {
          signal: signalMatcher,
          options: {
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
        colourful([loadedSlot('ams-a/a1', 'PLA', { color: redTray }), emptySlot('ams-a/a2')]),
      );
      expect(slot(1)).toHaveTextContent(selectedLabel(''));
      expect(slot(2)).toHaveTextContent(selectedLabel('0'));
      expect(
        await prepareActions().findByText('Filament 1 has no slot. Choose a loaded slot for it before sending.'),
      ).toBeInTheDocument();
      const send = prepareActions().getByRole('button', { name: 'Review print' });
      expect(send).toBeDisabled();
      expect(send).toHaveAccessibleDescription('Filament 1 has no slot. Choose a loaded slot for it before sending.');
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
    await user.click(prepareActions().getByRole('button', { name: 'Slice and preview' }));
    const result = await sliceDetails();
    expect(within(result).getByRole('status')).toHaveTextContent(refusal);
    expect(within(result).queryByText('Toolpath')).not.toBeInTheDocument();
    expect(within(result).queryByText(/fits the plate/u)).not.toBeInTheDocument();
    await reviewPrint();
  });

  it('shows what the slicer warned about a slice it still made', async () => {
    const user = userEvent.setup();
    await renderStudio();
    summarizeGcodeContainerMock.mockReturnValueOnce(bambuStudioSliceSummary);
    const merged = `The printer loads at most 4 filaments, so the model's 5 colours print as one, in ${red}.`;
    mockExport.mockResolvedValueOnce({
      success: true,
      exportId: 'gcode.3mf',
      evaluationId: 'mock-evaluation',
      files: [{ name: 'main.gcode.3mf', bytes: new Uint8Array([1]), mimeType: 'application/vnd.bambulab.gcode-3mf' }],
      issues: [{ message: merged, code: 'REPRESENTATION_UNSUPPORTED', severity: 'warning' }],
    });
    await user.click(prepareActions().getByRole('button', { name: 'Slice and preview' }));
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
    await user.click(prepareActions().getByRole('button', { name: 'Slice and preview' }));

    const result = await sliceDetails();
    expect(within(result).getByText('Part').nextElementSibling).toHaveTextContent('19.6 × 19.6 × 20 mm');
    expect(within(result).getByText('Toolpath').nextElementSibling).toHaveTextContent(
      "240 × 268 × 121.5 mm · every nozzle move, including the printer's start routine",
    );
    expect(within(result).getByText('Plate').nextElementSibling).toHaveTextContent('The part fits the plate');
    expect(within(result).queryByRole('alert')).not.toBeInTheDocument();
    const send = await reviewPrint();
    expect(send).not.toHaveAccessibleDescription();
  });

  it('should hold Send with a part-worded reason when the part itself leaves the plate', async () => {
    const user = userEvent.setup();
    await renderStudio();
    summarizeGcodeContainerMock.mockReturnValueOnce({
      ...cubeOnX1c,
      partBounds: { min: [240.4, 118.2, 0], max: [260, 137.8, 20] },
    });
    await user.click(prepareActions().getByRole('button', { name: 'Slice and preview' }));

    const reason = 'The part does not fit the plate: 260 mm is larger than the 256 mm plate on X.';
    const send = await prepareActions().findByRole('button', { name: 'Review print' });
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

  it("holds the real printer's send on its own producer check when Bambu Studio is unavailable, and keeps the simulator sendable", async () => {
    const user = userEvent.setup();
    const unavailable = createBambuStudio(false);
    desktopHost.bambuStudio = unavailable;
    const fixture = createFixture({ entries: [realPrinter()] });
    const producer = 'Slice it with Bambu Studio in Tau (desktop app with Bambu Studio installed), then send it again.';
    // The printer, not the pane, says which files it takes: its job check refuses the reference slicer's.
    fixture.checkJob.mockResolvedValue({
      status: 'blocked',
      program: { name: 'main.gcode.3mf', facts: { process: 'other' } },
      checks: [
        { id: 'producer', label: 'Sliced by Bambu Studio', state: 'blocked', source: 'computed', detail: producer },
      ],
      configuration: {},
    });
    const { unmount } = renderPane(fixture.client);
    await findMachine('Ready');
    expect(
      await within(prepareRegion()).findByText(
        "Slicing with Tau's reference slicer: Bambu Studio is not available here.",
      ),
    ).toBeInTheDocument();
    expect(unavailable.catalog).not.toHaveBeenCalled();

    // The reference engine still slices and previews; only Send waits.
    await user.click(prepareActions().getByRole('button', { name: 'Slice and preview' }));
    await waitFor(() => {
      expect(mockExport).toHaveBeenCalledExactlyOnceWith('gcode.3mf', {
        signal: signalMatcher,
        options: machineSliceOptions,
      });
    });
    const send = await prepareActions().findByRole('button', { name: 'Review print' });
    await waitFor(() => {
      expect(send).toHaveAccessibleDescription(`Sliced by Bambu Studio: ${producer}`);
    });
    expect(send).toBeDisabled();
    unmount();

    // The web build has no bridge; the simulator takes the reference slice.
    desktopHost.bambuStudio = undefined;
    renderPane(createFixture().client);
    expect(
      await screen.findByText("Slicing with Tau's reference slicer: Bambu Studio is not available here."),
    ).toBeInTheDocument();
    await user.click(prepareActions().getByRole('button', { name: 'Slice and preview' }));
    await reviewPrint();
  });

  it("names the slicer on an agent's job and states the machine's own refusal", async () => {
    const { program } = agentJob();
    const fixture = createFixture({
      jobs: [agentJob({ program: { ...program, producer: { name: 'Bambu Studio', version: bambuStudioVersion } } })],
    });
    const rendered = renderPane(fixture.client);
    const region = await screen.findByRole('region', { name: jobRegionName });
    expect(
      within(region).getByText(`Requested by Tau agent · sliced by Bambu Studio ${bambuStudioVersion}`),
    ).toBeInTheDocument();
    rendered.unmount();

    const refused = createFixture({
      jobs: [
        agentJob({
          state: 'failed',
          failure: { code: 'MACHINE_JOB_ARTIFACT_UNQUALIFIED', message: 'This file was not sliced by Bambu Studio.' },
        }),
      ],
    });
    renderPane(refused.client);
    // The provider's words, as it reported them; the pane adds no vendor copy of its own.
    expect(await screen.findByText('This file was not sliced by Bambu Studio.')).toBeInTheDocument();
  });

  it("should keep the printer's reason, without parsing it, when it refuses a start", async () => {
    const reason = 'mqtt message verify failed';
    const refused = createFixture({
      entries: [realPrinter()],
      jobs: [
        agentJob({
          state: 'rejected',
          startOperationId: 'operation-start-1',
          receipt: {
            operationId: 'operation-start-1',
            machineId: 'machine-1',
            kind: 'start',
            status: 'rejected',
            code: 'MACHINE_ACTION_PROVIDER_REJECTED',
            message: reason,
            observedAt: timestamp,
          },
          failure: { code: 'MACHINE_ACTION_PROVIDER_REJECTED', message: reason },
        }),
      ],
    });
    renderPane(refused.client);

    const jobs = await screen.findByRole('region', { name: 'Jobs' });
    expect(jobs).toHaveTextContent('The machine rejected the start (MACHINE_ACTION_PROVIDER_REJECTED)');
    expect(jobs).toHaveTextContent(reason);
    expect(jobs).not.toHaveTextContent('Developer Mode');
  });
});

describe('Print pane print settings file', () => {
  const x1c = 'Bambu Lab X1 Carbon 0.4 nozzle';
  const fine = '0.12mm Fine @BBL X1C';
  const gyroid = '0.20mm Standard Gyroid PETG @BBL X1C';
  const petg = 'Bambu PETG Basic @BBL X1C';
  /** The printer and filament presets are overrides under Advanced settings; the process stays in Prepare. */
  const combobox = (name: string): HTMLElement => {
    if (
      (name === 'Printer preset' || name.startsWith('Filament ')) &&
      screen.queryByRole('combobox', { name }) === null
    ) {
      fireEvent.click(screen.getByRole('button', { name: /^Advanced settings/u }));
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
    // The filament override in Advanced settings is named where the material is chosen.
    expect(screen.getByText('Sliced as Bambu PETG Basic')).toBeInTheDocument();

    expect(studio.resolveSelection).toHaveBeenLastCalledWith({
      hints: {
        model: 'X1C',
        nozzleDiameter: 0.4,
        preset: 'fine',
        plate: 'cool',
        materials: [{ slot: 0, materialId: 'PLA', profileId: 'GFA01' }],
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
    await openAdvancedSettings(user);
    await user.click(
      within(await screen.findByRole('group', { name: 'Bambu Studio settings' })).getByRole('button', {
        name: 'Group: Strength',
      }),
    );
    expect(screen.getByRole('spinbutton', { name: 'Input for Wall Loops' })).toHaveValue('3');
    expect(reset('Wall Loops')).toBeInTheDocument();

    summarizeGcodeContainerMock.mockReturnValueOnce(bambuStudioSliceSummary);
    await user.click(prepareActions().getByRole('button', { name: 'Slice and preview' }));
    await waitFor(() => {
      expect(mockExport).toHaveBeenCalledExactlyOnceWith('gcode.3mf', {
        signal: signalMatcher,
        options: {
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
    await findMachine('Ready');
    await openAdvancedSettings(user);
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

    await user.click(prepareActions().getByRole('button', { name: 'Slice and preview' }));
    await waitFor(() => {
      expect(mockExport).toHaveBeenCalledExactlyOnceWith('gcode.3mf', {
        signal: signalMatcher,
        options: { ...machineSliceOptions, nozzleDiameter: 0.6, layerHeight: 0.16 },
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
    await findMachine('Ready');

    expect(await within(prepareRegion()).findByRole('alert')).toHaveTextContent(/newer|unsupported/iu);
    expect(within(prepareRegion()).getByRole('combobox', { name: 'Profile' })).toBeDisabled();
    const slice = prepareActions().getByRole('button', { name: 'Slice and preview' });
    expect(slice).toBeDisabled();
    expect(slice).toHaveAccessibleDescription('Waiting for the print settings file.');
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
    await findMachine('Ready');

    await chooseOption(user, screen.getByRole('combobox', { name: 'Quality' }), 'Fine');
    await expectPreferences({ preset: 'fine' });
    expect(projectFiles.read(otherPath)).toBe(other);
    expect(within(prepareRegion()).queryByText(/another printer model/u)).not.toBeInTheDocument();
  });

  it('should rebase a disjoint external edit and refuse a concurrent change to the same preference', async () => {
    const user = userEvent.setup();
    renderPane(createFixture().client);
    await findMachine('Ready');
    const quality = (): HTMLElement => screen.getByRole('combobox', { name: 'Quality' });
    // First create the profile so subsequent conflicts refer to its captured fields.
    await chooseOption(user, quality(), 'Standard');
    await expectPreferences({ preset: 'standard' });
    projectFiles.race(preferencesBytes({ plate: 'cool', preset: 'standard' }));
    await chooseOption(user, quality(), 'Fine');
    await expectPreferences({ plate: 'cool', preset: 'fine' });
    projectFiles.race(preferencesBytes({ plate: 'cool', preset: 'standard' }));
    await chooseOption(user, quality(), 'Fast');
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
    await findMachine('Ready');
    const profile = () => within(prepareRegion()).getByRole('combobox', { name: 'Profile' });
    await waitFor(() => {
      expect(profile()).toBeEnabled();
    });
    expect(projectFiles.read(settingsPath)).toBeUndefined();
    await chooseOption(user, screen.getByRole('combobox', { name: 'Quality' }), 'Fine');
    await expectPreferences({ preset: 'fine' });
    // Each verb is a menu item; naming opens the shared naming form under the menu's button.
    await user.click(screen.getByRole('button', { name: 'Manage profiles' }));
    await user.click(screen.getByRole('menuitem', { name: 'Duplicate profile…' }));
    const copyName = await screen.findByRole('textbox', { name: 'Name for the copy of Default' });
    expect(copyName).toHaveValue('Default copy');
    await user.clear(copyName);
    await user.type(copyName, 'Production');
    await user.click(screen.getByRole('button', { name: 'Duplicate profile' }));
    await waitFor(() => {
      expect(profile()).toHaveTextContent('Production');
    });
    await chooseOption(user, screen.getByRole('combobox', { name: 'Quality' }), 'Fast');
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
    await user.click(screen.getByRole('menuitem', { name: 'Rename profile…' }));
    const newName = await screen.findByRole('textbox', { name: 'New name for Production' });
    await user.clear(newName);
    await user.type(newName, 'Batch');
    await user.click(screen.getByRole('button', { name: 'Rename profile' }));
    await waitFor(() => {
      expect(profile()).toHaveTextContent('Batch');
    });
    await waitFor(() => {
      expect(projectFiles.read(settingsPath)).toContain('Batch');
    });
    // Verbs that lose settings confirm with the profile named, then hand focus back to the menu's button.
    await user.click(screen.getByRole('button', { name: 'Manage profiles' }));
    await user.click(screen.getByRole('menuitem', { name: 'Reset to defaults…' }));
    const reset = await screen.findByRole('alertdialog', { name: 'Reset “Batch” to defaults?' });
    await user.click(within(reset).getByRole('button', { name: 'Reset profile' }));
    await expectPreferences({});
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Manage profiles' })).toHaveFocus();
    });
    await user.click(screen.getByRole('button', { name: 'Manage profiles' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete profile…' }));
    const remove = await screen.findByRole('alertdialog', { name: 'Delete “Batch”?' });
    expect(remove).toHaveTextContent('“Default” becomes the profile for printers of this type.');
    await user.click(within(remove).getByRole('button', { name: 'Delete profile' }));
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
            ...x1cManifest,
            identity: { ...x1cManifest.identity, typeId: 'bambu.a1-mini' },
          },
        },
      ],
    };
    globalThis.localStorage.setItem(`tau:print:selected-machine:${projectId}`, first.machineId);
    renderPane(client);
    await findMachine('Ready');
    await chooseOption(user, screen.getByRole('combobox', { name: 'Quality' }), 'Fine');
    await expectPreferences({ preset: 'fine' });
    await chooseOption(user, screen.getByRole('combobox', { name: 'Machine' }), 'Mini');
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Profile' })).toBeEnabled();
    });
    await chooseOption(user, screen.getByRole('combobox', { name: 'Quality' }), 'Fast');
    const miniPath = machineSettingsPath({ typeId: 'bambu.a1-mini' });
    await waitFor(() => {
      expect(
        JSON.parse(projectFiles.read(miniPath)!).profiles.default.configurations[slicingPreferences.manifest.source.id]
          .values.preset,
      ).toBe('fast');
    });
    await chooseOption(user, screen.getByRole('combobox', { name: 'Machine' }), 'Workshop X1C');
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Quality' })).toHaveTextContent('Fine');
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
    await findMachine('Ready');
    await user.click(prepareActions().getByRole('button', { name: 'Slice and preview' }));
    // A fresh slice offers Send as the action; slicing again is the slice result's own control.
    const result = await screen.findByRole('group', { name: 'Slice result' });
    await waitFor(() => {
      expect(within(result).getByRole('button', { name: 'Slice again' })).toBeEnabled();
    });
    expect(mockWriteFiles).toHaveBeenCalledOnce();
    expect(projectFiles.read(slicePath)).toBe('PK\u0003\u0004');

    // The same bytes again: the file already holds them, so nothing is written.
    await user.click(within(result).getByRole('button', { name: 'Slice again' }));
    await waitFor(() => {
      expect(mockExport).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(
        within(screen.getByRole('group', { name: 'Slice result' })).getByRole('button', { name: 'Slice again' }),
      ).toBeEnabled();
    });
    expect(mockWriteFiles).toHaveBeenCalledOnce();
  });

  it('lists every job the machine holds, whichever project sent it, as Stop and Cancel act on all of them', async () => {
    const { program } = agentJob();
    const ours = agentJob({ jobId: 'job-ours', state: 'denied', program: { ...program, name: 'ours.gcode.3mf' } });
    const theirs = agentJob({
      jobId: 'job-theirs',
      state: 'denied',
      artifact: { ...artifact, projectId: otherProjectId },
      program: { ...program, name: 'theirs.gcode.3mf' },
    });
    renderPane(createFixture({ jobs: [ours, theirs] }).client);

    await findMachine('Ready');
    openDisclosure(/^History/u);
    const list = await screen.findByRole('list', { name: 'Jobs' });
    expect(within(list).getByText('ours.gcode.3mf')).toBeInTheDocument();
    expect(within(list).getByText('theirs.gcode.3mf')).toBeInTheDocument();
  });

  it('names a started job whose run the host saw interrupted, not as finished', async () => {
    const interrupted = agentJob({
      state: 'started',
      run: { runId: 'provider-run-1', outcome: 'interrupted', endedAt: later },
    });
    renderPane(createFixture({ jobs: [interrupted] }).client);

    await findMachine('Ready');
    openDisclosure(/^History/u);
    const list = await screen.findByRole('list', { name: 'Jobs' });
    expect(within(list).getByText('Interrupted')).toBeInTheDocument();
  });

  it("offers no preview of another project's job, whose file is not in this project", async () => {
    const theirs = agentJob({ artifact: { ...artifact, projectId: otherProjectId } });
    const { client } = createFixture();
    // A host that answers every project's jobs, as one that predates the filter does.
    renderPane({ ...client, listJobs: async () => [theirs] });

    const region = await screen.findByRole('region', { name: jobRegionName });
    expect(within(region).getByText('From another project')).toBeInTheDocument();
    expect(within(region).queryByRole('button', { name: 'Preview' })).not.toBeInTheDocument();
  });
});

describe('Print pane with the Bambu provider’s own manifests', () => {
  it.each([
    // The X1C declares the four AMS units it takes and the external spool; the host's installed capabilities narrow them.
    ['X1C', bambuX1cManifest, 17],
    ['A1 mini', bambuA1MiniManifest, 5],
  ])(
    'serves the %s as the provider declares it: Monitor, Control and Prepare, and no Stop while idle',
    async (_name, real, slotCount) => {
      const machine = machineEntry({ manifest: real, snapshot: entry().snapshot });
      renderPane(createFixture({ entries: [machine] }).client);

      await findMachine('Ready');
      const monitor = screen.getByRole('region', { name: 'Monitor' });
      // The plate is a fact beside the heaters, by the name the manifest gives it.
      expect(monitor).toHaveTextContent('PlateTextured PEI plate');
      const slots = within(monitor).getByRole('list', { name: 'Material slots' });
      expect(within(slots).getAllByRole('listitem')).toHaveLength(slotCount);
      expect(screen.getByRole('button', { name: /^Control/u })).toBeInTheDocument();
      expect(prepareActions().getByRole('button', { name: 'Slice and preview' })).toBeEnabled();
      // Nothing to stop on an idle printer, and nothing above the stages asks whether the person is there.
      expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument();
      expect(screen.queryByRole('switch', { name: 'I am at the machine' })).not.toBeInTheDocument();
    },
  );

  it('asks "I am at the machine" beside the X1C’s motion, and sends Home with it once ticked', async () => {
    const machine = machineEntry({ manifest: bambuX1cManifest, snapshot: entry().snapshot, testing: true });
    const fixture = createFixture({ entries: [machine] });
    const user = userEvent.setup();
    renderPane(fixture.client);

    await findMachine('Ready');
    openDisclosure(/^Control/u);
    const motion = screen.getByRole('group', { name: 'Motion' });
    const home = within(motion).getByRole('button', { name: /^Home/u });
    expect(home).toBeDisabled();
    await user.click(within(motion).getByRole('switch', { name: 'I am at the machine' }));
    expect(home).toBeEnabled();
    await user.click(home);
    await waitFor(() => {
      expect(fixture.applyAction).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ action: 'motion.home', attended: true }),
      );
    });
  });
});

/** The LongMill, homed and idle, with testing on so its designed controls can be tried. */
const router = (overrides: Partial<Parameters<typeof machineEntry>[0]> = {}): ReturnType<typeof entry> =>
  machineEntry({
    manifest: routerManifest,
    name: 'Garage LongMill',
    providerId: 'grbl-simulator',
    testing: true,
    snapshot: machineSnapshot(millingComponents(routerManifest)),
    ...overrides,
  });

/** A control as the pane holds it, for the decisions that read one. */
const controlOf = (machine: ReturnType<typeof entry>, overrides: Partial<MachineControl> = {}): MachineControl => ({
  entry: machine,
  attended: false,
  setAttended: vi.fn(),
  check: vi.fn(),
  apply: vi.fn(),
  pending: undefined,
  error: undefined,
  stop: vi.fn(),
  isStopping: false,
  beginHold: vi.fn(),
  endHold: vi.fn(),
  hold: undefined,
  ...overrides,
});

describe('Print pane presence, Stop and jobs across machines', () => {
  it.each([
    { when: 'a jog is held', overrides: { hold: { parameters: { axis: 'x', direction: 1, feed: 1000 } } } },
    { when: 'a stop is in flight', overrides: { isStopping: true } },
  ] as const)('offers Stop while $when on an idle printer', ({ overrides }) => {
    expect(hasSomethingToStop(controlOf(entry()))).toBe(false);
    expect(hasSomethingToStop(controlOf(entry(), overrides))).toBe(true);
  });

  it('offers Stop for an operation still confirming, and for a stale machine whose last word was not idle', () => {
    const idle = entry();
    const confirming = entry({
      snapshot: {
        ...idle.snapshot,
        operations: [
          {
            operationId: 'operation-fan',
            machineId: 'machine-1',
            kind: 'action',
            inputDigest: artifact.digest,
            state: 'confirming',
            updatedAt: later,
          },
        ],
      },
    });
    expect(hasSomethingToStop(controlOf(confirming))).toBe(true);
    const unknown = { ...idle.snapshot, state: { status: 'unknown' } } as const;
    expect(hasSomethingToStop(controlOf(entry({ snapshot: unknown })))).toBe(false);
    expect(hasSomethingToStop(controlOf(entry({ snapshot: unknown, freshness: 'stale' })))).toBe(true);
    expect(hasSomethingToStop(controlOf(entry({ freshness: 'stale' })))).toBe(false);
  });

  it('keeps Stop live on a stale machine and sends every press as its own stop, even while one is in flight', async () => {
    const fixture = createFixture({ entries: [{ ...printing(), freshness: 'stale' }] });
    const pending = Promise.withResolvers<Awaited<ReturnType<MachineClient['stop']>>>();
    fixture.stop.mockReturnValueOnce(pending.promise);
    const user = userEvent.setup();
    renderPane(fixture.client);
    await findMachine('Stale observation');

    const stop = screen.getByRole('button', { name: 'Stop' });
    expect(stop).toBeEnabled();
    await user.click(stop);
    expect(stop).toBeEnabled();
    await user.click(stop);
    await waitFor(() => {
      expect(fixture.stop).toHaveBeenCalledTimes(2);
    });
    const [first, second] = fixture.stop.mock.calls.map(([input]) => input.operationId);
    expect(first).not.toBe(second);
    pending.resolve({
      operationId: first ?? 'stop-1',
      machineId: 'machine-1',
      kind: 'stop',
      status: 'accepted',
      observedAt: later,
    });
    // A stop never waits behind another, and nothing else is sent instead.
    expect(fixture.applyAction).not.toHaveBeenCalled();
    expect(fixture.reconcileOperation).not.toHaveBeenCalled();
  });

  it('forgets "I am at the machine" when another machine is chosen', async () => {
    const first = machineEntry({ manifest: bambuX1cManifest, snapshot: entry().snapshot, testing: true });
    const second = machineEntry({
      manifest: bambuX1cManifest,
      machineId: 'machine-2',
      name: 'Spare X1C',
      snapshot: entry().snapshot,
      testing: true,
    });
    const user = userEvent.setup();
    renderPane(createFixture({ entries: [first, second] }).client);
    await findMachine('Ready', 'Spare X1C');
    openDisclosure(/^Control/u);
    const presence = within(screen.getByRole('group', { name: 'Motion' })).getByRole('switch', {
      name: 'I am at the machine',
    });
    await user.click(presence);
    expect(presence).toBeChecked();

    await chooseOption(user, screen.getByRole('combobox', { name: 'Machine' }), 'Workshop X1C');
    await findMachine('Ready');
    openDisclosure(/^Control/u);
    expect(
      within(screen.getByRole('group', { name: 'Motion' })).getByRole('switch', { name: 'I am at the machine' }),
    ).not.toBeChecked();
  });

  it('asks "I am at the machine" once above everything where starting a job needs it', async () => {
    renderPane(createFixture({ entries: [router()] }).client);
    await findMachine('Ready', 'Garage LongMill');
    const presence = screen.getByRole('switch', { name: 'I am at the machine' });
    expect(presence).not.toBeChecked();
    expect(screen.getByText('Moving the machine and starting a job need someone who can see it.')).toBeInTheDocument();
  });

  it('asks "I am at the machine" beside the run controls that need it', async () => {
    const unattendedJobs = {
      ...routerManifest,
      jobs:
        routerManifest.jobs.type === 'supported'
          ? { ...routerManifest.jobs, safety: { ...routerManifest.jobs.safety, attended: false } }
          : routerManifest.jobs,
    };
    const held = router({
      manifest: unattendedJobs,
      snapshot: machineSnapshot(millingComponents(routerManifest), {
        state: { status: 'held' },
        run: { ...printingRun, state: 'paused' },
      }),
    });
    const user = userEvent.setup();
    renderPane(createFixture({ entries: [held] }).client);
    await findMachine('Paused', 'Garage LongMill');
    const run = screen.getByRole('region', { name: 'Run' });
    const resume = within(run).getByRole('button', { name: /^Resume/u });
    expect(resume).toBeDisabled();
    await user.click(within(run).getByRole('switch', { name: 'I am at the machine' }));
    expect(resume).toBeEnabled();
  });

  it("shows another project's job on this machine, marked, without its preview", async () => {
    const theirs = agentJob({ artifact: { ...artifact, projectId: 'proj_000000000000000000002' } });
    renderPane(createFixture({ jobs: [theirs] }).client);
    const region = await screen.findByRole('region', { name: jobRegionName });
    expect(within(region).getByText('From another project')).toBeInTheDocument();
    expect(within(region).queryByRole('button', { name: 'Preview' })).not.toBeInTheDocument();
  });

  it('reads a run the machine stopped reporting as not reported, and says Tau did not stop it', async () => {
    const run = printing();
    renderPane(
      createFixture({
        entries: [
          {
            ...run,
            snapshot: { ...run.snapshot, state: { status: 'ready' }, run: { ...printingRun, state: 'unknown' } },
          },
        ],
      }).client,
    );
    const ended = await screen.findByRole('region', { name: 'Run' });
    expect(ended).toHaveTextContent('Last run: Not reported · pyramid.gcode.3mf');
    expect(ended).toHaveTextContent('Workshop X1C did not report how this run ended, and Tau did not stop it.');
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

    expect(await screen.findByRole('heading', { name: 'No machines yet' })).toBeInTheDocument();
    /* Printers belong to the computer, so the pane never speaks of this project's printers. */
    expect(
      screen.getByText(
        'Find a machine on your network or add a simulated machine in Settings. Machines set up there are available in every project on this computer.',
      ),
    ).toBeInTheDocument();
    /* Discovery and the access-code ceremony live in settings; the pane offers no binding form of its own. */
    expect(screen.queryByRole('button', { name: 'Discover' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Logical Id/u)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Set up a machine' }));

    expect(screen.getByRole('status', { name: 'location' })).toHaveTextContent('?settings=machines');
  });
});

/** The Carvera, idle with its cover shut: it stores the program and starts it from Tau. */
const carvera = (): ReturnType<typeof entry> =>
  machineEntry({
    manifest: carveraManifest,
    name: 'Desk Carvera',
    providerId: 'carvera-simulator',
    snapshot: machineSnapshot(millingComponents(carveraManifest)),
  });

/** The Program stage, opened. */
const programRegion = (): HTMLElement => screen.getByRole('region', { name: 'Program' });

/** Choose one of the files the Program stage lists. */
const chooseProgram = async (user: ReturnType<typeof userEvent.setup>, path: string): Promise<void> => {
  await user.click(await within(programRegion()).findByRole('combobox', { name: 'Program' }));
  await user.click(screen.getByRole('option', { name: path }));
};

describe('Print pane program files', () => {
  beforeEach(() => {
    for (const [path, text] of [
      ['jobs/face.nc', 'G21\nG0 X0 Y0\n'],
      ['jobs/pocket.gcode', 'G21\nG1 X10 F600\n'],
      ['notes.txt', 'Clamp on the left.\n'],
      ['part.step', 'ISO-10303-21;\n'],
    ] as const) {
      projectFiles.write(path, text);
    }
  });

  it.each([
    { machine: router, name: 'Garage LongMill', isStreamed: true },
    { machine: carvera, name: 'Desk Carvera', isStreamed: false },
  ])(
    'lists only the files $name accepts, and says when Tau feeds the whole run',
    async ({ machine, name, isStreamed }) => {
      const user = userEvent.setup();
      renderPane(createFixture({ entries: [machine()] }).client);
      await findMachine('Ready', name);
      const program = await within(programRegion()).findByRole('combobox', { name: 'Program' });
      await user.click(program);
      expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
        'jobs/face.nc',
        'jobs/pocket.gcode',
      ]);
      await user.keyboard('{Escape}');
      expect(
        within(programRegion()).queryByText('Keep this computer awake: Tau feeds the program for the whole run.') !==
          null,
      ).toBe(isStreamed);
      expect(screen.queryByText(/from the agent or at the machine/u)).not.toBeInTheDocument();
    },
  );

  it('offers programs by the extensions each container declares, and by its media type where it declares none', () => {
    expect(programExtensions([{ ...bambuContainer, extensions: ['.nc'] }, bambuContainer])).toEqual([
      'nc',
      'gcode.3mf',
    ]);
  });

  it('checks the chosen file with the machine and shows a blocked check with its remedy', async () => {
    const fixture = createFixture({ entries: [router()] });
    fixture.checkJob.mockResolvedValue({
      status: 'blocked',
      program: {
        name: 'pocket.gcode',
        facts: { process: 'milling', lines: 2, extents: {}, tools: [], workOffsets: [], uses: [] },
      },
      checks: [
        {
          id: 'homed',
          label: 'The machine is homed',
          state: 'blocked',
          source: 'observed',
          detail: 'Home before running a program.',
          remedy: { type: 'action', componentId: 'motion', action: 'motion.home' },
        },
      ],
      configuration: { startLine: 1 },
    });
    const user = userEvent.setup();
    renderPane(fixture.client);
    await findMachine('Ready', 'Garage LongMill');
    await chooseProgram(user, 'jobs/pocket.gcode');

    const region = programRegion();
    expect(await within(region).findByText('The machine is homed: Home before running a program.')).toBeInTheDocument();
    expect(within(region).getByRole('list', { name: 'Checks' })).toHaveTextContent('The machine is homed');
    expect(within(region).getByRole('button', { name: /^Home/u })).toBeInTheDocument();
    expect(within(region).getByRole('button', { name: 'Review job' })).toBeDisabled();
    const [checked] = fixture.checkJob.mock.lastCall ?? [];
    expect(checked).toMatchObject({ machineId: 'machine-1', configuration: {} });
    expect(checked?.artifact).toMatchObject({
      projectId,
      path: 'jobs/pocket.gcode',
      mediaType: 'text/x.gcode',
      selectedMember: 'jobs/pocket.gcode',
    });
    expect(checked?.artifact.digest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(fixture.requestJob).not.toHaveBeenCalled();
  });

  it('asks for the job with the form the machine completed, then starts it at the machine with every attestation', async () => {
    const fixture = createFixture({ entries: [router()] });
    fixture.checkJob.mockResolvedValue({
      status: 'ready',
      program: {
        name: 'face.nc',
        facts: { process: 'milling', lines: 2, extents: {}, tools: [], workOffsets: [], uses: [] },
      },
      checks: [],
      configuration: { startLine: 1 },
    });
    const user = userEvent.setup();
    renderPane(fixture.client);
    await findMachine('Ready', 'Garage LongMill');
    const review = within(programRegion()).getByRole('button', { name: 'Review job' });
    await waitFor(() => {
      expect(review).toBeEnabled();
    });
    expect(within(programRegion()).getByText('2 lines')).toBeInTheDocument();
    await user.click(review);
    await waitFor(() => {
      expect(fixture.requestJob).toHaveBeenCalledOnce();
    });
    const [requested] = fixture.requestJob.mock.calls[0] ?? [];
    expect(requested).toMatchObject({
      machineId: 'machine-1',
      configuration: { startLine: 1 },
      requestedBy: { kind: 'user' },
      program: { name: 'face.nc' },
      artifact: { path: 'jobs/face.nc', selectedMember: 'jobs/face.nc' },
    });

    const card = await screen.findByRole('region', { name: 'Job awaiting you: face.nc' });
    const start = within(card).getByRole('button', { name: 'Send, then press Play' });
    expect(start).toBeDisabled();
    for (const checkbox of within(card).getAllByRole('checkbox')) {
      // oxlint-disable-next-line no-await-in-loop -- the person ticks each statement in turn.
      await user.click(checkbox);
    }
    expect(start).toBeDisabled();
    await user.click(screen.getByRole('switch', { name: 'I am at the machine' }));
    expect(start).toBeEnabled();
    await user.click(start);
    await waitFor(() => {
      expect(fixture.resolveJob).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          decision: 'approve',
          attended: true,
          attestations: ['stock-clamped', 'bit-installed', 'router-on', 'work-area-clear'],
        }),
      );
    });

    fixture.journal(
      agentJob({
        jobId: requested?.jobId,
        requestedBy: requested?.requestedBy,
        program: { name: 'face.nc', facts: { process: 'other' } },
        state: 'awaiting-start',
        updatedAt: '2026-09-24T02:00:10.000Z',
      }),
    );
    expect(await screen.findByText('Press start on Garage LongMill to begin face.nc')).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Job' })).getByText(/Keep this computer awake: Tau feeds the program/u),
    ).toBeInTheDocument();
  });

  it('says when the project has no file the machine runs', async () => {
    projectFiles.clear();
    renderPane(createFixture({ entries: [carvera()] }).client);
    await findMachine('Ready', 'Desk Carvera');
    expect(
      await within(programRegion()).findByText(
        'No program files in this project. Desk Carvera runs .gcode, .nc, .ngc, .tap files.',
      ),
    ).toBeInTheDocument();
    expect(within(programRegion()).getByRole('button', { name: 'Review job' })).toBeDisabled();
  });
});

describe('Print pane jobs watch', () => {
  it('says once, quietly, when job updates keep stopping', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const fixture = createFixture();
      const ended = async function* (): AsyncGenerator<never> {
        yield* [];
      };
      renderPane({ ...fixture.client, watchJobs: () => ended() });
      await findMachine('Ready');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(
        screen
          .getAllByRole('status')
          .filter((status) => status.textContent.includes('Job updates from Workshop X1C stopped')),
      ).toHaveLength(1);
      expect(screen.getByText(/Tau keeps retrying; the jobs shown here may be out of date\./u)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Print settings from the provider’s own form', () => {
  it('reads a Bambu preferences file saved before the form came from the provider', async () => {
    /* Written as an earlier Tau saved it: the Bambu block under its source id, beside the slicing preferences. */
    projectFiles.write(
      '.tau/machines/settings/bambu.x1c.json',
      `${JSON.stringify({
        version: 1,
        typeId: 'bambu.x1c',
        activeProfile: 'default',
        profiles: {
          default: {
            name: 'Default',
            configurations: {
              'slicer.bambu-studio.settings': { version: '1.0.0', values: { preset: 'fine' } },
              'bambu.machine.settings': {
                version: '1.0.0',
                values: {
                  plate: 'engineering',
                  timelapse: true,
                  material: { defaultSlot: 1, slotsByColor: { '#ff0000': 254 } },
                },
              },
            },
          },
        },
      })}\n`,
    );
    const { result } = renderHook(() => useMachineSettings(provider));
    await waitFor(() => {
      expect(result.current.file.status).toBe('current');
    });
    expect(result.current.error).toBeUndefined();
    expect(result.current.intent).toEqual({ preset: 'fine', plate: 'engineering' });
    expect(bambuPreferencesOf(provider, result.current.machine)).toEqual({
      plate: 'engineering',
      timelapse: true,
      material: { defaultSlot: 1, slotsByColor: { '#ff0000': 254 } },
    });
  });

  it('reads no Bambu preferences for a provider whose form is not Bambu’s', () => {
    expect(bambuPreferencesOf({ ...provider, settingsConfiguration: undefined }, { plate: 'cool' })).toBeUndefined();
  });

  it('writes the slot each filament prints from as Bambu tray numbers and reads them back as addresses', () => {
    const slots = [{ unitId: 'ams-a', slotId: 'a2' }, undefined, { unitId: 'external', slotId: 'spool' }];
    const written = withBambuSubmissionSlots(provider, { timelapse: true }, slots);
    expect(written).toEqual({ timelapse: true, amsMapping: [1, -1, 254] });
    expect(bambuSubmissionSlots(provider, written)).toEqual(slots);
    expect(withBambuSubmissionSlots(provider, written, [])).toEqual({ timelapse: true });
  });

  it('leaves the submission of a provider whose form is not Bambu’s untouched', () => {
    const other = { ...provider, settingsConfiguration: undefined };
    expect(withBambuSubmissionSlots(other, { amsMapping: [0] }, [{ unitId: 'ams-a', slotId: 'a2' }])).toEqual({
      amsMapping: [0],
    });
    expect(bambuSubmissionSlots(other, { amsMapping: [0] })).toEqual([]);
  });

  it('reads the saved slots by colour for several filaments and the default slot for one', () => {
    const preferences = { material: { defaultSlot: 1, slotsByColor: { '#ff0000': 254 } } };
    expect(savedBambuSlots(preferences, ['#FF0000', '#00FF00'])).toEqual([
      { unitId: 'external', slotId: 'spool' },
      undefined,
    ]);
    expect(savedBambuSlots(preferences, ['#FF0000'])).toEqual([{ unitId: 'ams-a', slotId: 'a2' }]);
  });

  it('finds the Bambu Studio filament picked for a slot by its tray', () => {
    const chosen = { filaments: { 254: 'Bambu PETG Basic @BBL X1C' } };
    expect(chosenBambuFilament(chosen, { unitId: 'external', slotId: 'spool' })).toBe('Bambu PETG Basic @BBL X1C');
    expect(chosenBambuFilament(chosen, { unitId: 'ams-a', slotId: 'a1' })).toBeUndefined();
    expect(chosenBambuFilament(chosen, undefined)).toBeUndefined();
  });
});

describe('Agent machine actions an interrupt names', () => {
  it('reads one only when its intent says which run the agent saw, null for none', () => {
    const approval = {
      interruptId: 'interrupt-9',
      kind: 'approval',
      prompt: 'Chamber light ({"on":true}) on Workshop X1C?',
      options: [],
      messageId: 'assistant-1',
      approvalId: 'interrupt-9',
      context: {
        machineId: 'machine-1',
        componentId: 'chamber-light',
        action: 'switch.set',
        operationId: 'op-12',
        parameters: { on: true },
        version: 1,
      },
    } as const;
    expect(pendingMachineActionOf(approval)).toBeUndefined();
    expect(
      pendingMachineActionOf({ ...approval, context: { ...approval.context, expectedRunId: null } }),
    ).toMatchObject({
      operationId: 'op-12',
      expectedRunId: null,
    });
  });
});
