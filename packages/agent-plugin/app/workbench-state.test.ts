import { afterEach, describe, expect, it } from 'vitest';
import { createActor, createAsyncLogic } from 'xstate';
import type { Actor } from 'xstate';
import { graphicsMachine } from '@taucad/viewer/machines/graphics.machine';
import type { TauViewerWorkbenchState } from '@taucad/mcp/viewer-protocol';
import type { WorkbenchView } from '@taucad/workbench';
import { newViewRecord } from '@taucad/workbench-panes/records/view-record';
import { liveViewSettings, seedViewer } from '#app/workbench-state.js';

const actors: Array<Actor<typeof graphicsMachine>> = [];

const createGraphicsActor = (): Actor<typeof graphicsMachine> => {
  const actor = createActor(
    graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
    { input: {} },
  );
  actor.start();
  actors.push(actor);
  return actor;
};

afterEach(() => {
  for (const actor of actors.splice(0)) {
    actor.stop();
  }
});

describe('liveViewSettings', () => {
  it('reports nothing before the page seeds the viewer for an entry', () => {
    expect(liveViewSettings(createGraphicsActor())).toBeUndefined();
  });

  /* An SVG model has a view camera but no three.js canvas, so no controls adapter ever attaches. */
  it('reports the settings of a seeded viewer that has no canvas', () => {
    const graphicsRef = createGraphicsActor();
    seedViewer(graphicsRef, 'drawing.svg', undefined);

    expect(graphicsRef.getSnapshot().context.controlsAdapter).toBeUndefined();
    expect(liveViewSettings(graphicsRef)).toBeDefined();
  });
});

describe('seedViewer', () => {
  const entryPath = 'src/model.ts';

  /** The saved state the server returns for a view whose camera is `camera`. */
  const savedWith = (camera: WorkbenchView['camera']): TauViewerWorkbenchState => {
    const {
      version: _version,
      entryPath: _entryPath,
      name: _name,
      kernelViews: _kernelViews,
      selectedKernelView: _selected,
      ...view
    } = {
      ...newViewRecord(entryPath),
      camera,
    };
    return { view };
  };

  /** The entry's first frame: the model of radius 1 is measured on screen. */
  const presentModel = (graphicsRef: Actor<typeof graphicsMachine>): void => {
    graphicsRef.send({
      type: 'geometryBoundsMeasured',
      key: 'model',
      bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
      radius: 1,
    });
  };

  const cameraOf = (graphicsRef: Actor<typeof graphicsMachine>) =>
    graphicsRef.getSnapshot().context.cameraRef.getSnapshot().context;

  it("applies a saved pose over the entry's first frame, and leaves a re-seeded entry alone", () => {
    const graphicsRef = createGraphicsActor();
    const { frameId } = cameraOf(graphicsRef).view;
    const pose: Extract<WorkbenchView['camera'], { kind: 'pose' }> = {
      kind: 'pose',
      frameId,
      target: [0.2, 0, 0],
      direction: [1, 0, 0],
      up: [0, 0, 1],
      verticalSpan: 3,
      perspectiveZoom: 1,
    };

    seedViewer(graphicsRef, entryPath, savedWith(pose));
    presentModel(graphicsRef);

    expect(cameraOf(graphicsRef).lastChange.source).toBe('persisted');
    expect(cameraOf(graphicsRef).view).toMatchObject({ target: pose.target, direction: pose.direction });

    const sent: string[] = [];
    const subscription = graphicsRef.subscribe(() => {
      sent.push('changed');
    });
    seedViewer(graphicsRef, entryPath, savedWith({ kind: 'preset', preset: 'front' }));
    subscription.unsubscribe();
    expect(sent).toEqual([]);
    expect(cameraOf(graphicsRef).view.direction).toEqual(pose.direction);
  });

  it("turns the camera to a saved preset side over the entry's first frame", () => {
    const graphicsRef = createGraphicsActor();

    seedViewer(graphicsRef, entryPath, savedWith({ kind: 'preset', preset: 'right' }));
    const framed = cameraOf(graphicsRef).view.direction;
    presentModel(graphicsRef);

    expect(cameraOf(graphicsRef).lastChange.source).toBe('persisted');
    expect(cameraOf(graphicsRef).view.direction).not.toEqual(framed);
  });
});
