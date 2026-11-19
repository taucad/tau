// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

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
  /* PL7 FP9 (D17): a module that failed to load fails again for the life of the page, so the diagram offers no Try
     again that could never load it. */
  it('shows the diagram without Try again and reports chunk_failed', async () => {
    render(<SetupViewerPreview mapping='alt' cameraInput={{ preset: 'alt' }} gizmoStyle='cube' isGizmoShown />);
    const fallback = await screen.findByTestId('setup-preview-fallback');
    expect(fallback).toHaveAttribute('data-reason', 'chunk_failed');
    expect(capture).toHaveBeenCalledWith('onboarding_preview_fallback_shown', { reason: 'chunk_failed' });
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.queryByTestId('setup-live-preview')).toBeNull();
  });
});
