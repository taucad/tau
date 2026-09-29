// @vitest-environment jsdom
import { Profiler } from 'react';
import { act, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActor, createAsyncLogic } from 'xstate';
import type { Actor } from 'xstate';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import type * as ButtonModule from '@taucad/ui/components/button';
import type * as SliderInputModule from '#components/ui/slider-input.js';
import {
  AxisLabel,
  SectionEditor,
  SectionOptions,
  resolveSectionTranslationControl,
} from '#components/geometry/cad/section-tool-row.js';
import type { SectionCut, SectionVector } from '#components/geometry/graphics/section-cuts.js';
import { GraphicsProvider } from '#hooks/use-graphics.js';
import { graphicsMachine } from '#machines/graphics.machine.js';

/* Pass-through recorders: every render of a Button or SliderInput is recorded by name, so a test can tell which
 * controls a change re-rendered. */
const { renders } = vi.hoisted(() => ({ renders: [] as string[] }));

vi.mock('@taucad/ui/components/button', async (importOriginal) => {
  const actual = await importOriginal<typeof ButtonModule>();
  return {
    ...actual,
    Button(properties: React.ComponentProps<typeof actual.Button>): React.JSX.Element {
      renders.push(`button:${properties['aria-label'] ?? 'unnamed'}`);
      return <actual.Button {...properties} />;
    },
  };
});

vi.mock('#components/ui/slider-input.js', async (importOriginal) => {
  const actual = await importOriginal<typeof SliderInputModule>();
  return {
    ...actual,
    SliderInput(properties: React.ComponentProps<typeof actual.SliderInput>): React.JSX.Element {
      renders.push(`field:${properties['aria-label']}`);
      return <actual.SliderInput {...properties} />;
    },
  };
});

type GraphicsActor = Actor<typeof graphicsMachine>;

let activeActor: GraphicsActor | undefined;

afterEach(() => {
  activeActor?.stop();
  activeActor = undefined;
  renders.length = 0;
});

const startGraphics = (centerMeters: [number, number, number] = [0, 0, 0]): GraphicsActor => {
  const actor = createActor(
    graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
    { input: {} },
  ).start();
  activeActor = actor;
  actor.send({ type: 'sceneRadiusUpdated', radius: 0.1, centerMeters });
  return actor;
};

/** Records what the UI sends, still delivering it; the actor's own `send` is a prototype getter a spy cannot wrap. */
const recordSends = (actor: GraphicsActor): ReturnType<typeof vi.fn<GraphicsActor['send']>> => {
  const send = vi.fn<GraphicsActor['send']>(actor.send);
  Object.defineProperty(actor, 'send', { value: send, configurable: true });
  return send;
};

const sentTypes = (send: ReturnType<typeof recordSends>): string[] => send.mock.calls.map(([event]) => event.type);

const cuts = (actor: GraphicsActor): readonly SectionCut[] => actor.getSnapshot().context.sectionCuts;
const cutAt = (actor: GraphicsActor, index: number): SectionCut => cuts(actor)[index]!;
const offsetOf = (cut: SectionCut): number | undefined => (cut.kind === 'plane' ? cut.offset : undefined);

/** A camera looking from `direction` (from its target toward the camera) at the origin. */
const cameraSeed = (direction: SectionVector): React.ComponentProps<typeof GraphicsProvider>['seed'] => ({
  camera: {
    cameraView: {
      frameId: 'tau:root',
      target: [0, 0, 0],
      direction,
      up: [0, 0, 1],
      verticalSpan: 2,
      perspectiveZoom: 1,
    },
  },
});

/** The Section row's parts, as the bar lays them out: the editor above the chips. */
const renderRow = (
  actor: GraphicsActor,
  commits?: { count: number },
  seed?: React.ComponentProps<typeof GraphicsProvider>['seed'],
): void => {
  render(
    <TooltipProvider>
      <GraphicsProvider graphicsRef={actor} seed={seed}>
        <Profiler
          id='section-row'
          onRender={() => {
            if (commits) {
              commits.count += 1;
            }
          }}
        >
          <div data-tool-bar='section'>
            <SectionEditor />
            <SectionOptions />
          </div>
        </Profiler>
      </GraphicsProvider>
    </TooltipProvider>,
  );
};

/** Section on with its first cut, an XZ plane, open. */
const startSection = (centerMeters?: [number, number, number]): GraphicsActor => {
  const actor = startGraphics(centerMeters);
  actor.send({ type: 'setSectionViewActive', payload: true });
  return actor;
};

