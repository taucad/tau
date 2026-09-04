/* oxlint-disable no-await-in-loop -- Teardown steps are intentionally sequential. */
/* eslint-disable @typescript-eslint/naming-convention -- Environment variables retain their wire names. */
import { mkdtemp, mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { _electron as electron } from 'playwright';
import type { ElectronApplication, Page } from 'playwright';
import { expect } from 'vitest';
import { desktopE2EApiUrl, desktopE2EFrontendUrl } from '#support/config.js';

/**
 * Electron launch + diagnostics for the desktop smoke suite (work item Z1).
 *
 * Packaged-directory mode, exactly as the shell blueprint's L5 status section
 * describes: `electron.launch({ args: [apps/desktop] })` against the built
 * `dist/main/index.js`, with the three required environment names, the A7
 * `TAU_DESKTOP_TOKEN` seed and the `TAU_E2E_PICK_DIRECTORY` dialog override.
 * Every run gets a throwaway `--user-data-dir`, which is what makes a second
 * run idempotent: Home, the granted-root store and IndexedDB all start empty.
 */

const workspaceRoot = resolve(import.meta.dirname, '../../../..');
/* Overridable because `nx run ui:dev:desktop` empties `apps/ui/desktop/build`
 * on start (it re-copies `public/` there): a developer's live desktop session
 * and this suite would otherwise fight over one directory. Point the suite at
 * a snapshot of a built bundle instead. */
const clientRoot = process.env['TAU_DESKTOP_CLIENT_ROOT'] ?? join(workspaceRoot, 'apps/ui/desktop/build/client');
const desktopRoot = join(workspaceRoot, 'apps/desktop');
const packagedExecutable = join(desktopRoot, 'package-out/Tau-darwin-arm64/Tau.app/Contents/MacOS/Tau');
const diagnosticsRoot = join(workspaceRoot, 'out/test-results/desktop-e2e');

/**
 * WebGPU launch profile. The default is the hardware adapter this Mac has;
 * headless runners without one set `TAU_E2E_WEBGPU_PROFILE=software`. Copied
 * from `apps/ui-e2e/src/support/webgpu-profile.ts` rather than imported —
 * cross-e2e-project source imports are not a dependency this suite should own.
 */
const webGpuArguments = (): readonly string[] => {
  const profile = process.env['TAU_E2E_WEBGPU_PROFILE'] ?? 'hardware';
  if (profile === 'software') {
    return ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader'];
  }
  if (profile === 'hardware') {
    return ['--enable-unsafe-webgpu'];
  }
  throw new Error(`TAU_E2E_WEBGPU_PROFILE must be 'software' or 'hardware'; received '${profile}'.`);
};

/** One launched desktop app plus everything a spec needs to assert about it. */
export type DesktopSession = {
  readonly application: ElectronApplication;
  /** The app's node-backed Home, `<userData>/home`. */
  readonly homeRoot: string;
  readonly page: Page;
  /**
   * The shell's rotating diagnostics log. Main names this directory to the
   * kernel utility through `TAU_DESKTOP_LOG_DIR`, so the `kernel.engine` line
   * that carries the resolved engine version lands here (N6).
   */
  readonly logPath: string;
  /** The absolute path `window.tau.dialog.selectDirectory()` resolves to. */
  readonly pickedDirectory: string;
  /** Write trace, screenshot, process output and `desktop.log` under `out/`. */
  readonly capture: (label: string) => Promise<string>;
  readonly close: () => Promise<void>;
};

/**
 * Launch the built desktop shell against the suite's dedicated API.
 *
 * @param options - The seeded bearer handed to main through A7, plus any extra
 *   environment the shell needs. `env` exists for launcher 2, whose services
 *   utility reads `TAU_DESKTOP_AGENT_GATEWAY_URL` at fork time: its gateway
 *   calls are Node `fetch` from the utility process, so no page route can
 *   reach them and the value has to be present before the app starts.
 * @returns The live session.
 */
export const launchDesktopApp = async (options: {
  readonly token: string;
  readonly env?: Readonly<Record<string, string>> | undefined;
  readonly packaged?: boolean | undefined;
  readonly useProductionEndpointDefaults?: boolean | undefined;
}): Promise<DesktopSession> => {
  const userData = await mkdtemp(join(tmpdir(), 'tau-desktop-e2e-user-'));
  /* A fixed, already-lowercase leaf inside the random parent: the workspace
   * slug the UI mints is the folder name slugified, so a `mkdtemp` name with
   * capitals would make the routed URL differ from the directory on disk for
   * no reason. */
  const pickedParent = await mkdtemp(join(tmpdir(), 'tau-desktop-e2e-pick-'));
  const pickedDirectory = join(pickedParent, 'tau-desktop-workspace');
  await mkdir(pickedDirectory, { recursive: true });
  const output: string[] = [];
  const inheritedEnvironment = { ...(process.env as Record<string, string>) };
  if (options.useProductionEndpointDefaults) {
    delete inheritedEnvironment['TAU_API_URL'];
    delete inheritedEnvironment['TAU_WEBSOCKET_URL'];
    delete inheritedEnvironment['TAU_FRONTEND_URL'];
  }

  const application = await electron.launch({
    ...(options.packaged ? { executablePath: packagedExecutable } : {}),
    args: [...(options.packaged ? [] : [desktopRoot]), `--user-data-dir=${userData}`, ...webGpuArguments()],
    cwd: desktopRoot,
    env: {
      ...inheritedEnvironment,
      NODE_ENV: 'production',
      /* Forwarded into `window.ENV` by the shell's client allowlist, where it
       * turns on the `tauDebug` feature flag that mounts
       * `SectionViewTestBridge` — the viewport-framing observable. `ui-e2e`
       * sets the same variable on its UI server for the same reason. */
      TAU_DEBUG: process.env['TAU_DEBUG'] ?? 'true',
      ...(options.useProductionEndpointDefaults
        ? {}
        : {
            TAU_API_URL: desktopE2EApiUrl,
            TAU_WEBSOCKET_URL: desktopE2EApiUrl.replace(/^http/u, 'ws'),
            TAU_FRONTEND_URL: desktopE2EFrontendUrl,
          }),
      ...(options.packaged ? {} : { TAU_DESKTOP_CLIENT_ROOT: clientRoot }),
      TAU_DESKTOP_TOKEN: options.token,
      TAU_E2E_PICK_DIRECTORY: pickedDirectory,
      ...options.env,
    },
  });

  application.process().stdout?.on('data', (chunk: unknown) => output.push(String(chunk)));
  application.process().stderr?.on('data', (chunk: unknown) => output.push(String(chunk)));

  /* Anything that throws between `launch` and the returned session would
   * otherwise strand a live Electron — and a stranded shell keeps polling the
   * API, which blows better-auth's 100-per-10 s bucket and 429s the *next*
   * run's sign-up. Kill it here rather than leaving it to a caller that never
   * received a session to close. */
  const consoleErrors: string[] = [];
  let page: Page;
  try {
    page = await application.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    page.setDefaultTimeout(60_000);
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });
    page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
    await page.context().tracing.start({ screenshots: true, snapshots: true });
    if (options.packaged) {
      await application.evaluate(({ dialog, shell }, selectedDirectory) => {
        const testState = globalThis as typeof globalThis & { __TAU_E2E_EXTERNAL_URL__?: string };
        shell.openExternal = async (url): Promise<void> => {
          testState.__TAU_E2E_EXTERNAL_URL__ = url;
        };
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedDirectory] });
        dialog.showMessageBox = async () => ({ checkboxChecked: false, response: 1 });
      }, pickedDirectory);
    }
  } catch (error) {
    application.process().kill('SIGKILL');
    /* The shell's own output is the only account of why it went away, and the
     * caller has no session to read it from. */
    throw new Error(`The desktop shell did not survive launch.\n${output.join('')}`, { cause: error });
  }

  let tracing = true;
  let captured = false;

  /** Shallow-ish listing of a directory tree, for the failure report. */
  const tree = async (directory: string, depth = 3): Promise<string[]> => {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    const lines: string[] = [];
    for (const entry of entries) {
      lines.push(join(directory, entry.name));
      if (entry.isDirectory() && depth > 0) {
        lines.push(...(await tree(join(directory, entry.name), depth - 1)));
      }
    }
    return lines;
  };

  const capture = async (label: string): Promise<string> => {
    captured = true;
    const directory = join(diagnosticsRoot, label);
    await mkdir(directory, { recursive: true });
    if (tracing) {
      tracing = false;
      await page.context().tracing.stop({ path: join(directory, 'trace.zip') });
    }
    await page
      .screenshot({ path: join(directory, 'screenshot.png'), fullPage: true, timeout: 10_000 })
      .catch(() => undefined);
    const desktopLog = await readFile(join(userData, 'logs/desktop.log'), 'utf8').catch(() => '(no desktop.log)');
    const bodyText = await page
      // oxlint-disable-next-line unicorn/prefer-dom-node-text-content -- `innerText` keeps the rendered line breaks that make this readable.
      .evaluate(() => document.body.innerText.slice(0, 2000))
      .catch(() => '(unavailable)');
    const pickedTree = await tree(pickedDirectory);
    const homeTree = await tree(join(userData, 'home'));
    const grants = await readFile(join(userData, 'granted-roots.json'), 'utf8').catch(() => '(none)');
    await writeFile(
      join(directory, 'diagnostics.log'),
      [
        `url: ${page.url()}`,
        `body: ${bodyText}`,
        `userData: ${userData}`,
        `pickedDirectory: ${pickedDirectory}`,
        '--- console errors ---',
        consoleErrors.join('\n'),
        '--- process output ---',
        output.join(''),
        '--- picked directory ---',
        pickedTree.join('\n'),
        '--- home root ---',
        homeTree.join('\n'),
        '--- granted roots ---',
        grants,
        '--- desktop.log ---',
        desktopLog,
      ].join('\n'),
      'utf8',
    );
    return directory;
  };

  const close = async (): Promise<void> => {
    if (tracing) {
      tracing = false;
      await page
        .context()
        .tracing.stop()
        .catch(() => undefined);
    }
    const child = application.process();
    const exited =
      child.exitCode === null && child.signalCode === null
        ? new Promise<void>((resolve) => {
            child.once('exit', () => {
              resolve();
            });
          })
        : Promise.resolve();
    await application.close().catch(() => undefined);
    /* `close()` asks the app to quit, and a shell holding a stalled chat run
     * does not always finish quitting. Left alive they accumulate, and the
     * next `electron.launch` in the same vitest process comes back with a
     * window that is already closed — three tests died that way before this
     * existed. */
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }
    await exited;
    if (captured) {
      /* Keep the evidence a failing run just produced. */
      return;
    }
    await rm(userData, { force: true, recursive: true });
    await rm(pickedParent, { force: true, recursive: true });
  };

  return {
    application,
    capture,
    close,
    homeRoot: join(userData, 'home'),
    logPath: join(userData, 'logs/desktop.log'),
    page,
    pickedDirectory,
  };
};

