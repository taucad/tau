import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { viewportRenderTiers } from '#components/geometry/graphics/three/utils/render-order.utils.js';

const currentDirectory = dirname(fileURLToPath(import.meta.url));

describe('viewportRenderTiers', () => {
  it('should use finite safe integers in explicit section-helper order', () => {
    const values = Object.values(viewportRenderTiers);

    for (const value of values) {
      expect(Number.isSafeInteger(value)).toBe(true);
      expect(Number.isFinite(value)).toBe(true);
    }

    expect(viewportRenderTiers.model).toBeLessThan(viewportRenderTiers.sectionCapFill);
    expect(viewportRenderTiers.sectionCapFill).toBeLessThan(viewportRenderTiers.sectionContourOutline);
    expect(viewportRenderTiers.sectionContourOutline).toBeLessThan(viewportRenderTiers.sectionControlBody);
    expect(viewportRenderTiers.sectionControlBody).toBeLessThan(viewportRenderTiers.sectionControlLabel);
    expect(viewportRenderTiers.sectionControlLabel).toBeLessThan(viewportRenderTiers.sectionTransformControl);
    expect(viewportRenderTiers.sectionTransformControl).toBeLessThan(viewportRenderTiers.viewportGizmo);
  });

  it('should keep section-view render paths off unsafe topmost arithmetic', () => {
    const files = [
      join(currentDirectory, '..', 'react', 'section-contour-fill.tsx'),
      join(currentDirectory, '..', 'react', 'section-view-controls.tsx'),
      join(currentDirectory, '..', 'controls', 'transform-controls.ts'),
    ];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source.includes('topMostRenderOrder')).toBe(false);
      expect(source.includes('Number.MAX_SAFE_INTEGER')).toBe(false);
    }
  });
});
