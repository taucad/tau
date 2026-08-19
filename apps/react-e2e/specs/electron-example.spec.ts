import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import { expectResolvedElectronExternalization } from '../support/electron-vite-contract';
import { packageVersion } from '../support/package-version';
import { expectPublicRuntimeExample } from '../support/public-example-suite';
import { buildArtifactNames } from '../support/runtime-build-artifacts';

const appRoot = join(process.cwd(), 'examples/electron');
const electronViteBin = join(appRoot, 'node_modules/.bin/electron-vite');
const electronEnvironment = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);
electronEnvironment['NO_COLOR'] = '1';
electronEnvironment['FORCE_COLOR'] = '0';
electronEnvironment['TAU_PROJECT_ROOT'] = join(appRoot, 'workspace');

test.beforeAll(async ({ browserName: _browserName }) => {
  expect(packageVersion(appRoot, 'electron-vite')).toBe('6.0.0-beta.1');
  expect(packageVersion(appRoot, 'vite')).toBe('8.0.10');
  await expectResolvedElectronExternalization(appRoot);

  execFileSync(electronViteBin, ['build'], { cwd: appRoot, stdio: 'pipe' });

  const mainArtifacts = buildArtifactNames(join(appRoot, 'dist/main'));
  const rendererArtifacts = buildArtifactNames(join(appRoot, 'dist/renderer'));
  expect(mainArtifacts).toContain('index.js');
  expect(mainArtifacts.filter((name) => name.startsWith('kernel-host-') && name.endsWith('.js'))).toHaveLength(1);
  expect(rendererArtifacts.filter((name) => name.startsWith('kernel-host-'))).toHaveLength(0);
});

const exampleSuccessMessage = 'OpenSCAD rendered through @taucad/runtime in an Electron utility process.';
const workspaceEntryPath = join(appRoot, 'workspace/main.scad');

test('should render OpenSCAD through electron-vite 6 beta and Vite 8', async ({ browserName: _browserName }) => {
  const app = await electron.launch({ args: [appRoot], cwd: appRoot, env: electronEnvironment });

  try {
    const window = await app.firstWindow();
    await expectPublicRuntimeExample(window, {
      navigate: false,
      successMessage: exampleSuccessMessage,
    });
  } finally {
    await app.close();
  }
});

test('should re-render when an external writer edits the project file', async ({ browserName: _browserName }) => {
  const app = await electron.launch({ args: [appRoot], cwd: appRoot, env: electronEnvironment });
  const originalSource = readFileSync(workspaceEntryPath, 'utf8');

  try {
    const window = await app.firstWindow();
    await expectPublicRuntimeExample(window, {
      navigate: false,
      successMessage: exampleSuccessMessage,
    });

    // A raw node:fs write from outside the app entirely: the utility's `fromNodeFs`
    // watcher is the only thing that can carry it into a render. Typing into the
    // textarea is deliberately avoided — that flips the example into inline-source
    // mode permanently and would prove nothing about the disk arm.
    writeFileSync(workspaceEntryPath, `depth = 7;\n${originalSource}`, 'utf8');

    // A new customizer control can only appear from a fresh frame off disk.
    await expect(window.getByLabel('depth')).toHaveValue('7', { timeout: 120_000 });
    await expect(window.getByText(exampleSuccessMessage)).toBeVisible({ timeout: 120_000 });
  } finally {
    writeFileSync(workspaceEntryPath, originalSource, 'utf8');
    await app.close();
  }
});
