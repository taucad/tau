// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ComponentObservation,
  MachineActivity,
  MachineClient,
  MachineDirectoryEntry,
} from '@taucad/runtime/machine';
import { useMachineControl, usePresence, presenceLease } from '#hooks/use-machine-control.js';
import type { MachineControl } from '#hooks/use-machine-control.js';
import {
  Activities,
  ControlStage,
  describeStillFailure,
  formChoices,
  formNumber,
} from '#routes/w.$workspace.$project/chat-print-controls.js';
import { PressureAdvanceStage } from '#routes/w.$workspace.$project/chat-print-materials.js';
import {
  MachineAlerts,
  MonitorStage,
  describeRun,
  isObservationStale,
} from '#routes/w.$workspace.$project/chat-print-monitor.js';
import { PrintStages } from '#routes/w.$workspace.$project/chat-print-section.js';
import { machineActionDescriptorOf, machineJogHold, standardMachineAction } from '@taucad/runtime/machine';
import {
  carveraManifest,
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
  const presence = usePresence();
  const control = useMachineControl({
    client,
    entry: machine,
    attended: isAttended || presence.attended,
    setAttended: presence.setAttended,
  });
  return (
    <PrintStages>
      {children(control)}
      {control.error === undefined ? null : <p role='alert'>{control.error}</p>}
    </PrintStages>
  );
}

const surfaces = (client: MachineClient, machine: MachineDirectoryEntry, attended: boolean): React.JSX.Element => (
  <Harness client={client} machine={machine} isAttended={attended}>
    {(control) => (
      <>
        <MachineAlerts control={control} />
        <Activities control={control} />
        <MonitorStage control={control} />
        <ControlStage client={client} control={control} />
        <PressureAdvanceStage control={control} />
      </>
    )}
  </Harness>
);

