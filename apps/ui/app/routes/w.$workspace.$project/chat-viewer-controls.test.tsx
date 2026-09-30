// @vitest-environment jsdom
import { act, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActor, createAsyncLogic } from 'xstate';
import type { Actor } from 'xstate';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { GraphicsProvider } from '#hooks/use-graphics.js';
import { KeyboardProvider } from '#hooks/use-keyboard.js';
import { graphicsMachine } from '#machines/graphics.machine.js';
import { ChatViewerControls } from '#routes/w.$workspace.$project/chat-viewer-controls.js';

const mocks = vi.hoisted(() => ({ hasGridReadout: true }));

vi.mock('#components/geometry/cad/capture-view-control.js', () => ({
  CaptureViewControl: () => <button type='button' aria-label='Capture view to chat' />,
}));
vi.mock('#components/geometry/cad/grid-control.js', () => ({
  // The readout renders nothing until the grid has a size.
  GridSizeIndicator: () =>
    mocks.hasGridReadout ? <button type='button' aria-label='Grid 10 mm, units and grid' /> : null,
}));
vi.mock('#components/geometry/cad/viewer-settings.js', () => ({
  ViewerSettings: ({ side, align }: { readonly side?: string; readonly align?: string }) => (
    <button type='button' aria-label='Viewer settings' data-side={side} data-align={align} />
  ),
}));

type GraphicsActor = Actor<typeof graphicsMachine>;

let activeActor: GraphicsActor | undefined;

afterEach(() => {
  activeActor?.stop();
  activeActor = undefined;
  mocks.hasGridReadout = true;
});

const startGraphics = (): GraphicsActor => {
  const actor = createActor(
    graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
    { input: {} },
  ).start();
  activeActor = actor;
  actor.send({ type: 'sceneRadiusUpdated', radius: 0.1, centerMeters: [0, 0, 0] });
  return actor;
};

