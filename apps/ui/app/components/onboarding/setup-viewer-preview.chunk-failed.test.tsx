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
  it('degrades to the diagram, reports chunk_failed, and offers no Try again the page could never honour', async () => {
    render(<SetupViewerPreview mapping='alt' cameraInput={{ preset: 'alt' }} gizmoStyle='cube' isGizmoShown />);
    const fallback = await screen.findByTestId('setup-preview-fallback');
    expect(fallback).toHaveAttribute('data-reason', 'chunk_failed');
    expect(capture).toHaveBeenCalledWith('onboarding_preview_fallback_shown', { reason: 'chunk_failed' });
    // A browser keeps a module that failed to load failed for the page's life (PL7 staging defects FP9, D17).
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(chunk.loads).toBe(1);
  });
});
