import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { packageVersion } from '../support/package-version';
import { expectPublicRuntimeExample } from '../support/public-example-suite';
import { expectRuntimeBuildArtifacts } from '../support/runtime-build-artifacts';

const appRoot = resolve(import.meta.dirname, '../../../examples/react-router');

test.beforeAll(({ browserName: _browserName }) => {
  expect(packageVersion(appRoot, 'react-router')).toBe('8.3.0');
  expect(packageVersion(appRoot, '@react-router/dev')).toBe('8.3.0');
  expect(packageVersion(appRoot, 'vite')).toBe('8.0.10');
  expectRuntimeBuildArtifacts(resolve(appRoot, 'build/client/assets'));
});

test('should render Replicad through React Router 8 and Vite 8', async ({ page }) => {
  await expectPublicRuntimeExample(page, {
    successMessage: 'Replicad rendered through @taucad/runtime in a React Router Vite worker.',
  });
});
