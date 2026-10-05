import { createActor, createAsyncLogic } from 'xstate';
import type { SnapshotFrom } from 'xstate';
import { describe, expect, it } from 'vitest';
import { maxSectionCuts } from '#components/geometry/graphics/section-cuts.js';
import { contentDigest } from '@taucad/cache-core';
import { createEmptyGlb } from '@taucad/geometry-core';
import type { PaneRenderingProvenance, GraphicsInput } from '#machines/graphics.machine.js';
import { graphicsMachine } from '#machines/graphics.machine.js';

const createGraphicsActor = (input: GraphicsInput) =>
  createActor(graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }), {
    input,
  });

/** An active cut on the XZ plane through a geometry centred at [1, 2, 3] m, recording every published snapshot. */
const startXzCut = () => {
  const actor = createGraphicsActor({});
  actor.start();
  actor.send({ type: 'sceneRadiusUpdated', radius: 0.1, centerMeters: [1, 2, 3] });
  actor.send({ type: 'setSectionViewActive', payload: true });
  const published: Array<SnapshotFrom<typeof graphicsMachine>> = [];
  const subscription = actor.subscribe((snapshot) => {
    published.push(snapshot);
  });
  return { actor, published, subscription };
};

describe('graphics pane rendering ownership', () => {
  it('should bind only the matching pane record and clear it on generic, assembly and empty replacements', () => {
    const actor = createGraphicsActor({});
    actor.start();
    try {
      const sourceFile = 'main.ts';
      const artifact: NonNullable<ReturnType<typeof actor.getSnapshot>['context']['artifact']> = {
        mimeType: 'model/gltf-binary',
        content: createEmptyGlb(),
      };
      const first: PaneRenderingProvenance = {
        documentId: 'document',
        evaluationId: 'evaluation',
        requestId: 'pane-first',
        hash: 'same-output',
        sourceRevision: {
          entry: sourceFile,
          files: {
            [sourceFile]: contentDigest({ value: `sha256:${'a'.repeat(64)}`, name: 'pane source' }),
          },
        },
        isCurrent: () => true,
      };
      actor.send({ type: 'updateArtifact', artifact, hash: first.hash, sourceFile, paneRendering: first });
      expect(actor.getSnapshot().context.paneRendering).toBe(first);
      const second = { ...first, requestId: 'pane-second' };
      actor.send({ type: 'updateArtifact', artifact, hash: second.hash, sourceFile, paneRendering: second });
      expect(actor.getSnapshot().context.paneRendering).toBe(second);
      expect(actor.getSnapshot().context.artifactKey).toBe(first.hash);
      actor.send({ type: 'updateArtifact', artifact, hash: second.hash, sourceFile });
      expect(actor.getSnapshot().context.paneRendering).toBeUndefined();
      actor.send({ type: 'updateArtifact', artifact, hash: 'foreign-output', sourceFile, paneRendering: second });
      expect(actor.getSnapshot().context.paneRendering).toBeUndefined();
      actor.send({
        type: 'updateArtifact',
        artifact,
        hash: second.hash,
        sourceFile: 'foreign.ts',
        paneRendering: second,
      });
      expect(actor.getSnapshot().context.paneRendering).toBeUndefined();
      actor.send({ type: 'updateArtifact', artifact, hash: second.hash, sourceFile, paneRendering: second });
      actor.send({ type: 'updateAssembly', key: 'assembly', units: { length: 'mm' }, sourceFile });
      expect(actor.getSnapshot().context.paneRendering).toBeUndefined();
      actor.send({ type: 'updateArtifact', artifact, hash: second.hash, sourceFile, paneRendering: second });
      actor.send({ type: 'clearArtifact' });
      expect(actor.getSnapshot().context.paneRendering).toBeUndefined();
    } finally {
      actor.stop();
    }
  });
});

