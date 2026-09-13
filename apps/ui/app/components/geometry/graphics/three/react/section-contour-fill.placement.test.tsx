import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const stageSource = readFileSync(join(currentDirectory, '..', 'stage.tsx'), 'utf8');

describe('SectionContourFills placement (Architecture C)', () => {
  it('renders contour fills outside SectionClippingGroup in stage.tsx', () => {
    expect(stageSource.includes('<SectionContourFills')).toBe(true);

    const clippingOpen = stageSource.indexOf('<SectionClippingGroup');
    expect(clippingOpen).toBeGreaterThanOrEqual(0);

    const clippingCloseToken = '</SectionClippingGroup>';
    const clippingClose = stageSource.indexOf(clippingCloseToken, clippingOpen);
    expect(clippingClose).toBeGreaterThan(clippingOpen);

    const contourIndex = stageSource.indexOf('<SectionContourFills');
    expect(contourIndex).toBeGreaterThan(clippingClose);

    const legacyStencilProxies = ['Section', 'Stencil', 'Proxies'].join('');
    const legacyCapPlane = ['Section', 'Cap', 'Plane'].join('');
    expect(stageSource.includes(legacyStencilProxies)).toBe(false);
    expect(stageSource.includes(legacyCapPlane)).toBe(false);
  });
});
