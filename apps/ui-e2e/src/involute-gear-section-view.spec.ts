import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

type SectionViewBridge = {
  setSectionView(state: {
    plane: 'xy' | 'xz' | 'yz';
    direction?: 1 | -1;
    pivot?: readonly [number, number, number];
  }): void;
  getSectionCapCompleteness():
    | {
        status: 'complete';
        trueCutComponentCount: number;
        cappedTrueCutComponentCount: number;
        unresolvedTrueCutEdgeCount: number;
        unsupportedSourceCount: number;
      }
    | { status: 'unsupported' | 'failed' }
    | undefined;
};

test('repaired involute gear produces a complete section snapshot', async () => {
  await target.navigate('/s/builtin~jscad.gear?graphicsBackend=webgl');
  await target.expectVisible(selectors.getByCss('canvas[data-engine]'), 60_000);
  await target.expectGraphicsBackend('webgl');
  await target.expectGeometryFramed();

  await target.evaluate(() => {
    const bridge = (globalThis as { __TAU_SECTION_VIEW_TEST__?: SectionViewBridge }).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Section view e2e bridge is not installed.');
    }
    bridge.setSectionView({ plane: 'xy', direction: 1, pivot: [0, 0, 0.004] });
  });
  await target.delay(750);

  const completeness = await target.evaluate(() => {
    const bridge = (globalThis as { __TAU_SECTION_VIEW_TEST__?: SectionViewBridge }).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Section view e2e bridge is not installed.');
    }
    return bridge.getSectionCapCompleteness();
  });
  expect(completeness?.status, JSON.stringify(completeness)).toBe('complete');
  if (completeness?.status !== 'complete') {
    return;
  }
  expect(completeness.trueCutComponentCount).toBeGreaterThan(0);
  expect(completeness.cappedTrueCutComponentCount).toBe(completeness.trueCutComponentCount);
  expect(completeness.unresolvedTrueCutEdgeCount).toBe(0);
  expect(completeness.unsupportedSourceCount).toBe(0);
});
