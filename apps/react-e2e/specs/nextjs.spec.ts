import { test } from '@playwright/test';
import { expectCylinderRender, expectParameterUpdateChangesGeometry } from '../support/browser-runtime-suite';

test('renders and updates a Replicad cylinder through Next.js Turbopack', async ({ page }) => {
  await page.goto('/');
  await expectCylinderRender(page);
  await expectParameterUpdateChangesGeometry(page);
});
