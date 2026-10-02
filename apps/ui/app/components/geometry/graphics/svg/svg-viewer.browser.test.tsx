/* oxlint-disable eslint/no-await-in-loop -- Wheel turns must advance the same live panzoom instance in order. */
import '#styles/global.css';
import { render, screen } from '@testing-library/react';
import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import type { KnownArtifact } from '@taucad/runtime';

vi.mock('#hooks/use-graphics.js', () => ({
  useGraphics: () => ({ send: () => undefined, on: () => ({ unsubscribe: () => undefined }) }),
  useGraphicsSelector: <T,>(
    selector: (state: { context: { gridSizes: { largeSize: number; smallSize: number } } }) => T,
  ): T => selector({ context: { gridSizes: { largeSize: 10, smallSize: 1 } } }),
}));
vi.mock('#hooks/use-theme.js', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- mirrors the public Theme enum.
  Theme: { LIGHT: 'light' },
  useTheme: () => ({ theme: 'light' }),
}));

const { SvgViewer } = await import('#components/geometry/graphics/svg/svg-viewer.js');
const copper: Extract<KnownArtifact, { mimeType: 'image/svg+xml' }> = {
  mimeType: 'image/svg+xml',
  content:
    '<svg viewBox="0 0 100 100"><style>body { background: rgb(255, 0, 255) } .copper { fill: rgb(181, 94, 42) }</style><rect class="copper" x="20" y="20" width="60" height="60"/></svg>',
};

describe('SVG viewer in Chromium', () => {
  it('keeps authored CSS in the shadow root and renders copper through zoom', async () => {
    await page.viewport(720, 600);
    const bodyBackground = getComputedStyle(document.body).backgroundColor;
    render(
      <div data-testid='frame' style={{ width: 480, height: 480 }}>
        <SvgViewer artifact={copper} enableGrid={false} enableAxes={false} />
      </div>,
    );
    const host = await screen.findByTestId('svg-viewer-host');
    const shadow = host.shadowRoot;
    expect(shadow).not.toBeNull();
    expect(shadow?.querySelector('style')?.textContent).toContain('body { background');
    expect(getComputedStyle(document.body).backgroundColor).toBe(bodyBackground);
    const rectangle = shadow?.querySelector('.copper');
    if (!rectangle) {
      throw new Error('Expected the authored copper shape');
    }
    // oxlint-disable-next-line tau-lint/no-hardcoded-color -- Browser assertion checks the authored fixture color survives sanitization.
    expect(getComputedStyle(rectangle).fill).toBe('rgb(181, 94, 42)');

    const canvas = shadow?.querySelector('div');
    expect(canvas).not.toBeNull();
    for (let turn = 0; turn < 15; turn += 1) {
      canvas?.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -1 }));
      await new Promise((resolve) => {
        setTimeout(resolve, 120);
      });
    }
    const panzoomRoot = shadow?.querySelector('#panzoom-root');
    const transform = panzoomRoot instanceof SVGElement ? panzoomRoot.style.transform : '';
    expect(transform).toContain('scale(');
    expect(Number(/scale\(([^)]+)\)/.exec(transform)?.[1])).toBeGreaterThan(3.5);
    const screenshot = await page.screenshot({
      element: screen.getByTestId('frame'),
      path: '../../../../../../../out/tscircuit-closeout/svg-copper-zoom.png',
    });
    expect(screenshot).toContain('svg-copper-zoom.png');
  });
});
