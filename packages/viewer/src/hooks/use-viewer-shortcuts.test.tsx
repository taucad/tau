// @vitest-environment jsdom
import { StrictMode, useRef } from 'react';
import { act, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActor, createAsyncLogic } from 'xstate';
import type { Actor } from 'xstate';
import { GraphicsProvider, useCameraSelector } from '#hooks/use-graphics.jsx';
import { KeyboardProvider } from '@taucad/ui/components/keyboard';
import { useViewerShortcuts } from '#hooks/use-viewer-shortcuts.js';
import { ViewerViewFieldsProvider } from '#cad/viewer-view-fields.jsx';
import type { ViewerViewFields } from '#cad/viewer-view-fields.jsx';
import { graphicsMachine } from '#machines/graphics.machine.js';

type GraphicsActor = Actor<typeof graphicsMachine>;

const actors: GraphicsActor[] = [];

afterEach(() => {
  for (const actor of actors.splice(0)) {
    actor.stop();
  }
  announced.clear();
  chips.clear();
  vi.restoreAllMocks();
});

const startGraphics = (): GraphicsActor => {
  const actor = createActor(
    graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
    { input: {} },
  ).start();
  actors.push(actor);
  actor.send({ type: 'sceneRadiusUpdated', radius: 0.1, centerMeters: [0, 0, 0] });
  actor.send({
    type: 'geometryBoundsMeasured',
    key: 'model',
    bounds: { min: [-0.1, -0.1, -0.1], max: [0.1, 0.1, 0.1] },
    radius: 0.1,
  });
  return actor;
};

/**
 * Records what the shortcuts send, still delivering it; the actor's `send` is a prototype getter. The provider's own
 * viewer environment report is delivered but not recorded.
 */
const recordSends = (actor: GraphicsActor): ReturnType<typeof vi.fn<GraphicsActor['send']>> => {
  const deliver = actor.send;
  const send = vi.fn<GraphicsActor['send']>(deliver);
  const value: GraphicsActor['send'] = (event) => {
    if (event.type === 'viewerEnvironmentChanged') {
      deliver(event);
      return;
    }
    send(event);
  };
  Object.defineProperty(actor, 'send', { value, configurable: true });
  return send;
};

function FieldOfView({ label }: Readonly<{ label: string }>): React.JSX.Element {
  const fieldOfView = useCameraSelector((state) => state.context.view.requestedVerticalFieldOfView);
  return <output aria-label={`${label} field of view`}>{fieldOfView}</output>;
}

/** What each viewer's bar announced, by viewer label. */
const announced = new Map<string, string[]>();
const announcementsOf = (label: string): string[] => announced.get(label) ?? [];
/** The cut chips each viewer's bar shows, by viewer label, as the section row renders them. */
const chips = new Map<string, readonly string[]>();

/** A viewer frame with a bar holding a button and a text field, as the bar mounts the shortcuts. */
function Viewer({ label }: Readonly<{ label: string }>): React.JSX.Element {
  const barRef = useRef<HTMLDivElement>(null);
  useViewerShortcuts(barRef, (phrase) => {
    announced.set(label, [...announcementsOf(label), phrase]);
  });
  return (
    <section data-viewer-frame aria-label={label}>
      <FieldOfView label={label} />
      <div ref={barRef}>
        <button type='button'>{`${label} control`}</button>
        <input aria-label={`${label} field`} />
        {(chips.get(label) ?? []).map((cutId) => (
          <div key={cutId} data-section-chip={cutId}>
            <button type='button'>{`${label} chip ${cutId}`}</button>
          </div>
        ))}
      </div>
    </section>
  );
}

