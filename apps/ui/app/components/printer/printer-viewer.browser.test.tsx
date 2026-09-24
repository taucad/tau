import '#styles/global.css';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeBambuContainer } from '@taucad/slicer/container';
import { fixtureGcode } from '#components/printer/testing/toolpath-fixture.js';
import type { PrinterLiveState } from '#components/printer/use-printer-live.js';
import type { FileViewerPaneContent } from '#routes/w.$workspace.$project/file-viewers/file-viewer.types.js';

/**
 * Screenshot evidence for the printer simulation scene: the X1C enclosure with
 * the toolpath revealed to a mid-print time, light and dark, plus the viewer
 * following a live run. PNGs land under `out/research/.../C/`.
 */

const mocks = vi.hoisted(() => ({
  theme: 'light' as 'light' | 'dark',
  live: undefined as PrinterLiveState | undefined,
}));

vi.mock('#hooks/use-theme.js', () => ({ useTheme: () => ({ theme: mocks.theme }) }));
vi.mock('#components/printer/use-printer-live.js', () => ({ usePrinterLive: () => mocks.live }));

const { PrinterViewer } = await import('#components/printer/printer-viewer.js');

const evidenceDirectory = '../../../../../out/research/design-to-print-workbench-blueprint/2026-09-24-implementation/C';
const name = 'benchy.gcode.3mf';
const container = writeBambuContainer({
  gcode: fixtureGcode({ layers: 60, size: 120 }),
  modelName: 'benchy',
  plate: 'textured-pei',
});
const readAll = async (): Promise<Uint8Array<ArrayBuffer>> => container;
const renderPane = ({ body }: FileViewerPaneContent): React.ReactNode => (
  <div data-testid='frame' className='bg-background' style={{ width: '1100px', height: '720px' }}>
    {body}
  </div>
);

// oxlint-disable-next-line tau-lint/no-hardcoded-color -- the `#RRGGBB` a machine reports for its loaded spool
const loadedSpoolColor = '#E0523C';

const printingLive: PrinterLiveState = {
  machineName: 'Workshop X1C',
  runState: 'printing',
  isActive: true,
  position: { currentLayer: 38, totalLayers: 60, progress: 63 },
  chamberLight: 'on',
  nozzleTarget: 250,
  bedTarget: 65,
  filamentColor: loadedSpoolColor,
};

const nextFrames = async (count: number): Promise<void> =>
  new Promise<void>((resolve) => {
    let remaining = count;
    const tick = (): void => {
      remaining -= 1;
      if (remaining <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

const mount = async (theme: 'light' | 'dark'): Promise<HTMLElement> => {
  mocks.theme = theme;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  const { container: root } = render(
    <PrinterViewer name={name} kind='container' revision={1} readAll={readAll} renderPane={renderPane} />,
  );
  await screen.findByRole('region', { name: `Printer simulation: ${name}` });
  await nextFrames(3);
  return within(root).getByTestId('frame');
};

afterEach(() => {
  cleanup();
  mocks.live = undefined;
  document.documentElement.classList.remove('dark');
});

describe('Printer viewer screenshots', () => {
  for (const theme of ['light', 'dark'] as const) {
    it(`captures the scene paused mid-print in ${theme}`, async () => {
      globalThis.history.replaceState(undefined, '', '?graphicsBackend=webgl');
      await page.viewport(1100, 720);
      const frame = await mount(theme);
      const controls = within(frame).getByRole('group', { name: 'Playback controls' });
      fireEvent.click(within(controls).getByRole('button', { name: 'Pause' }));
      const time = within(controls).getByRole('slider', { name: 'Time' });
      fireEvent.change(time, { target: { value: String(Math.round(Number(time.getAttribute('max')) * 0.55)) } });
      const hud = within(frame).getByRole('region', { name: 'Print HUD' });
      await waitFor(() => {
        expect(within(hud).getByText('Layer').nextElementSibling?.textContent).toMatch(/^3\d \/ 6\d$/u);
      });
      await nextFrames(3);
      const path = await page.screenshot({
        element: frame,
        path: `${evidenceDirectory}/printer-mid-print-${theme}.png`,
      });
      expect(path).toContain(`printer-mid-print-${theme}.png`);
    });
  }

  it('captures the scene following a live run in dark', async () => {
    globalThis.history.replaceState(undefined, '', '?graphicsBackend=webgl');
    mocks.live = printingLive;
    await page.viewport(1100, 720);
    const frame = await mount('dark');
    const controls = within(frame).getByRole('group', { name: 'Playback controls' });
    fireEvent.click(within(controls).getByRole('switch', { name: 'Live' }));
    await waitFor(() => {
      expect(within(controls).getByRole('switch', { name: 'Live' })).toHaveAttribute('aria-checked', 'true');
      expect(within(controls).getByRole('slider', { name: 'Time' })).toBeDisabled();
    });
    const hud = within(frame).getByRole('region', { name: 'Print HUD' });
    expect(within(hud).getByText('Machine').nextElementSibling?.textContent).toContain('Workshop X1C');
    await nextFrames(3);
    const path = await page.screenshot({ element: frame, path: `${evidenceDirectory}/printer-live-dark.png` });
    expect(path).toContain('printer-live-dark.png');
  });
});
