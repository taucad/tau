import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { isValidElement } from 'react';
import { Plus, Printer } from 'lucide-react';
import type { IDockviewPanelHeaderProps } from 'dockview-react';
import { mock } from 'vitest-mock-extended';
import { writeBambuContainer } from '@taucad/slicer/container';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { printerAccent } from '#components/printer/printer-colors.constants.js';
import { layerAtTime, liveTime } from '#components/printer/printer-playback.js';
import type { PrinterSceneProps } from '#components/printer/printer-scene.js';
import type { PrinterLiveState } from '#components/printer/use-printer-live.js';
import { fixtureGcode } from '#components/printer/testing/toolpath-fixture.js';
import { getViewerTabIcon } from '#components/panes/viewer-tab-context-menu.js';
import { digestBytes } from '#utils/crypto.utils.js';
import type { FileViewerPaneContent } from '#routes/w.$workspace.$project/file-viewers/file-viewer.types.js';

const mocks = vi.hoisted(() => ({
  scene: vi.fn<(props: PrinterSceneProps) => undefined>(() => undefined),
  live: undefined as PrinterLiveState | undefined,
  liveDigest: undefined as string | undefined,
  isReducedMotion: false,
}));

vi.mock('#components/printer/printer-scene.js', () => ({ PrinterScene: mocks.scene }));
vi.mock('#components/printer/use-printer-live.js', () => ({
  usePrinterLive: (digest: string | undefined) => {
    mocks.liveDigest = digest;
    return mocks.live;
  },
}));
vi.mock('#hooks/use-theme.js', () => ({ useTheme: () => ({ theme: 'dark' }) }));

const { PrinterViewer } = await import('#components/printer/printer-viewer.js');

const name = 'fixture.gcode.3mf';
const container = writeBambuContainer({
  gcode: fixtureGcode({ layers: 3 }),
  modelName: 'fixture',
  plate: 'textured-pei',
});
const renderPane = ({ actions, body }: FileViewerPaneContent): React.ReactNode => (
  <main>
    <header role='group' aria-label={`File actions for ${name}`}>
      {actions}
    </header>
    {body}
  </main>
);
const readAll = async (): Promise<Uint8Array<ArrayBuffer>> => container;

const viewer = (): React.JSX.Element => (
  <TooltipProvider>
    <PrinterViewer name={name} kind='container' revision={1} readAll={readAll} renderPane={renderPane} />
  </TooltipProvider>
);

const renderViewer = (): ReturnType<typeof render> => render(viewer());

const latestSceneProps = (): PrinterSceneProps => {
  const call = mocks.scene.mock.calls.at(-1);
  if (!call) {
    throw new Error('The scene has not rendered');
  }
  return call[0];
};

// oxlint-disable-next-line tau-lint/no-hardcoded-color -- the `#RRGGBB` a machine reports for its loaded spool
const loadedSpoolColor = '#3366FF';

const liveState = (overrides: Partial<PrinterLiveState> = {}): PrinterLiveState => ({
  machineId: 'machine-1',
  machineName: 'X1C simulator',
  runState: 'printing',
  isActive: true,
  printsThisFile: true,
  position: { currentLayer: 2, totalLayers: 3, progress: 40 },
  chamberLight: 'on',
  nozzleTarget: 250,
  bedTarget: 65,
  filamentColor: loadedSpoolColor,
  manifest: undefined,
  ...overrides,
});

