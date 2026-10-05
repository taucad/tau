// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Activity, Info } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type {
  MachineAlertSnapshot,
  MachineClient,
  MachineDirectoryEntry,
  MachineManifest,
  MachineRunSnapshot,
  PrintRequest,
} from '@taucad/runtime/machine';
import {
  ControlCenterStage,
  describeStillFailure,
  describeWaits,
} from '#routes/w.$workspace.$project/chat-print-controls.js';
import type { ApplyMachineAction } from '#routes/w.$workspace.$project/chat-print-controls.js';
import {
  MaterialChangeCard,
  MaterialSlots,
  materialChange,
} from '#routes/w.$workspace.$project/chat-print-materials.js';
import {
  MonitorStage,
  PrinterAlerts,
  describeRun,
  runFileName,
} from '#routes/w.$workspace.$project/chat-print-monitor.js';
import { PrintStage, PrintStages } from '#routes/w.$workspace.$project/chat-print-section.js';
import {
  agentRequest,
  artifact,
  entry,
  later,
  manifest,
  printing,
  timestamp,
} from '#routes/w.$workspace.$project/chat-print.fixture.js';

afterEach(cleanup);

/** The printing fixture machine, observing exactly this run and these alerts. */
const observing = (
  run: MachineRunSnapshot,
  extra: Pick<MachineDirectoryEntry['snapshot'], 'activeRunId' | 'alerts'> = {},
): MachineDirectoryEntry => {
  const machine = printing();
  const { activeRunId: _activeRunId, ...snapshot } = machine.snapshot;
  return { ...machine, snapshot: { ...snapshot, ...extra, run } };
};

const renderMonitor = (machine: MachineDirectoryEntry) =>
  render(
    <>
      <PrinterAlerts entry={machine} />
      <MonitorStage entry={machine} manifest={manifest} apply={undefined} />
    </>,
  );

/** The fixture X1C once light, speed and filament actions are qualified, as the machine-actions guide reaches. */
const qualified: MachineManifest = {
  ...manifest,
  speedProfiles: [
    { id: 'silent', label: 'Silent', percent: 50 },
    { id: 'standard', label: 'Standard', percent: 100 },
  ],
  actions: [
    ...manifest.actions.filter((action) => action.id !== 'light.set'),
    { id: 'light.set', label: 'Chamber light', effect: 'none', qualification: 'qualified' },
    { id: 'speed.set', label: 'Print speed', effect: 'motion', qualification: 'qualified' },
    { id: 'material.load', label: 'Load filament', effect: 'material', qualification: 'qualified' },
    { id: 'material.unload', label: 'Unload filament', effect: 'material', qualification: 'qualified' },
    { id: 'material.continue', label: 'Continue filament change', effect: 'material', qualification: 'qualified' },
    {
      id: 'material.set',
      label: 'Set material',
      effect: 'material',
      qualification: 'qualified',
      parameters: {
        type: 'object',
        properties: {
          slot: { type: 'integer' },
          profile: {
            oneOf: [
              { const: 'GFL99', title: 'Generic PLA' },
              { const: 'GFG99', title: 'Generic PETG' },
            ],
          },
          color: { type: 'string' },
        },
        required: ['slot', 'profile', 'color'],
      },
    },
  ],
};

/** A change as the machine-actions guide proposes the printer report it: the external load's steps and its prompt. */
const externalLoad = (step: string, awaiting?: Readonly<{ kind: 'feed' | 'confirmation'; promptId: string }>) => ({
  currentSlot: 255,
  targetSlot: 254,
  units: [],
  change: {
    changeId: 'change-1',
    kind: 'load',
    slot: 254,
    steps: [
      { id: 'heat', label: 'Heat the nozzle', actor: 'machine' },
      { id: 'push', label: 'Push new filament into extruder', actor: 'person' },
      { id: 'grab', label: 'Grab new filament', actor: 'machine' },
      { id: 'confirm', label: 'Confirm extruded', actor: 'person' },
      { id: 'purge', label: 'Purge old filament', actor: 'machine' },
    ],
    step,
    ...(awaiting === undefined ? {} : { awaiting }),
  },
});

