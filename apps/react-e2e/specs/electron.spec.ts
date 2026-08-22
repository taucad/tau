import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import {
  expectCylinderRender,
  expectRapidParameterChangesPublishLatestGeometry,
} from '../support/browser-runtime-suite';
import {
  clickTarget,
  currentTargetSession,
  expectTargetCount,
  expectTargetInspection,
  expectTargetText,
  expectTargetVisible,
} from '../support/external-target';

test('should publish the latest Replicad cylinder through an Electron utility process', async () => {
  expectTargetInspection();
  const session = await currentTargetSession();
  expect(session.windowVisible).toBe(false);
  await expectTargetVisible(selectors.getByRole('heading', { name: 'Tau React Runtime E2E' }));
  await expectCylinderRender();
  await expectRapidParameterChangesPublishLatestGeometry();
});

test('should terminate a non-yielding utility while a sibling runtime remains usable', async () => {
  await expectTargetVisible(selectors.getByRole('heading', { name: 'Tau React Runtime E2E' }));
  await expectCylinderRender();

  await clickTarget(selectors.getByRole('button', { name: 'Run blocking render' }));
  const status = selectors.getByRole('status', { name: 'Timeout runtime status' });
  await expectTargetText(status, 'running');
  await expectTargetText(status, 'render timed out');
  await expectTargetText(status, 'runtime terminated after timeout');
  await expectTargetCount(selectors.getByRole('alert', { name: 'Timeout runtime error' }), 0);

  await expectRapidParameterChangesPublishLatestGeometry();
});
