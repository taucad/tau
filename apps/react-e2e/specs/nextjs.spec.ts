import { test } from 'vitest';
import {
  expectCooperativeTimeoutRecovery,
  expectCylinderRender,
  expectRapidParameterChangesPublishLatestGeometry,
  getBrowserDeployment,
  openBrowserRuntime,
} from '../support/browser-runtime-suite';
import { expectTargetInspection } from '../support/external-target';

test('should publish the latest Replicad cylinder through Next.js 15 Webpack', async () => {
  expectTargetInspection();
  await openBrowserRuntime();
  await expectCylinderRender();
  await expectRapidParameterChangesPublishLatestGeometry();
});

test('should recover the same browser runtime after a cooperative wire timeout', async ({ skip }) => {
  skip(getBrowserDeployment() !== 'non-isolated', 'Wire-notify is owned by non-isolated deployments.');
  await openBrowserRuntime();
  await expectCooperativeTimeoutRecovery();
});
