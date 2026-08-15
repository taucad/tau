import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  expectCooperativeTimeoutRecovery,
  expectCylinderRender,
  expectHardTimeoutTermination,
  expectRapidParameterChangesPublishLatestGeometry,
  getBrowserDeployment,
  openBrowserRuntime,
} from '../support/browser-runtime-suite';
import { packageVersion } from '../support/package-version';
import { expectRuntimeBuildArtifacts } from '../support/runtime-build-artifacts';

const appRoot = resolve(import.meta.dirname, '../apps/react-router');

test.beforeAll(({ browserName: _browserName }, workerInfo) => {
  expect(packageVersion(appRoot, 'react-router')).toBe('7.18.2');
  expect(packageVersion(appRoot, '@react-router/dev')).toBe('7.18.2');
  expect(packageVersion(appRoot, 'vite')).toBe('7.3.6');
  const output = workerInfo.project.name === 'react-router-isolated' ? 'build-isolated' : 'build-non-isolated';
  expectRuntimeBuildArtifacts(resolve(appRoot, `${output}/client/assets`));
});

test('should publish the latest Replicad cylinder through React Router and Vite', async ({ page }, testInfo) => {
  await openBrowserRuntime(page, testInfo);
  await expectCylinderRender(page);
  await expectRapidParameterChangesPublishLatestGeometry(page);
});

test('should recover the same browser runtime after a cooperative wire timeout', async ({ page }, testInfo) => {
  test.skip(getBrowserDeployment(testInfo) !== 'non-isolated', 'Wire-notify is owned by non-isolated deployments.');
  await openBrowserRuntime(page, testInfo);
  await expectCooperativeTimeoutRecovery(page);
});

test('should terminate a blocking browser runtime without affecting its sibling', async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== 'react-router-non-isolated',
    'The browser Worker termination contract has one canonical framework owner.',
  );
  await openBrowserRuntime(page, testInfo);
  await expectCylinderRender(page);
  await expectHardTimeoutTermination(page);
  await expectRapidParameterChangesPublishLatestGeometry(page);
});
