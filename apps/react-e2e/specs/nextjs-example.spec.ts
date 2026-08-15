import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { packageVersion } from '../support/package-version';
import { expectPublicRuntimeExample } from '../support/public-example-suite';
import { expectRuntimeBuildArtifacts } from '../support/runtime-build-artifacts';

const appRoot = resolve(import.meta.dirname, '../../../examples/nextjs');

test.beforeAll(({ browserName: _browserName }) => {
  expect(packageVersion(appRoot, 'next')).toBe('16.3.0');
  expectRuntimeBuildArtifacts(resolve(appRoot, '.next/static/media'));
});

test('should render Replicad through Next.js 16 Turbopack', async ({ page }) => {
  await expectPublicRuntimeExample(page, {
    successMessage: 'Replicad rendered through @taucad/runtime in a Next.js Turbopack worker.',
  });
});
