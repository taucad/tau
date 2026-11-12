// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const capture = vi.hoisted(() => vi.fn());
const chunk = vi.hoisted(() => ({ loads: 0 }));
vi.mock('#hooks/use-analytics.js', () => ({ useAnalytics: () => ({ capture }) }));
vi.mock('#components/onboarding/webgl-support.js', () => ({ canCreateWebGl: () => true }));
vi.mock('#components/onboarding/setup-live-preview.js', () => {
  chunk.loads += 1;
  if (chunk.loads === 1) {
    throw new Error('Failed to fetch dynamically imported module');
  }
  return { default: () => <div data-testid='setup-live-preview' /> };
});

const { SetupViewerPreview } = await import('#components/onboarding/setup-viewer-preview.js');

describe('setup step 3 when the preview chunk does not load', () => {
  it('shows the diagram with Try again, reports chunk_failed, and Try again loads the chunk afresh', async () => {
    const user = userEvent.setup();
    render(<SetupViewerPreview mapping='alt' cameraInput={{ preset: 'alt' }} gizmoStyle='cube' isGizmoShown />);
    const fallback = await screen.findByTestId('setup-preview-fallback');
    expect(fallback).toHaveAttribute('data-reason', 'chunk_failed');
    expect(capture).toHaveBeenCalledWith('onboarding_preview_fallback_shown', { reason: 'chunk_failed' });
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('setup-live-preview')).toBeInTheDocument();
    expect(screen.queryByTestId('setup-preview-fallback')).not.toBeInTheDocument();
  });
});