const addRevolution = (actor: GraphicsActor): SectionCut => {
  actor.send({ type: 'addSectionCut', payload: { kind: 'revolution', axis: 'x' } });
  return cuts(actor).at(-1)!;
};

describe('resolveSectionTranslationControl', () => {
  it('should centre the physical range on displaced geometry without a fixed metre floor', () => {
    expect(
      resolveSectionTranslationControl({
        geometryCenterMeters: [10, 20, 30],
        geometryRadiusMeters: 0.1,
        selectedPlaneId: 'xy',
      }),
    ).toEqual({ minMeters: 29.8, maxMeters: 30.2 });
  });

  it('should leave the range open before geometry bounds are known', () => {
    expect(
      resolveSectionTranslationControl({
        geometryCenterMeters: [0, 0, 0],
        geometryRadiusMeters: 0,
        selectedPlaneId: 'xy',
      }),
    ).toEqual({ minMeters: undefined, maxMeters: undefined });
  });
});

describe('Section row', () => {
  it('should fold the open editor away from its chip and open it again', async () => {
    const actor = startSection();
    const user = userEvent.setup();
    renderRow(actor);

    const chip = screen.getByRole('button', { name: 'Plane XZ 0 mm' });
    expect(chip).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('group', { name: 'XZ plane' })).toBeInTheDocument();

    await user.click(chip);

    expect(chip).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('group', { name: 'XZ plane' })).not.toBeInTheDocument();
    expect(actor.getSnapshot().context.selectedSectionCutId).toBeUndefined();

    await user.click(chip);

    expect(chip).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('group', { name: 'XZ plane' })).toBeInTheDocument();
  });

  it('should add planes and a revolution cutaway from the camera direction, opening each', async () => {
    const actor = startSection();
    const send = recordSends(actor);
    const user = userEvent.setup();
    renderRow(actor);

    await user.click(screen.getByRole('button', { name: 'Add section' }));
    await user.click(await screen.findByRole('menuitem', { name: 'XY plane' }));

    const added = send.mock.calls.find(([event]) => event.type === 'addSectionCut')?.[0];
    expect(added).toMatchObject({ payload: { kind: 'plane', plane: 'xy' } });
    expect(added?.type === 'addSectionCut' ? added.payload.viewDirection : undefined).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Plane XY 0 mm', expanded: true })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add section' }));
    await user.click(await screen.findByRole('menuitem', { name: /Revolution cutaway/ }));

    expect(screen.getByRole('button', { name: 'Revolution cutaway 90° about Z', expanded: true })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Revolution cutaway' })).toBeInTheDocument();
    expect(cuts(actor)).toHaveLength(3);
  });

  it('should refuse a fifth cut and say why', async () => {
    const actor = startSection();
    for (const plane of ['xy', 'yz', 'xz'] as const) {
      actor.send({ type: 'addSectionCut', payload: { kind: 'plane', plane } });
    }
    const user = userEvent.setup();
    renderRow(actor);

    const add = screen.getByRole('button', { name: 'Add section' });
    expect(add).toHaveAttribute('aria-disabled', 'true');

    await user.hover(add);

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Up to 4 cuts');

    await user.click(add);
    await user.keyboard('{Enter}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(cuts(actor)).toHaveLength(4);
  });

  it('should move focus to the next chip when a chip is removed, and to Add after the last', async () => {
    const actor = startSection();
    actor.send({ type: 'addSectionCut', payload: { kind: 'plane', plane: 'xy' } });
    const user = userEvent.setup();
    renderRow(actor);

    await user.click(screen.getByRole('button', { name: 'Remove plane XZ 0 mm' }));

    expect(screen.queryByRole('button', { name: 'Plane XZ 0 mm' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Plane XY 0 mm' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Remove plane XY 0 mm' }));

    expect(cuts(actor)).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Add section' })).toHaveFocus();
  });

  it('should number chips that read the same, and only while they do', async () => {
    const actor = startSection();
    actor.send({ type: 'addSectionCut', payload: { kind: 'plane', plane: 'xz' } });
    const user = userEvent.setup();
    renderRow(actor);

    for (const ordinal of [1, 2]) {
      expect(screen.getByRole('button', { name: `Plane XZ 0 mm (${ordinal})` })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: `Remove plane XZ 0 mm (${ordinal})` })).toBeInTheDocument();
    }

    await user.click(screen.getByRole('button', { name: 'Remove plane XZ 0 mm (1)' }));

    expect(screen.getByRole('button', { name: 'Plane XZ 0 mm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove plane XZ 0 mm' })).toBeInTheDocument();
  });

  it("should colour a chip's glyph as its axis mark, mixed toward the text colour", () => {
    const actor = startSection();
    renderRow(actor);
    render(<AxisLabel axis='y' />);

    const glyph = screen.getByRole('button', { name: 'Plane XZ 0 mm' }).querySelector('svg');
    const mark = document.querySelector<HTMLElement>('span[aria-hidden="true"].rounded-full');

    expect(glyph?.style.color).toContain('currentcolor');
    expect(glyph?.style.color).toBe(mark?.style.backgroundColor);
  });

  it('should focus the editor when a chip opens by keyboard, but not by pointer', async () => {
    const actor = startSection();
    actor.send({ type: 'selectSectionCut', payload: undefined });
    const user = userEvent.setup();
    renderRow(actor);
    const chip = screen.getByRole('button', { name: 'Plane XZ 0 mm' });

    await user.click(chip);

    expect(chip).toHaveFocus();

    await user.click(chip);
    await user.keyboard('{Enter}');

    const editor = screen.getByRole('group', { name: 'XZ plane' });
    expect(editor).toContainElement(document.activeElement as HTMLElement);
    expect(within(editor).getByRole('radio', { name: 'XZ' })).toHaveFocus();
  });

  it('should preview a cut while its chip is hovered or focused by keyboard', async () => {
    const actor = startSection();
    const user = userEvent.setup();
    renderRow(actor);
    const chip = screen.getByRole('button', { name: 'Plane XZ 0 mm' });
    const cutId = cutAt(actor, 0).id;

    await user.hover(chip);
    expect(actor.getSnapshot().context.hoveredSectionCutId).toBe(cutId);

    await user.unhover(chip);
    expect(actor.getSnapshot().context.hoveredSectionCutId).toBeUndefined();

    act(() => {
      chip.focus();
    });
    expect(actor.getSnapshot().context.hoveredSectionCutId).toBe(cutId);

    act(() => {
      chip.blur();
    });
    expect(actor.getSnapshot().context.hoveredSectionCutId).toBeUndefined();
  });

  it('should keep a hover set elsewhere when a chip loses focus', () => {
    const actor = startSection();
    actor.send({ type: 'addSectionCut', payload: { kind: 'plane', plane: 'xy' } });
    renderRow(actor);
    const chip = screen.getByRole('button', { name: 'Plane XZ 0 mm' });
    act(() => {
      chip.focus();
    });

    // A scene handle, or the pointer on another chip, lights the other cut while this chip holds focus.
    act(() => {
      actor.send({ type: 'hoverSectionCut', payload: cutAt(actor, 1).id });
    });
    act(() => {
      chip.blur();
    });

    expect(actor.getSnapshot().context.hoveredSectionCutId).toBe(cutAt(actor, 1).id);
  });

  it('should return focus to the open cut’s chip after Enter or Escape in a field', async () => {
    const actor = startSection();
    addRevolution(actor);
    actor.send({ type: 'selectSectionCut', payload: cutAt(actor, 0).id });
    const user = userEvent.setup();
    renderRow(actor);
    const chip = screen.getByRole('button', { name: 'Plane XZ 0 mm' });

    await user.click(screen.getByRole('spinbutton', { name: 'Offset in mm' }));
    await user.keyboard('12{Enter}');

    expect(screen.getByRole('button', { name: 'Plane XZ 12 mm', expanded: true })).toHaveFocus();

    await user.click(screen.getByRole('spinbutton', { name: 'Offset in mm' }));
    await user.keyboard('40{Escape}');

    expect(offsetOf(cutAt(actor, 0))).toBeCloseTo(0.012, 9);
    expect(chip).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Revolution cutaway 90° about X' }));
    await user.click(screen.getByRole('spinbutton', { name: 'Sweep in degrees' }));
    await user.keyboard('{Enter}');

    expect(screen.getByRole('button', { name: 'Revolution cutaway 90° about X', expanded: true })).toHaveFocus();
  });
});

