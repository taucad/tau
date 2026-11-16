// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SetupLivePreviewProps } from '#components/onboarding/setup-live-preview.js';

const capture = vi.hoisted(() => vi.fn());
vi.mock('#hooks/use-analytics.js', () => ({ useAnalytics: () => ({ capture }) }));
const webgl = vi.hoisted(() => ({ isAvailable: true }));
vi.mock('#components/onboarding/webgl-support.js', () => ({ canCreateWebGl: () => webgl.isAvailable }));
const shown = vi.hoisted(() => ({ props: [] as SetupLivePreviewProps[] }));
vi.mock('#components/onboarding/setup-live-preview.js', () => ({
  default: (props: SetupLivePreviewProps) => {
    shown.props.push(props);
    return (
      <div data-testid='setup-live-preview'>
        <canvas data-testid='preview-canvas' />
      </div>
    );
  },
}));

const { SetupViewerPreview } = await import('#components/onboarding/setup-viewer-preview.js');

const renderPreview = () =>
  render(<SetupViewerPreview mapping='tau' cameraInput={{ preset: 'right-orbit' }} gizmoStyle='axes' isGizmoShown />);

describe('setup step 3 live preview', () => {
  beforeEach(() => {
    capture.mockReset();
    shown.props = [];
    webgl.isAvailable = true;
  });

  it('shows a placeholder in the final-size area, then the preview with the choices in effect', async () => {
    renderPreview();
    expect(screen.getByTestId('setup-viewer-preview')).toHaveClass('aspect-4/3');
    expect(screen.getByTestId('setup-preview-placeholder')).toHaveAttribute('role', 'status');
    expect(await screen.findByTestId('setup-live-preview')).toBeInTheDocument();
    expect(shown.props.at(-1)).toMatchObject({
      cameraInput: { preset: 'right-orbit' },
      gizmoStyle: 'axes',
      isGizmoShown: true,
    });
    expect(capture).not.toHaveBeenCalled();
  });

  it('falls back to the diagram on a lost context, reports it, and Try again brings the preview back', async () => {
    const user = userEvent.setup();
    renderPreview();
    await screen.findByTestId('setup-live-preview');
    act(() => {
      shown.props.at(-1)?.onContextLost();
    });
    expect(screen.getByTestId('setup-preview-fallback')).toHaveAttribute('data-reason', 'context_lost');
    expect(capture).toHaveBeenCalledWith('onboarding_preview_fallback_shown', { reason: 'context_lost' });

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('setup-live-preview')).toBeInTheDocument();
  });

  it('shows the diagram with no preview chunk when WebGL is unavailable', () => {
    webgl.isAvailable = false;
    renderPreview();
    expect(screen.getByTestId('setup-preview-fallback')).toHaveAttribute('data-reason', 'no_webgl');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(shown.props).toHaveLength(0);
  });
});
