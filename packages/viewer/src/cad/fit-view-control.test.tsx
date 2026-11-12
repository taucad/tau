// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useSelector } from '@xstate/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActor, createAsyncLogic } from 'xstate';
import type { Actor, SnapshotFrom } from 'xstate';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { FitViewControl } from '#cad/fit-view-control.jsx';
import { graphicsMachine } from '#machines/graphics.machine.js';

type GraphicsActor = Actor<typeof graphicsMachine>;

const mocks = vi.hoisted(() => ({ actor: undefined as unknown }));

vi.mock('#hooks/use-graphics.jsx', () => ({
  useGraphics: () => mocks.actor,
  useGraphicsSelector: <T,>(selector: (state: SnapshotFrom<typeof graphicsMachine>) => T): T =>
    useSelector(mocks.actor as GraphicsActor, selector),
}));

const actors: GraphicsActor[] = [];

afterEach(() => {
  for (const actor of actors.splice(0)) {
    actor.stop();
  }
});

/** A graphics actor that has measured a model of `radius` (none when 0), as the control's provider. */
const startGraphics = (radius = 0.1): GraphicsActor => {
  const actor = createActor(
    graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
    { input: {} },
  ).start();
  actors.push(actor);
  actor.send({ type: 'sceneRadiusUpdated', radius, centerMeters: [0, 0, 0] });
  if (radius > 0) {
    actor.send({
      type: 'geometryBoundsMeasured',
      key: 'model',
      bounds: { min: [-radius, -radius, -radius], max: [radius, radius, radius] },
      radius,
    });
  }
  mocks.actor = actor;
  return actor;
};

const renderControl = (shortcut?: string): void => {
  render(
    <TooltipProvider>
      <FitViewControl shortcut={shortcut} />
    </TooltipProvider>,
  );
};

/** Whether clicking the button made the actor fit the view. */
const clickFits = async (actor: GraphicsActor): Promise<boolean> => {
  let fitted = false;
  const subscription = actor.on('viewFitRequested', () => {
    fitted = true;
  });
  await userEvent.click(screen.getByRole('button', { name: 'Fit view' }));
  subscription.unsubscribe();
  return fitted;
};

describe('FitViewControl', () => {
  it('should expose a Fit view button that fits the view', async () => {
    const actor = startGraphics();
    renderControl();

    expect(await clickFits(actor)).toBe(true);
  });

  it('should show the F shortcut in its tooltip', async () => {
    startGraphics();
    renderControl('F');

    await userEvent.hover(screen.getByRole('button', { name: 'Fit view' }));

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Fit viewF');
  });

  it('should not claim to fit an empty model', async () => {
    const actor = startGraphics(0);
    renderControl();

    expect(screen.getByRole('button', { name: 'Fit view' })).toHaveAttribute('aria-disabled', 'true');
    expect(await clickFits(actor)).toBe(false);
  });

  it('should not claim a fit while a new entry waits for its first presentation', async () => {
    const actor = startGraphics();
    actor.send({ type: 'entryChanged', identity: 'src/other.ts' });
    renderControl();

    expect(screen.getByRole('button', { name: 'Fit view' })).toHaveAttribute('aria-disabled', 'true');
    expect(await clickFits(actor)).toBe(false);
  });
});