describe('Plane editor', () => {
  it('should send offsets rounded to 1 mm, stepping one display unit, and nothing unchanged', async () => {
    const actor = startSection([0.01, 0.02, 0.03]);
    const send = recordSends(actor);
    const user = userEvent.setup();
    renderRow(actor);
    const offset = screen.getByRole('spinbutton', { name: 'Offset in mm' });

    await user.clear(offset);
    await user.keyboard('12.6{Enter}');

    expect(cutAt(actor, 0)).toMatchObject({ plane: 'xz' });
    expect(offsetOf(cutAt(actor, 0))).toBeCloseTo(0.013, 9);

    send.mockClear();
    await user.clear(offset);
    await user.keyboard('13.2{Enter}');

    expect(sentTypes(send)).not.toContain('updateSectionCut');

    await user.click(offset);
    await user.keyboard('{ArrowUp}');

    expect(offsetOf(cutAt(actor, 0))).toBeCloseTo(0.014, 9);
    expect(screen.getByRole('button', { name: 'Plane XZ 14 mm' })).toBeInTheDocument();
  });

  it.each([
    ['m', '0.025', 0.025],
    ['in', '1.5', 0.0381],
  ] as const)('should keep a typed offset in %s to 1 mm', async (unit, typed, metres) => {
    const actor = startSection();
    actor.send({ type: 'setGridUnit', payload: { unit } });
    const user = userEvent.setup();
    renderRow(actor);
    const offset = screen.getByRole('spinbutton', { name: `Offset in ${unit}` });

    await user.clear(offset);
    await user.keyboard(`${typed}{Enter}`);

    expect(offsetOf(cutAt(actor, 0))).toBeCloseTo(metres, 3);
  });

  it('should move a new plane back through the centre and flip it', async () => {
    const actor = startSection([0.01, 0.02, 0.03]);
    const user = userEvent.setup();
    renderRow(actor);

    await user.click(screen.getByRole('radio', { name: 'XY' }));

    expect(cutAt(actor, 0)).toMatchObject({ plane: 'xy', offset: 0.03 });
    expect(screen.getByRole('group', { name: 'XY plane' })).toBeInTheDocument();

    const first = cutAt(actor, 0);
    const isFlipped = first.kind === 'plane' && first.isFlipped;
    const flip = screen.getByRole('button', { name: 'Flip', pressed: isFlipped });
    await user.click(flip);

    expect(cutAt(actor, 0)).toMatchObject({ isFlipped: !isFlipped });
    expect(flip).toHaveAttribute('aria-pressed', String(!isFlipped));
  });

  it('should flip a cut moved to another plane so it removes the side facing the camera', async () => {
    // From the camera: −Y and +Z. An XZ plane faces it from its −Y side, an XY plane from its +Z side.
    const viewDirection: SectionVector = [0, -0.6, 0.8];
    const actor = startGraphics();
    actor.send({ type: 'setSectionViewActive', payload: true, viewDirection });
    expect(cutAt(actor, 0)).toMatchObject({ plane: 'xz', isFlipped: true });
    const user = userEvent.setup();
    renderRow(actor, undefined, cameraSeed(viewDirection));

    await user.click(screen.getByRole('radio', { name: 'XY' }));

    expect(cutAt(actor, 0)).toMatchObject({ plane: 'xy', isFlipped: false });

    await user.click(screen.getByRole('radio', { name: 'XZ' }));

    expect(cutAt(actor, 0)).toMatchObject({ plane: 'xz', isFlipped: true });
  });

  it('should stop a typed offset at the ends of the range the field advertises', async () => {
    const actor = startSection();
    const user = userEvent.setup();
    renderRow(actor);
    const offset = screen.getByRole('spinbutton', { name: 'Offset in mm' });
    expect(offset).toHaveAttribute('aria-valuemin', '-200');
    expect(offset).toHaveAttribute('aria-valuemax', '200');

    await user.clear(offset);
    await user.keyboard('500{Enter}');

    expect(offsetOf(cutAt(actor, 0))).toBeCloseTo(0.2, 9);
    expect(offset).toHaveAttribute('aria-valuenow', '200');

    await user.click(offset);
    await user.keyboard('{ArrowUp}');

    expect(offsetOf(cutAt(actor, 0))).toBeCloseTo(0.2, 9);

    await user.keyboard('{ArrowDown}');

    expect(offsetOf(cutAt(actor, 0))).toBeCloseTo(0.199, 9);
  });

  it('should advertise no range before the bounds are known, and step one display unit with the arrows', async () => {
    const actor = startSection();
    actor.send({ type: 'sceneRadiusUpdated', radius: 0, centerMeters: [0, 0, 0] });
    const user = userEvent.setup();
    renderRow(actor);
    const offset = screen.getByRole('spinbutton', { name: 'Offset in mm' });
    expect(offset).not.toHaveAttribute('aria-valuemin');
    expect(offset).not.toHaveAttribute('aria-valuemax');

    await user.click(offset);
    await user.keyboard('{ArrowUp}{ArrowUp}');

    expect(offsetOf(cutAt(actor, 0))).toBeCloseTo(0.002, 9);

    await user.keyboard('{ArrowDown}');

    expect(offsetOf(cutAt(actor, 0))).toBeCloseTo(0.001, 9);

    await user.clear(offset);
    await user.keyboard('500{Enter}');

    expect(offsetOf(cutAt(actor, 0))).toBeCloseTo(0.5, 9);
  });

  it('should ignore a press on the plane already chosen', async () => {
    const actor = startSection();
    const send = recordSends(actor);
    const user = userEvent.setup();
    renderRow(actor);

    await user.click(screen.getByRole('radio', { name: 'XZ' }));

    expect(sentTypes(send)).not.toContain('updateSectionCut');
  });
});