const showSvg = (actor: GraphicsActor): void => {
  actor.send({
    type: 'updateArtifact',
    artifact: { mimeType: 'image/svg+xml', content: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' },
    hash: 'svg',
  });
};

const renderBar = (actor: GraphicsActor, properties: { shouldEnableCapture?: boolean } = {}): void => {
  render(
    <KeyboardProvider>
      <TooltipProvider>
        <GraphicsProvider graphicsRef={actor}>
          <ChatViewerControls {...properties} />
        </GraphicsProvider>
      </TooltipProvider>
    </KeyboardProvider>,
  );
};

const controlNames = (): string[] =>
  within(screen.getByRole('group', { name: 'Viewer controls' }))
    .getAllByRole('button')
    .map((button) => button.getAttribute('aria-label') ?? button.textContent);

const sectionRow = (): HTMLElement => screen.getByRole('group', { name: 'Section view options' });
const measuringRow = (): HTMLElement => screen.getByRole('group', { name: 'Measuring options' });

describe('ChatViewerControls', () => {
  describe('at rest', () => {
    it('should hold the grid readout, the tools, the actions and Viewer settings, in that order', () => {
      renderBar(startGraphics());

      expect(controlNames()).toEqual([
        'Grid 10 mm, units and grid',
        'Section view',
        'Measure',
        'Fit view',
        'Capture view to chat',
        'Viewer settings',
      ]);
      expect(screen.getByRole('button', { name: 'Viewer settings' })).toMatchObject({
        dataset: { side: 'top', align: 'end' },
      });
      expect(screen.queryByRole('group', { name: /options$/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    });

    it('should never shrink below its rows, so no row spills out of the bar in a narrow strip', () => {
      renderBar(startGraphics());

      expect(
        screen.getByRole('group', { name: 'Viewer controls' }).closest('[data-slot="viewer-controls"]'),
      ).toHaveClass('max-w-full', 'min-w-min');
    });

    it('should hint the S, M and F shortcuts in the tooltips', async () => {
      const user = userEvent.setup();
      renderBar(startGraphics());

      for (const [name, key] of [
        ['Section view', 'S'],
        ['Measure', 'M'],
        ['Fit view', 'F'],
      ] as const) {
        // oxlint-disable-next-line no-await-in-loop -- one tooltip at a time.
        await user.hover(screen.getByRole('button', { name }));
        // oxlint-disable-next-line no-await-in-loop -- one tooltip at a time.
        expect(await screen.findByRole('tooltip', { name: new RegExp(`^${name}\\s*${key}$`) })).toBeInTheDocument();
      }
    });

    it('should leave Capture out when capture is not enabled', () => {
      renderBar(startGraphics(), { shouldEnableCapture: false });

      expect(controlNames()).toEqual([
        'Grid 10 mm, units and grid',
        'Section view',
        'Measure',
        'Fit view',
        'Viewer settings',
      ]);
    });

    it('should offer no Section or Measure toggle, and no rows, for 2D geometry', () => {
      const actor = startGraphics();
      actor.send({ type: 'setSectionViewActive', payload: true });
      actor.send({ type: 'setMeasureActive', payload: true });
      showSvg(actor);
      renderBar(actor);

      expect(controlNames()).toEqual([
        'Grid 10 mm, units and grid',
        'Fit view',
        'Capture view to chat',
        'Viewer settings',
      ]);
      expect(screen.queryByRole('group', { name: /options$/ })).not.toBeInTheDocument();
    });

    it('should start the controls row with no divider while the grid readout shows nothing', () => {
      mocks.hasGridReadout = false;
      renderBar(startGraphics());

      const row = screen.getByRole('group', { name: 'Viewer controls' });
      expect(controlNames()[0]).toBe('Section view');
      // The hairline that follows the readout hides itself when it starts its line.
      expect(row.firstElementChild).toHaveClass('first:hidden');
    });
  });

  describe('rows', () => {
    it('should stack the Section row and its editor above the Measuring row, above the controls', async () => {
      const user = userEvent.setup();
      renderBar(startGraphics());

      await user.click(screen.getByRole('button', { name: 'Section view' }));
      await user.click(screen.getByRole('button', { name: 'Measure' }));

      const order = [
        within(sectionRow()).getByRole('group', { name: 'XZ plane' }),
        within(sectionRow()).getByRole('group', { name: 'Sections' }),
        measuringRow(),
        screen.getByRole('group', { name: 'Viewer controls' }),
      ];
      for (const [index, element] of order.slice(1).entries()) {
        // None of these holds another, so each follows the last and nothing more.
        expect(order[index]!.compareDocumentPosition(element)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      }
      expect(screen.getByRole('button', { name: 'Done with section' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Done with measure' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Section view', pressed: true })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Measure', pressed: true })).toBeInTheDocument();
    });

    it('should end the Section row with its last cut', async () => {
      const actor = startGraphics();
      actor.send({ type: 'setSectionViewActive', payload: true });
      const user = userEvent.setup();
      renderBar(actor);

      await user.click(within(sectionRow()).getByRole('button', { name: 'Remove plane XZ 0 mm' }));

      expect(screen.queryByRole('group', { name: 'Section view options' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Section view', pressed: false })).toHaveFocus();
    });

    it('should say, politely, when the section is refused and the view keeps the last one', () => {
      const actor = startGraphics();
      actor.send({ type: 'setSectionViewActive', payload: true });
      const { sectionCuts } = actor.getSnapshot().context;
      actor.send({ type: 'setSectionCertification', payload: { status: 'certified', cuts: sectionCuts } });
      renderBar(actor);
      // Present, and empty, before there is anything to say, so that the words are announced when they come.
      const status = within(sectionRow()).getByRole('status');
      expect(status).toBeEmptyDOMElement();

      act(() => {
        actor.send({ type: 'setSectionCertification', payload: { status: 'rejected', cuts: sectionCuts } });
      });

      expect(status).toHaveTextContent('Section unavailable for this model; showing the last section');
    });

    it('should claim no last section when the caps refuse before they ever drew one', () => {
      const actor = startGraphics();
      actor.send({ type: 'setSectionViewActive', payload: true });
      renderBar(actor);

      act(() => {
        actor.send({ type: 'setSectionCertification', payload: { status: 'rejected', cuts: [] } });
      });

      expect(within(sectionRow()).getByRole('status')).toHaveTextContent(/^Section unavailable for this model$/);
    });
  });

  describe('announcements', () => {
    it('should say, politely, what each shortcut did', async () => {
      const actor = startGraphics();
      const user = userEvent.setup();
      renderBar(actor);
      const fitView = screen.getByRole('button', { name: 'Fit view' });
      act(() => {
        fitView.focus();
      });
      // The bar's own live region, the only one at rest.
      const status = screen.getByRole('status');
      const phrases: string[] = [];
      const press = async (keys: string): Promise<void> => {
        await user.keyboard(keys);
        phrases.push(status.textContent);
      };

      await press('s');
      // A second cut, open, so Delete leaves Section on.
      act(() => {
        actor.send({ type: 'addSectionCut', payload: { kind: 'plane', plane: 'xy' } });
      });
      for (const keys of ['m', 'g', 'g', 'p', 'p', 'f', 'f', '{Escape}', '{Delete}', '{Escape}']) {
        // oxlint-disable-next-line no-await-in-loop -- each key is pressed in turn.
        await press(keys);
      }

      expect(phrases).toEqual([
        'Section on',
        'Measure on',
        'Grid hidden',
        'Grid shown',
        'Orthographic',
        'Perspective',
        'Fitted to view',
        'Fitted to view',
        'Measure off',
        'Cut removed',
        'Section off',
      ]);
      expect(fitView).toHaveFocus();
    });
  });

  describe('focus', () => {
    it('should move focus into a row when its toggle starts the tool', async () => {
      const user = userEvent.setup();
      renderBar(startGraphics());

      await user.click(screen.getByRole('button', { name: 'Section view' }));

      expect(within(sectionRow()).getByRole('radio', { name: 'XZ' })).toHaveFocus();

      await user.click(screen.getByRole('button', { name: 'Measure' }));

      // The Targets control opens the row before disabled Clear all and Done.
      expect(within(measuringRow()).getByRole('button', { name: /^Targets:/u })).toHaveFocus();
    });

    it('should move focus into the row when Enter starts the tool', async () => {
      const user = userEvent.setup();
      renderBar(startGraphics());

      act(() => {
        screen.getByRole('button', { name: 'Measure' }).focus();
      });
      await user.keyboard('{Enter}');

      expect(within(measuringRow()).getByRole('button', { name: /^Targets:/u })).toHaveFocus();
    });

    it('should leave focus where it is when S or M starts a tool', async () => {
      const user = userEvent.setup();
      renderBar(startGraphics());
      const fitView = screen.getByRole('button', { name: 'Fit view' });
      act(() => {
        fitView.focus();
      });

      await user.keyboard('s');
      await user.keyboard('m');

      expect(sectionRow()).toBeInTheDocument();
      expect(measuringRow()).toBeInTheDocument();
      expect(fitView).toHaveFocus();
    });

    it('should return focus to the toggle when Done ends a row', async () => {
      const user = userEvent.setup();
      renderBar(startGraphics());

      await user.click(screen.getByRole('button', { name: 'Section view' }));
      await user.click(within(sectionRow()).getByRole('button', { name: 'Done with section' }));

      expect(screen.queryByRole('group', { name: 'Section view options' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Section view', pressed: false })).toHaveFocus();
    });

    it('should return focus to the toggle when Escape, S or M ends the row holding it', async () => {
      const user = userEvent.setup();
      renderBar(startGraphics());

      await user.click(screen.getByRole('button', { name: 'Measure' }));
      await user.keyboard('{Escape}');

      expect(screen.queryByRole('group', { name: 'Measuring options' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Measure' })).toHaveFocus();

      await user.click(screen.getByRole('button', { name: 'Section view' }));
      act(() => {
        within(sectionRow()).getByRole('button', { name: 'Plane XZ 0 mm' }).focus();
      });
      await user.keyboard('s');

      expect(screen.queryByRole('group', { name: 'Section view options' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Section view' })).toHaveFocus();

      await user.click(screen.getByRole('button', { name: 'Measure' }));
      await user.keyboard('m');

      expect(screen.getByRole('button', { name: 'Measure' })).toHaveFocus();
    });

    it('should keep focus in the bar through Enter and Escape in a field, so the next Escape stops Section', async () => {
      const user = userEvent.setup();
      renderBar(startGraphics());
      await user.click(screen.getByRole('button', { name: 'Section view' }));

      await user.click(within(sectionRow()).getByRole('spinbutton', { name: 'Offset in mm' }));
      await user.keyboard('12{Enter}');

      const chip = within(sectionRow()).getByRole('button', { name: 'Plane XZ 12 mm', expanded: true });
      expect(chip).toHaveFocus();

      await user.click(within(sectionRow()).getByRole('spinbutton', { name: 'Offset in mm' }));
      await user.keyboard('30{Escape}');

      expect(chip).toHaveAccessibleName('Plane XZ 12 mm');
      expect(chip).toHaveFocus();

      await user.keyboard('{Escape}');

      expect(screen.queryByRole('group', { name: 'Section view options' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Section view', pressed: false })).toHaveFocus();
    });

    it('should remove the cut of the chip holding focus with Delete, rather than the open cut', async () => {
      const actor = startGraphics();
      actor.send({ type: 'setSectionViewActive', payload: true });
      actor.send({ type: 'addSectionCut', payload: { kind: 'plane', plane: 'xy' } });
      const user = userEvent.setup();
      renderBar(actor);
      expect(within(sectionRow()).getByRole('button', { name: 'Plane XY 0 mm' })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      act(() => {
        within(sectionRow()).getByRole('button', { name: 'Plane XZ 0 mm' }).focus();
      });

      await user.keyboard('{Delete}');

      expect(actor.getSnapshot().context.sectionCuts.map((cut) => cut.kind === 'plane' && cut.plane)).toEqual(['xy']);
    });

    it('should move focus to the next chip when Delete removes the open cut from inside its editor', async () => {
      const actor = startGraphics();
      actor.send({ type: 'setSectionViewActive', payload: true });
      actor.send({ type: 'addSectionCut', payload: { kind: 'plane', plane: 'xy' } });
      actor.send({ type: 'selectSectionCut', payload: actor.getSnapshot().context.sectionCuts[0]!.id });
      const user = userEvent.setup();
      renderBar(actor);
      act(() => {
        within(sectionRow()).getByRole('button', { name: 'Flip' }).focus();
      });

      await user.keyboard('{Delete}');

      expect(actor.getSnapshot().context.sectionCuts).toMatchObject([{ plane: 'xy' }]);
      expect(within(sectionRow()).getByRole('button', { name: 'Plane XY 0 mm' })).toHaveFocus();
    });
  });
});
