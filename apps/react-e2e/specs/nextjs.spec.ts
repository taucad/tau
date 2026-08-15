import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  expectCooperativeTimeoutRecovery,
  expectCylinderRender,
  expectRapidParameterChangesPublishLatestGeometry,
  getBrowserDeployment,
  openBrowserRuntime,
} from '../support/browser-runtime-suite';
import { packageVersion } from '../support/package-version';
import { expectRuntimeBuildArtifacts } from '../support/runtime-build-artifacts';

const appRoot = resolve(import.meta.dirname, '../apps/nextjs');

test.beforeAll(({ browserName: _browserName }, workerInfo) => {
  expect(packageVersion(appRoot, 'next')).toBe('15.5.22');
  const output = workerInfo.project.name === 'nextjs-isolated' ? '.next-isolated' : '.next-non-isolated';
  expectRuntimeBuildArtifacts(resolve(appRoot, `${output}/static/media`));
});

test('should publish the latest Replicad cylinder through Next.js 15 Webpack', async ({ page }, testInfo) => {
  await openBrowserRuntime(page, testInfo);
  await expectCylinderRender(page);
  await expectRapidParameterChangesPublishLatestGeometry(page);
});

test('should recover the same browser runtime after a cooperative wire timeout', async ({ page }, testInfo) => {
  test.skip(getBrowserDeployment(testInfo) !== 'non-isolated', 'Wire-notify is owned by non-isolated deployments.');
  await openBrowserRuntime(page, testInfo);
  await expectCooperativeTimeoutRecovery(page);
});