describe('Revolution editor', () => {
  it('should step the sweep by 1°, and 15° with Shift, within 5–355°', async () => {
    const actor = startSection();
    const cut = addRevolution(actor);
    const user = userEvent.setup();
    renderRow(actor);
    const sweep = screen.getByRole('spinbutton', { name: 'Sweep in degrees' });

    await user.click(sweep);
    await user.keyboard('{ArrowUp}');
    expect(cutAt(actor, 1)).toMatchObject({ sweep: 91 });

    await user.keyboard('{Shift>}{ArrowUp}{/Shift}');
    expect(cutAt(actor, 1)).toMatchObject({ sweep: 106 });

    act(() => {
      actor.send({ type: 'updateSectionCut', payload: { id: cut.id, patch: { sweep: 350 } } });
    });
    await user.keyboard('{Shift>}{ArrowUp}{/Shift}');
    expect(cutAt(actor, 1)).toMatchObject({ sweep: 355 });

    await user.clear(sweep);
    await user.keyboard('47.6{Enter}');
    expect(cutAt(actor, 1)).toMatchObject({ sweep: 48 });
  });

  it('should wrap the start angle around the circle with the arrows and stop at its ends when typed', async () => {
    const actor = startSection();
    const cut = addRevolution(actor);
    act(() => {
      actor.send({ type: 'updateSectionCut', payload: { id: cut.id, patch: { start: 0 } } });
    });
    const user = userEvent.setup();
    renderRow(actor);
    const start = screen.getByRole('spinbutton', { name: 'From, start angle in degrees' });

    await user.click(start);
    await user.keyboard('{ArrowDown}');
    expect(cutAt(actor, 1)).toMatchObject({ start: 359 });

    await user.keyboard('{Shift>}{ArrowDown}{/Shift}');
    expect(cutAt(actor, 1)).toMatchObject({ start: 344 });

    act(() => {
      actor.send({ type: 'updateSectionCut', payload: { id: cut.id, patch: { start: 350 } } });
    });
    await user.keyboard('{Shift>}{ArrowUp}{/Shift}');
    expect(cutAt(actor, 1)).toMatchObject({ start: 5 });

    await user.clear(start);
    await user.keyboard('400{Enter}');
    expect(cutAt(actor, 1)).toMatchObject({ start: 359 });
  });

  it('should turn the cutaway about another axis', async () => {
    const actor = startSection();
    addRevolution(actor);
    const user = userEvent.setup();
    renderRow(actor);

    await user.click(screen.getByRole('radio', { name: 'Y axis' }));

    expect(cutAt(actor, 1)).toMatchObject({ kind: 'revolution', axis: 'y' });
    expect(screen.getByRole('button', { name: 'Revolution cutaway 90° about Y' })).toBeInTheDocument();
  });
});

