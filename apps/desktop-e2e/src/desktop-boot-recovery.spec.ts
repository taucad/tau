/* eslint-disable @typescript-eslint/naming-convention -- Environment variables retain their wire names. */
/**
 * T-R12.12 (R12, B17, B19): boot health, safe mode and the recovery window, through the real shell.
 *
 * These rows need no account and no API: each launch is driven with Playwright's `_electron` directly, over a profile
 * of its own, because the shared harness waits for the app's own page to load and several rows here are about a page
 * that never does. Watchdog deadlines are shortened with `TAU_E2E_BOOT_DEADLINE_SCALE`.
 */
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { _electron as electron } from 'playwright';
import type { ElectronApplication, Page } from 'playwright';
import { afterEach, describe, expect, it } from 'vitest';

const workspaceRoot = resolve(import.meta.dirname, '../../..');
const desktopRoot = join(workspaceRoot, 'apps/desktop');
const builtClientRoot = process.env['TAU_DESKTOP_CLIENT_ROOT'] ?? join(workspaceRoot, 'apps/ui/desktop/build/client');
/** 45 s and 60 s become 0.9 s and 1.2 s. */
const deadlineScale = '0.02';

type Ledger = {
  readonly build: string;
  readonly unhealthyCount: number;
  readonly last?: { readonly mode: string; readonly stage: string; readonly ended?: string };
};

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    // oxlint-disable-next-line no-await-in-loop -- tear down in reverse launch order.
    await cleanup().catch(() => undefined);
  }
});

const profile = async (): Promise<string> => {
  const userData = await mkdtemp(join(tmpdir(), 'tau-desktop-boot-recovery-'));
  cleanups.push(async () => rm(userData, { recursive: true, force: true }));
  return userData;
};

const launch = async (
  userData: string,
  options: { clientRoot?: string; args?: readonly string[]; env?: Readonly<Record<string, string>> } = {},
): Promise<ElectronApplication> => {
  const application = await electron.launch({
    args: [desktopRoot, `--user-data-dir=${userData}`, ...(options.args ?? [])],
    cwd: desktopRoot,
    env: {
      ...(process.env as Record<string, string>),
      NODE_ENV: 'production',
      TAU_API_URL: 'http://127.0.0.1:9',
      TAU_WEBSOCKET_URL: 'ws://127.0.0.1:9',
      TAU_FRONTEND_URL: 'http://127.0.0.1:9',
      TAU_DESKTOP_CLIENT_ROOT: options.clientRoot ?? builtClientRoot,
      TAU_CONFIG_DIR: join(userData, 'config'),
      TAU_E2E_HIDE_WINDOW: '1',
      TAU_E2E_BOOT_DEADLINE_SCALE: deadlineScale,
      ...options.env,
    },
  });
  cleanups.push(async () => {
    await application.close();
  });
  return application;
};

const readLedger = async (userData: string): Promise<Ledger> =>
  JSON.parse(await readFile(join(userData, 'boot-health.json'), 'utf8')) as Ledger;

const lastStage = async (userData: string): Promise<string | undefined> => {
  const ledger = await readLedger(userData);
  return ledger.last?.stage;
};

const quit = async (application: ElectronApplication): Promise<void> => {
  const closed = application.waitForEvent('close');
  await application.evaluate(({ app }) => {
    app.quit();
  });
  await closed;
};

/**
 * Replace `app.relaunch` with a recorder that writes the arguments it was given to `target`, so they outlive the
 * process the restart then quits.
 */
const recordRelaunch = async (application: ElectronApplication, target: string): Promise<void> => {
  await application.evaluate(({ app }, path) => {
    const { writeFileSync } = process.getBuiltinModule('node:fs');
    app.relaunch = (options) => {
      writeFileSync(path, JSON.stringify(options?.args ?? []));
    };
  }, target);
};

const readRelaunch = async (target: string): Promise<string[]> =>
  JSON.parse(await readFile(target, 'utf8')) as string[];