const renderControl = (
  machine: MachineDirectoryEntry,
  {
    attended = false,
    fixture = createFixture({ entries: [machine] }),
  }: { attended?: boolean; fixture?: PrintClientFixture } = {},
) => {
  const view = render(surfaces(fixture.client, machine, attended));
  /** The machine reports again: the same surfaces over the new observation. */
  const observe = (next: MachineDirectoryEntry): void => {
    view.rerender(surfaces(fixture.client, next, attended));
  };
  return { ...view, fixture, observe };
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

    // The keyboard sends a step once, as a click does.
    within(control).getByRole('button', { name: 'Jog X+' }).focus();
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(fixture.applyAction).toHaveBeenCalledTimes(2);
    });

    await user.click(within(control).getByRole('button', { name: 'Zero X here' }));
    await waitFor(() => {
      expect(fixture.applyAction).toHaveBeenLastCalledWith(
        expect.objectContaining({ action: 'work-offset.set', parameters: { offset: 'G54', position: { x: 0 } } }),
      );
    });
    const ids = fixture.applyAction.mock.calls.map(([input]) => input.operationId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('raises the bed with the up arrow when the bed rides Z, as Bambu Studio does', async () => {
    const user = userEvent.setup();
    const bedOnZ = {
      ...routerManifest,
      axes: routerManifest.axes.map((axis) => (axis.id === 'z' ? ({ ...axis, carries: 'work' } as const) : axis)),
    };
    const { fixture } = renderControl(router({ manifest: bedOnZ }), { attended: true });
    await user.click(within(openStage('Control')).getByRole('button', { name: 'Jog Z−, bed up' }));
    await waitFor(() => {
      expect(fixture.applyAction).toHaveBeenCalledWith(
        expect.objectContaining({ parameters: { axis: 'z', distance: -1, feed: 1000 } }),
      );
    });
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

  it('reads and controls every motion group, and sums up by the least trusted one', async () => {
    const user = userEvent.setup();
    // A second head with its own axis, homed apart from the first: its position is lost.
    const home = routerManifest.actions.find((action) => action.id === 'motion.home');
    const twoHeads: typeof routerManifest = {
      ...routerManifest,
      axes: [
        ...routerManifest.axes,
        {
          id: 'u',
          label: 'U',
          kind: 'linear',
          unit: 'mm',
          travel: { min: 0, max: 100 },
          carries: 'tool',
          reference: 'cycle',
        },
      ],
      components: [...routerManifest.components, { id: 'head-2', label: 'Second head', kind: 'motion', axes: ['u'] }],
      actions: [...routerManifest.actions, ...(home === undefined ? [] : [{ ...home, componentId: 'head-2' }])],
    };
    const observations = [
      ...millingComponents(twoHeads),
      known('head-2', 'position', {
        kind: 'motion',
        homed: { u: false },
        trust: 'lost',
        position: { machine: { u: 0 }, work: { u: 0 } },
        workOffset: { id: 'G54', revision: 'wo-2', origin: { u: 0 } },
        mode: 'normal',
        feed: 0,
        limits: [],
      }),
    ];
    const { fixture } = renderControl(router({ manifest: twoHeads, snapshot: machineSnapshot(observations) }), {
      attended: true,
    });
    const monitor = screen.getByRole('region', { name: 'Monitor' });
    expect(within(monitor).getByRole('heading', { name: 'Axes position' })).toBeInTheDocument();
    expect(within(monitor).getByRole('heading', { name: 'Second head position' })).toBeInTheDocument();
    expect(within(monitor).getAllByRole('table')).toHaveLength(2);
    expect(monitor).toHaveTextContent('Second head work offsetG54 · revision wo-2');
    expect(screen.getByRole('button', { name: /^Monitor/u })).toHaveTextContent('Lost · Router off');

    const control = openStage('Control');
    expect(within(control).getByRole('group', { name: 'Axes' })).toBeInTheDocument();
    const second = within(control).getByRole('group', { name: 'Second head' });
    expect(within(second).getByRole('button', { name: /^Home/u })).toBeInTheDocument();
    // The controller's own buttons stay with the first group, not once per head.
    expect(within(second).queryByRole('button', { name: /^Unlock/u })).not.toBeInTheDocument();
    // The lost head blocks the first group's jog: the refusal names it, and its remedy homes it, not the Axes.
    const axes = within(control).getByRole('group', { name: 'Axes' });
    expect(axes).toHaveTextContent('Second head: The position was lost. Home first.');
    await user.click(within(axes).getByRole('button', { name: /^Second head: Home/u }));
    await waitFor(() => {
      expect(fixture.applyAction).toHaveBeenCalledWith(
        expect.objectContaining({ componentId: 'head-2', action: 'motion.home' }),
      );
    });
  });

  /** The router with a rotary unit on axis A, declaring the given actions of the router's motion group. */
  const withRotary = (actions: readonly string[]): typeof routerManifest => ({
    ...routerManifest,
    axes: [
      ...routerManifest.axes,
      { id: 'a', label: 'A', kind: 'rotary', unit: 'deg', carries: 'work', reference: 'none' },
    ],
    components: [...routerManifest.components, { id: 'rotary', label: 'Rotary', kind: 'motion', axes: ['a'] }],
    actions: [
      ...routerManifest.actions,
      ...routerManifest.actions
        .filter((action) => action.componentId === 'motion' && actions.includes(action.id))
        .map((action) => ({ ...action, componentId: 'rotary' })),
    ],
  });

  it('sums up position trust only over the groups that can home, as motion is gated', () => {
    // The rotary unit declares no homing and reports no trust: it neither gates motion nor reads as not homed.
    const rotary = withRotary(['motion.move']);
    renderControl(router({ manifest: rotary, snapshot: machineSnapshot(millingComponents(rotary)) }));
    expect(screen.getByRole('button', { name: /^Monitor/u })).toHaveTextContent('Homed · Router off');
  });

  it('offers a rotary-only group no work-zero move and no empty jog pad', () => {
    const rotary = withRotary(['motion.home', 'motion.move', 'motion.jog']);
    renderControl(router({ manifest: rotary, snapshot: machineSnapshot(millingComponents(rotary)) }));
    const group = within(openStage('Control')).getByRole('group', { name: 'Rotary' });
    expect(within(group).getByRole('button', { name: /^Home/u })).toBeInTheDocument();
    expect(within(group).queryByRole('button', { name: /^Go to work zero/u })).not.toBeInTheDocument();
    expect(within(group).queryByRole('group', { name: 'Jog step' })).not.toBeInTheDocument();
    expect(within(group).queryByText('Jog')).not.toBeInTheDocument();
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
    // An alert reads in the feature tone; red is only for Stop and cancel (#321).
    expect(alert).toHaveClass('border-feature/30');
    expect(alert.className).not.toMatch(/destructive/u);
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
    vi.restoreAllMocks();
  });

  const holdJog = (
    fixture: PrintClientFixture,
    machine = router(),
    name = 'Jog X+',
  ): Readonly<{ jog: HTMLElement; observe: (next: MachineDirectoryEntry) => void }> => {
    const { observe } = renderControl(machine, { attended: true, fixture });
    const control = openStage('Control');
    fireEvent.click(within(control).getByRole('radio', { name: 'Hold to jog' }));
    expect(control).toHaveTextContent('the machine stops by itself within 150 ms');
    return { jog: within(control).getByRole('button', { name }), observe };
  };

  /** Press and wait until the machine granted the hold. */
  const press = async (fixture: PrintClientFixture, jog: HTMLElement): Promise<void> => {
    fireEvent.pointerDown(jog);
    await waitFor(() => {
      expect(fixture.beginHold).toHaveBeenCalledOnce();
    });
    await waitFor(() => {
      expect(jog).toHaveAttribute('aria-pressed', 'true');
    });
  };

  it('presses only the jog button of the group whose hold is in force', async () => {
    // A second head on the same Z: each group has its own Z+.
    const jog = routerManifest.actions.find((action) => action.id === 'motion.jog');
    const twoOnZ: typeof routerManifest = {
      ...routerManifest,
      components: [...routerManifest.components, { id: 'head-2', label: 'Second head', kind: 'motion', axes: ['z'] }],
      actions: [...routerManifest.actions, ...(jog === undefined ? [] : [{ ...jog, componentId: 'head-2' }])],
      holds: [
        ...routerManifest.holds,
        machineActionDescriptorOf(machineJogHold({ componentId: 'head-2', lease: 100, bound: 150 })),
      ],
    };
    const machine = router({
      manifest: twoOnZ,
      snapshot: machineSnapshot([
        ...millingComponents(twoOnZ),
        known('head-2', 'position', {
          kind: 'motion',
          homed: { z: true },
          trust: 'homed',
          position: { machine: { z: 0 }, work: { z: 0 } },
          workOffset: { id: 'G54', revision: 'wo-2', origin: { z: 0 } },
          mode: 'normal',
          feed: 0,
          limits: [],
        }),
      ]),
    });
    const fixture = createFixture({ entries: [machine] });
    renderControl(machine, { attended: true, fixture });
    const control = openStage('Control');
    const axes = within(control).getByRole('group', { name: 'Axes' });
    const second = within(control).getByRole('group', { name: 'Second head' });
    fireEvent.click(within(axes).getByRole('radio', { name: 'Hold to jog' }));
    fireEvent.click(within(second).getByRole('radio', { name: 'Hold to jog' }));
    const held = within(second).getByRole('button', { name: 'Jog Z+' });
    await press(fixture, held);
    expect(fixture.beginHold).toHaveBeenCalledWith(expect.objectContaining({ componentId: 'head-2' }));
    expect(within(axes).getByRole('button', { name: 'Jog Z+' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.pointerUp(held);
  });

  it('keeps a hold while the machine reports itself moving, and keeps its button live to let go', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fixture = createFixture({ entries: [router()] });
    const { jog, observe } = holdJog(fixture);
    await press(fixture, jog);
    // Grbl reports Jog as active: that is the hold itself, not a reason to stop.
    observe(router({ snapshot: machineSnapshot(millingComponents(routerManifest), { state: { status: 'active' } }) }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120);
    });
    expect(fixture.endHold).not.toHaveBeenCalled();
    expect(fixture.renewHold.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(jog).toBeEnabled();
    fireEvent.pointerUp(jog);
    await waitFor(() => {
      expect(fixture.endHold).toHaveBeenCalledExactlyOnceWith({ holdId: 'hold-1' });
    });
  });

  it.each([
    { when: 'the observation goes stale', next: () => router({ freshness: 'stale' }) },
    {
      when: 'the machine goes into alarm',
      next: () =>
        router({ snapshot: machineSnapshot(millingComponents(routerManifest), { state: { status: 'alarm' } }) }),
    },
  ])('lets go and stops renewing when $when', async ({ next }) => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fixture = createFixture({ entries: [router()] });
    const { jog, observe } = holdJog(fixture);
    await press(fixture, jog);
    observe(next());
    await waitFor(() => {
      expect(fixture.endHold).toHaveBeenCalledExactlyOnceWith({ holdId: 'hold-1' });
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/^Garage LongMill stopped the jog: /u);
    const renewals = fixture.renewHold.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(fixture.renewHold).toHaveBeenCalledTimes(renewals);
  });

  it.each([
    { where: 'a release anywhere on the page', release: () => fireEvent.pointerUp(document.body) },
    { where: 'a cancelled pointer', release: () => fireEvent.pointerCancel(globalThis.window) },
    { where: 'the window losing focus', release: () => fireEvent.blur(globalThis.window) },
    {
      where: 'the page being hidden',
      release: () => {
        vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
        fireEvent(document, new Event('visibilitychange'));
      },
    },
  ])('ends a hold on $where', async ({ release }) => {
    const fixture = createFixture({ entries: [router()] });
    const { jog } = holdJog(fixture);
    await press(fixture, jog);
    act(release);
    await waitFor(() => {
      expect(fixture.endHold).toHaveBeenCalledExactlyOnceWith({ holdId: 'hold-1' });
    });
    expect(jog).toHaveAttribute('aria-pressed', 'false');
  });

  it('says so when the machine ended the hold, and lets go', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fixture = createFixture({ entries: [router()] });
    fixture.renewHold.mockResolvedValue({ status: 'ended' });
    const { jog } = holdJog(fixture);
    await press(fixture, jog);
    expect(await screen.findByRole('alert')).toHaveTextContent('Garage LongMill ended the jog.');
    expect(jog).toHaveAttribute('aria-pressed', 'false');
    // The machine already ended it: nothing to release.
    expect(fixture.endHold).not.toHaveBeenCalled();
  });

  it('stays quiet when the release finds the hold already ended, and says any other failure', async () => {
    const fixture = createFixture({ entries: [router()] });
    /* The host's typed refusal: the code travels beside a sentence, never inside it (R11). */
    fixture.endHold.mockRejectedValueOnce(
      Object.assign(new Error('This hold has already ended.'), { code: 'MACHINE_HOLD_ENDED' }),
    );
    const { jog } = holdJog(fixture);
    await press(fixture, jog);
    fireEvent.pointerUp(jog);
    await waitFor(() => {
      expect(fixture.endHold).toHaveBeenCalledOnce();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fixture.endHold.mockRejectedValueOnce(new Error('MACHINE_CHANNEL_CLOSED'));
    fixture.beginHold.mockClear();
    await press(fixture, jog);
    fireEvent.pointerUp(jog);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Garage LongMill did not confirm the end of the jog (MACHINE_CHANNEL_CLOSED)',
    );
  });

  it('holds with Space once despite key repeat and lets go on key up', async () => {
    const fixture = createFixture({ entries: [router()] });
    const { jog } = holdJog(fixture);
    fireEvent.keyDown(jog, { key: ' ' });
    fireEvent.keyDown(jog, { key: ' ', repeat: true });
    await waitFor(() => {
      expect(fixture.beginHold).toHaveBeenCalledOnce();
    });
    fireEvent.keyUp(jog, { key: ' ' });
    await waitFor(() => {
      expect(fixture.endHold).toHaveBeenCalledExactlyOnceWith({ holdId: 'hold-1' });
    });
  });

  it('holds the bed up as Z− on a machine whose bed rides Z', async () => {
    const fixture = createFixture({ entries: [router()] });
    const bedOnZ = {
      ...routerManifest,
      axes: routerManifest.axes.map((axis) => (axis.id === 'z' ? ({ ...axis, carries: 'work' } as const) : axis)),
    };
    const { jog } = holdJog(fixture, router({ manifest: bedOnZ }), 'Jog Z−, bed up');
    fireEvent.pointerDown(jog);
    await waitFor(() => {
      expect(fixture.beginHold).toHaveBeenCalledWith(
        expect.objectContaining({ parameters: { axis: 'z', direction: -1, feed: 1000 } }),
      );
    });
  });

  it('begins a hold on press, renews it every half lease, and ends it on release', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fixture = createFixture({ entries: [router()] });
    const { jog } = holdJog(fixture);

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

  it('ends a granted hold when the pane goes away', async () => {
    const fixture = createFixture({ entries: [router()] });
    const { jog } = holdJog(fixture);
    await press(fixture, jog);
    cleanup();
    await waitFor(() => {
      expect(fixture.endHold).toHaveBeenCalledExactlyOnceWith({ holdId: 'hold-1' });
    });
  });

  it.each([
    {
      scenario: 'refused',
      refuse: (fixture: PrintClientFixture) =>
        fixture.beginHold.mockResolvedValueOnce({
          status: 'rejected',
          code: 'MACHINE_ACTION_BUSY',
          message: 'The machine is busy.',
        }),
    },
    {
      scenario: 'failed',
      refuse: (fixture: PrintClientFixture) =>
        fixture.beginHold.mockRejectedValueOnce(new Error('The machine is busy.')),
    },
  ])('lets go and says why when the machine $scenario the hold', async ({ refuse }) => {
    const fixture = createFixture({ entries: [router()] });
    refuse(fixture);
    const { jog } = holdJog(fixture);
    fireEvent.pointerDown(jog);
    expect(await screen.findByText('The machine is busy.')).toBeInTheDocument();
    expect(jog).toHaveAttribute('aria-pressed', 'false');
    expect(fixture.renewHold).not.toHaveBeenCalled();
  });

  it('ends a hold released before the machine granted it, and never renews it', async () => {
    const fixture = createFixture({ entries: [router()] });
    const granted = Promise.withResolvers<{ status: 'held'; holdId: string; lease: number }>();
    fixture.beginHold.mockReturnValueOnce(granted.promise);
    const { jog } = holdJog(fixture);

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
    // The button that opened it is gone; keyboard focus lands on the confirmation's first choice, not the page.
    expect(within(confirm).getByRole('button', { name: /^Unload A1/u })).toHaveFocus();
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

  it('shows the speed a fan runs at beside its name, and keeps the speed chosen in the list while it spins down', async () => {
    const user = userEvent.setup();
    const components = fffComponents().map((observation) =>
      observation.componentId === 'part-fan'
        ? known('part-fan', 'accessories', { kind: 'level', ratio: 0.47 })
        : observation,
    );
    const { fixture, observe } = renderControl(
      entry({ testing: true, snapshot: machineSnapshot(components, { components }) }),
    );
    const control = openStage('Control');
    const speed = within(control).getByRole('combobox', { name: 'Part fan' });
    expect(within(control).getByText('47 %')).toBeInTheDocument();
    expect(speed).toHaveTextContent('Set speed');

    await user.click(speed);
    await user.click(screen.getByRole('option', { name: '0 %' }));
    await waitFor(() => {
      expect(fixture.applyAction).toHaveBeenCalledWith(
        expect.objectContaining({ componentId: 'part-fan', action: 'level.set', parameters: { ratio: 0 } }),
      );
    });
    expect(speed).toHaveTextContent('0 %');
    expect(within(control).getByText('47 %')).toBeInTheDocument();

    // The program sets the fan: the list follows what the machine reports, not the earlier choice.
    const programmed = fffComponents().map((observation) =>
      observation.componentId === 'part-fan'
        ? known('part-fan', 'accessories', { kind: 'level', ratio: 0.75 })
        : observation,
    );
    observe(entry({ testing: true, snapshot: machineSnapshot(programmed, { components: programmed }) }));
    expect(speed).toHaveTextContent('75 %');
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

  it('shows a flow-ratio result read-only, since Tau cannot keep it yet', async () => {
    const user = userEvent.setup();
    const { fixture } = renderControl(
      activity({
        kind: 'material.calibration.run',
        label: 'Flow-ratio calibration',
        state: 'needs-person',
        steps: [],
        results: [
          {
            id: 'result-1',
            label: 'A1 · PLA',
            confidence: 'good',
            value: { unitId: 'ams-a', slotId: 'a1', profileId: 'GFA00', flowRatio: 0.98 },
          },
        ],
      }),
    );
    const card = screen.getByRole('region', { name: 'Flow-ratio calibration' });
    expect(card).toHaveTextContent('Flow ratio 0.980');
    expect(card).toHaveTextContent('Tau can’t keep this result yet. Enter it in your slicer’s filament settings.');
    expect(within(card).queryByRole('button', { name: /^Save as a profile/u })).not.toBeInTheDocument();
    expect(within(card).queryByRole('textbox', { name: 'Profile name' })).not.toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Discard' }));
    expect(screen.queryByRole('group', { name: 'Calibration result' })).not.toBeInTheDocument();
    expect(fixture.applyAction).not.toHaveBeenCalled();
  });
});

describe('describeStillFailure', () => {
  const failure = (message: string, code?: string): Error =>
    code === undefined ? new Error(message) : Object.assign(new Error(message), { code });

  it('words a failure by its typed code, never by a code its message names', () => {
    expect(describeStillFailure(failure('slow down', 'MACHINE_STILL_RATE_LIMITED'))).toBe(
      'Stills are limited to one every 5 seconds; wait a moment, then capture again.',
    );
    expect(describeStillFailure(failure('MACHINE_STILL_RATE_LIMITED'))).toBe(
      'The camera could not capture a still; capture again in a moment. (MACHINE_STILL_RATE_LIMITED)',
    );
    expect(describeStillFailure(failure('Lost', 'MACHINE_OTHER'))).toBe(
      'The camera could not capture a still; capture again in a moment. (MACHINE_OTHER)',
    );
    expect(describeStillFailure(failure(' '))).toBe('The camera could not capture a still; capture again in a moment.');
  });
});

describe('describeRun', () => {
  it('states the run with its first counter and the time left', () => {
    expect(describeRun(printing())).toBe('Running · layer 42 of 125 · 9 min left');
    expect(describeRun(entry())).toBeUndefined();
  });
});

describe('controls read from what the machine declares', () => {
  it("runs the probe cycle chosen from the machine's own list", async () => {
    const user = userEvent.setup();
    const carvera = machineEntry({
      manifest: carveraManifest,
      name: 'Shop Carvera',
      providerId: 'carvera-simulator',
      testing: true,
      snapshot: machineSnapshot([
        ...millingComponents(carveraManifest),
        known('cover', 'inputs', { kind: 'interlock', state: 'safe' }),
      ]),
    });
    const { fixture } = renderControl(carvera, { attended: true });
    const control = openStage('Control');
    await user.click(within(control).getByRole('combobox', { name: 'Wireless probe cycle' }));
    await user.click(screen.getByRole('option', { name: 'corner' }));
    await user.click(within(control).getByRole('button', { name: /^Probe/u }));
    await waitFor(() => {
      expect(fixture.applyAction).toHaveBeenCalledWith(
        expect.objectContaining({ componentId: 'probe', action: 'probe.run', parameters: { cycle: 'corner' } }),
      );
    });
  });

  it("keeps a feed and a duration inside the form's bounds and prefers its default", () => {
    const fast = machineActionDescriptorOf(
      machineJogHold({
        componentId: 'motion',
        lease: 100,
        bound: 150,
        schema: z.strictObject({
          axis: z.string(),
          direction: z.union([z.literal(1), z.literal(-1)]),
          feed: z.number().positive().max(600),
        }),
      }),
    );
    expect(formNumber(fast, 'feed', 1000)).toBe(600);
    const timed = machineActionDescriptorOf(
      standardMachineAction({
        id: 'spindle.set',
        componentId: 'router',
        label: 'Router',
        when: ['ready'],
        schema: z.discriminatedUnion('mode', [
          z.strictObject({ mode: z.literal('off') }),
          z.strictObject({ mode: z.literal('clockwise'), duration: z.number().positive().default(30) }),
        ]),
      }),
    );
    expect(formNumber(timed, 'duration', 10)).toBe(30);
    expect(formChoices(timed, 'cycle')).toEqual([]);
  });

  it('says why a designed control waits for testing, and why an unsupported one is not offered here', () => {
    const unsupportedHome = {
      ...routerManifest,
      actions: routerManifest.actions.map((descriptor) =>
        descriptor.id === 'motion.home'
          ? {
              ...descriptor,
              qualification: { status: 'unsupported', reason: 'This machine has no homing switches.' } as const,
            }
          : descriptor,
      ),
    };
    renderControl(router({ manifest: unsupportedHome, testing: undefined }), { attended: true });
    const control = openStage('Control');
    expect(within(control).getByRole('button', { name: 'Jog X+' })).toBeDisabled();
    expect(
      within(control).getByText(/^Jog is not yet qualified on this machine\. Turn on testing/u),
    ).toBeInTheDocument();
    const home = within(control).getByRole('button', { name: /^Home/u });
    expect(home).toBeDisabled();
    expect(home).toHaveAttribute('title', 'This machine has no homing switches.');
  });
});

describe('Monitor readings', () => {
  it("shows a provider's own readings under their component, and siblings of an unknown reading", () => {
    const components = [
      ...fffComponents().filter((observation) => observation.componentId !== 'tool-0'),
      {
        componentId: 'tool-0',
        group: 'temperature',
        receivedAt: observedAt,
        knowledge: 'unknown',
        reason: 'Unreadable report',
      },
      known('chamber', 'bambu.environment', {
        kind: 'readings',
        values: [{ id: 'humidity', label: 'Humidity', value: 40 }],
      }),
    ] satisfies readonly ComponentObservation[];
    renderControl(entry({ snapshot: machineSnapshot(components) }));
    const monitor = screen.getByRole('region', { name: 'Monitor' });
    expect(within(monitor).getByRole('heading', { name: /chamber/iu })).toBeInTheDocument();
    expect(monitor).toHaveTextContent('Humidity40');
    // One component unknown, its siblings still read.
    expect(monitor).toHaveTextContent('Bed24 °C');
    expect(monitor).not.toHaveTextContent('Nozzle');
  });

  it.each([
    { trust: 'homed', label: 'Homed' },
    { trust: 'kept', label: 'Kept since homing' },
    { trust: 'lost', label: 'Lost' },
    { trust: 'unknown', label: 'Not homed' },
  ] as const)('reads a position trusted as $trust as $label', ({ trust, label }) => {
    const components = millingComponents(routerManifest).map(
      (observation): ComponentObservation =>
        observation.componentId === 'motion' && observation.knowledge === 'known' && observation.value.kind === 'motion'
          ? { ...observation, value: { ...observation.value, trust } }
          : observation,
    );
    renderControl(router({ snapshot: machineSnapshot(components) }));
    const monitor = screen.getByRole('region', { name: 'Monitor' });
    expect(monitor).toHaveTextContent(label);
  });

  it('marks the position stale once it is past the time it stays valid', () => {
    const expired = millingComponents(routerManifest).map(
      (observation): ComponentObservation =>
        observation.componentId === 'motion' ? { ...observation, validUntil: '2026-09-24T01:59:59.000Z' } : observation,
    );
    renderControl(router({ snapshot: machineSnapshot(expired) }));
    expect(within(screen.getByRole('region', { name: 'Monitor' })).getByText('Stale')).toBeInTheDocument();
  });
});