describe('Section row renders', () => {
  it('should re-render only the moved cut’s chip and the offset field for a drag step', async () => {
    const actor = startSection();
    actor.send({ type: 'addSectionCut', payload: { kind: 'plane', plane: 'xy' } });
    const moved = cutAt(actor, 0);
    act(() => {
      actor.send({ type: 'selectSectionCut', payload: moved.id });
    });
    const commits = { count: 0 };
    renderRow(actor, commits);
    await act(async () => undefined);
    renders.length = 0;
    commits.count = 0;

    act(() => {
      actor.send({ type: 'updateSectionCut', payload: { id: moved.id, patch: { offset: 0.005 } } });
    });

    expect(commits.count).toBe(1);
    expect(renders.toSorted()).toEqual(['button:Remove plane XZ 5 mm', 'field:Offset in mm']);
  });

  it('should not re-render for an update that changes nothing', async () => {
    const actor = startSection();
    const commits = { count: 0 };
    renderRow(actor, commits);
    await act(async () => undefined);
    renders.length = 0;
    commits.count = 0;

    act(() => {
      actor.send({ type: 'updateSectionCut', payload: { id: cutAt(actor, 0).id, patch: { plane: 'xz' } } });
      actor.send({ type: 'setGridVisibility', payload: false });
    });

    expect(commits.count).toBe(0);
    expect(renders).toEqual([]);
  });
});
