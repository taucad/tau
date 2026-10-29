// @vitest-environment jsdom
import { act, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from '@testing-library/user-event';
import { createActor, createAsyncLogic } from 'xstate';
import type { Actor } from 'xstate';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { KeyboardProvider } from '@taucad/ui/components/keyboard';
import { GraphicsProvider } from '#hooks/use-graphics.jsx';
import { graphicsMachine } from '#machines/graphics.machine.js';
import { ViewerControls } from '#cad/viewer-controls.jsx';

const mocks = vi.hoisted(() => ({ isMobile: false }));
vi.mock('@taucad/ui/hooks/use-mobile', () => ({ useIsMobile: () => mocks.isMobile }));
vi.mock('#cad/grid-control.jsx', () => ({
  GridSizeIndicator: () => <button type='button' aria-label='Grid 10 mm, units and grid' />,
}));
vi.mock('#cad/viewer-settings.jsx', () => ({
  ViewerSettings: () => <button type='button' aria-label='Viewer settings' />,
}));

let actor: Actor<typeof graphicsMachine> | undefined;

afterEach(() => {
  actor?.stop();
  actor = undefined;
  mocks.isMobile = false;
});

function renderBar(mobileAction?: React.ReactNode): void {
  actor = createActor(
    graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
    { input: {} },
  ).start();
  render(
    <KeyboardProvider>
      <TooltipProvider>
        <GraphicsProvider graphicsRef={actor}>
          <ViewerControls mobileAction={mobileAction} />
        </GraphicsProvider>
      </TooltipProvider>
    </KeyboardProvider>,
  );
}

const controlNames = (): string[] =>
  within(screen.getByRole('group', { name: 'Viewer controls' }))
    .getAllByRole('button')
    .map((button) => button.getAttribute('aria-label') ?? button.textContent);

const arAction = <button type='button' aria-label='View in your space' />;

describe('ViewerControls host action', () => {
  it('shows the host action after Fullscreen in the desktop layout, as an iPad gets it', () => {
    renderBar(arAction);
    const names = controlNames();
    expect(names.slice(names.indexOf('Fit view'), names.indexOf('Fit view') + 3)).toEqual([
      'Fit view',
      'Enter fullscreen',
      'View in your space',
    ]);
  });

  it('adds nothing to the desktop bar when the host action renders nothing', () => {
    renderBar(null);
    expect(controlNames()).not.toContain('View in your space');
    expect(controlNames()).toContain('Enter fullscreen');
  });

  it('shows the host action in place of Fullscreen on a phone', () => {
    mocks.isMobile = true;
    renderBar(arAction);
    const names = controlNames();
    expect(names).not.toContain('Enter fullscreen');
    expect(names[names.indexOf('Fit view') + 1]).toBe('View in your space');
  });
});

describe('ViewerControls measurement readiness', () => {
  it('should show preparing until input is ready without admitting measurement actions', () => {
    renderBar();
    act(() => {
      actor!.send({ type: 'setMeasureActive', payload: true });
    });

    expect(screen.getByRole('status', { name: 'Preparing measurement' })).toHaveTextContent('Preparing measurement…');
    expect(screen.queryByRole('group', { name: 'Measuring options' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Targets:/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Measure' })).toHaveAttribute('aria-busy', 'true');
    const done = screen.getByRole('button', { name: 'Done with measure' });
    done.focus();

    act(() => {
      actor!.send({ type: 'setMeasureInputReady', ready: true });
    });

    expect(screen.queryByRole('status', { name: 'Preparing measurement' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Measuring options' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Targets:/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Measure' })).toHaveAttribute('aria-busy', 'false');
    expect(screen.getByRole('button', { name: 'Done with measure' })).toBe(done);
    expect(done).toHaveFocus();
    const targets = screen.getByRole('button', { name: /^Targets:/ });
    targets.focus();
    act(() => {
      actor!.send({ type: 'setMeasureInputReady', ready: false });
      actor!.send({ type: 'setMeasureInputReady', ready: true });
    });
    expect(screen.getByRole('button', { name: /^Targets:/ })).toBe(targets);
    expect(targets).toHaveFocus();
  });

  it('should cancel preparation and require readiness again when reopened', async () => {
    renderBar();
    const user = userEvent.setup();
    act(() => {
      actor!.send({ type: 'setMeasureActive', payload: true });
    });
    await user.click(screen.getByRole('button', { name: 'Done with measure' }));
    expect(actor!.getSnapshot().context.isMeasureActive).toBe(false);
    expect(screen.queryByRole('status', { name: 'Preparing measurement' })).not.toBeInTheDocument();
    act(() => {
      actor!.send({ type: 'setMeasureInputReady', ready: true });
      actor!.send({ type: 'setMeasureActive', payload: true });
    });
    expect(screen.getByRole('status', { name: 'Preparing measurement' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Targets:/ })).not.toBeInTheDocument();
  });
});
