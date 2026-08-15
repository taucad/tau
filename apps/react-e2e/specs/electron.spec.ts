import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import {
  expectCylinderRender,
  expectRapidParameterChangesPublishLatestGeometry,
} from '../support/browser-runtime-suite';
import { expectResolvedElectronExternalization } from '../support/electron-vite-contract';
import { packageVersion } from '../support/package-version';
import { expectRuntimeBuildArtifacts } from '../support/runtime-build-artifacts';

const appRoot = join(process.cwd(), 'apps/react-e2e/apps/electron');
const outputRoot = join(appRoot, 'dist');
const electronEnvironment = (): Record<string, string> => {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  environment['FORCE_COLOR'] = '0';
  environment['NO_COLOR'] = '1';
  environment['TAU_PROJECT_ROOT'] = join(appRoot, 'workspace');
  return environment;
};

test.beforeAll(async ({ browserName: _browserName }) => {
  expect(packageVersion(appRoot, 'electron-vite')).toBe('5.0.0');
  expect(packageVersion(appRoot, 'vite')).toBe('7.3.6');
  await expectResolvedElectronExternalization(appRoot);

  const electronViteBin = join(appRoot, 'node_modules/.bin/electron-vite');
  execFileSync(electronViteBin, ['build'], {
    cwd: appRoot,
    env: electronEnvironment(),
    stdio: 'pipe',
  });
  expectRuntimeBuildArtifacts(join(outputRoot, 'main'), join(outputRoot, 'renderer'));
});

test('should publish the latest Replicad cylinder through an Electron utility process', async ({
  browserName: _browserName,
}) => {
  const diagnostics: string[] = [];
  const app = await electron.launch({
    args: [appRoot],
    cwd: appRoot,
    env: electronEnvironment(),
  });

  try {
    const window = await app.firstWindow();
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible())).toBe(false);
    window.on('console', (message) => {
      diagnostics.push(`[renderer:${message.type()}] ${message.text()}`);
    });
    window.on('pageerror', (error) => {
      diagnostics.push(`[renderer:pageerror] ${error.message}`);
    });
    await expect(window.getByRole('heading', { name: 'Tau React Runtime E2E' })).toBeVisible();
    await expectCylinderRender(window);
    await expectRapidParameterChangesPublishLatestGeometry(window);
  } finally {
    if (test.info().status !== test.info().expectedStatus && diagnostics.length > 0) {
      await test.info().attach('electron-renderer-diagnostics', {
        body: diagnostics.join('\n'),
        contentType: 'text/plain',
      });
    }
    await app.close();
  }
});

test('should terminate a non-yielding utility while a sibling runtime remains usable', async ({
  browserName: _browserName,
}) => {
  const app = await electron.launch({
    args: [appRoot],
    cwd: appRoot,
    env: electronEnvironment(),
  });

  try {
    const window = await app.firstWindow();
    await expect(window.getByRole('heading', { name: 'Tau React Runtime E2E' })).toBeVisible();
    await expectCylinderRender(window);

    await window.getByRole('button', { name: 'Run blocking render' }).click();
    await expect(window.getByRole('status', { name: 'Timeout runtime status' })).toHaveText('running');
    await expect(window.getByRole('status', { name: 'Timeout runtime status' })).toHaveText('render timed out');
    await expect(window.getByRole('status', { name: 'Timeout runtime status' })).toHaveText(
      'runtime terminated after timeout',
    );
    await expect(window.getByRole('alert', { name: 'Timeout runtime error' })).toHaveCount(0);

    await expectRapidParameterChangesPublishLatestGeometry(window);
  } finally {
    await app.close();
  }
});
