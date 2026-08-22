import { test } from 'vitest';
import {
  expectCooperativeTimeoutRecovery,
  expectCylinderRender,
  expectHardTimeoutTermination,
  expectRapidParameterChangesPublishLatestGeometry,
  getBrowserDeployment,
  openBrowserRuntime,
} from '../support/browser-runtime-suite';
import { currentReactTarget, expectTargetInspection } from '../support/external-target';

test('should publish the latest Replicad cylinder through React Router and Vite', async () => {
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

test('should terminate a blocking browser runtime without affecting its sibling', async ({ skip }) => {
  skip(
    currentReactTarget().id !== 'react-router-non-isolated',
    'The browser Worker termination contract has one canonical framework owner.',
  );
  await openBrowserRuntime();
  await expectCylinderRender();
  await expectHardTimeoutTermination();
  await expectRapidParameterChangesPublishLatestGeometry();
});