const renderViewers = (...viewers: ReadonlyArray<readonly [string, GraphicsActor, ViewerViewFields?]>): void => {
  render(
    <KeyboardProvider>
      {viewers.map(([label, actor, viewFields]) => (
        <GraphicsProvider key={label} graphicsRef={actor}>
          <ViewerViewFieldsProvider value={viewFields}>
            <Viewer label={label} />
          </ViewerViewFieldsProvider>
        </GraphicsProvider>
      ))}
      <div role='menu'>
        <button type='button' role='menuitem'>
          Menu item
        </button>
      </div>
      <div role='tree' aria-label='Files'>
        <div role='treeitem' tabIndex={0} aria-selected='false'>
          part.ts
        </div>
      </div>
      <div role='dialog' aria-label='Dialog'>
        <button type='button'>Dialog button</button>
      </div>
      <div role='listbox' aria-label='Units'>
        <div role='option' tabIndex={0} aria-selected='true'>
          Millimetre
        </div>
      </div>
      <div role='grid' aria-label='Parameters'>
        <div role='row'>
          <div role='gridcell' tabIndex={0}>
            Width
          </div>
        </div>
      </div>
      {/* A Radix popover, tooltip or select places its content in this wrapper. */}
      <div data-radix-popper-content-wrapper=''>
        <button type='button'>Popover button</button>
      </div>
    </KeyboardProvider>,
  );
};

/** Names the viewer under the pointer, which jsdom's `:hover` never matches. */
const hoverViewer = (label: string | undefined): void => {
  vi.spyOn(document, 'querySelector').mockImplementation((selectors: string) =>
    selectors === '[data-viewer-frame]:hover'
      ? label === undefined
        ? null
        : screen.getByRole('region', { name: label })
      : document.documentElement.querySelector(selectors),
  );
};

const focus = (element: HTMLElement): void => {
  act(() => {
    element.focus();
  });
};

/** The shortcuts the bar's keyboard adapter sent to graphics, in order. */
const pressedShortcuts = (send: ReturnType<typeof recordSends>): string[] =>
  send.mock.calls.flatMap(([event]) => (event.type === 'viewerShortcutPressed' ? [event.shortcut] : []));

const fitViewCount = (send: ReturnType<typeof recordSends>): number =>
  pressedShortcuts(send).filter((shortcut) => shortcut === 'fitView').length;

