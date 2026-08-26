import { test } from 'vitest';
import { expectCylinderRender, openBrowserRuntime } from '../support/browser-runtime-suite';
import { currentReactTarget, expectTargetInspection } from '../support/external-target';
import { expectPublicRuntimeExample } from '../support/public-example-suite';

test('should render non-empty geometry through the framework development server', async () => {
  expectTargetInspection();
  const { metadata } = currentReactTarget();

  if (!metadata.example) {
    await openBrowserRuntime();
    await expectCylinderRender();
    return;
  }

  await expectPublicRuntimeExample({ successMessage: metadata.successMessage ?? '' });
});
