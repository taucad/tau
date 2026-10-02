// @vitest-environment jsdom
import { useRef } from 'react';
import { act, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActor, createAsyncLogic } from 'xstate';
import type { Actor } from 'xstate';
import { GraphicsProvider, useCameraSelector } from '#hooks/use-graphics.js';
import { KeyboardProvider } from '#hooks/use-keyboard.js';
import { useViewerShortcuts } from '#hooks/use-viewer-shortcuts.js';
import { graphicsMachine } from '#machines/graphics.machine.js';

type GraphicsActor = Actor<typeof graphicsMachine>;

const actors: GraphicsActor[] = [];

afterEach(() => {
  for (const actor of actors.splice(0)) {
    actor.stop();
  }
  vi.restoreAllMocks();
});

const startGraphics = (): GraphicsActor => {
  const actor = createActor(
    graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
    { input: {} },
  ).start();
  actors.push(actor);
  actor.send({ type: 'sceneRadiusUpdated', radius: 0.1, centerMeters: [0, 0, 0] });
  return actor;
};

/** Records what the shortcuts send, still delivering it; the actor's `send` is a prototype getter. */
const recordSends = (actor: GraphicsActor): ReturnType<typeof vi.fn<GraphicsActor['send']>> => {
  const send = vi.fn<GraphicsActor['send']>(actor.send);
  Object.defineProperty(actor, 'send', { value: send, configurable: true });
  return send;
};

function FieldOfView({ label }: Readonly<{ label: string }>): React.JSX.Element {
  const fieldOfView = useCameraSelector((state) => state.context.view.requestedVerticalFieldOfView);
  return <output aria-label={`${label} field of view`}>{fieldOfView}</output>;
}

/** A viewer frame with a bar holding a button and a text field, as the bar mounts the shortcuts. */
function Viewer({ label }: Readonly<{ label: string }>): React.JSX.Element {
  const barRef = useRef<HTMLDivElement>(null);
  useViewerShortcuts(barRef, () => undefined);
  return (
    <section data-viewer-frame aria-label={label}>
      <FieldOfView label={label} />
      <div ref={barRef}>
        <button type='button'>{`${label} control`}</button>
        <input aria-label={`${label} field`} />
      </div>
    </section>
  );
}

const renderViewers = (...viewers: ReadonlyArray<readonly [string, GraphicsActor]>): void => {
  render(
    <KeyboardProvider>
      {viewers.map(([label, actor]) => (
        <GraphicsProvider key={label} graphicsRef={actor}>
          <Viewer label={label} />
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

const fitViewCount = (send: ReturnType<typeof recordSends>): number =>
  send.mock.calls.filter(([event]) => event.type === 'fitView').length;

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

      expect(send.mock.calls.map(([event]) => event.type)).toEqual(['fitView', 'setGridVisibility']);
    });
  });
});
