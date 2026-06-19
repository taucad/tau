import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TooltipProvider } from '#components/ui/tooltip.js';
import { KeyboardProvider } from '#hooks/use-keyboard.js';
import { PublicationViewerPane } from '#routes/v.$id/publication-viewer-pane.js';

vi.mock('#components/cad-preview.js', () => ({
  CadPreviewViewer: () => <div data-slot='cad-preview-viewer-stub' />,
  CadPreviewStatus: () => <div data-slot='cad-preview-status-stub' />,
}));

vi.mock('#components/cad/ar-button.js', () => ({
  ArButton: () => (
    <button type='button' data-slot='ar-button-stub'>
      AR
    </button>
  ),
}));

vi.mock('@xstate/react', () => ({
  useSelector: vi.fn(() => undefined),
}));

vi.mock('#hooks/use-cad-preview.js', () => ({
  useCadPreview: () => ({
    cadRef: {},
    geometries: [],
  }),
}));

const requestFullscreenStub = vi.fn(async () => undefined);

const renderViewerPane = (): ReturnType<typeof render> =>
  render(
    <KeyboardProvider>
      <TooltipProvider>
        <PublicationViewerPane />
      </TooltipProvider>
    </KeyboardProvider>,
  );

describe('PublicationViewerPane', () => {
  it('renders a Model preview region with the cad viewer + status overlay', () => {
    renderViewerPane();
    expect(screen.getByRole('region', { name: 'Model preview' })).toBeDefined();
    expect(document.querySelector('[data-slot="cad-preview-viewer-stub"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="cad-preview-status-stub"]')).not.toBeNull();
  });

  it('mounts the AR button and the fullscreen toggle', () => {
    renderViewerPane();
    expect(document.querySelector('[data-slot="ar-button-stub"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: /fullscreen/iu })).toBeDefined();
  });

  it('toggles fullscreen when the F key is pressed', () => {
    requestFullscreenStub.mockClear();
    // oxlint-disable-next-line no-extend-native -- jsdom Fullscreen API stub
    Element.prototype.requestFullscreen = requestFullscreenStub as unknown as Element['requestFullscreen'];

    renderViewerPane();

    globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }));

    expect(requestFullscreenStub).toHaveBeenCalledTimes(1);
  });
});
