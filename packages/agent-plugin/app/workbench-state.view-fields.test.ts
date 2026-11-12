import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Workbench from '@taucad/workbench';
import { createActor, createAsyncLogic } from 'xstate';
import type { Actor } from 'xstate';
import { graphicsMachine } from '@taucad/viewer/machines/graphics.machine';
import type { TauViewerWorkbenchState } from '@taucad/mcp/viewer-protocol';
import { viewFieldPaths, viewRecordV1Defaults } from '@taucad/workbench';
import { newViewRecord } from '@taucad/workbench-panes/records/view-record';
import { createPageViewFields, liveViewSettings, seedViewer } from '#app/workbench-state.js';

/* A build whose Tau values differ from the format values: no axes and a field of view of 30. */
vi.mock('@taucad/workbench', async (importOriginal) => {
  const actual = await importOriginal<typeof Workbench>();
  return {
    ...actual,
    tauViewDefaults: Object.freeze({ ...actual.viewRecordV1Defaults, 'display.axes': false, fieldOfView: 30 }),
  };
});

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

const entryPath = 'src/model.ts';

/** The saved state for a view that sets the grid off and leaves every other leaf at its format value. */
const saved = (): TauViewerWorkbenchState => {
  const {
    version: _version,
    entryPath: _entryPath,
    name: _name,
    kernelViews: _kernelViews,
    selectedKernelView: _selected,
    ...view
  } = newViewRecord(entryPath);
  return { view: { ...view, display: { ...view.display, grid: false } } };
};

const fieldOfViewOf = (graphicsRef: Actor<typeof graphicsMachine>): number =>
  graphicsRef.getSnapshot().context.cameraRef.getSnapshot().context.view.requestedVerticalFieldOfView;

describe('page view fields', () => {
  it("renders the view's own leaves and Tau's value for every other, and reports none of them", () => {
    const graphicsRef = createGraphicsActor();
    const viewFields = createPageViewFields(graphicsRef);
    viewFields.seed(seedViewer(graphicsRef, entryPath, saved()) ?? {});

    const { context } = graphicsRef.getSnapshot();
    expect(context.enableGrid).toBe(false);
    expect(context.enableAxes).toBe(false);
    expect(fieldOfViewOf(graphicsRef)).toBe(30);
    expect(viewFields.sourceOf?.('display.grid')).toBe('view');
    expect(viewFields.sourceOf?.('display.axes')).toBe('tau');
    /* A camera move or a section change reports these two and no inheritable leaf. */
    expect(Object.keys(liveViewSettings(graphicsRef) ?? {})).toEqual(['section', 'measurements']);
    expect(viewFields.commanded()).toEqual({});
  });

  it('reports a set leaf with its value, and a reset leaf as the format value', () => {
    const graphicsRef = createGraphicsActor();
    const viewFields = createPageViewFields(graphicsRef);
    viewFields.seed(seedViewer(graphicsRef, entryPath, saved()) ?? {});

    void viewFields.set('display.lines', false);
    expect(graphicsRef.getSnapshot().context.enableLines).toBe(false);
    expect(viewFields.commanded()).toEqual({ 'display.lines': false });

    viewFields.reset('display.grid');
    viewFields.reset('fieldOfView');
    /* Reset shows Tau's value and reports the format value, so the record inherits Tau's value again. */
    expect(graphicsRef.getSnapshot().context.enableGrid).toBe(viewRecordV1Defaults['display.grid']);
    expect(fieldOfViewOf(graphicsRef)).toBe(30);
    expect(viewFields.commanded()).toEqual({
      'display.lines': false,
      'display.grid': viewRecordV1Defaults['display.grid'],
      fieldOfView: viewRecordV1Defaults.fieldOfView,
    });
    expect(viewFields.sourceOf?.('display.grid')).toBe('tau');
    expect(viewFields.sourceOf?.('display.lines')).toBe('view');
  });

  it('ignores a grid unit no view record holds, and starts a newly seeded entry with no commands', () => {
    const graphicsRef = createGraphicsActor();
    const viewFields = createPageViewFields(graphicsRef);
    viewFields.seed(seedViewer(graphicsRef, entryPath, saved()) ?? {});

    void viewFields.set('grid.unit', 'furlong');
    expect(viewFields.commanded()).toEqual({});
    void viewFields.set('grid.unit', 'in');
    expect(graphicsRef.getSnapshot().context.displayUnits.length.symbol).toBe('in');
    expect(viewFields.commanded()).toEqual({ 'grid.unit': 'in' });

    viewFields.seed(seedViewer(graphicsRef, 'src/other.ts', undefined) ?? {});
    expect(viewFields.commanded()).toEqual({});
    expect(viewFieldPaths.map((leaf) => viewFields.sourceOf?.(leaf))).toEqual(viewFieldPaths.map(() => 'tau'));
  });
});