describe('graphics machine durable section view', () => {
  it('should restore seeded cuts under new ids with the section on', () => {
    const actor = createGraphicsActor({
      sectionView: {
        active: true,
        cuts: [
          { kind: 'plane', plane: 'xz', offset: 2, isFlipped: true },
          { kind: 'revolution', axis: 'z', origin: [1, 2, 3], start: 30, sweep: 200 },
        ],
      },
    });
    actor.start();
    try {
      const snapshot = actor.getSnapshot();
      expect(snapshot.matches({ operational: { section: 'on' } })).toBe(true);
      expect(snapshot.context.isSectionViewActive).toBe(true);
      expect(snapshot.context.sectionCuts).toEqual([
        { id: expect.stringMatching(/^cut_/u) as unknown, kind: 'plane', plane: 'xz', offset: 2, isFlipped: true },
        {
          id: expect.stringMatching(/^cut_/u) as unknown,
          kind: 'revolution',
          axis: 'z',
          origin: [1, 2, 3],
          start: 30,
          sweep: 200,
        },
      ]);
      expect(new Set(snapshot.context.sectionCuts.map((cut) => cut.id)).size).toBe(2);
      expect(snapshot.context.selectedSectionCutId).toBeUndefined();
    } finally {
      actor.stop();
    }
  });

  it.each([
    ['an inactive seed', { active: false, cuts: [{ kind: 'plane', plane: 'xy', offset: 0, isFlipped: false }] }, 1],
    ['a seed with no cuts', { active: true, cuts: [] }, 0],
  ] as const)('should keep the section off for %s', (_label, sectionView, cutCount) => {
    const actor = createGraphicsActor({ sectionView: { active: sectionView.active, cuts: [...sectionView.cuts] } });
    actor.start();
    try {
      expect(actor.getSnapshot().matches({ operational: { section: 'off' } })).toBe(true);
      expect(actor.getSnapshot().context.isSectionViewActive).toBe(false);
      expect(actor.getSnapshot().context.sectionCuts).toHaveLength(cutCount);
    } finally {
      actor.stop();
    }
  });

  it('should start with no cuts and both tools off when a record carries no section view', () => {
    const actor = createGraphicsActor({});
    actor.start();
    try {
      const snapshot = actor.getSnapshot();
      expect(snapshot.matches({ operational: { section: 'off', measure: 'off' } })).toBe(true);
      expect(snapshot.context.sectionCuts).toEqual([]);
      expect(snapshot.context.isSectionViewActive).toBe(false);
      expect(snapshot.context.isMeasureActive).toBe(false);
    } finally {
      actor.stop();
    }
  });
});

describe('graphics machine section and measure together', () => {
  it('should run Section and Measure together and turn each off on its own', () => {
    const actor = createGraphicsActor({});
    actor.start();
    try {
      actor.send({ type: 'setSectionViewActive', payload: true });
      actor.send({ type: 'setMeasureActive', payload: true });
      expect(actor.getSnapshot().matches({ operational: { section: 'on', measure: 'on' } })).toBe(true);
      expect(actor.getSnapshot().context).toMatchObject({ isSectionViewActive: true, isMeasureActive: true });

      actor.send({ type: 'setMeasureActive', payload: false });
      expect(actor.getSnapshot().matches({ operational: { section: 'on', measure: 'off' } })).toBe(true);
      expect(actor.getSnapshot().context).toMatchObject({ isSectionViewActive: true, isMeasureActive: false });

      actor.send({ type: 'setMeasureActive', payload: true });
      actor.send({ type: 'setSectionViewActive', payload: false });
      expect(actor.getSnapshot().matches({ operational: { section: 'off', measure: 'on' } })).toBe(true);
      expect(actor.getSnapshot().context).toMatchObject({ isSectionViewActive: false, isMeasureActive: true });
    } finally {
      actor.stop();
    }
  });

  it('should keep a half-placed measurement while the section turns on, adds cuts and turns off', () => {
    const actor = createGraphicsActor({});
    actor.start();
    try {
      actor.send({ type: 'setMeasureActive', payload: true });
      actor.send({ type: 'startMeasurement', payload: [1, 2, 3] });

      actor.send({ type: 'setSectionViewActive', payload: true });
      actor.send({ type: 'addSectionCut', payload: { kind: 'revolution' } });
      actor.send({ type: 'setSectionViewActive', payload: false });

      expect(actor.getSnapshot().matches({ operational: { measure: { on: 'selected' } } })).toBe(true);
      expect(actor.getSnapshot().context.currentMeasurementStart).toEqual([1, 2, 3]);
      expect(actor.getSnapshot().context.viewerHoverSuppressionReasons).toEqual(['measureTool']);
    } finally {
      actor.stop();
    }
  });
});