/* The switches a recorded relaunch adds to what `launch` and Playwright already pass. */
const relaunchedSwitches = (recorded: readonly string[]): string[] =>
  recorded.filter(
    (value) => value.startsWith('--') && !/^--(?:user-data-dir|inspect|remote-debugging-port)(?:=|$)/u.test(value),
  );

/** The recovery window, once main opened it. */
const recoveryPage = async (application: ElectronApplication): Promise<Page> => {
  let found: Page | undefined;
  await expect
    .poll(
      () => {
        found = application.windows().find((page) => page.url().endsWith('/recovery/index.html'));
        return found !== undefined;
      },
      { timeout: 60_000 },
    )
    .toBe(true);
  await found!.waitForLoadState('domcontentloaded');
  return found!;
};

const appPage = async (application: ElectronApplication): Promise<Page> => {
  const page = await application.firstWindow();
  await page.waitForURL((url) => url.protocol === 'app:', { waitUntil: 'load', timeout: 120_000 });
  return page;
};

describe('desktop boot recovery (T-R12.12)', () => {
  it('(a) starts in safe mode after two unhealthy launches, clears probation by healthy launches', async () => {
    const userData = await profile();
    /* A first launch names this build in the ledger. */
    const first = await launch(userData);
    await appPage(first);
    await expect.poll(async () => lastStage(userData), { timeout: 120_000 }).toBe('home-ready');
    await quit(first);
    const { build } = await readLedger(userData);
    await writeFile(
      join(userData, 'boot-health.json'),
      JSON.stringify({
        schemaVersion: 1,
        build,
        unhealthyCount: 2,
        last: { launchId: 'seed', mode: 'normal', stage: 'window-loaded', deadlinePassed: false, ended: 'clean' },
      }),
    );

    const safe = await launch(userData);
    const page = await appPage(safe);
    await expect
      .poll(async () => page.locator('[data-slot="safe-mode-bar"]').isVisible(), { timeout: 120_000 })
      .toBe(true);
    await expect.poll(async () => lastStage(userData), { timeout: 120_000 }).toBe('home-ready');
    const safeLedger = await readLedger(userData);
    expect(safeLedger.last?.mode).toBe('safe-auto');
    const compositing = await safe.evaluate(({ app }) => app.getGPUFeatureStatus().gpu_compositing);
    expect(compositing).toMatch(/^disabled/u);
    await quit(safe);

    /* Probation: the healthy safe launch leaves one, and the next launch is normal. */
    const probation = await launch(userData);
    await appPage(probation);
    const probationLedger = await readLedger(userData);
    expect(probationLedger.unhealthyCount).toBe(1);
    expect(probationLedger.last?.mode).toBe('normal');
    await expect.poll(async () => lastStage(userData), { timeout: 120_000 }).toBe('home-ready');
    await quit(probation);

    const cleared = await launch(userData);
    await appPage(cleared);
    const clearedLedger = await readLedger(userData);
    expect(clearedLedger.unhealthyCount).toBe(0);
  }, 900_000);

  it('(b) opens the recovery window when the app page cannot load, with live updater status and working actions', async () => {
    const userData = await profile();
    const emptyClient = join(userData, 'empty-client');
    await mkdir(emptyClient);
    const application = await launch(userData, { clientRoot: emptyClient });
    const recovery = await recoveryPage(application);
    await expect.poll(async () => recovery.locator('#update-status').textContent()).toMatch(/\S/u);
    await application.evaluate(({ shell }) => {
      const test = globalThis as typeof globalThis & { __recovery?: string[] };
      test.__recovery = [];
      shell.showItemInFolder = (path) => {
        test.__recovery!.push(`show-logs:${path.endsWith('desktop.log')}`);
      };
    });
    const relaunchRecord = join(userData, 'relaunch.json');
    await recordRelaunch(application, relaunchRecord);
    await recovery.getByRole('button', { name: 'Show Logs' }).click();
    await expect
      .poll(async () =>
        application.evaluate(() => (globalThis as typeof globalThis & { __recovery?: string[] }).__recovery ?? []),
      )
      .toEqual(['show-logs:true']);
    const log = await readFile(join(userData, 'logs', 'desktop.log'), 'utf8');
    expect(log).toContain('main.recovery-shown');
    /* The restart relaunches with `--safe-mode` and quits this process. */
    const closed = application.waitForEvent('close');
    await recovery.getByRole('button', { name: 'Restart in Safe Mode' }).click();
    await closed;
    expect(await readRelaunch(relaunchRecord)).toContain('--safe-mode');
  }, 300_000);

  it('(c) falls back to the native dialog when the recovery page itself is missing', async () => {
    const userData = await profile();
    const emptyClient = join(userData, 'empty-client');
    await mkdir(emptyClient);
    const application = await launch(userData, {
      clientRoot: emptyClient,
      env: { TAU_E2E_RECOVERY_PAGE: join(userData, 'no-such-recovery.html') },
    });
    await expect
      .poll(async () => readFile(join(userData, 'logs', 'desktop.log'), 'utf8').catch(() => ''), { timeout: 60_000 })
      .toContain('main.recovery-dialog-shown');
    expect(application.windows().some((page) => page.url().includes('recovery'))).toBe(false);
  }, 300_000);

  it('(d) offers the recovery window beside a page that throws before mounting, without closing or reloading it', async () => {
    const userData = await profile();
    const throwingClient = join(userData, 'throwing-client');
    await mkdir(throwingClient);
    await writeFile(
      join(throwingClient, 'index.html'),
      '<!doctype html><html><body><script>globalThis.__loads = (globalThis.__loads ?? 0) + 1; throw new Error("before mount");</script></body></html>',
    );
    const application = await launch(userData, { clientRoot: throwingClient });
    const first = await appPage(application);
    await recoveryPage(application);
    expect(first.isClosed()).toBe(false);
    expect(first.url()).toMatch(/^app:\/\/tau\//u);
    const loads = await application.evaluate(
      ({ webContents }) =>
        webContents.getAllWebContents().filter((contents) => contents.getURL().startsWith('app://tau/')).length,
    );
    expect(loads).toBe(1);
    const log = await readFile(join(userData, 'logs', 'desktop.log'), 'utf8');
    expect(log).not.toContain('main.renderer-reload');
  }, 300_000);

  it('(e) restarts in safe mode from Help → Troubleshooting, and the relaunch shows the bar', async () => {
    const userData = await profile();
    const application = await launch(userData);
    await appPage(application);
    const relaunchRecord = join(userData, 'relaunch.json');
    await recordRelaunch(application, relaunchRecord);
    const closed = application.waitForEvent('close');
    await application.evaluate(({ Menu }) => {
      const help = Menu.getApplicationMenu()?.items.find((item) => item.role === 'help' || item.label === 'Help');
      const troubleshooting = help?.submenu?.items.find((item) => item.label === 'Troubleshooting');
      troubleshooting?.submenu?.items.find((item) => item.label === 'Restart in Safe Mode')?.click();
    });
    /* The restart quits this process once the relaunch is armed; the next launch starts only after it is gone. */
    await closed;
    const relaunchArgs = relaunchedSwitches(await readRelaunch(relaunchRecord));
    expect(relaunchArgs).toContain('--safe-mode');

    const relaunched = await launch(userData, { args: relaunchArgs });
    const page = await appPage(relaunched);
    await expect
      .poll(async () => page.locator('[data-slot="safe-mode-bar"]').isVisible(), { timeout: 120_000 })
      .toBe(true);
    const requested = await readLedger(userData);
    expect(requested.last?.mode).toBe('safe-requested');
    expect(existsSync(join(userData, 'boot-health.json'))).toBe(true);
  }, 600_000);
});

/** Replace main's message boxes with a stub that records each one and answers with `response`. */
const stubMessageBoxes = async (application: ElectronApplication, response: number): Promise<void> => {
  await application.evaluate(({ dialog }, answer) => {
    const test = globalThis as typeof globalThis & { __boxes?: Array<{ message: string; buttons: string[] }> };
    test.__boxes = [];
    const record = async (...args: unknown[]): Promise<{ response: number; checkboxChecked: boolean }> => {
      const options = (args.length > 1 ? args[1] : args[0]) as { message: string; buttons?: string[] };
      test.__boxes!.push({ message: options.message, buttons: [...(options.buttons ?? [])] });
      return { response: answer, checkboxChecked: false };
    };
    dialog.showMessageBox = record as typeof dialog.showMessageBox;
  }, response);
};

const messageBoxes = async (application: ElectronApplication): Promise<Array<{ message: string; buttons: string[] }>> =>
  application.evaluate(
    () => (globalThis as typeof globalThis & { __boxes?: Array<{ message: string; buttons: string[] }> }).__boxes ?? [],
  );

const boxMessages = async (application: ElectronApplication): Promise<string[]> => {
  const boxes = await messageBoxes(application);
  return boxes.map((box) => box.message);
};

const boxButtons = async (application: ElectronApplication): Promise<string[][]> => {
  const boxes = await messageBoxes(application);
  return boxes.map((box) => box.buttons);
};

const crashRenderer = async (application: ElectronApplication): Promise<void> => {
  await application.evaluate(({ webContents }) => {
    webContents
      .getAllWebContents()
      .find((contents) => contents.getURL().startsWith('app://tau/'))
      ?.forcefullyCrashRenderer();
  });
};

describe('desktop renderer reload policy and hang rule (T-B11.2, T-B24.2)', () => {
  it('(T-B11.2) reloads once, then lands on Home with a notice, then opens the recovery window', async () => {
    const userData = await profile();
    const application = await launch(userData);
    const page = await appPage(application);
    await expect.poll(async () => lastStage(userData), { timeout: 120_000 }).toBe('home-ready');
    await stubMessageBoxes(application, 0);
    await page.evaluate(() => {
      globalThis.location.assign('/files');
    });
    await page.waitForURL((url) => url.pathname === '/files', { waitUntil: 'load', timeout: 120_000 });

    /* First death: the same address again. */
    await crashRenderer(application);
    await page.waitForURL((url) => url.pathname === '/files', { waitUntil: 'load', timeout: 120_000 });
    expect(await messageBoxes(application)).toEqual([]);

    /* Second within 60 s: Home, with a notice naming what was closed. */
    await crashRenderer(application);
    await page.waitForURL((url) => url.pathname === '/', { waitUntil: 'load', timeout: 120_000 });
    await expect.poll(async () => boxMessages(application)).toEqual([expect.stringMatching(/closed/iu)]);

    /* Third within 5 minutes: no more reloads, the recovery window instead. */
    await crashRenderer(application);
    await recoveryPage(application);
    const log = await readFile(join(userData, 'logs', 'desktop.log'), 'utf8');
    expect(log).toContain('main.renderer-reload');
    expect(log).toMatch(/main\.renderer-reload.*"step":"stop"/u);
  }, 600_000);

  it('(T-B24.2) offers Wait, Reload and Restart in Safe Mode to a page blocked for 40 s, and Reload restores it', async () => {
    const userData = await profile();
    const application = await launch(userData);
    const page = await appPage(application);
    await expect.poll(async () => lastStage(userData), { timeout: 120_000 }).toBe('home-ready');
    /* Reload. */
    await stubMessageBoxes(application, 1);
    /* Settles (or rejects, once the hung renderer is replaced) after the assertions below. */
    const blocking = page.evaluate(() => {
      const until = Date.now() + 40_000;
      while (Date.now() < until) {
        // Block the page's main thread.
      }
    });

    await expect
      .poll(async () => boxButtons(application), { timeout: 90_000 })
      .toEqual([['Wait', 'Reload', 'Restart in Safe Mode']]);
    const restored = await application.firstWindow();
    await restored.waitForURL((url) => url.protocol === 'app:', { waitUntil: 'load', timeout: 120_000 });
    expect(await restored.evaluate(() => document.readyState)).toBe('complete');
    const log = await readFile(join(userData, 'logs', 'desktop.log'), 'utf8');
    expect(log).toContain('renderer.hang-offered');
    await Promise.allSettled([blocking]);
  }, 600_000);
});
