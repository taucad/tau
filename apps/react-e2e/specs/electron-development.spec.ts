import { test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import { expectCylinderRender } from '../support/browser-runtime-suite';
import { currentReactTarget, expectTargetInspection, expectTargetVisible } from '../support/external-target';
import { expectPublicRuntimeExample } from '../support/public-example-suite';

test('should render non-empty geometry through electron-vite development', async () => {
  expectTargetInspection();
  const { metadata } = currentReactTarget();
  if (!metadata.example) {
    await expectTargetVisible(selectors.getByRole('heading', { name: 'Tau React Runtime E2E' }));
    await expectCylinderRender();
    return;
  }
  await expectPublicRuntimeExample({
    navigate: false,
    successMessage: metadata.successMessage ?? '',
  });
});
