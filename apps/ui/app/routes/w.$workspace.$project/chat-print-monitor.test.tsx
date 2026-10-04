// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ComponentObservation,
  MachineActivity,
  MachineClient,
  MachineDirectoryEntry,
} from '@taucad/runtime/machine';
import { useMachineControl, usePresence, presenceLease } from '#hooks/use-machine-control.js';
import type { MachineControl } from '#hooks/use-machine-control.js';
import { Activities, ControlStage } from '#routes/w.$workspace.$project/chat-print-controls.js';
import { PressureAdvanceStage } from '#routes/w.$workspace.$project/chat-print-materials.js';
import {
  MachineAlerts,
  MonitorStage,
  describeRun,
  isObservationStale,
} from '#routes/w.$workspace.$project/chat-print-monitor.js';
import { PrintStages } from '#routes/w.$workspace.$project/chat-print-section.js';
import {
  fffComponents,
  known,
  machineEntry,
  machineSnapshot,
  millingComponents,
  observedAt,
  routerManifest,
} from '#components/print/testing/machines.fixture.js';
import { createFixture, entry, printing } from '#routes/w.$workspace.$project/chat-print.fixture.js';
import type { PrintClientFixture } from '#routes/w.$workspace.$project/chat-print.fixture.js';

afterEach(cleanup);

const byPerson: unknown = expect.objectContaining({ kind: 'user' });
const opaqueColour: unknown = expect.stringMatching(/^#[0-9A-F]{6}FF$/u);

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
});

/** The LongMill, homed and idle, with testing on so its designed controls can be tried. */
const router = (overrides: Partial<Parameters<typeof machineEntry>[0]> = {}): MachineDirectoryEntry =>
  machineEntry({
    manifest: routerManifest,
    name: 'Garage LongMill',
    providerId: 'grbl-simulator',
    testing: true,
    snapshot: machineSnapshot(millingComponents(routerManifest)),
    ...overrides,
  });

/** Render surfaces over one real `useMachineControl`, as the pane wires them. */
function Harness({
  client,
  machine,
  isAttended,
  children,
}: {
  readonly client: MachineClient;
  readonly machine: MachineDirectoryEntry;
  readonly isAttended: boolean;
  readonly children: (control: MachineControl) => React.ReactNode;
}): React.JSX.Element {
  const control = useMachineControl({ client, entry: machine, attended: isAttended });
  return (
    <PrintStages>
      {children(control)}
      {control.error === undefined ? null : <p role='alert'>{control.error}</p>}
    </PrintStages>
  );
}

const renderControl = (
  machine: MachineDirectoryEntry,
  {
    attended = false,
    fixture = createFixture({ entries: [machine] }),
  }: { attended?: boolean; fixture?: PrintClientFixture } = {},
) => {
  const view = render(
    <Harness client={fixture.client} machine={machine} isAttended={attended}>
      {(control) => (
        <>
          <MachineAlerts control={control} />
          <Activities control={control} />
          <MonitorStage control={control} />
          <ControlStage client={fixture.client} control={control} />
          <PressureAdvanceStage control={control} />
        </>
      )}
    </Harness>,
  );
  return { ...view, fixture };
};

const openStage = (title: string): HTMLElement => {
  const trigger = screen.getByRole('button', { name: new RegExp(`^${title}`, 'u') });
  if (trigger.getAttribute('aria-expanded') !== 'true') {
    fireEvent.click(trigger);
  }
  return screen.getByRole('region', { name: title });
};

describe('presence', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('forgets "I am at the machine" after ten minutes without a control, and a control renews it', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => usePresence());
    expect(result.current.attended).toBe(false);
    act(() => {
      result.current.setAttended(true);
    });
    act(() => {
      vi.advanceTimersByTime(presenceLease - 1000);
    });
    expect(result.current.attended).toBe(true);
    act(() => {
      result.current.touch();
    });
    act(() => {
      vi.advanceTimersByTime(presenceLease - 1000);
    });
    expect(result.current.attended).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.attended).toBe(false);
    // A touch while absent does not bring presence back.
    act(() => {
      result.current.touch();
    });
    expect(result.current.attended).toBe(false);
  });
});

