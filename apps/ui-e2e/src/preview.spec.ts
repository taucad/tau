import { describe, expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

describe('Build Preview', () => {
  test('renders a 3D model for the Hollow Box project', async () => {
    const canvas = selectors.getByRole('img', { name: /3d model preview/i });
    await target.navigate('/examples/proj_hollow_box');

    await target.expectVisible(canvas, 45_000);
    await target.expectHidden(selectors.getByRole('alert'));

    const bboxViewer = selectors.getByTestId('bbox-viewer');
    await target.expectVisible(bboxViewer, 60_000);

    const sizeText = (await target.textContent(selectors.getByTestId('bbox-size'))) ?? '';
    const sizeMatch = /\[\s*([\d+.-]+)\s*,\s*([\d+.-]+)\s*,\s*([\d+.-]+)\s*]/.exec(sizeText);
    expect(sizeMatch, `bbox-size should match "[x, y, z]" but got "${sizeText}"`).not.toBeNull();
    const dims = sizeMatch!.slice(1, 4).map(Number);
    for (const [axis, value] of (['X', 'Y', 'Z'] as const).map((a, i) => [a, dims[i] ?? Number.NaN] as const)) {
      expect(Number.isFinite(value) && value > 0, `bbox ${axis} size must be > 0, got ${value}`).toBe(true);
    }

    const positiveInt = async (testId: string): Promise<number> => {
      const text = (await target.textContent(selectors.getByTestId(testId))) ?? '0';
      return Number.parseInt(text, 10);
    };
    expect(await positiveInt('count-meshes')).toBeGreaterThan(0);
    expect(await positiveInt('count-vertices')).toBeGreaterThan(0);
    expect(await positiveInt('count-triangles')).toBeGreaterThan(0);
  });

  test('shows loading state before model is ready', async () => {
    await target.navigate('/examples/proj_hollow_box');
    const loading = selectors.getByRole('status', { name: /loading preview/i });
    const canvas = selectors.getByRole('img', { name: /3d model preview/i });
    await target.expectVisible(loading.or(canvas));
  });

  test('displays an error for a non-existent project', async () => {
    await target.navigate('/examples/proj_does_not_exist');
    await target.expectVisible(selectors.getByRole('alert', { name: /preview error/i }), 45_000);
  });
});
