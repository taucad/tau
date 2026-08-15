import { test } from '@playwright/test';
import { expectCylinderRender, openBrowserRuntime } from '../support/browser-runtime-suite';
import { expectPublicRuntimeExample } from '../support/public-example-suite';

test('should render non-empty geometry through the framework development server', async ({ page }, testInfo) => {
  const { name } = testInfo.project;

  if (name === 'react-router-development' || name === 'nextjs-development') {
    await openBrowserRuntime(page, testInfo);
    await expectCylinderRender(page);
    return;
  }

  const successMessage =
    name === 'react-router-example-development'
      ? 'Replicad rendered through @taucad/runtime in a React Router Vite worker.'
      : 'Replicad rendered through @taucad/runtime in a Next.js Turbopack worker.';

  await expectPublicRuntimeExample(page, { successMessage });
});