describe('Control on a milling machine', () => {
  it('holds every attended control with its reason until the person is at the machine', () => {
    renderControl(router());
    const control = openStage('Control');
    const jog = within(control).getByRole('button', { name: 'Jog X+' });
    expect(jog).toBeDisabled();
    expect(within(control).getByRole('button', { name: /^Home/u })).toBeDisabled();
  });

  it('checks a step jog, then sends it once with the run it saw, the capability revision and presence', async () => {
    const user = userEvent.setup();
    const { fixture } = renderControl(router(), { attended: true });
    const control = openStage('Control');
    // Designed, not yet qualified: the control says so beside its name.
    expect(within(control).getAllByText('Unqualified').length).toBeGreaterThan(0);

    await user.click(within(control).getByRole('button', { name: 'Jog X+' }));
    await waitFor(() => {
      expect(fixture.applyAction).toHaveBeenCalledOnce();
    });
    expect(fixture.applyAction).toHaveBeenCalledWith(
      expect.objectContaining({
        machineId: 'machine-1',
        componentId: 'motion',
        action: 'motion.jog',
        version: 1,
        capabilityRevision: 'capabilities-1',
        expectedRunId: null,
        parameters: { axis: 'x', distance: 1, feed: 1000 },
        requestedBy: byPerson,
        attended: true,
      }),
    );

    await user.click(within(control).getByRole('button', { name: 'Zero X here' }));
    await waitFor(() => {
      expect(fixture.applyAction).toHaveBeenLastCalledWith(
        expect.objectContaining({ action: 'work-offset.set', parameters: { offset: 'G54', position: { x: 0 } } }),
      );
    });
    const ids = fixture.applyAction.mock.calls.map(([input]) => input.operationId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('says why the machine refused, without resending', async () => {
    const user = userEvent.setup();
    const fixture = createFixture({ entries: [router()] });
    fixture.applyAction.mockResolvedValueOnce({
      operationId: 'op-1',
      machineId: 'machine-1',
      kind: 'action',
      status: 'rejected',
      code: 'MACHINE_ACTION_PROVIDER_REJECTED',
      message: 'Grbl answered error:15 (travel exceeded).',
      observedAt,
    });
    renderControl(router(), { attended: true, fixture });
    await user.click(within(openStage('Control')).getByRole('button', { name: 'Jog X+' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Grbl answered error:15 (travel exceeded).');
    expect(fixture.applyAction).toHaveBeenCalledOnce();
  });

  it('switches the router on for a bounded time and off again', async () => {
    const user = userEvent.setup();
    const { fixture } = renderControl(router(), { attended: true });
    const control = openStage('Control');
    expect(control).toHaveTextContent('It stops by itself after 10 s.');
    await user.click(within(control).getByRole('switch', { name: 'Router' }));
    await waitFor(() => {
      expect(fixture.applyAction).toHaveBeenCalledWith(
        expect.objectContaining({
          componentId: 'router',
          action: 'spindle.set',
          parameters: { mode: 'clockwise', duration: 10 },
        }),
      );
    });
  });

  it('reads the DRO in work and machine coordinates, with how far the position can be trusted', () => {
    renderControl(router());
    const monitor = screen.getByRole('region', { name: 'Monitor' });
    const table = within(monitor).getByRole('table');
    expect(within(table).getByRole('row', { name: /^Work G54/u })).toHaveTextContent('100.000120.0005.000');
    expect(within(table).getByRole('row', { name: /^Machine/u })).toHaveTextContent('400.000420.000-10.000');
    expect(within(monitor).getByText('Homed')).toBeInTheDocument();
    expect(monitor).toHaveTextContent('G54 · revision wo-1');
  });

  it('hides a position it cannot trust', () => {
    const lost = millingComponents(routerManifest).map(
      (observation): ComponentObservation =>
        observation.componentId === 'motion' && observation.knowledge === 'known' && observation.value.kind === 'motion'
          ? { ...observation, value: { ...observation.value, trust: 'lost' } }
          : observation,
    );
    renderControl(router({ snapshot: machineSnapshot(lost) }));
    const table = within(screen.getByRole('region', { name: 'Monitor' })).getByRole('table');
    expect(within(table).getByRole('row', { name: /^Machine/u })).toHaveTextContent('Machine———');
    expect(screen.getByText('Lost')).toBeInTheDocument();
  });

  it('offers an alert’s action remedy as its button and a person’s remedy as words', async () => {
    const user = userEvent.setup();
    const alarm = router({
      snapshot: machineSnapshot(millingComponents(routerManifest), {
        state: { status: 'alarm', reason: 'Hard limit' },
        alerts: [
          {
            code: 'ALARM:1',
            severity: 'serious',
            message: 'A limit switch was hit.',
            blocks: 'motion',
            remedies: [
              { type: 'person', instruction: 'Move the gantry off the switch.' },
              { type: 'action', componentId: 'controller', action: 'controller.unlock' },
            ],
          },
        ],
      }),
    });
    const { fixture } = renderControl(alarm, { attended: true });
    const alert = screen.getByRole('alert', { name: 'Machine alert' });
    expect(alert).toHaveTextContent('At the machine: Move the gantry off the switch.');
    await user.click(within(alert).getByRole('button', { name: /^Unlock/u }));
    await waitFor(() => {
      expect(fixture.applyAction).toHaveBeenCalledWith(
        expect.objectContaining({ componentId: 'controller', action: 'controller.unlock' }),
      );
    });
  });
});

describe('press and hold', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const holdJog = (fixture: PrintClientFixture): HTMLElement => {
    renderControl(router(), { attended: true, fixture });
    const control = openStage('Control');
    fireEvent.click(within(control).getByRole('combobox', { name: 'Jog step' }));
    fireEvent.click(screen.getByRole('option', { name: 'Hold to jog' }));
    expect(control).toHaveTextContent('the machine stops by itself within 150 ms');
    return within(control).getByRole('button', { name: 'Jog X+' });
  };

  it('begins a hold on press, renews it every half lease, and ends it on release', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fixture = createFixture({ entries: [router()] });
    const jog = holdJog(fixture);

    fireEvent.pointerDown(jog);
    await waitFor(() => {
      expect(fixture.beginHold).toHaveBeenCalledOnce();
    });
    expect(fixture.beginHold).toHaveBeenCalledWith(
      expect.objectContaining({
        componentId: 'motion',
        hold: 'motion.jog',
        parameters: { axis: 'x', direction: 1, feed: 1000 },
        attended: true,
        capabilityRevision: 'capabilities-1',
      }),
    );
    // The fixture grants a 100 ms lease: renewals every 50 ms while pressed.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(160);
    });
    expect(fixture.renewHold.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(fixture.renewHold).toHaveBeenCalledWith({ holdId: 'hold-1' });

    fireEvent.pointerUp(jog);
    await waitFor(() => {
      expect(fixture.endHold).toHaveBeenCalledExactlyOnceWith({ holdId: 'hold-1' });
    });
    const renewals = fixture.renewHold.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(fixture.renewHold).toHaveBeenCalledTimes(renewals);
  });

  it('ends a hold released before the machine granted it, and never renews it', async () => {
    const fixture = createFixture({ entries: [router()] });
    const granted = Promise.withResolvers<{ status: 'held'; holdId: string; lease: number }>();
    fixture.beginHold.mockReturnValueOnce(granted.promise);
    const jog = holdJog(fixture);

    fireEvent.pointerDown(jog);
    fireEvent.pointerUp(jog);
    await act(async () => {
      granted.resolve({ status: 'held', holdId: 'hold-late', lease: 100 });
    });
    await waitFor(() => {
      expect(fixture.endHold).toHaveBeenCalledExactlyOnceWith({ holdId: 'hold-late' });
    });
    expect(fixture.renewHold).not.toHaveBeenCalled();
  });
});

describe('Monitor and materials on a printer', () => {
  it('reads heaters with their targets and the material slots', () => {
    renderControl(printing());
    const monitor = screen.getByRole('region', { name: 'Monitor' });
    expect(monitor).toHaveTextContent('Nozzle220 °Cto 220 °C');
    const slots = within(monitor).getByRole('list', { name: 'Material slots' });
    expect(within(slots).getAllByRole('listitem')).toHaveLength(5);
    expect(within(slots).getAllByRole('listitem')[0]).toHaveTextContent(/^A1.*PLA.*In use/u);
  });

  it('marks a group stale once its observation is past its validity', () => {
    const machine = entry();
    const now = Date.parse(observedAt);
    expect(isObservationStale({ entry: machine, componentId: 'filament', group: 'material', now })).toBe(false);
    const expiring = {
      ...machine,
      snapshot: {
        ...machine.snapshot,
        components: [
          {
            ...known('tool-0', 'temperature', { kind: 'readings', values: [] }),
            validUntil: '2026-09-24T02:00:10.000Z',
          },
        ],
      },
    };
    expect(isObservationStale({ entry: expiring, componentId: 'tool-0', group: 'temperature', now })).toBe(false);
    expect(
      isObservationStale({ entry: expiring, componentId: 'tool-0', group: 'temperature', now: now + 10_000 }),
    ).toBe(true);
    expect(isObservationStale({ entry: { ...machine, freshness: 'stale' }, componentId: 'x', group: 'y', now })).toBe(
      true,
    );
  });

  it('sets the material in an empty slot with its full metadata', async () => {
    const user = userEvent.setup();
    const { fixture } = renderControl(entry({ testing: true }));
    const slots = screen.getByRole('list', { name: 'Material slots' });
    await user.click(within(slots).getByText('A2'));
    const slot = screen.getByRole('group', { name: 'Slot A2' });
    await user.click(within(slot).getByRole('button', { name: 'Set material' }));
    const form = screen.getByRole('form', { name: 'Set the material in A2' });
    await user.type(within(form).getByRole('textbox', { name: 'Filament profile' }), 'GFG00');
    await user.type(within(form).getByRole('textbox', { name: 'Preset setting' }), 'GFSG00');
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(fixture.applyAction).toHaveBeenCalledOnce();
    });
    expect(fixture.applyAction).toHaveBeenCalledWith(
      expect.objectContaining({
        componentId: 'filament',
        action: 'material.set',
        expectedRunId: null,
        parameters: {
          slot: { unitId: 'ams-a', slotId: 'a2' },
          material: {
            materialType: 'PLA',
            color: opaqueColour,
            preset: { profileId: 'GFG00', settingId: 'GFSG00' },
            nozzleTemperature: { min: 190, max: 230 },
          },
        },
      }),
    );
  });

  it('keeps a tag-read slot read-only and loads it only after the person confirms', async () => {
    const user = userEvent.setup();
    const { fixture } = renderControl(
      entry({ testing: true, snapshot: machineSnapshot(fffComponents(), { components: fffComponents() }) }),
    );
    await user.click(within(screen.getByRole('list', { name: 'Material slots' })).getByText('A1'));
    const slot = screen.getByRole('group', { name: 'Slot A1' });
    expect(slot).toHaveTextContent('The AMS read this spool’s tag, which sets its material.');
    expect(within(slot).queryByRole('button', { name: 'Set material' })).not.toBeInTheDocument();
    // A1 feeds the toolhead already: the offer is to unload, and it asks first.
    await user.click(within(slot).getByRole('button', { name: 'Unload' }));
    expect(fixture.applyAction).not.toHaveBeenCalled();
    const confirm = screen.getByRole('alertdialog', { name: 'Confirm unload' });
    await user.click(within(confirm).getByRole('button', { name: /^Unload A1/u }));
    await waitFor(() => {
      expect(fixture.applyAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'material.unload',
          parameters: { slot: { unitId: 'ams-a', slotId: 'a1' }, toolheadId: 'tool-0' },
        }),
      );
    });
  });

  it('lists the pressure-advance table, deletes a row, and saves a value by hand', async () => {
    const user = userEvent.setup();
    const { fixture } = renderControl(entry({ testing: true }));
    const stage = openStage('Pressure advance');
    expect(stage).toHaveTextContent('PLA Basic 0.4');
    await user.click(within(stage).getByRole('button', { name: 'Delete PLA Basic 0.4' }));
    await waitFor(() => {
      expect(fixture.applyAction).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'material.calibration.delete', parameters: { profileId: 'k-pla' } }),
      );
    });

    const form = within(stage).getByRole('form', { name: 'Save a pressure-advance profile' });
    await user.type(within(form).getByRole('textbox', { name: 'Name' }), 'PETG HF');
    await user.type(within(form).getByRole('textbox', { name: 'Filament profile' }), 'GFG99');
    await user.click(within(form).getByRole('button', { name: 'Save profile' }));
    await waitFor(() => {
      expect(fixture.applyAction).toHaveBeenLastCalledWith(
        expect.objectContaining({
          action: 'material.calibration.save',
          parameters: {
            source: 'manual',
            name: 'PETG HF',
            preset: { profileId: 'GFG99', settingId: '' },
            nozzleId: 'nozzle-0',
            pressureAdvance: 0.02,
          },
        }),
      );
    });
  });
});