/** An idle X1C with black PLA in the toolhead from A1, grey PETG in A2 and white PETG on the external holder. */
const withSlots = (
  materialSystem: NonNullable<MachineDirectoryEntry['snapshot']['materialSystem']>,
  run?: MachineRunSnapshot,
) =>
  entry({
    snapshot: {
      ...entry().snapshot,
      setup: {
        ...entry().snapshot.setup,
        /* oxlint-disable tau-lint/no-hardcoded-color -- the `#RRGGBBAA` a machine reports for its loaded spools */
        materials: [
          { slot: 0, state: 'loaded', materialId: 'pla-black', color: '#000000FF', remainingPercent: 80 },
          { slot: 1, state: 'loaded', materialId: 'petg-grey', color: '#8E9089FF', remainingPercent: 40 },
          { slot: 254, state: 'loaded', materialId: 'petg-white', color: '#FFFFFFFF' },
        ],
        /* oxlint-enable tau-lint/no-hardcoded-color */
      },
      materialSystem,
      ...(run === undefined ? {} : { run }),
    },
  });

/** The value beside a label, as the person reads the row, or nothing without the row. */
const rowValue = (label: string): string | undefined =>
  screen.queryByText(label)?.nextElementSibling?.textContent ?? undefined;

/** A request the host prepared: the printer runs its upload as `tau-<preparedId>`. */
const preparedFor = (preparedId: string): NonNullable<PrintRequest['prepared']> => ({
  preparedId,
  preparedDigest: artifact.digest,
  configurationDigest: artifact.digest,
  providerDataDigest: artifact.digest,
  setupDigest: artifact.digest,
  machineId: 'machine-1',
  physicalMachineId: 'physical-1',
  artifact,
  remoteName: `tau-${preparedId}.gcode.3mf`,
  parser: { id: 'bambu-gcode-3mf', version: '1' },
  preparedAt: timestamp,
  expiresAt: later,
});

const unconfirmedStart = agentRequest({
  state: 'unknown',
  prepared: preparedFor('3f2a9c'),
  receipt: {
    operationId: 'start-1',
    machineId: 'machine-1',
    kind: 'start',
    status: 'unknown',
    reason: 'reply-lost-after-possible-acceptance',
    observedAt: timestamp,
  },
});

