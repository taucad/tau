// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const capture = vi.hoisted(() => vi.fn());
vi.mock('#hooks/use-analytics.js', () => ({ useAnalytics: () => ({ capture }) }));
vi.mock('#components/onboarding/webgl-support.js', () => ({ canCreateWebGl: () => true }));
vi.mock('#components/onboarding/setup-live-preview.js', () => {
  throw new Error('Failed to fetch dynamically imported module');
});

const { SetupViewerPreview } = await import('#components/onboarding/setup-viewer-preview.js');

describe('setup step 3 when the preview chunk does not load (S5 f)', () => {
  it('shows the diagram with Try again and reports chunk_failed', async () => {
    render(<SetupViewerPreview mapping='alt' cameraInput={{ preset: 'alt' }} gizmoStyle='cube' isGizmoShown />);
    const fallback = await screen.findByTestId('setup-preview-fallback');
    expect(fallback).toHaveAttribute('data-reason', 'chunk_failed');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(capture).toHaveBeenCalledWith('onboarding_preview_fallback_shown', { reason: 'chunk_failed' });
  });
});
