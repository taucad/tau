import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import { expectCylinderRender, expectParameterUpdateChangesGeometry } from '../support/browser-runtime-suite';

const repoRoot = process.cwd();
const appRoot = join(process.cwd(), 'apps/react-e2e/apps/electron');
const electronViteBin = join(repoRoot, 'node_modules/.bin/electron-vite');

test.beforeAll(() => {
  execFileSync(electronViteBin, ['build'], {
    cwd: appRoot,
    stdio: 'pipe',
  });
});

test('renders and updates a Replicad cylinder through Electron utility process', async () => {
  const diagnostics: string[] = [];
  const app = await electron.launch({
    args: [appRoot],
    cwd: appRoot,
    env: {
      ...process.env,
      NO_COLOR: '1',
      FORCE_COLOR: '0',
      TAU_PROJECT_ROOT: join(appRoot, 'workspace'),
    },
  });

  try {
    const window = await app.firstWindow();
    window.on('console', (message) => {
      diagnostics.push(`[renderer:${message.type()}] ${message.text()}`);
    });
    window.on('pageerror', (error) => {
      diagnostics.push(`[renderer:pageerror] ${error.message}`);
    });
    await expect(window.getByRole('heading', { name: 'Tau React Runtime E2E' })).toBeVisible();
    await expectCylinderRender(window);
    await expectParameterUpdateChangesGeometry(window);
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