describe('PrinterViewer', () => {
  beforeEach(() => {
    mocks.scene.mockClear();
    mocks.live = undefined;
    mocks.isReducedMotion = false;
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion') && mocks.isReducedMotion,
      media: query,
      addEventListener: (): void => undefined,
      removeEventListener: (): void => undefined,
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should mount a labelled simulation for a .gcode.3mf and autoplay it', async () => {
    renderViewer();
    expect(screen.getByRole('status', { name: `Loading simulation of ${name}` })).toHaveAttribute('aria-busy', 'true');

    const region = await screen.findByRole('region', { name: `Printer simulation: ${name}` });
    expect(within(region).getByRole('img', { name: `Bambu Lab X1 Carbon printing ${name}` })).toHaveAttribute(
      'tabindex',
      '0',
    );
    const controls = within(region).getByRole('group', { name: 'Playback controls' });
    expect(within(controls).getByRole('button', { name: 'Pause' })).toBeEnabled();
    expect(within(controls).getByRole('button', { name: 'Previous segment' })).toBeEnabled();
    expect(within(controls).getByRole('button', { name: 'Next segment' })).toBeEnabled();
    expect(within(controls).getByRole('button', { name: 'Reset' })).toBeEnabled();
    expect(within(controls).getByRole('slider', { name: 'Time' })).toHaveValue('0');
    expect(within(controls).getByRole('slider', { name: 'Layer' })).toHaveAttribute('max', '3');
    const speed = within(controls).getByRole('radiogroup', { name: 'Speed' });
    expect(
      within(speed)
        .getAllByRole('radio')
        .map((radio) => radio.textContent),
    ).toEqual(['1×', '10×', '100×', 'Max']);
    expect(within(speed).getByRole('radio', { name: '1×' })).toHaveAttribute('aria-checked', 'true');
    const live = within(controls).getByRole('switch', { name: 'Live' });
    expect(live).toBeDisabled();
    expect(live).not.toBeChecked();
    expect(controls).toHaveTextContent('No active run to follow');

    const hud = within(region).getByRole('region', { name: 'Print HUD' });
    // The purge line before the first LAYER_CHANGE is the parser's layer 0, so the cursor starts on layer 1 of 3.
    expect(within(hud).getByText('Layer').nextElementSibling).toHaveTextContent('1 / 3');
    expect(within(hud).getByText('Nozzle').nextElementSibling).toHaveTextContent('220 °C');
    expect(within(hud).getByText('Bed').nextElementSibling).toHaveTextContent('60 °C');
    expect(within(hud).getByText('Elapsed').nextElementSibling).toHaveTextContent('0:00:00');
    expect(within(hud).getByText('Filament').nextElementSibling).toHaveTextContent(/^\d+ mm \/ \d+ mm$/u);
    expect(within(hud).queryByText('Preview shows known motion only')).not.toBeInTheDocument();

    const props = latestSceneProps();
    expect(props.store.getSnapshot()).toMatchObject({ isPlaying: true, speed: 1, isLive: false });
    expect(props.isReducedMotion).toBe(false);
    expect(props.chamberLight).toBe('unknown');
    expect(props.filamentColor).toBe(printerAccent);
    expect(props.geometry.buildVolume).toEqual([256, 256, 256]);
  });

  it('should not autoplay under reduced motion while scrubbing still works', async () => {
    mocks.isReducedMotion = true;
    renderViewer();
    const controls = await screen.findByRole('group', { name: 'Playback controls' });
    expect(within(controls).getByRole('button', { name: 'Play' })).toBeEnabled();
    const props = latestSceneProps();
    expect(props.isReducedMotion).toBe(true);
    expect(props.store.getSnapshot().isPlaying).toBe(false);

    fireEvent.change(within(controls).getByRole('slider', { name: 'Layer' }), { target: { value: '3' } });
    expect(props.store.getTime()).toBe(props.program.layerTable[2]!.startTime);
    expect(await within(screen.getByRole('region', { name: 'Print HUD' })).findByText('3 / 3')).toBeInTheDocument();
  });

  it('should play, pause and step from the keyboard on the focused viewport', async () => {
    const user = userEvent.setup();
    renderViewer();
    const viewport = await screen.findByRole('img', { name: `Bambu Lab X1 Carbon printing ${name}` });
    const controls = screen.getByRole('group', { name: 'Playback controls' });
    const props = latestSceneProps();

    viewport.focus();
    await user.keyboard(' ');
    expect(within(controls).getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(props.store.getSnapshot().isPlaying).toBe(false);

    await user.keyboard('{ArrowRight}');
    expect(props.store.getTime()).toBe(props.program.times[2]);
    await user.keyboard('{ArrowLeft}');
    expect(props.store.getTime()).toBe(0);

    await user.keyboard(' ');
    expect(within(controls).getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('should change speed, reset, and pause when the document is hidden', async () => {
    const user = userEvent.setup();
    renderViewer();
    const controls = await screen.findByRole('group', { name: 'Playback controls' });
    const props = latestSceneProps();

    await user.click(within(controls).getByRole('radio', { name: 'Max' }));
    expect(props.store.getSnapshot().speed).toBe('max');
    await user.click(within(controls).getByRole('radio', { name: '10×' }));
    expect(props.store.getSnapshot().speed).toBe(10);

    fireEvent.change(within(controls).getByRole('slider', { name: 'Time' }), { target: { value: '4' } });
    expect(props.store.getTime()).toBe(4);
    await user.click(within(controls).getByRole('button', { name: 'Reset' }));
    expect(props.store.getSnapshot()).toMatchObject({ time: 0, isPlaying: false });

    await user.click(within(controls).getByRole('button', { name: 'Play' }));
    expect(props.store.getSnapshot().isPlaying).toBe(true);
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    try {
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
    } finally {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    }
    expect(within(controls).getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('should follow the machine in live mode and drop out when the run ends', async () => {
    const user = userEvent.setup();
    mocks.live = liveState();
    const view = renderViewer();
    const controls = await screen.findByRole('group', { name: 'Playback controls' });
    const props = latestSceneProps();
    expect(props.filamentColor).toBe(loadedSpoolColor);
    expect(props.chamberLight).toBe('on');
    expect(props.liveNozzleTarget).toBe(250);
    const hud = screen.getByRole('region', { name: 'Print HUD' });
    expect(within(hud).getByText('Machine').nextElementSibling).toHaveTextContent('X1C simulator · printing');
    expect(within(hud).getByText('Nozzle').nextElementSibling).toHaveTextContent('250 °C');
    expect(controls).not.toHaveTextContent('No active run to follow');

    const live = within(controls).getByRole('switch', { name: 'Live' });
    expect(live).toBeEnabled();
    await user.click(live);
    expect(live).toBeChecked();
    expect(props.store.getSnapshot()).toMatchObject({ isLive: true, isPlaying: false });
    // Layer 2 of 3 at 40 % overall: the progress falls inside that layer's window, so it places the cursor.
    expect(props.store.getTime()).toBe(liveTime(props.program, mocks.live.position));
    expect(layerAtTime(props.program, props.store.getTime())).toBe(1);
    expect(props.store.getTime()).toBeCloseTo(0.4 * props.program.duration, 6);
    expect(within(controls).getByRole('slider', { name: 'Time' })).toBeDisabled();
    expect(within(controls).getByRole('slider', { name: 'Layer' })).toBeDisabled();
    expect(within(controls).getByRole('button', { name: 'Play' })).toBeDisabled();
    expect(within(controls).getByRole('button', { name: 'Next segment' })).toBeDisabled();
    expect(within(controls).getByRole('radio', { name: 'Max' })).toBeDisabled();

    mocks.live = liveState({ position: { currentLayer: 3, totalLayers: 3, progress: 90 } });
    view.rerender(viewer());
    expect(props.store.getTime()).toBe(liveTime(props.program, mocks.live.position));
    expect(layerAtTime(props.program, props.store.getTime())).toBe(2);

    mocks.live = liveState({ runState: 'succeeded', isActive: false, printsThisFile: false });
    view.rerender(viewer());
    expect(within(controls).getByRole('switch', { name: 'Live' })).not.toBeChecked();
    expect(within(controls).getByRole('switch', { name: 'Live' })).toBeDisabled();
    expect(controls).toHaveTextContent('No active run to follow');
    expect(within(controls).getByRole('slider', { name: 'Time' })).toBeEnabled();
  });

  it('should not follow a run that prints another file, and say so', async () => {
    mocks.live = liveState({ printsThisFile: false });
    renderViewer();
    const controls = await screen.findByRole('group', { name: 'Playback controls' });

    expect(within(controls).getByRole('switch', { name: 'Live' })).toBeDisabled();
    expect(controls).toHaveTextContent('The printer is running another file');
    expect(within(screen.getByRole('region', { name: 'Print HUD' })).queryByText('Machine')).not.toBeInTheDocument();
    // The viewer names its file by the digest of the bytes it shows, as the print request ledger does.
    expect(mocks.liveDigest).toBe(await digestBytes(container));
  });

  it('should frame the print again from the pane actions without touching playback', async () => {
    const user = userEvent.setup();
    renderViewer();
    await screen.findByRole('region', { name: `Printer simulation: ${name}` });
    const initial = latestSceneProps();
    const actions = screen.getByRole('group', { name: `File actions for ${name}` });
    const frame = within(actions).getByRole('button', { name: 'Frame the print' });
    await user.click(frame);
    expect(latestSceneProps().frameRequest).toBe(initial.frameRequest + 1);
    await user.click(frame);
    expect(latestSceneProps().frameRequest).toBe(initial.frameRequest + 2);
    expect(latestSceneProps().store).toBe(initial.store);
    expect(initial.store.getSnapshot().isPlaying).toBe(true);
  });

  it('should report a file that cannot be read', async () => {
    render(
      <PrinterViewer
        name='broken.gcode.3mf'
        kind='container'
        revision={1}
        readAll={async () => new Uint8Array([0x50, 0x4b, 0x03, 0x04])}
        renderPane={renderPane}
      />,
    );
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The toolpath could not be read.');
    expect(mocks.scene).not.toHaveBeenCalled();
  });
});

describe('getViewerTabIcon', () => {
  const icon = (params: Record<string, unknown>): React.ReactNode =>
    getViewerTabIcon(mock<IDockviewPanelHeaderProps>({ params }));

  it('should return the printer icon for printer files only', () => {
    for (const entryPath of ['prints/bracket.gcode.3mf', 'bracket.gcode']) {
      const element = icon({ entryPath });
      expect(isValidElement(element) && element.type).toBe(Printer);
    }
    expect(icon({ entryPath: 'bracket.step' })).toBeUndefined();
    expect(icon({})).toBeUndefined();
    const launcher = icon({ mode: 'launcher' });
    expect(isValidElement(launcher) && launcher.type).toBe(Plus);
  });
});
