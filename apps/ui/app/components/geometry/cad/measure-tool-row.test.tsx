// @vitest-environment jsdom
import { act, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { createActor, createAsyncLogic } from 'xstate';
import type { Actor } from 'xstate';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { MeasureOptions } from '#components/geometry/cad/measure-tool-row.js';
import { AxisLabel } from '#components/geometry/cad/section-tool-row.js';
import { GraphicsProvider } from '#hooks/use-graphics.js';
import { graphicsMachine } from '#machines/graphics.machine.js';

type GraphicsActor = Actor<typeof graphicsMachine>;

let activeActor: GraphicsActor | undefined;

afterEach(() => {
  activeActor?.stop();
  activeActor = undefined;
});

const startMeasuring = (): GraphicsActor => {
  const actor = createActor(
    graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
    { input: {} },
  ).start();
  activeActor = actor;
  actor.send({ type: 'setMeasureActive', payload: true });
  return actor;
};

/** Measures along X from the origin, `metres` long. */
const measure = (actor: GraphicsActor, metres: number): void => {
  act(() => {
    actor.send({ type: 'startMeasurement', payload: [0, 0, 0] });
    actor.send({ type: 'completeMeasurement', payload: [metres, 0, 0] });
  });
};

/** The Measuring row's options as the bar lays them out, followed by the row's Done. */
const renderRow = (actor: GraphicsActor): void => {
  render(
    <TooltipProvider>
      <GraphicsProvider graphicsRef={actor}>
        <div data-tool-bar='measure'>
          <MeasureOptions />
          <button type='button'>Done</button>
        </div>
      </GraphicsProvider>
    </TooltipProvider>,
  );
};

const listedValues = (): string[] =>
  within(screen.getByRole('list', { name: 'Measurements' }))
    .getAllByRole('listitem')
    .map((item) => within(item).getAllByRole('button')[0]!.getAttribute('aria-label')!.replace('Pin ', ''));

describe('MeasureOptions', () => {
  it('offers a keyboard target chooser and commits an explicitly selected candidate once', async () => {
    const actor = startMeasuring();
    actor.send({
      type: 'setMeasureCandidates',
      candidates: [
        { id: 'edge:a', label: 'Board edge' },
        { id: 'circle:b', label: 'Pawn base' },
      ],
      activeId: 'edge:a',
    });
    const user = userEvent.setup();
    renderRow(actor);
    await user.click(screen.getByRole('button', { name: /^Targets:/ }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Measurement mode' }), 'point');
    expect(actor.getSnapshot().context.measureMode).toBe('point');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Measurement mode' }), 'auto');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Choose target' }), 'circle:b');
    await user.click(screen.getByRole('button', { name: 'Lock target' }));
    await user.click(screen.getByRole('button', { name: 'Use target' }));
    expect(actor.getSnapshot().context).toMatchObject({
      measureChosenCandidateId: 'circle:b',
      measureLockedTargetId: 'circle:b',
      measureCommitRequest: 1,
    });
  });
  it('should prompt for a feature or two points at zero, with nothing to list or clear', () => {
    renderRow(startMeasuring());

    expect(screen.getByRole('status')).toHaveTextContent('Choose a feature or two points');
    expect(screen.queryByRole('button', { name: /measurement/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear all' })).toBeDisabled();
  });

  it('should announce the count as measurements are added', () => {
    const actor = startMeasuring();
    renderRow(actor);

    measure(actor, 0.01);
    expect(screen.getByRole('status')).toHaveTextContent('1 measurement');

    measure(actor, 0.02);
    expect(screen.getByRole('status')).toHaveTextContent('2 measurements');
  });

  it('should clear all measurements and move focus to Done', async () => {
    const actor = startMeasuring();
    measure(actor, 0.01);
    measure(actor, 0.02);
    const user = userEvent.setup();
    renderRow(actor);

    await user.click(screen.getByRole('button', { name: 'Clear all' }));

    expect(actor.getSnapshot().context.measurements).toEqual([]);
    expect(screen.getByRole('status')).toHaveTextContent('Choose a feature or two points');
    expect(screen.getByRole('button', { name: 'Done' })).toHaveFocus();
  });

  it('should list measurements newest first, and pinned first once pinned', async () => {
    const actor = startMeasuring();
    measure(actor, 0.01);
    measure(actor, 0.02);
    const user = userEvent.setup();
    renderRow(actor);
    const count = screen.getByRole('button', { name: '2 measurements' });

    await user.click(count);

    expect(count).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('dialog', { name: 'Measurements' })).toBeInTheDocument();
    expect(listedValues()).toEqual(['20.0 mm', '10.0 mm']);
    expect(screen.getAllByRole('listitem')[1]).toHaveTextContent('X 10.0Y 0.0Z 0.0');

    await user.click(screen.getByRole('button', { name: 'Pin 10.0 mm', pressed: false }));

    expect(screen.getByRole('button', { name: 'Pin 10.0 mm', pressed: true })).toBeInTheDocument();
    expect(listedValues()).toEqual(['10.0 mm', '20.0 mm']);
    expect(actor.getSnapshot().context.measurements[0]).toMatchObject({ isPinned: true });
  });

  it('should mark the axis letters of each measurement as the Section editor does', async () => {
    const actor = startMeasuring();
    measure(actor, 0.01);
    const user = userEvent.setup();
    renderRow(actor);
    await user.click(screen.getByRole('button', { name: '1 measurement' }));
    const item = screen.getByRole('listitem');

    for (const axis of ['x', 'y', 'z'] as const) {
      const { container } = render(<AxisLabel axis={axis} />);
      expect(within(item).getByText(axis.toUpperCase()).outerHTML).toBe(container.innerHTML);
    }
  });

  it('should preview a measurement while its row is hovered', async () => {
    const actor = startMeasuring();
    measure(actor, 0.01);
    const user = userEvent.setup();
    renderRow(actor);
    await user.click(screen.getByRole('button', { name: '1 measurement' }));
    const row = screen.getByRole('listitem');

    await user.hover(row);
    expect(actor.getSnapshot().context.hoveredMeasurementId).toBe(actor.getSnapshot().context.measurements[0]!.id);

    await user.unhover(row);
    expect(actor.getSnapshot().context.hoveredMeasurementId).toBeUndefined();
  });

  it('should keep focus in the list as rows are removed, then move it to Done', async () => {
    const actor = startMeasuring();
    measure(actor, 0.01);
    measure(actor, 0.02);
    const user = userEvent.setup();
    renderRow(actor);
    await user.click(screen.getByRole('button', { name: '2 measurements' }));

    await user.click(screen.getByRole('button', { name: 'Remove 20.0 mm' }));

    expect(screen.getByRole('status')).toHaveTextContent('1 measurement');
    expect(screen.getByRole('button', { name: 'Remove 10.0 mm' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Remove 10.0 mm' }));

    expect(actor.getSnapshot().context.measurements).toEqual([]);
    expect(screen.queryByRole('list', { name: 'Measurements' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toHaveFocus();
  });
});