/** Complete the production loopback authentication flow for a packaged app. */
export const authenticatePackagedDesktop = async (session: DesktopSession, bearerToken: string): Promise<void> => {
  let signInError: unknown;
  // async-iife: the loopback callback must run while renderer sign-in is pending.
  const signIn = (async (): Promise<void> => {
    try {
      await session.page.evaluate(async () => {
        const { tauAuth } = globalThis as typeof globalThis & { tauAuth: { signIn(): Promise<void> } };
        await tauAuth.signIn();
      });
    } catch (error) {
      signInError = error;
    }
  })();
  let externalUrl = '';
  await expect
    .poll(
      async () => {
        externalUrl = await session.application.evaluate(() => {
          const testState = globalThis as typeof globalThis & { __TAU_E2E_EXTERNAL_URL__?: string };
          return testState.__TAU_E2E_EXTERNAL_URL__ ?? '';
        });
        return externalUrl;
      },
      { timeout: 30_000 },
    )
    .not.toBe('');
  const redirect = new URL(externalUrl).searchParams.get('redirectTo');
  if (!redirect) {
    throw new Error(`Packaged desktop sign-in emitted no redirect target: ${externalUrl}`);
  }
  const handoff = new URL(redirect, desktopE2EFrontendUrl);
  const port = handoff.searchParams.get('port');
  const state = handoff.searchParams.get('state');
  if (!port || !state) {
    throw new Error(`Packaged desktop sign-in emitted an invalid handoff target: ${handoff.toString()}`);
  }
  const generated = await fetch(`${desktopE2EApiUrl}/v1/auth/one-time-token/generate`, {
    headers: { authorization: `Bearer ${bearerToken}` },
  });
  if (!generated.ok) {
    throw new Error(`Packaged desktop token generation failed with HTTP ${String(generated.status)}.`);
  }
  const oneTimeToken = ((await generated.json()) as { readonly token?: string }).token;
  if (!oneTimeToken) {
    throw new Error('Packaged desktop token generation returned no token.');
  }
  const loopback = new URL(`http://127.0.0.1:${port}/callback`);
  loopback.searchParams.set('ott', oneTimeToken);
  loopback.searchParams.set('state', state);
  const callback = await fetch(loopback);
  if (!callback.ok) {
    throw new Error(`Packaged desktop loopback callback failed with HTTP ${String(callback.status)}.`);
  }
  await signIn;
  if (signInError !== undefined) {
    throw signInError instanceof Error
      ? signInError
      : new Error('Packaged desktop sign-in failed.', { cause: signInError });
  }
};
