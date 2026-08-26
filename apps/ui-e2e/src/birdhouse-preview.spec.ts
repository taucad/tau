import { describe, expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

describe('Birdhouse preview (TAU_DEBUG)', () => {
  test('navigates from the home page to the birdhouse preview and renders a non-empty glTF', async () => {
    await target.navigate('/');

    const communityHeading = selectors.getByRole('heading', { name: /from the community/i });
    await target.expectVisible(communityHeading, 30_000);
    await target.scrollIntoView(communityHeading);

    const birdhouseLink = selectors.getByRole('link', { name: /^preview birdhouse$/i });
    await target.expectVisible(birdhouseLink, 30_000);
    await target.click(birdhouseLink);
    await target.expectUrl(/\/examples\/proj_birdhouse$/u, 30_000);

    const canvas = selectors.getByRole('img', { name: /3d model preview/i });
    await target.expectVisible(canvas, 60_000);
    await target.expectHidden(selectors.getByRole('alert'));

    const debugPanel = selectors.getByTestId('preview-debug-panel');
    await target.expectVisible(debugPanel, 60_000);
    await target.expectVisible(selectors.getByTestId('bbox-viewer'), 60_000);

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
    expect(await positiveInt('count-primitives')).toBeGreaterThan(0);
    expect(await positiveInt('count-vertices')).toBeGreaterThan(0);
    expect(await positiveInt('count-triangles')).toBeGreaterThan(0);
    await target.expectText(selectors.getByTestId('asset-version'), '2.0');
  });
});