describe('graphics machine section cuts', () => {
  /** A graphics actor with geometry centred at [1, 2, 3] m. */
  const startCentred = (input: GraphicsInput = {}) => {
    const actor = createGraphicsActor(input);
    actor.start();
    actor.send({ type: 'sceneRadiusUpdated', radius: 0.1, centerMeters: [1, 2, 3] });
    return actor;
  };

  it('should add the first unused plane through the geometry centre, select it and turn the section on', () => {
    const actor = startCentred();
    try {
      actor.send({ type: 'addSectionCut', payload: { kind: 'plane' } });
      const [first] = actor.getSnapshot().context.sectionCuts;
      expect(first).toMatchObject({ kind: 'plane', plane: 'xz', offset: 2, isFlipped: false });
      expect(actor.getSnapshot().context.selectedSectionCutId).toBe(first?.id);
      expect(actor.getSnapshot().matches({ operational: { section: 'on' } })).toBe(true);
      expect(actor.getSnapshot().context.isSectionViewActive).toBe(true);

      actor.send({ type: 'addSectionCut', payload: { kind: 'plane', viewDirection: [-1, 0.2, 0.2] } });
      const [, second] = actor.getSnapshot().context.sectionCuts;
      // The camera is on the −X side, so the new plane removes −X to face it.
      expect(second).toMatchObject({ kind: 'plane', plane: 'yz', offset: 1, isFlipped: true });
      expect(actor.getSnapshot().context.selectedSectionCutId).toBe(second?.id);
    } finally {
      actor.stop();
    }
  });

  it('should add a cutaway about the up axis through the geometry centre, opening toward the camera', () => {
    const actor = startCentred({ upDirection: 'y' });
    try {
      actor.send({ type: 'addSectionCut', payload: { kind: 'revolution', viewDirection: [0, 0.5, 1] } });

      expect(actor.getSnapshot().context.sectionCuts).toEqual([
        {
          id: expect.stringMatching(/^cut_/u) as unknown,
          kind: 'revolution',
          axis: 'y',
          origin: [1, 2, 3],
          start: 315,
          sweep: 90,
        },
      ]);
    } finally {
      actor.stop();
    }
  });

  it('should add the default plane when the section turns on with no cuts, and keep the cuts but not the hover when it turns off', () => {
    const actor = startCentred();
    try {
      actor.send({ type: 'setSectionViewActive', payload: true, viewDirection: [0.3, -1, 0.5] });
      const [cut] = actor.getSnapshot().context.sectionCuts;
      expect(actor.getSnapshot().context.sectionCuts).toHaveLength(1);
      expect(cut).toMatchObject({ kind: 'plane', plane: 'xz', offset: 2, isFlipped: true });
      expect(actor.getSnapshot().context.selectedSectionCutId).toBe(cut?.id);
      actor.send({ type: 'hoverSectionCut', payload: cut!.id });

      actor.send({ type: 'setSectionViewActive', payload: false });
      expect(actor.getSnapshot().matches({ operational: { section: 'off' } })).toBe(true);
      expect(actor.getSnapshot().context.sectionCuts).toEqual([cut]);
      expect(actor.getSnapshot().context.selectedSectionCutId).toBe(cut?.id);
      expect(actor.getSnapshot().context.hoveredSectionCutId).toBeUndefined();

      actor.send({ type: 'setSectionViewActive', payload: true });
      expect(actor.getSnapshot().context.sectionCuts).toEqual([cut]);
    } finally {
      actor.stop();
    }
  });

  it('should refuse a cut past the fourth and keep the snapshot', () => {
    const actor = startCentred();
    try {
      for (let count = 0; count < maxSectionCuts; count++) {
        actor.send({ type: 'addSectionCut', payload: { kind: 'revolution' } });
      }
      const full = actor.getSnapshot();
      expect(full.context.sectionCuts).toHaveLength(4);

      actor.send({ type: 'addSectionCut', payload: { kind: 'plane' } });
      actor.send({ type: 'addSectionCut', payload: { kind: 'revolution' } });

      expect(actor.getSnapshot()).toBe(full);
    } finally {
      actor.stop();
    }
  });

  it('should update a cut by id and keep the snapshot for a patch that changes nothing', () => {
    const actor = startCentred();
    const published: Array<SnapshotFrom<typeof graphicsMachine>> = [];
    const subscription = actor.subscribe((snapshot) => {
      published.push(snapshot);
    });
    try {
      actor.send({ type: 'addSectionCut', payload: { kind: 'plane' } });
      actor.send({ type: 'addSectionCut', payload: { kind: 'revolution' } });
      const [plane, cutaway] = actor.getSnapshot().context.sectionCuts;

      actor.send({ type: 'updateSectionCut', payload: { id: plane!.id, patch: { offset: 2.5, isFlipped: true } } });
      const moved = actor.getSnapshot();
      expect(moved.context.sectionCuts).toEqual([{ ...plane, offset: 2.5, isFlipped: true }, cutaway]);
      expect(moved.context.sectionCuts[1]).toBe(cutaway);

      published.length = 0;
      actor.send({ type: 'updateSectionCut', payload: { id: plane!.id, patch: { offset: 2.5 } } });
      actor.send({ type: 'updateSectionCut', payload: { id: cutaway!.id, patch: { sweep: 90, start: 360 } } });
      actor.send({ type: 'updateSectionCut', payload: { id: 'cut_missing', patch: { offset: 1 } } });

      expect(actor.getSnapshot()).toBe(moved);
      expect(published.every((snapshot) => snapshot === moved)).toBe(true);
    } finally {
      subscription.unsubscribe();
      actor.stop();
    }
  });

  it('should remove a cut, clearing the selection and hover that name it', () => {
    const actor = startCentred();
    try {
      actor.send({ type: 'addSectionCut', payload: { kind: 'plane' } });
      actor.send({ type: 'addSectionCut', payload: { kind: 'plane' } });
      const [first, second] = actor.getSnapshot().context.sectionCuts;
      actor.send({ type: 'hoverSectionCut', payload: second!.id });
      actor.send({ type: 'selectSectionCut', payload: second!.id });

      actor.send({ type: 'removeSectionCut', payload: first!.id });
      expect(actor.getSnapshot().context).toMatchObject({
        sectionCuts: [second],
        selectedSectionCutId: second!.id,
        hoveredSectionCutId: second!.id,
      });

      const before = actor.getSnapshot();
      actor.send({ type: 'removeSectionCut', payload: first!.id });
      expect(actor.getSnapshot()).toBe(before);
    } finally {
      actor.stop();
    }
  });

  it('should turn the section off when its last cut is removed', () => {
    const actor = startCentred();
    try {
      actor.send({ type: 'addSectionCut', payload: { kind: 'plane' } });
      const [cut] = actor.getSnapshot().context.sectionCuts;
      actor.send({ type: 'hoverSectionCut', payload: cut!.id });

      actor.send({ type: 'removeSectionCut', payload: cut!.id });

      expect(actor.getSnapshot().matches({ operational: { section: 'off' } })).toBe(true);
      expect(actor.getSnapshot().context).toMatchObject({
        isSectionViewActive: false,
        sectionCuts: [],
        selectedSectionCutId: undefined,
        hoveredSectionCutId: undefined,
      });
    } finally {
      actor.stop();
    }
  });

  it.each([
    [
      'turned off',
      (actor: ReturnType<typeof startCentred>) => {
        actor.send({ type: 'setSectionViewActive', payload: false });
      },
    ],
    [
      'left with no cut',
      (actor: ReturnType<typeof startCentred>) => {
        actor.send({ type: 'removeSectionCut', payload: actor.getSnapshot().context.sectionCuts[0]!.id });
      },
    ],
  ] as const)('should forget the committed cuts and a refusal when the section is %s', (_label, turnOff) => {
    const actor = startCentred();
    try {
      actor.send({ type: 'addSectionCut', payload: { kind: 'plane' } });
      const { sectionCuts } = actor.getSnapshot().context;
      actor.send({ type: 'setSectionCertification', payload: { status: 'rejected', cuts: sectionCuts } });

      turnOff(actor);

      expect(actor.getSnapshot().matches({ operational: { section: 'off' } })).toBe(true);
      expect(actor.getSnapshot().context).toMatchObject({
        committedSectionCuts: [],
        sectionCertification: 'certified',
      });
    } finally {
      actor.stop();
    }
  });

  it('should select and hover cuts by id, ignoring unknown ids and repeats', () => {
    const actor = startCentred();
    try {
      actor.send({ type: 'addSectionCut', payload: { kind: 'plane' } });
      const [cut] = actor.getSnapshot().context.sectionCuts;

      actor.send({ type: 'selectSectionCut', payload: undefined });
      actor.send({ type: 'hoverSectionCut', payload: cut!.id });
      const hovered = actor.getSnapshot();
      expect(hovered.context).toMatchObject({ selectedSectionCutId: undefined, hoveredSectionCutId: cut!.id });

      actor.send({ type: 'hoverSectionCut', payload: cut!.id });
      actor.send({ type: 'selectSectionCut', payload: 'cut_missing' });
      actor.send({ type: 'hoverSectionCut', payload: 'cut_missing' });
      expect(actor.getSnapshot()).toBe(hovered);

      actor.send({ type: 'selectSectionCut', payload: cut!.id });
      actor.send({ type: 'hoverSectionCut', payload: undefined });
      expect(actor.getSnapshot().context).toMatchObject({
        selectedSectionCutId: cut!.id,
        hoveredSectionCutId: undefined,
      });
    } finally {
      actor.stop();
    }
  });
});

/* XState notifies observers after every event, so "no change" means the same snapshot object: `useSelector`
 * bails out on snapshot identity, so no subscriber re-renders or re-runs its selector. */
describe('graphics machine section view steps', () => {
  it('should mark a pointer gesture as moved once, however many steps it reports', () => {
    const { actor, published, subscription } = startXzCut();
    try {
      actor.send({ type: 'markModelPointerGestureMoved' });
      const marked = actor.getSnapshot();
      expect(marked.context.suppressNextModelPointerClick).toBe(true);

      published.length = 0;
      actor.send({ type: 'markModelPointerGestureMoved' });

      expect(actor.getSnapshot()).toBe(marked);
      expect(published.every((snapshot) => snapshot === marked)).toBe(true);
    } finally {
      subscription.unsubscribe();
      actor.stop();
    }
  });
});