describe('Activities', () => {
  const activity = (overrides: Partial<MachineActivity>): MachineDirectoryEntry => {
    const machine = entry({ testing: true });
    return {
      ...machine,
      snapshot: {
        ...machine.snapshot,
        activities: [
          {
            activityId: 'activity-1',
            componentId: 'filament',
            kind: 'material.load',
            label: 'Loading A2',
            state: 'needs-person',
            steps: [
              { id: 'heat', label: 'Heat the nozzle', actor: 'machine', state: 'done' },
              { id: 'check', label: 'Is the new colour coming out?', actor: 'person', state: 'active' },
            ],
            ...overrides,
          },
        ],
      },
    };
  };

  it('answers the machine’s question through interaction.respond, naming the prompt', async () => {
    const user = userEvent.setup();
    const { fixture } = renderControl(
      activity({
        awaiting: {
          kind: 'confirmation',
          promptId: 'prompt-1',
          label: 'Is the new colour coming out?',
          answers: [
            { id: 'yes', label: 'Yes, it is clean', role: 'confirm' },
            { id: 'retry', label: 'Purge again', role: 'other' },
          ],
          effects: ['material'],
          safety: { authority: 'person', attended: false, interlocks: [] },
        },
      }),
    );
    const card = screen.getByRole('region', { name: 'Loading A2' });
    expect(within(card).getByRole('status')).toHaveTextContent(
      'Workshop X1C waits for you: Is the new colour coming out?',
    );
    await user.click(within(card).getByRole('button', { name: /^Yes, it is clean/u }));
    await waitFor(() => {
      expect(fixture.applyAction).toHaveBeenCalledWith(
        expect.objectContaining({
          componentId: 'filament',
          action: 'interaction.respond',
          parameters: { activityId: 'activity-1', promptId: 'prompt-1', answer: 'yes' },
        }),
      );
    });
    expect(await within(card).findByText('Waiting for Workshop X1C to continue…')).toBeInTheDocument();
  });

  it('saves a measured calibration result under a name, or discards it without touching the machine', async () => {
    const user = userEvent.setup();
    const measured = activity({
      kind: 'material.calibration.run',
      label: 'Pressure-advance calibration',
      state: 'succeeded',
      steps: [],
      results: [{ id: 'result-1', label: 'A1 · PLA', confidence: 'good', value: { pressureAdvance: 0.024 } }],
    });
    const { fixture, unmount } = renderControl(measured);
    const card = screen.getByRole('region', { name: 'Pressure-advance calibration' });
    expect(card).toHaveTextContent('K 0.024');
    const name = within(card).getByRole('textbox', { name: 'Profile name' });
    await user.clear(name);
    await user.type(name, 'PLA measured');
    await user.click(within(card).getByRole('button', { name: /^Save as a profile/u }));
    await waitFor(() => {
      expect(fixture.applyAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'material.calibration.save',
          parameters: { source: 'measured', activityId: 'activity-1', resultId: 'result-1', name: 'PLA measured' },
        }),
      );
    });
    unmount();

    const again = renderControl(measured);
    await user.click(
      within(screen.getByRole('region', { name: 'Pressure-advance calibration' })).getByRole('button', {
        name: 'Discard',
      }),
    );
    expect(screen.queryByRole('group', { name: 'Calibration result' })).not.toBeInTheDocument();
    expect(again.fixture.applyAction).not.toHaveBeenCalled();
  });
});

describe('describeRun', () => {
  it('states the run with its first counter and the time left', () => {
    expect(describeRun(printing())).toBe('Running · layer 42 of 125 · 9 min left');
    expect(describeRun(entry())).toBeUndefined();
  });
});