describe('MonitorStage', () => {
  // The run block names the run by this file; Monitor no longer repeats it.
  describe('run file', () => {
    const member = '/data/Metadata/plate_1.gcode';

    it.each<
      Readonly<{
        scenario: string;
        run: MachineRunSnapshot;
        activeRunId?: string;
        requests: readonly PrintRequest[];
        fileName: string | undefined;
      }>
    >([
      {
        scenario: 'an unconfirmed Tau start by the run name the printer reports',
        run: { state: 'printing', name: 'tau-3f2a9c', file: member },
        activeRunId: '1834297113',
        requests: [unconfirmedStart],
        fileName: 'pyramid.gcode.3mf',
      },
      {
        scenario: 'a started request by its provider run id',
        run: { state: 'printing', name: 'Cube', file: member },
        activeRunId: 'provider-run-1',
        requests: [
          agentRequest({
            state: 'started',
            receipt: {
              operationId: 'start-1',
              machineId: 'machine-1',
              kind: 'start',
              status: 'accepted',
              providerRunId: 'provider-run-1',
              observedAt: timestamp,
            },
          }),
        ],
        fileName: 'pyramid.gcode.3mf',
      },
      {
        scenario: "a request by the upload name the simulator reports as the run's file",
        run: { state: 'printing', file: 'tau-3f2a9c.gcode.3mf' },
        activeRunId: 'start-1',
        requests: [unconfirmedStart],
        fileName: 'pyramid.gcode.3mf',
      },
      {
        scenario: "the printer's run name when no request uploaded the run",
        run: { state: 'printing', name: 'tau-3f2a9c', file: member },
        activeRunId: '1834297113',
        requests: [
          agentRequest({ state: 'unknown', prepared: preparedFor('other'), summary: { fileName: 'other.gcode.3mf' } }),
        ],
        fileName: 'tau-3f2a9c',
      },
      {
        scenario: 'a file that is not an archive member',
        run: { state: 'printing', file: 'benchy.gcode' },
        requests: [],
        fileName: 'benchy.gcode',
      },
      {
        scenario: 'no file when the printer names only an archive member',
        run: { state: 'printing', file: member },
        requests: [],
        fileName: undefined,
      },
    ])('should name $scenario', ({ run, activeRunId, requests, fileName }) => {
      expect(runFileName(observing(run, activeRunId === undefined ? {} : { activeRunId }), requests)).toBe(fileName);
    });
  });

  it('should show heaters in whole degrees and no target while a heater is off', () => {
    const idle = printing();
    const temperatures = idle.snapshot.temperatures ?? {};
    const at = (quantity: typeof temperatures.nozzle, value: number): typeof temperatures.nozzle =>
      quantity === undefined ? undefined : { ...quantity, value, representation: 'binary64' };
    renderMonitor({
      ...idle,
      snapshot: {
        ...idle.snapshot,
        temperatures: {
          ...temperatures,
          nozzle: at(temperatures.nozzle, 24.34),
          nozzleTarget: at(temperatures.nozzleTarget, 0),
          bed: at(temperatures.bed, 61.6),
        },
      },
    });

    expect(rowValue('Nozzle')).toBe('24 °C');
    expect(rowValue('Bed')).toBe('62 °C');
    expect(screen.queryByText('to 0 °C')).not.toBeInTheDocument();
    expect(screen.getByText('to 55 °C')).toBeInTheDocument();
  });

  describe('stage', () => {
    it.each<readonly [string, string | undefined, string | undefined]>([
      ['the phrase the provider reports', 'Heating the bed', 'Heating the bed'],
      ['no row without a stage', undefined, undefined],
      ['no row for a bare stage number a saved snapshot may hold', '2', undefined],
    ])('should show %s', (_case, stage, shown) => {
      renderMonitor(observing({ state: 'printing', ...(stage === undefined ? {} : { stage }) }));

      expect(rowValue('Stage')).toBe(shown);
    });

    it('should not repeat the stage the run line names while calibrating', () => {
      renderMonitor(observing({ state: 'printing', currentLayer: 0, totalLayers: 64, stage: 'Levelling the bed' }));

      expect(rowValue('Stage')).toBeUndefined();
    });

    it.each<readonly [string, MachineRunSnapshot, string]>([
      [
        'calibration at layer 0 as preparing with its stage',
        { state: 'printing', currentLayer: 0, totalLayers: 64, stage: 'Calibrating extrusion', remainingSeconds: 1320 },
        'Preparing · Calibrating extrusion · 22 min left',
      ],
      [
        'the layer once printing starts',
        { state: 'printing', currentLayer: 4, totalLayers: 64, remainingSeconds: 960 },
        'Printing layer 4 of 64 · 16 min left',
      ],
      [
        'layer 0 without a stage phrase as printing',
        { state: 'printing', currentLayer: 0, totalLayers: 64, stage: '54' },
        'Printing layer 0 of 64',
      ],
    ])('should describe %s', (_case, run, line) => {
      expect(describeRun(observing(run))).toBe(line);
    });
  });

  describe('alerts', () => {
    const fatal: MachineAlertSnapshot = {
      code: '0300-0100-0001-0007',
      severity: 'fatal',
      message: "The printer's motion controller reported a fatal error.",
      reference: 'https://wiki.bambulab.com/en/x1/troubleshooting/hmscode/0300_0100_0001_0007',
    };
    const warning: MachineAlertSnapshot = {
      code: '0C00-0300-0003-000B',
      severity: 'warning',
      message: "The printer's camera and AI inspection raised a warning.",
      reference: 'https://wiki.bambulab.com/en/x1/troubleshooting/hmscode/0C00_0300_0003_000B',
    };
    const printError: MachineAlertSnapshot = {
      code: '0300-400C',
      message: "The printer's motion controller reported a print error.",
    };
    const notice: MachineAlertSnapshot = { code: '0500-0400-0004-0001', severity: 'info' };

    it('should show one line per alert with its sentence, its code and a link to its help page', () => {
      renderMonitor(observing({ state: 'paused' }, { alerts: [fatal, warning, printError, notice] }));

      const alerts = screen.getByRole('alert', { name: 'Printer alerts' });
      const [first, second, third, fourth] = within(alerts).getAllByRole('listitem');
      expect(first).toHaveTextContent(
        "Fatal: The printer's motion controller reported a fatal error.0300-0100-0001-0007Look up 0300-0100-0001-0007",
      );
      expect(within(first!).getByRole('link', { name: `Look up ${fatal.code}` })).toHaveAttribute(
        'href',
        fatal.reference,
      );
      expect(within(second!).getByRole('link', { name: `Look up ${warning.code}` })).toHaveAttribute(
        'target',
        '_blank',
      );
      expect(second).toHaveTextContent(/^Warning: The printer's camera and AI inspection raised a warning\./u);
      /* A print error has no severity and no help page. */
      expect(third).toHaveTextContent("The printer's motion controller reported a print error.0300-400C");
      expect(within(third!).queryByRole('link')).not.toBeInTheDocument();
      expect(fourth).toHaveTextContent('Notice: The printer reported an alert.0500-0400-0004-0001');
    });

    it('should name a single alert and link only an https help page', () => {
      renderMonitor(
        observing({ state: 'printing' }, { alerts: [{ ...warning, reference: 'http://wiki.bambulab.com/en/x1' }] }),
      );

      const alert = screen.getByRole('alert', { name: 'Printer alert' });
      expect(alert).toHaveTextContent(warning.message!);
      expect(within(alert).queryByRole('link')).not.toBeInTheDocument();
    });

    it('should show no alert notice without alerts', () => {
      renderMonitor(observing({ state: 'printing' }, { alerts: [] }));

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('still capture', () => {
    it('should explain a missing ffmpeg with how to install it instead of the code', async () => {
      const captureStill = vi.fn<MachineClient['captureStill']>(async () => {
        throw new Error('MACHINE_STILL_FFMPEG_MISSING');
      });
      const user = userEvent.setup();
      // The camera leads the Control center, which a run opens.
      render(
        <ControlCenterStage
          client={mock<MachineClient>({ captureStill })}
          entry={observing({ state: 'printing' }, { activeRunId: 'provider-run-1' })}
          manifest={manifest}
          apply={undefined}
        />,
      );

      await user.click(screen.getByRole('button', { name: 'Capture still' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Tau could not find ffmpeg, which capturing a still needs; install it (with Homebrew on macOS: brew install ffmpeg; on Windows: winget install ffmpeg), then capture again.',
      );
      expect(screen.queryByText(/MACHINE_STILL/u)).not.toBeInTheDocument();
      expect(captureStill).toHaveBeenCalledWith(expect.objectContaining({ machineId: 'machine-1' }));
    });
  });
});

describe('ControlCenterStage', () => {
  it('should show the light the person chose until the printer reports it', async () => {
    const apply = vi.fn<ApplyMachineAction>(async () => undefined);
    const user = userEvent.setup();
    const dark: ReturnType<typeof printing> = {
      ...printing(),
      snapshot: { ...printing().snapshot, lights: { chamber: 'off' } },
    };
    const view = render(
      <ControlCenterStage client={mock<MachineClient>()} entry={dark} manifest={qualified} apply={apply} />,
    );
    expect(screen.getByRole('switch', { name: 'Chamber light' })).not.toBeChecked();

    await user.click(screen.getByRole('switch', { name: 'Chamber light' }));

    expect(apply).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ machineId: 'machine-1', action: 'light.set', parameters: { on: true } }),
    );
    expect(screen.getByRole('switch', { name: 'Chamber light' })).toBeChecked();
    view.rerender(
      <ControlCenterStage client={mock<MachineClient>()} entry={printing()} manifest={qualified} apply={apply} />,
    );
    expect(screen.getByRole('switch', { name: 'Chamber light' })).toBeChecked();
    expect(screen.getByRole('button', { name: /^Control center/u })).toHaveTextContent('Light on');
  });

  it('should go back to the observed light and say why when the host refuses', async () => {
    const apply = vi.fn<ApplyMachineAction>(async () => {
      throw new Error('MACHINE_ACTION_UNQUALIFIED');
    });
    const user = userEvent.setup();
    render(<ControlCenterStage client={mock<MachineClient>()} entry={printing()} manifest={qualified} apply={apply} />);

    await user.click(screen.getByRole('switch', { name: 'Chamber light' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That action is not qualified on this printer yet, so nothing was sent.',
    );
    expect(screen.getByRole('switch', { name: 'Chamber light' })).toBeChecked();
  });

  it('should keep designed controls disabled with one sentence saying why', () => {
    const designedSpeed: MachineManifest = {
      ...manifest,
      speedProfiles: qualified.speedProfiles,
      actions: [
        ...manifest.actions,
        { id: 'speed.set', label: 'Print speed', effect: 'motion', qualification: 'designed' },
      ],
    };
    render(
      <ControlCenterStage
        client={mock<MachineClient>()}
        entry={printing()}
        manifest={designedSpeed}
        apply={undefined}
      />,
    );

    expect(screen.getByRole('switch', { name: 'Chamber light' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Print speed' })).toBeDisabled();
    expect(
      screen.getByText('Chamber light and print speed are designed but not yet qualified on this printer.'),
    ).toBeInTheDocument();
  });
});

describe('describeWaits', () => {
  it('should give one sentence per reason and leave out what the pane says elsewhere', () => {
    expect(
      describeWaits([
        { isAvailable: false, label: 'Chamber light', reason: 'not available from Tau yet' },
        { isAvailable: true, label: 'Print speed' },
        { isAvailable: false, label: 'Load filament' },
        undefined,
      ]),
    ).toEqual(['Chamber light is not available from Tau yet.']);
  });
});

describe('MaterialSlots', () => {
  beforeEach(() => {
    // The jsdom environment has no pointer capture or scrolling, which the Material select's listbox uses.
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.setPointerCapture = vi.fn();
  });

  it('should open a slot in place, ask once, load it, and return focus to its row', async () => {
    const apply = vi.fn<ApplyMachineAction>(async () => undefined);
    const user = userEvent.setup();
    render(
      <MaterialSlots
        entry={withSlots({ currentSlot: 0, units: [] })}
        manifest={qualified}
        apply={apply}
        isStale={false}
      />,
    );
    const slots = screen.getByRole('list', { name: 'Material slots' });
    expect(within(slots).getAllByRole('listitem')[0]).toHaveTextContent('A1pla-blackIn use80 %');

    await user.click(within(slots).getByRole('button', { name: /^A2/u }));
    const slot = screen.getByRole('group', { name: 'Slot A2' });
    expect(within(slot).getByRole('button', { name: 'All slots' })).toHaveFocus();
    await user.click(within(slot).getByRole('button', { name: 'Load into toolhead' }));
    const dialog = within(slot).getByRole('alertdialog', { name: 'Confirm load into toolhead' });
    expect(dialog).toHaveTextContent(
      'Load A2 (petg-grey) into the toolhead? The nozzle heats for petg-grey and A1 goes back first.',
    );
    expect(apply).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Load A2' }));

    expect(apply).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ machineId: 'machine-1', action: 'material.load', parameters: { slot: 1 } }),
    );
    expect(await within(slot).findByRole('status')).toHaveTextContent('Waiting for Workshop X1C to confirm the load…');
    await user.click(within(slot).getByRole('button', { name: 'All slots' }));
    expect(
      within(screen.getByRole('list', { name: 'Material slots' })).getByRole('button', { name: /^A2/u }),
    ).toHaveFocus();
  });

  it('should hold filament changes during a run', async () => {
    const user = userEvent.setup();
    render(
      <MaterialSlots
        entry={{
          ...withSlots({ currentSlot: 0, units: [] }, { state: 'printing' }),
          snapshot: {
            ...withSlots({ currentSlot: 0, units: [] }, { state: 'printing' }).snapshot,
            activeRunId: 'provider-run-1',
          },
        }}
        manifest={qualified}
        apply={vi.fn<ApplyMachineAction>()}
        isStale={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: /^A1/u }));

    expect(screen.getByRole('button', { name: 'Unload' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Unload' })).toHaveAccessibleDescription(
      'Filament changes wait until the run ends.',
    );
  });

  it('should leave the extrusion check on the printer while it reports no steps', async () => {
    const user = userEvent.setup();
    const loading = withSlots(
      { currentSlot: 255, targetSlot: 254, units: [] },
      { state: 'idle', stage: 'Waiting for filament' },
    );
    render(
      <>
        <MaterialChangeCard entry={loading} manifest={qualified} apply={vi.fn<ApplyMachineAction>()} />
        <MaterialSlots entry={loading} manifest={qualified} apply={vi.fn<ApplyMachineAction>()} isStale={false} />
      </>,
    );
    const card = screen.getByRole('region', { name: 'Filament change' });
    expect(within(card).getByRole('status')).toHaveTextContent('Feeding Ext · petg-white…');
    expect(card).toHaveTextContent('Waiting for filament');
    expect(card).toHaveTextContent("then confirm on the printer's screen");
    expect(within(card).queryByRole('button', { name: 'Done' })).not.toBeInTheDocument();

    // The slot itself waits for the change the card shows.
    expect(screen.getByRole('button', { name: /^Ext/u })).toHaveAccessibleName(/Loading/u);
    await user.click(screen.getByRole('button', { name: /^Ext/u }));
    expect(screen.getByRole('button', { name: 'Feed into toolhead' })).toHaveAccessibleDescription(
      'Wait for the filament change to finish.',
    );
  });

  it('should list the reported steps and offer Done and Retry only while the printer asks', async () => {
    const apply = vi.fn<ApplyMachineAction>(async () => undefined);
    const user = userEvent.setup();
    const card = (system: ReturnType<typeof externalLoad>) => (
      <MaterialChangeCard entry={withSlots(system)} manifest={qualified} apply={apply} />
    );
    const { rerender } = render(card(externalLoad('push', { kind: 'feed', promptId: 'prompt-1' })));

    const steps = screen.getAllByRole('listitem');
    expect(steps.map((step) => step.textContent)).toEqual([
      'Heat the nozzle (done)',
      'Push new filament into extruder (needs you)',
      'Grab new filament (to do)',
      'Confirm extruded (to do)',
      'Purge old filament (to do)',
    ]);
    expect(steps[1]).toHaveAttribute('aria-current', 'step');
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    expect(screen.getByRole('status')).toHaveTextContent('Workshop X1C waits for you to push the filament in.');
    expect(screen.getByRole('region', { name: 'Filament change' })).toHaveTextContent(
      'Push the petg-white into the toolhead until the extruder grips it; Workshop X1C carries on by itself.',
    );
    expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument();

    rerender(card(externalLoad('confirm', { kind: 'confirmation', promptId: 'prompt-2' })));
    const check = screen.getByRole('group', { name: 'Check the extrusion' });
    await user.click(within(check).getByRole('button', { name: 'Done' }));
    expect(apply).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        action: 'material.continue',
        parameters: { promptId: 'prompt-2', answer: 'extruded' },
      }),
    );
    // Answered: the same prompt is not offered again while the printer moves on.
    expect(within(check).getByRole('status')).toHaveTextContent('Waiting for Workshop X1C to continue…');
    expect(within(check).queryByRole('button', { name: 'Done' })).not.toBeInTheDocument();

    rerender(card(externalLoad('confirm', { kind: 'confirmation', promptId: 'prompt-3' })));
    expect(
      within(screen.getByRole('group', { name: 'Check the extrusion' })).getByRole('button', { name: 'Retry' }),
    ).toBeEnabled();
  });

  it('should leave an AMS change during a run to the run line', () => {
    const changing = withSlots({ currentSlot: 0, targetSlot: 1, units: [] }, { state: 'printing' });
    const { container } = render(
      <MaterialChangeCard
        entry={{ ...changing, snapshot: { ...changing.snapshot, activeRunId: 'provider-run-1' } }}
        manifest={qualified}
        apply={vi.fn<ApplyMachineAction>()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('should set the material of an external spool nobody has set', async () => {
    const apply = vi.fn<ApplyMachineAction>(async () => undefined);
    const user = userEvent.setup();
    const unset = withSlots({ currentSlot: 0, units: [] });
    render(
      <MaterialSlots
        entry={{
          ...unset,
          snapshot: {
            ...unset.snapshot,
            setup: {
              ...unset.snapshot.setup,
              materials: [...unset.snapshot.setup.materials.slice(0, 2), { slot: 254, state: 'unknown' }],
            },
          },
        }}
        manifest={qualified}
        apply={apply}
        isStale={false}
      />,
    );
    expect(screen.getByRole('button', { name: /^Ext/u })).toHaveTextContent('Not set');

    await user.click(screen.getByRole('button', { name: /^Ext/u }));
    expect(screen.queryByRole('button', { name: 'Feed into toolhead' })).not.toBeInTheDocument();
    expect(
      screen.getByText('Set the material of the spool on the holder first, so the nozzle heats for it.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Set material' }));
    const form = screen.getByRole('form', { name: 'Set the material in Ext' });
    expect(within(form).getByRole('combobox', { name: 'Material' })).toHaveTextContent('Generic PLA');
    await user.click(within(form).getByRole('combobox', { name: 'Material' }));
    await user.click(screen.getByRole('option', { name: 'Generic PETG' }));
    await user.click(within(form).getByRole('button', { name: 'Save' }));

    expect(apply).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        action: 'material.set',
        // oxlint-disable-next-line tau-lint/no-hardcoded-color -- the colour the form sends for a spool without one
        parameters: { slot: 254, profile: 'GFG99', color: '#FFFFFF' },
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Waiting for Workshop X1C to confirm the material…');
  });

  it('should keep the material of a spool whose tag the AMS read', async () => {
    const user = userEvent.setup();
    const tagged = withSlots({ currentSlot: 0, units: [] });
    // The guide's proposed slot fact; the runtime's snapshot type does not declare it yet.
    const materials = tagged.snapshot.setup.materials.map((material) =>
      material.slot === 0 ? { ...material, identifiedBy: 'tag' } : material,
    );
    render(
      <MaterialSlots
        entry={{ ...tagged, snapshot: { ...tagged.snapshot, setup: { ...tagged.snapshot.setup, materials } } }}
        manifest={qualified}
        apply={vi.fn<ApplyMachineAction>()}
        isStale={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: /^A1/u }));
    expect(screen.getByText('In the toolhead · read from its tag')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set material' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Set material' })).toHaveAccessibleDescription(
      "The AMS read this spool's tag, which sets its material.",
    );
  });

  it.each<
    readonly [
      string,
      NonNullable<MachineDirectoryEntry['snapshot']['materialSystem']>,
      ReturnType<typeof materialChange>,
    ]
  >([
    ['nothing without a target', { currentSlot: 0, units: [] }, undefined],
    ['nothing once the target is in the toolhead', { currentSlot: 1, targetSlot: 1, units: [] }, undefined],
    ['a load to the target slot', { currentSlot: 0, targetSlot: 1, units: [] }, { kind: 'load', slot: 1 }],
    [
      'an unload of the slot in the toolhead',
      { currentSlot: 0, targetSlot: 255, units: [] },
      { kind: 'unload', slot: 0 },
    ],
  ])('should read %s as the change', (_case, materialSystem, change) => {
    expect(materialChange(withSlots(materialSystem))).toEqual(change);
  });
});

describe('PrintStages', () => {
  it('should move between stage headers with the arrow keys, Home and End', async () => {
    const user = userEvent.setup();
    render(
      <PrintStages>
        <PrintStage icon={Activity} title='Monitor' isDefaultOpen>
          <p>Temperatures</p>
        </PrintStage>
        <PrintStage icon={Info} title='Inspect' summary='X1C'>
          <p>Firmware</p>
        </PrintStage>
      </PrintStages>,
    );
    const monitor = screen.getByRole('button', { name: 'Monitor' });
    const inspect = screen.getByRole('button', { name: /^Inspect\s*X1C$/u });
    expect(monitor).toHaveAttribute('aria-expanded', 'true');
    expect(inspect).toHaveAttribute('aria-expanded', 'false');

    monitor.focus();
    await user.keyboard('{ArrowDown}');
    expect(inspect).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(monitor).toHaveFocus();
    await user.keyboard('{End}');
    expect(inspect).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByText('Firmware')).toBeInTheDocument();
  });
});

describe('describeStillFailure', () => {
  /* Every fixed code a still capture can reject with: the camera leg, its connection and access code, and the host. */
  const stillCodes = [
    'MACHINE_STILL_FFMPEG_MISSING',
    'MACHINE_STILL_FFMPEG_FAILED',
    'MACHINE_STILL_AUTH_REJECTED',
    'MACHINE_SECRET_UNKNOWN',
    'MACHINE_TLS_PIN_MISMATCH',
    'MACHINE_CONNECT_FAILED',
    'MACHINE_CONNECT_TIMEOUT',
    'MACHINE_STILL_TIMEOUT',
    'MACHINE_STILL_STREAM_FAILED',
    'MACHINE_STILL_CAPTURE_FAILED',
    'MACHINE_STILL_TOO_LARGE',
    'MACHINE_STILL_INVALID',
    'MACHINE_STILL_PROXY_FAILED',
    'MACHINE_STILL_REQUEST_INVALID',
    'MACHINE_STILL_UNAVAILABLE',
    'MACHINE_STILL_RATE_LIMITED',
  ] as const;
  const generic = 'The camera could not capture a still; capture again in a moment.';

  it('should give every code a capture rejects with its own sentence, without the code', () => {
    const sentences = stillCodes.map((code) => describeStillFailure(new Error(code)));

    expect(new Set(sentences).size).toBe(stillCodes.length);
    for (const sentence of sentences) {
      expect(sentence).toMatch(/^[A-Z][^_]*\.$/u);
      expect(sentence).not.toContain(generic);
    }
  });

  it.each([
    [
      'a code a desktop shell wrapped in its own words',
      new Error('Error invoking remote method: Error: MACHINE_STILL_AUTH_REJECTED'),
    ],
    ['the error code field', Object.assign(new Error('Capture failed'), { code: 'MACHINE_STILL_AUTH_REJECTED' })],
  ])('should find %s', (_case, error) => {
    expect(describeStillFailure(error)).toBe(
      "The camera refused the printer's saved access code; bind it again in Settings under Printers with the access code shown on its screen.",
    );
  });

  it.each([
    ['an unknown code with the code', new Error('MACHINE_STILL_NEW_FAULT'), `${generic} (MACHINE_STILL_NEW_FAULT)`],
    [
      'a message that names no code with the message',
      new Error('Machine channel closed'),
      `${generic} (Machine channel closed)`,
    ],
    ['a blank message alone', new Error(' '), generic],
  ])('should keep a generic sentence for %s', (_case, error, sentence) => {
    expect(describeStillFailure(error)).toBe(sentence);
  });
});
