import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import process from 'node:process';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, expect, test } from '@playwright/test';
import type { Browser } from '@playwright/test';
import { expectCylinderRender } from '../support/browser-runtime-suite';
import { packageVersion } from '../support/package-version';
import { expectPublicRuntimeExample } from '../support/public-example-suite';

const developmentApps = {
  'electron-development': {
    electronVite: '5.0.0',
    port: 9225,
    root: resolve(import.meta.dirname, '../apps/electron'),
    vite: '7.3.6',
  },
  'electron-example-development': {
    electronVite: '6.0.0-beta.1',
    port: 9226,
    root: resolve(import.meta.dirname, '../../../examples/electron'),
    vite: '8.0.10',
  },
} as const;

type DevelopmentAppName = keyof typeof developmentApps;

const output = (child: ChildProcess): string[] => {
  const lines: string[] = [];
  child.stdout?.setEncoding('utf8').on('data', (chunk: string) => lines.push(chunk));
  child.stderr?.setEncoding('utf8').on('data', (chunk: string) => lines.push(chunk));
  return lines;
};

const waitForCdp = async (child: ChildProcess, port: number, logs: string[]): Promise<string> => {
  const endpoint = `http://127.0.0.1:${port}`;
  await expect
    .poll(
      async () => {
        if (child.exitCode !== null) {
          throw new Error(`electron-vite exited with ${child.exitCode} before CDP was ready.\n${logs.join('')}`);
        }

        try {
          const response = await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(1000) });
          return response.ok;
        } catch {
          return false;
        }
      },
      { intervals: [250], timeout: 180_000 },
    )
    .toBe(true);
  return endpoint;
};

const connectToCdp = async (endpoint: string): Promise<Browser> => {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      /* oxlint-disable-next-line typescript/no-deprecated -- Electron development exposes its renderer through CDP. */
      /* oxlint-disable-next-line eslint/no-await-in-loop -- CDP connection retries must be sequential. */
      return await chromium.connectOverCDP(endpoint, { timeout: 30_000 });
    } catch (error) {
      lastError = error;
      /* oxlint-disable-next-line eslint/no-await-in-loop -- back off before the next sequential CDP attempt. */
      await delay(250);
    }
  }
  throw lastError;
};

const stopProcess = async (child: ChildProcess): Promise<void> => {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  const exited = (async (): Promise<boolean> => {
    await once(child, 'exit');
    return true;
  })();
  const send = (signal: NodeJS.Signals): boolean => {
    try {
      if (process.platform !== 'win32' && child.pid) {
        process.kill(-child.pid, signal);
      } else {
        child.kill(signal);
      }
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
        throw error;
      }
      return false;
    }
  };

  if (!send('SIGTERM')) {
    return;
  }
  const stopped = await Promise.race([exited, delay(5000, false)]);
  if (!stopped && send('SIGKILL')) {
    await Promise.race([exited, delay(5000, false)]);
  }
};

test('should render non-empty geometry through electron-vite development', async ({
  browserName: _browserName,
}, testInfo) => {
  const projectName = testInfo.project.name;
  if (!Object.hasOwn(developmentApps, projectName)) {
    throw new TypeError(`Unknown Electron development project: ${projectName}`);
  }
  const name = projectName as DevelopmentAppName;
  const app = developmentApps[name];

  expect(packageVersion(app.root, 'electron-vite')).toBe(app.electronVite);
  expect(packageVersion(app.root, 'vite')).toBe(app.vite);

  const environment = { ...process.env };
  environment['FORCE_COLOR'] = '0';
  environment['NO_COLOR'] = '1';
  environment['TAU_PROJECT_ROOT'] = resolve(app.root, 'workspace');
  const child = spawn(
    resolve(app.root, 'node_modules/.bin/electron-vite'),
    ['--remoteDebuggingPort', String(app.port)],
    {
      cwd: app.root,
      detached: process.platform !== 'win32',
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const logs = output(child);
  let browser: Browser | undefined;

  try {
    await once(child, 'spawn');
    browser = await connectToCdp(await waitForCdp(child, app.port, logs));
    const page = browser
      .contexts()
      .flatMap((context) => context.pages())
      .find((candidate) => !candidate.url().startsWith('devtools://'));
    if (!page) {
      throw new Error(`Electron exposed CDP without a renderer page.\n${logs.join('')}`);
    }

    if (name === 'electron-development') {
      await expect(page.getByRole('heading', { name: 'Tau React Runtime E2E' })).toBeVisible();
      await expectCylinderRender(page);
    } else {
      await expectPublicRuntimeExample(page, {
        navigate: false,
        successMessage: 'OpenSCAD rendered through @taucad/runtime in an Electron utility process.',
      });
    }
  } catch (error) {
    if (logs.length > 0) {
      await testInfo.attach('electron-vite-development-output', {
        body: logs.join(''),
        contentType: 'text/plain',
      });
    }
    throw error;
  } finally {
    await browser?.close();
    await stopProcess(child);
  }
});
