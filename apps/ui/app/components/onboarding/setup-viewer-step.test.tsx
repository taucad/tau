// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';

vi.mock('#flags/use-feature.js', () => ({ useFeature: () => true }));
vi.mock('#hooks/use-project-manager.js', () => ({ useProjectManager: () => ({ connectWorkspace: vi.fn() }) }));
const capture = vi.hoisted(() => vi.fn());
vi.mock('#hooks/use-analytics.js', () => ({ useAnalytics: () => ({ capture }) }));
const webgl = vi.hoisted(() => ({ isAvailable: true }));
vi.mock('#components/onboarding/webgl-support.js', () => ({ canCreateWebGl: () => webgl.isAvailable }));
// The live preview is its own chunk with the real viewer; `setup-viewer-preview.test.tsx` covers its loading.
vi.mock('#components/onboarding/setup-live-preview.js', () => ({
  default: () => <div data-testid='setup-live-preview' />,
}));

const { default: WelcomeRoute } = await import('#routes/welcome/route.js');
const { personRecordStores, deviceRecordStore } = await import('#preferences/person-record.store.js');
const { SetupPreviewFallback } = await import('#components/onboarding/setup-preview-fallback.js');

const renderViewerStep = (): void => {
  const router = createMemoryRouter([{ path: '/welcome', element: <WelcomeRoute /> }], {
    initialEntries: ['/welcome?step=viewer'],
  });
  render(<RouterProvider router={router} />);
};

const mouseControls = (): HTMLElement => screen.getByRole('group', { name: 'Mouse controls' });

describe('setup step 3 (S4)', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    capture.mockReset();
    webgl.isAvailable = true;
  });

  it("preselects Tau's default with no tool answer", () => {
    renderViewerStep();
    expect(within(mouseControls()).getByRole('radio', { name: /Tau default/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Cube' })).toBeChecked();
    expect(screen.getByTestId('setup-preset-reason')).toHaveTextContent('Tau’s default.');
  });

  it("preselects the tool answer's preset and gizmo", () => {
    personRecordStores.profile.write({ tool: 'blender' });
    renderViewerStep();
    expect(within(mouseControls()).getByRole('radio', { name: /Middle-drag orbit, Shift pan/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Axis balls' })).toBeChecked();
    expect(screen.getByTestId('setup-preset-reason')).toHaveTextContent('Suggested because you use Blender');
  });

  it('stores a chosen preset and a chosen style', async () => {
    const user = userEvent.setup();
    renderViewerStep();
    await user.click(within(mouseControls()).getByRole('radio', { name: /Alt-drag navigation/ }));
    expect(personRecordStores.viewer.read().controls.preset).toBe('alt');
    await user.click(screen.getByRole('radio', { name: 'Classic cube' }));
    expect(personRecordStores.viewer.read().gizmo.style).toBe('classic-cube');
  });

  it("stores None as viewDefaults['display.gizmo'] = false, and a style afterwards removes it", async () => {
    const user = userEvent.setup();
    renderViewerStep();
    await user.click(screen.getByRole('radio', { name: 'None' }));
    expect(personRecordStores.viewer.read().viewDefaults['display.gizmo']).toBe(false);
    expect(screen.getByRole('radio', { name: 'None' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Axes' }));
    expect(personRecordStores.viewer.read().viewDefaults).not.toHaveProperty('display.gizmo');
    expect(personRecordStores.viewer.read().gizmo.style).toBe('axes');
  });

  it("stores the trackpad switch as the device's inputDevice and shows the trackpad legend", async () => {
    const user = userEvent.setup();
    renderViewerStep();
    expect(screen.getByTestId('setup-legend-zoom')).toHaveTextContent('Scroll');
    await user.click(screen.getByRole('switch', { name: 'I use a trackpad' }));
    expect(deviceRecordStore.read().inputDevice).toBe('trackpad');
    expect(screen.getByTestId('setup-legend-zoom')).toHaveTextContent('Pinch');
    expect(screen.getByTestId('setup-legend-pan')).toHaveTextContent('Two-finger scroll');
    await user.click(screen.getByRole('switch', { name: 'I use a trackpad' }));
    expect(deviceRecordStore.read().inputDevice).toBe('mouse');
  });

  it('shows orbit, pan and zoom as key caps from the preset data', async () => {
    const user = userEvent.setup();
    renderViewerStep();
    await user.click(within(mouseControls()).getByRole('radio', { name: /Middle-drag orbit, Ctrl pan/ }));
    expect(screen.getByTestId('setup-legend-orbit')).toHaveTextContent('Middle drag');
    const pan = screen.getByTestId('setup-legend-pan');
    expect([...pan.querySelectorAll('kbd')].map((key) => key.textContent)).toEqual(['Ctrl', 'Middle drag']);
  });
});

describe('setup preview fallback (S5 f)', () => {
  beforeEach(() => {
    capture.mockReset();
  });

  it('shows the diagram and reports no_webgl when WebGL is unavailable', () => {
    webgl.isAvailable = false;
    renderViewerStep();
    expect(screen.getByTestId('setup-preview-fallback')).toHaveAttribute('data-reason', 'no_webgl');
    expect(capture).toHaveBeenCalledWith('onboarding_preview_fallback_shown', { reason: 'no_webgl' });
  });

  it.each(['context_lost', 'chunk_failed'] as const)('reports %s once with the diagram for the mapping', (reason) => {
    const { rerender } = render(<SetupPreviewFallback mapping='trackpad' reason={reason} />);
    rerender(<SetupPreviewFallback mapping='alt' reason={reason} />);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith('onboarding_preview_fallback_shown', { reason });
    expect(screen.getByTestId('setup-preview-fallback')).toHaveTextContent('Orbit');
  });

  it('offers Try again when the chunk failed', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<SetupPreviewFallback mapping='tau' reason='chunk_failed' onRetry={onRetry} />);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('reports nothing when there is no live preview to fall back from', () => {
    render(<SetupPreviewFallback mapping='tau' />);
    expect(capture).not.toHaveBeenCalled();
  });
});