describe('useViewerShortcuts', () => {
  describe('targeting', () => {
    it('should act on the viewer under the pointer, whichever holds focus', async () => {
      const left = startGraphics();
      const right = startGraphics();
      const leftSend = recordSends(left);
      const rightSend = recordSends(right);
      const user = userEvent.setup();
      renderViewers(['Left', left], ['Right', right]);
      focus(screen.getByRole('button', { name: 'Left control' }));
      hoverViewer('Right');

      await user.keyboard('f');

      expect(fitViewCount(rightSend)).toBe(1);
      expect(fitViewCount(leftSend)).toBe(0);
    });

    it('should act on the viewer holding focus when none is under the pointer', async () => {
      const left = startGraphics();
      const right = startGraphics();
      const leftSend = recordSends(left);
      const rightSend = recordSends(right);
      const user = userEvent.setup();
      renderViewers(['Left', left], ['Right', right]);
      hoverViewer(undefined);

      focus(screen.getByRole('button', { name: 'Left control' }));
      await user.keyboard('f');

      expect(fitViewCount(leftSend)).toBe(1);
      expect(fitViewCount(rightSend)).toBe(0);

      act(() => {
        (document.activeElement as HTMLElement).blur();
      });
      await user.keyboard('f');

      expect(fitViewCount(leftSend)).toBe(1);
      expect(fitViewCount(rightSend)).toBe(0);
    });

    it('should ignore keys typed into a field, and while focus is in a menu, list, tree, grid, dialog or popover', async () => {
      const actor = startGraphics();
      const send = recordSends(actor);
      const user = userEvent.setup();
      renderViewers(['Viewer', actor]);
      hoverViewer('Viewer');

      for (const element of [
        screen.getByRole('textbox', { name: 'Viewer field' }),
        screen.getByRole('menuitem', { name: 'Menu item' }),
        screen.getByRole('treeitem', { name: 'part.ts' }),
        screen.getByRole('button', { name: 'Dialog button' }),
        screen.getByRole('option', { name: 'Millimetre' }),
        screen.getByRole('gridcell', { name: 'Width' }),
        screen.getByRole('button', { name: 'Popover button' }),
      ]) {
        focus(element);
        // oxlint-disable-next-line no-await-in-loop -- each key is pressed in turn with focus on the next element.
        await user.keyboard('fg');
      }

      expect(send).not.toHaveBeenCalled();

      focus(screen.getByRole('button', { name: 'Viewer control' }));
      await user.keyboard('f');

      expect(fitViewCount(send)).toBe(1);
    });
  });

  describe('keys', () => {
    it('should toggle Section with S and Measure with M', async () => {
      const actor = startGraphics();
      const user = userEvent.setup();
      renderViewers(['Viewer', actor]);
      hoverViewer('Viewer');

      await user.keyboard('s');
      expect(actor.getSnapshot().context).toMatchObject({ isSectionViewActive: true, sectionCuts: [{ plane: 'xz' }] });

      await user.keyboard('m');
      expect(actor.getSnapshot().context).toMatchObject({ isSectionViewActive: true, isMeasureActive: true });

      await user.keyboard('sm');
      expect(actor.getSnapshot().context).toMatchObject({ isSectionViewActive: false, isMeasureActive: false });
    });

    it('should step back with Escape: a pending point, then Measure, then Section', async () => {
      const actor = startGraphics();
      actor.send({ type: 'setSectionViewActive', payload: true });
      actor.send({ type: 'setMeasureActive', payload: true });
      actor.send({ type: 'startMeasurement', payload: [0, 0, 0] });
      const user = userEvent.setup();
      renderViewers(['Viewer', actor]);
      hoverViewer('Viewer');

      await user.keyboard('{Escape}');
      expect(actor.getSnapshot().context).toMatchObject({
        currentMeasurementStart: undefined,
        isMeasureActive: true,
        isSectionViewActive: true,
      });

      await user.keyboard('{Escape}');
      expect(actor.getSnapshot().context).toMatchObject({ isMeasureActive: false, isSectionViewActive: true });

      await user.keyboard('{Escape}');
      expect(actor.getSnapshot().context).toMatchObject({ isMeasureActive: false, isSectionViewActive: false });

      const passedOn = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      document.body.dispatchEvent(passedOn);
      expect(passedOn.defaultPrevented).toBe(false);
    });

    it('should remove the selected cut with Delete or Backspace, and nothing while none is selected', async () => {
      const actor = startGraphics();
      actor.send({ type: 'setSectionViewActive', payload: true });
      actor.send({ type: 'addSectionCut', payload: { kind: 'plane', plane: 'xy' } });
      const [first] = actor.getSnapshot().context.sectionCuts;
      expect(actor.getSnapshot().context.sectionCuts).toHaveLength(2);
      const user = userEvent.setup();
      renderViewers(['Viewer', actor]);
      hoverViewer('Viewer');

      await user.keyboard('{Delete}');
      expect(actor.getSnapshot().context.sectionCuts).toEqual([first]);

      await user.keyboard('{Delete}{Backspace}');
      expect(actor.getSnapshot().context.sectionCuts).toEqual([first]);

      act(() => {
        actor.send({ type: 'selectSectionCut', payload: first!.id });
      });
      await user.keyboard('{Backspace}');
      expect(actor.getSnapshot().context).toMatchObject({ sectionCuts: [], isSectionViewActive: false });
    });

    it('should send Delete and Backspace as removeCut, preferring the focused chip of this bar to the selected cut', async () => {
      const actor = startGraphics();
      actor.send({ type: 'setSectionViewActive', payload: true });
      actor.send({ type: 'addSectionCut', payload: { kind: 'plane', plane: 'xy' } });
      const [first, second] = actor.getSnapshot().context.sectionCuts;
      expect(actor.getSnapshot().context.selectedSectionCutId).toBe(second!.id);
      const send = recordSends(actor);
      chips.set('Viewer', [first!.id]);
      chips.set('Other', [second!.id]);
      const other = startGraphics();
      const user = userEvent.setup();
      renderViewers(['Viewer', actor], ['Other', other]);
      hoverViewer('Viewer');

      // A chip in another bar is not this bar's: the selected cut goes.
      focus(screen.getByRole('button', { name: `Other chip ${second!.id}` }));
      await user.keyboard('{Delete}');
      expect(actor.getSnapshot().context.sectionCuts).toEqual([first]);

      act(() => {
        actor.send({ type: 'addSectionCut', payload: { kind: 'plane', plane: 'yz' } });
      });
      const [, added] = actor.getSnapshot().context.sectionCuts;
      focus(screen.getByRole('button', { name: `Viewer chip ${first!.id}` }));
      await user.keyboard('{Backspace}');

      expect(actor.getSnapshot().context.sectionCuts).toEqual([added]);
      expect(pressedShortcuts(send)).toEqual(['removeCut', 'removeCut']);
      expect(announcementsOf('Viewer')).toEqual(['Cut removed', 'Cut removed']);
    });

    it('should pass Delete and Backspace through when graphics has no cut to remove', async () => {
      const actor = startGraphics();
      actor.send({ type: 'setSectionViewActive', payload: true });
      actor.send({ type: 'selectSectionCut', payload: undefined });
      const send = recordSends(actor);
      renderViewers(['Viewer', actor]);
      hoverViewer('Viewer');
      focus(screen.getByRole('button', { name: 'Viewer control' }));

      for (const key of ['Delete', 'Backspace']) {
        const passedOn = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
        document.activeElement!.dispatchEvent(passedOn);
        expect(passedOn.defaultPrevented).toBe(false);
      }
      expect(send).not.toHaveBeenCalled();
      expect(actor.getSnapshot().context.sectionCuts).toHaveLength(1);
    });

    it('should switch to orthographic with P and back to the last perspective angle', async () => {
      const actor = startGraphics();
      const user = userEvent.setup();
      renderViewers(['Viewer', actor]);
      hoverViewer('Viewer');
      const fieldOfView = screen.getByRole('status', { name: 'Viewer field of view' });
      const perspective = fieldOfView.textContent;
      expect(Number(perspective)).toBeGreaterThan(0);

      await user.keyboard('p');
      expect(fieldOfView).toHaveTextContent('0');

      await user.keyboard('p');
      expect(fieldOfView).toHaveTextContent(perspective);
    });

    it('should toggle the grid with G', async () => {
      const actor = startGraphics();
      const user = userEvent.setup();
      renderViewers(['Viewer', actor]);
      hoverViewer('Viewer');
      const isGridShown = actor.getSnapshot().context.enableGrid;

      await user.keyboard('g');
      expect(actor.getSnapshot().context.enableGrid).toBe(!isGridShown);

      await user.keyboard('g');
      expect(actor.getSnapshot().context.enableGrid).toBe(isGridShown);
    });

    it('should set the grid and projection through the host view commands and send nothing live (V11)', async () => {
      const actor = startGraphics();
      const send = recordSends(actor);
      const set = vi.fn();
      const user = userEvent.setup();
      renderViewers(['Viewer', actor, { set, reset: vi.fn() }]);
      hoverViewer('Viewer');
      const isGridShown = actor.getSnapshot().context.enableGrid;
      const fieldOfView = actor.getSnapshot().context.cameraRef.getSnapshot().context.view.requestedVerticalFieldOfView;

      await user.keyboard('g');
      await user.keyboard('p');

      expect(set.mock.calls).toEqual([
        ['display.grid', !isGridShown],
        ['fieldOfView', 0],
      ]);
      expect(pressedShortcuts(send)).toEqual([]);
      expect(actor.getSnapshot().context.enableGrid).toBe(isGridShown);
      expect(actor.getSnapshot().context.cameraRef.getSnapshot().context.view.requestedVerticalFieldOfView).toBe(
        fieldOfView,
      );
      expect(announcementsOf('Viewer')).toEqual([isGridShown ? 'Grid hidden' : 'Grid shown', 'Orthographic']);
    });

    it('should toggle a second G or P from the value still being written, not the stale one shown', async () => {
      const actor = startGraphics();
      const writes: Array<PromiseWithResolvers<boolean>> = [];
      const set = vi.fn(async () => {
        const write = Promise.withResolvers<boolean>();
        writes.push(write);
        return write.promise;
      });
      const user = userEvent.setup();
      renderViewers(['Viewer', actor, { set, reset: vi.fn() }]);
      hoverViewer('Viewer');
      const isGridShown = actor.getSnapshot().context.enableGrid;
      const fieldOfView = actor.getSnapshot().context.cameraRef.getSnapshot().context.view.requestedVerticalFieldOfView;

      await user.keyboard('gg');
      await user.keyboard('pp');

      expect(set.mock.calls).toEqual([
        ['display.grid', !isGridShown],
        ['display.grid', isGridShown],
        ['fieldOfView', 0],
        ['fieldOfView', fieldOfView],
      ]);

      // A refused write is forgotten, so the next press reads graphics again.
      for (const write of writes) {
        write.resolve(true);
      }
      await user.keyboard('g');
      const refused = writes.at(-1)!;
      refused.resolve(false);
      await refused.promise;
      await Promise.resolve();
      await user.keyboard('g');
      expect(set.mock.calls.slice(-2)).toEqual([
        ['display.grid', !isGridShown],
        ['display.grid', !isGridShown],
      ]);
    });

    it('should toggle G from what graphics shows once a written value reached it and the settings menu changed it', async () => {
      const actor = startGraphics();
      const set = vi.fn(async () => true);
      const user = userEvent.setup();
      renderViewers(['Viewer', actor, { set, reset: vi.fn() }]);
      hoverViewer('Viewer');
      const isGridShown = actor.getSnapshot().context.enableGrid;
      const fieldOfView = actor.getSnapshot().context.cameraRef.getSnapshot().context.view.requestedVerticalFieldOfView;

      await user.keyboard('g');
      await user.keyboard('p');
      // The host's writes reach graphics (the record's seed), then the settings menu sets both back.
      act(() => {
        actor.send({ type: 'setGridVisibility', payload: !isGridShown });
        actor.getSnapshot().context.cameraRef.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 0 });
      });
      act(() => {
        actor.send({ type: 'setGridVisibility', payload: isGridShown });
        actor
          .getSnapshot()
          .context.cameraRef.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: fieldOfView });
      });
      await user.keyboard('g');
      await user.keyboard('p');

      expect(set.mock.calls).toEqual([
        ['display.grid', !isGridShown],
        ['fieldOfView', 0],
        ['display.grid', !isGridShown],
        ['fieldOfView', 0],
      ]);
    });

    it('should keep a newer pending G when an older write with the same value fails', async () => {
      const actor = startGraphics();
      const writes: Array<PromiseWithResolvers<boolean>> = [];
      const set = vi.fn(async () => {
        const write = Promise.withResolvers<boolean>();
        writes.push(write);
        return write.promise;
      });
      const user = userEvent.setup();
      renderViewers(['Viewer', actor, { set, reset: vi.fn() }]);
      hoverViewer('Viewer');
      const isGridShown = actor.getSnapshot().context.enableGrid;

      // Three presses: the first and third write the same value.
      await user.keyboard('ggg');
      const [first] = writes;
      first!.resolve(false);
      await first!.promise;
      await Promise.resolve();
      // The third write is still pending, so the next press toggles from it.
      await user.keyboard('g');

      expect(set.mock.calls.map((call: unknown[]) => call[1])).toEqual([
        !isGridShown,
        isGridShown,
        !isGridShown,
        isGridShown,
      ]);
    });

    it('should keep sending F, S and M to graphics with the host view commands', async () => {
      const actor = startGraphics();
      const send = recordSends(actor);
      const user = userEvent.setup();
      renderViewers(['Viewer', actor, { set: vi.fn(), reset: vi.fn() }]);
      hoverViewer('Viewer');

      await user.keyboard('f');

      expect(pressedShortcuts(send)).toEqual(['fitView']);
    });

    it('should keep S, M and P off for 2D geometry, while F and G still work', async () => {
      const actor = startGraphics();
      actor.send({
        type: 'updateArtifact',
        artifact: { mimeType: 'image/svg+xml', content: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' },
        hash: 'svg',
      });
      const send = recordSends(actor);
      const user = userEvent.setup();
      renderViewers(['Viewer', actor]);
      hoverViewer('Viewer');
      const fieldOfView = screen.getByRole('status', { name: 'Viewer field of view' }).textContent;

      await user.keyboard('smp');

      expect(send).not.toHaveBeenCalled();
      expect(screen.getByRole('status', { name: 'Viewer field of view' })).toHaveTextContent(fieldOfView);

      await user.keyboard('fg');

      expect(pressedShortcuts(send)).toEqual(['fitView', 'grid']);
      expect(announcementsOf('Viewer')).toEqual(['Fitted to view', expect.stringMatching(/^Grid (shown|hidden)$/)]);
    });
  });
  it('should keep empty viewport shortcuts without starting model tools', async () => {
    const actor = startGraphics();
    actor.send({ type: 'sceneRadiusUpdated', radius: 0, centerMeters: [0, 0, 0] });
    const emitted: string[] = [];
    actor.on('viewFitRequested', () => {
      emitted.push('viewFitRequested');
    });
    renderViewers(['Viewer', actor]);
    hoverViewer('Viewer');
    const isGridShown = actor.getSnapshot().context.enableGrid;

    await userEvent.keyboard('fsm');

    expect(emitted).toEqual([]);
    expect(actor.getSnapshot().context).toMatchObject({ isSectionViewActive: false, isMeasureActive: false });
    expect(announcementsOf('Viewer')).toEqual([
      'No model to fit',
      'A model is required for section view',
      'A model is required for measurement',
    ]);

    await userEvent.keyboard('g');

    expect(actor.getSnapshot().context.enableGrid).toBe(!isGridShown);
  });

  it('should send each key to graphics as its shortcut and announce what graphics did', async () => {
    const actor = startGraphics();
    const send = recordSends(actor);
    const user = userEvent.setup();
    renderViewers(['Viewer', actor]);
    hoverViewer('Viewer');

    await user.keyboard('fsmgp{Escape}{Escape}');

    expect(pressedShortcuts(send)).toEqual(['fitView', 'section', 'measure', 'grid', 'projection', 'escape', 'escape']);
    expect(announcementsOf('Viewer')).toEqual([
      'Fitted to view',
      'Section on',
      'Measure on',
      expect.stringMatching(/^Grid (shown|hidden)$/),
      'Orthographic',
      'Measure off',
      'Section off',
    ]);
  });

  it('should act and announce once per key under StrictMode', async () => {
    const actor = startGraphics();
    const send = recordSends(actor);
    const user = userEvent.setup();
    render(
      <StrictMode>
        <KeyboardProvider>
          <GraphicsProvider graphicsRef={actor}>
            <Viewer label='Viewer' />
          </GraphicsProvider>
        </KeyboardProvider>
      </StrictMode>,
    );
    hoverViewer('Viewer');
    const isGridShown = actor.getSnapshot().context.enableGrid;

    await user.keyboard('g');

    expect(pressedShortcuts(send)).toEqual(['grid']);
    expect(actor.getSnapshot().context.enableGrid).toBe(!isGridShown);
    expect(announcementsOf('Viewer')).toHaveLength(1);
  });

  it('should announce only in the bar that heard the key when two bars show one graphics actor', async () => {
    const actor = startGraphics();
    const user = userEvent.setup();
    renderViewers(['Left', actor], ['Right', actor]);

    // Left presses first, so its adapter listens on the shared actor before Right's press.
    hoverViewer('Left');
    await user.keyboard('g');
    hoverViewer('Right');
    await user.keyboard('g');

    expect(announcementsOf('Left')).toHaveLength(1);
    expect(announcementsOf('Right')).toHaveLength(1);
  });
});
