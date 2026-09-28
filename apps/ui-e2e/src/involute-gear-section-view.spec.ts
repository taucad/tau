import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

type SectionCapCompleteness =
  | {
      status: 'complete';
      admittedSourceCount: number;
      trueCutComponentCount: number;
      cappedTrueCutComponentCount: number;
      unresolvedTrueCutEdgeCount: number;
      unsupportedSourceCount: number;
    }
  | { status: 'unsupported' | 'failed' };

type SectionViewBridge = {
  setSectionCuts(
    cuts: ReadonlyArray<{ kind: 'plane'; plane: 'xy' | 'xz' | 'yz'; offset: number; isFlipped: boolean }>,
  ): void;
  getSectionCapCompleteness(): SectionCapCompleteness | undefined;
};

const readCompleteness = async (): Promise<SectionCapCompleteness | undefined> =>
  target.evaluate(() => {
    const bridge = (globalThis as { __TAU_SECTION_VIEW_TEST__?: SectionViewBridge }).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Section view e2e bridge is not installed.');
    }
    return bridge.getSectionCapCompleteness();
  });

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
    bridge.setSectionCuts([{ kind: 'plane', plane: 'xy', offset: 0.004, isFlipped: false }]);
  });

  // While the gear's section analysis is pending the caps certify the cut without it, as complete with no sources.
  await expect
    .poll(
      async () => {
        const polled = await readCompleteness();
        return polled?.status === 'complete' && polled.admittedSourceCount === 0
          ? 'complete without sources'
          : polled?.status;
      },
      { timeout: 30_000 },
    )
    .toBe('complete');
  const completeness = await readCompleteness();
  if (completeness?.status !== 'complete') {
    throw new Error(`Section caps are incomplete: ${JSON.stringify(completeness)}`);
  }
  expect(completeness.trueCutComponentCount).toBeGreaterThan(0);
  expect(completeness.cappedTrueCutComponentCount).toBe(completeness.trueCutComponentCount);
  expect(completeness.unresolvedTrueCutEdgeCount).toBe(0);
  expect(completeness.unsupportedSourceCount).toBe(0);
});
