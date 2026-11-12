import { afterEach, describe, expect, it } from 'vitest';
import { createActor, createAsyncLogic } from 'xstate';
import type { Actor } from 'xstate';
import { graphicsMachine } from '#machines/graphics.machine.js';
import type {
  GraphicsEvent,
  ViewerShortcut,
  ViewerShortcutCamera,
  ViewerShortcutOutcome,
} from '#machines/graphics.machine.js';

type GraphicsActor = Actor<typeof graphicsMachine>;
type ShortcutPress = Extract<GraphicsEvent, { type: 'viewerShortcutPressed' }>;

const actors: GraphicsActor[] = [];

afterEach(() => {
  for (const actor of actors.splice(0)) {
    actor.stop();
  }
});

const perspective: ViewerShortcutCamera = {
  direction: [0, -1, 0],
  requestedVerticalFieldOfView: 45,
  lastPerspectiveVerticalFieldOfView: 45,
};
const orthographic: ViewerShortcutCamera = { ...perspective, requestedVerticalFieldOfView: 0 };

const startGraphics = (radius = 0.1): GraphicsActor => {
  const actor = createActor(
    graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
    { input: {} },
  ).start();
  actors.push(actor);
  actor.send({ type: 'sceneRadiusUpdated', radius, centerMeters: [0, 0, 0] });
  return actor;
};

let pressCount = 0;
const pressOf = (
  shortcut: ViewerShortcut,
  options: Readonly<{ camera?: ViewerShortcutCamera; cutId?: string }> = {},
): ShortcutPress => {
  pressCount += 1;
  return {
    type: 'viewerShortcutPressed',
    shortcut,
    pressId: `bar:${pressCount}`,
    camera: options.camera ?? perspective,
    ...(options.cutId === undefined ? {} : { cutId: options.cutId }),
  };
};

/** Sends `press` and returns the outcome graphics emitted for it, if any. */
const press = (actor: GraphicsActor, event: ShortcutPress): ViewerShortcutOutcome | undefined => {
  let outcome: ViewerShortcutOutcome | undefined;
  const subscription = actor.on('viewerShortcutApplied', (applied) => {
    if (applied.pressId === event.pressId) {
      outcome = applied.outcome;
    }
  });
  actor.send(event);
  subscription.unsubscribe();
  return outcome;
};

describe('graphics viewer shortcuts', () => {
  it('should fit the view through `fitView`, and only with a model or a 2D drawing', () => {
    const actor = startGraphics();
    const fits: string[] = [];
    actor.on('viewFitRequested', () => {
      fits.push('fit');
    });

    expect(press(actor, pressOf('fitView'))).toBe('fitted');
    expect(fits).toHaveLength(1);

    const empty = startGraphics(0);
    expect(press(empty, pressOf('fitView'))).toBe('noModelToFit');
  });

  it('should toggle Section, cutting away the side the camera faces', () => {
    const actor = startGraphics();

    expect(press(actor, pressOf('section'))).toBe('sectionOn');
    expect(actor.getSnapshot().context).toMatchObject({ isSectionViewActive: true, sectionCuts: [{ plane: 'xz' }] });

    expect(press(actor, pressOf('section'))).toBe('sectionOff');
    expect(actor.getSnapshot().context.isSectionViewActive).toBe(false);

    expect(press(startGraphics(0), pressOf('section'))).toBe('sectionNeedsModel');
  });

  it('should toggle Measure, and need a model to start it', () => {
    const actor = startGraphics();

    expect(press(actor, pressOf('measure'))).toBe('measureOn');
    expect(actor.getSnapshot().context.isMeasureActive).toBe(true);
    expect(press(actor, pressOf('measure'))).toBe('measureOff');
    expect(actor.getSnapshot().context.isMeasureActive).toBe(false);

    expect(press(startGraphics(0), pressOf('measure'))).toBe('measureNeedsModel');
  });

  it('should toggle the grid', () => {
    const actor = startGraphics();
    const isShown = actor.getSnapshot().context.enableGrid;

    expect(press(actor, pressOf('grid'))).toBe(isShown ? 'gridHidden' : 'gridShown');
    expect(actor.getSnapshot().context.enableGrid).toBe(!isShown);
  });

  it('should switch the camera to orthographic, and back to the last perspective angle', () => {
    const actor = startGraphics();
    const camera = () => actor.getSnapshot().context.cameraRef.getSnapshot().context.view;

    expect(press(actor, pressOf('projection', { camera: perspective }))).toBe('orthographic');
    expect(camera().requestedVerticalFieldOfView).toBe(0);

    expect(press(actor, pressOf('projection', { camera: orthographic }))).toBe('perspective');
    expect(camera().requestedVerticalFieldOfView).toBe(45);
  });

  it('should step back with Escape, and leave it unhandled once nothing is on', () => {
    const actor = startGraphics();
    actor.send({ type: 'setSectionViewActive', payload: true });
    actor.send({ type: 'setMeasureActive', payload: true });
    actor.send({ type: 'startMeasurement', payload: [0, 0, 0] });

    expect(press(actor, pressOf('escape'))).toBe('pointCancelled');
    expect(press(actor, pressOf('escape'))).toBe('measureOff');
    expect(press(actor, pressOf('escape'))).toBe('sectionOff');

    const idle = pressOf('escape');
    expect(actor.getSnapshot().can(idle)).toBe(false);
    expect(press(actor, idle)).toBeUndefined();
  });

  it('should remove the focused chip cut before the selected one, and nothing without a known cut', () => {
    const actor = startGraphics();
    actor.send({ type: 'setSectionViewActive', payload: true });
    actor.send({ type: 'addSectionCut', payload: { kind: 'plane', plane: 'xy' } });
    const [first, second] = actor.getSnapshot().context.sectionCuts;

    expect(press(actor, pressOf('removeCut', { cutId: first!.id }))).toBe('cutRemoved');
    expect(actor.getSnapshot().context.sectionCuts).toEqual([second]);

    actor.send({ type: 'selectSectionCut', payload: undefined });
    expect(actor.getSnapshot().can(pressOf('removeCut'))).toBe(false);
    expect(actor.getSnapshot().can(pressOf('removeCut', { cutId: 'missing' }))).toBe(false);

    actor.send({ type: 'selectSectionCut', payload: second!.id });
    expect(press(actor, pressOf('removeCut'))).toBe('cutRemoved');
    expect(actor.getSnapshot().context).toMatchObject({ sectionCuts: [], isSectionViewActive: false });
  });

  it('should leave Section, Measure and the projection unhandled for 2D geometry', () => {
    const actor = startGraphics();
    actor.send({
      type: 'updateArtifact',
      artifact: { mimeType: 'image/svg+xml', content: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' },
      hash: 'svg',
    });

    for (const shortcut of ['section', 'measure', 'projection'] as const) {
      expect(actor.getSnapshot().can(pressOf(shortcut))).toBe(false);
    }
    expect(actor.getSnapshot().can(pressOf('fitView'))).toBe(true);
    expect(actor.getSnapshot().can(pressOf('grid'))).toBe(true);
  });
});
