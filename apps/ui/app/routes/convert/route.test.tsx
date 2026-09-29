// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActor, createAsyncLogic } from 'xstate';
import type { Actor } from 'xstate';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { GraphicsProvider } from '#hooks/use-graphics.js';
import { KeyboardProvider } from '#hooks/use-keyboard.js';
import { graphicsMachine } from '#machines/graphics.machine.js';
import { ConverterExportPanel, ConverterViewer } from '#routes/convert/route.js';

vi.mock('#components/geometry/cad/cad-viewer.js', () => ({
  CadViewer: () => <div role='img' aria-label='Model' />,
}));
vi.mock('#components/geometry/cad/capture-view-control.js', () => ({
  CaptureViewControl: () => <button type='button' aria-label='Capture view to chat' />,
}));
vi.mock('#components/geometry/cad/grid-control.js', () => ({
  GridSizeIndicator: () => <button type='button' aria-label='Grid 10 mm, units and grid' />,
}));
vi.mock('#components/geometry/cad/viewer-settings.js', () => ({
  ViewerSettings: () => <button type='button' aria-label='Viewer settings' />,
}));

let activeActor: Actor<typeof graphicsMachine> | undefined;

afterEach(() => {
  activeActor?.stop();
  activeActor = undefined;
});

const renderViewer = (): void => {
  activeActor = createActor(
    graphicsMachine.provide({
      actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) },
    }),
    { input: {} },
  ).start();
  render(
    <KeyboardProvider>
      <TooltipProvider>
        <GraphicsProvider graphicsRef={activeActor}>
          <ConverterViewer glbData={new Uint8Array([0x67, 0x6c, 0x54, 0x46])} fileName='bracket.step' />
        </GraphicsProvider>
      </TooltipProvider>
    </KeyboardProvider>,
  );
};

describe('ConverterViewer', () => {
  it('should show the viewer bar without Capture, in the frame the shortcuts target', () => {
    renderViewer();

    const bar = screen.getByRole('group', { name: 'Viewer controls' });
    expect(
      within(bar)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label') ?? button.textContent),
    ).toEqual(['Grid 10 mm, units and grid', 'Section view', 'Measure', 'Fit view', 'Viewer settings']);
    expect(bar.closest('[data-viewer-frame]')).toContainElement(screen.getByRole('img', { name: 'Model' }));
  });

  it('should centre the bar in a label container clear of the export panel from md up', () => {
    renderViewer();

    const surface = screen.getByRole('group', { name: 'Viewer controls' }).closest('[data-slot="viewer-controls"]')!;
    const strip = surface.parentElement!;
    // Safe centring: a bar wider than the strip starts at its left edge rather than centring off the screen.
    expect(strip).toHaveClass(
      'pointer-events-none',
      'right-2',
      'md:right-84',
      'flex-col',
      'items-center-safe',
      '@container/viewer',
    );
    expect(strip).not.toHaveClass('items-center', 'right-84');
    expect(strip.lastElementChild).toBe(surface);
  });
});

describe('ConverterExportPanel', () => {
  it('should fold away below md behind an Export toggle, and stay open from md up', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <ConverterExportPanel>
          <button type='button'>Export STEP</button>
        </ConverterExportPanel>
      </TooltipProvider>,
    );
    const toggle = screen.getByRole('button', { name: 'Export' });
    const panel = document.querySelector<HTMLElement>(`[id="${toggle.getAttribute('aria-controls')}"]`);

    expect(toggle).toHaveClass('md:hidden');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(panel).toHaveClass('max-md:hidden');
    expect(panel).not.toHaveClass('hidden');
    expect(panel).toContainElement(screen.getByRole('button', { name: 'Export STEP' }));

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(panel).not.toHaveClass('max-md:hidden');

    await user.click(toggle);

    expect(panel).toHaveClass('max-md:hidden');
  });
});
