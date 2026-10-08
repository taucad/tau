/**
 * Capture the README hero (`docs/assets/tau-desktop-{light,dark}.webp`): the Tau desktop app open on the Planetary
 * Gear System example, taken as a native macOS window screenshot with its shadow, once per theme.
 *
 * One-time setup (see `scripts/src/readme-hero-chat.ts` for the chat):
 *   1. Launch the desktop app on a fresh, signed-out userData folder and create the project through the app: Build from
 *      code, name "Planetary Gear System", kernel Replicad, then save (Mod+S) and quit.
 *   2. Copy `main.ts`, `main.geospec.ts` and `DESIGN.md` from
 *      `libs/tau-examples/src/kernels/replicad/planetary-gear-system` into the project, then write the showcase chat
 *      into the chat the app created ("Initial design"):
 *        node --import @oxc-node/core/register scripts/src/readme-hero-chat.ts --project <dir> --chat-id <chat id>
 *   The script itself puts Parameters above Kinematics in the project's saved workbench layout before launching.
 *   3. Build the desktop main process (`cd apps/desktop && npx electron-vite build`) and start a desktop renderer dev
 *      server on --renderer-url (from `apps/ui/desktop`, `react-router dev --config vite.config.ts --port 3002` with
 *      the variables in `apps/ui/.env`).
 *
 * Usage:
 *   node scripts/src/readme-hero-capture.ts --profile "$HOME/Library/Application Support/Tau-hero" [--write-assets]
 *     [--renderer-url http://localhost:3002] [--api-url https://api.taucad.dev]
 *
 * Writes `out/screenshots/readme-hero/tau-desktop-{light,dark}.png`; `--write-assets` also encodes them into
 * `docs/assets/` with cwebp (alpha kept, so the shadow sits on either README theme).
 *
 * Constraints learned the hard way:
 *   - Never reload the renderer or call `page.goto`: the desktop services broker quiesces and the viewer hangs on
 *     "Loading runtime formats…". Themes switch through the app's `BroadcastChannel('tau-theme')`.
 *   - Never scroll the home page: the community gallery runs live kernel previews and can crash the renderer. The
 *     project opens through its sidebar chat link only.
 *   - The API only allows the packaged `app://tau` origin, so a dev renderer's model-catalog fetch fails and the
 *     composer shows a raw model id. The catalog is fetched here and served to the renderer.
 *   - A fresh launch does not apply the view record's display flags, so Axes and Post-processing are set in the viewer
 *     menu and verified.
 *   - The window is focused for coloured traffic lights and ignores real mouse events, so the pointer adds no hover.
 *   - The terminal running this needs macOS Screen Recording permission; without it the capture has no contents.
 *
 * Exit codes: 0 success, 1 bad arguments or an unexpected app state, 2 network failure, 3 missing dependency.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';

import { _electron as electron } from 'playwright';
import type { ElectronApplication, Page } from 'playwright';

const repoRoot = resolve(import.meta.dirname, '../..');
const desktopDirectory = join(repoRoot, 'apps/desktop');
const outputDirectory = join(repoRoot, 'out/screenshots/readme-hero');
const projectName = 'Planetary Gear System';
const projectSlug = 'planetary-gear-system';
const chatName = 'Initial design';
const sunJoint = 'sun';
const sunAngle = '30';
const windowWidth = 1728;
const windowHeight = 1080;
const themes = ['light', 'dark'] as const;
/** Parameters above Kinematics in the workbench lane (weights are relative). */
const workbenchLayout = {
  kind: 'split',
  direction: 'column',
  children: [
    { kind: 'group', size: 0.32, tabs: [{ kind: 'pane', pane: 'parameters' }] },
    { kind: 'group', size: 0.68, tabs: [{ kind: 'pane', pane: 'kinematics' }] },
  ],
};
/** A window capture smaller than this is the frame without contents (no Screen Recording permission). */
const minimumCaptureBytes = 200_000;
type Theme = (typeof themes)[number];

class UsageError extends Error {}
class NetworkError extends Error {}
class MissingDependencyError extends Error {}

const { values } = parseArgs({
  options: {
    profile: { type: 'string' },
    'renderer-url': { type: 'string', default: 'http://localhost:3002' },
    'api-url': { type: 'string', default: 'https://api.taucad.dev' },
    'write-assets': { type: 'boolean', default: false },
  },
});

/**
 * Pause the page clock.
 *
 * @param page - The app page.
 * @param duration - Milliseconds to wait.
 */
const sleep = async (page: Page, duration: number): Promise<void> => {
  await page.waitForTimeout(duration);
};

/**
 * Read `apps/ui/.env` the way the desktop dev task passes it to Electron.
 *
 * @returns The file's variables, or nothing when the file is absent.
 */
const readUiEnvironment = (): Record<string, string> => {
  const file = join(repoRoot, 'apps/ui/.env');
  if (!existsSync(file)) {
    return {};
  }
  const entries: Array<[string, string]> = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = /^\s*([\w.]+)\s*=\s*(.*?)\s*$/u.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      entries.push([match[1], match[2].replace(/^(['"])(.*)\1$/u, '$2')]);
    }
  }
  return Object.fromEntries(entries);
};

/**
 * Fetch the public model catalog the composer resolves its label from.
 *
 * @param apiUrl - The API origin.
 * @returns The catalog body as JSON text.
 */
const fetchCatalog = async (apiUrl: string): Promise<string> => {
  const response = await fetch(`${apiUrl.replace(/\/$/u, '')}/v1/models`, {
    signal: AbortSignal.timeout(30_000),
  }).catch((error: unknown) => {
    throw new NetworkError(`Model catalog unreachable: ${String(error)}`);
  });
  if (!response.ok) {
    throw new NetworkError(`Model catalog answered ${String(response.status)}.`);
  }
  const body = await response.text();
  if (!Array.isArray(JSON.parse(body))) {
    throw new TypeError('Model catalog is not a list.');
  }
  return body;
};

/**
 * Put Parameters above Kinematics in the project's saved workbench layout; the app reads it when the project opens.
 *
 * @param projectDirectory - The hero project inside the profile's home.
 */
const writeWorkbenchLayout = (projectDirectory: string): void => {
  const file = join(projectDirectory, '.tau/workbench/layout.json');
  if (!existsSync(file)) {
    throw new UsageError(`No ${file}; open the project once in the app, then rerun.`);
  }
  const layout = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  writeFileSync(file, `${JSON.stringify({ ...layout, workbench: workbenchLayout }, undefined, 2)}\n`);
};

/**
 * Parse a URL flag before anything launches.
 *
 * @returns The parsed URL.
 */
const parseUrlFlag = (flag: string, value: string): URL => {
  try {
    return new URL(value);
  } catch {
    throw new UsageError(`--${flag} must be an absolute URL, got "${value}".`);
  }
};

/** Switch the app theme in place: native chrome plus the app's own theme channel, never a reload. */
const setTheme = async (app: ElectronApplication, page: Page, theme: Theme): Promise<void> => {
  await app.evaluate(({ nativeTheme }, next) => {
    nativeTheme.themeSource = next;
  }, theme);
  await page.evaluate((next) => {
    localStorage.setItem('tau-theme', next);
    new BroadcastChannel('tau-theme').postMessage({ theme: next, metadata: { definedBy: 'USER' } });
  }, theme);
  await sleep(page, 3500);
};

/** Open the project's chat from the sidebar, expanding the sidebar and the project row when needed. */
const openProject = async (page: Page): Promise<void> => {
  await page.keyboard.press('Escape');
  const chatLink = page.getByRole('link', { name: chatName, exact: true });
  if (!(await chatLink.isVisible())) {
    const expand = page.getByRole('button', { name: `Expand ${projectName}` });
    if (!(await expand.isVisible())) {
      await page.locator('[data-sidebar="trigger"]').first().click();
      await sleep(page, 800);
    }
    if (await expand.isVisible()) {
      await expand.click();
      await sleep(page, 800);
    }
  }
  // Every project made through Build from code has an "Initial design" chat, so the URL proves which one opened.
  await chatLink.first().click({ noWaitAfter: true });
  await page.waitForURL(new RegExp(`/w/[^/]+/${projectSlug}(?:[/?]|$)`, 'u'), { timeout: 60_000 });
  await sleep(page, 25_000);
  await page.keyboard.press('Escape');
  if (/[?&]settings=/u.test(page.url())) {
    throw new UsageError(`A settings dialog is open: ${page.url()}`);
  }
};

/** Pose the driver joint, show its followers and collapse the sidebar. */
const stageKinematics = async (page: Page): Promise<void> => {
  const angle = page.getByRole('spinbutton', { name: sunJoint });
  await angle.fill(sunAngle);
  await angle.press('Enter');
  await sleep(page, 2500);
  if (!(await page.getByText('planet-1', { exact: true }).isVisible())) {
    await page.getByText('Followers', { exact: true }).first().click();
    await sleep(page, 1200);
  }
  if (await page.getByRole('link', { name: chatName, exact: true }).isVisible()) {
    await page
      .getByRole('button', { name: /toggle sidebar/iu })
      .first()
      .click();
    await sleep(page, 1500);
  }
};

/** Set Axes off and Post-processing (ambient occlusion) on in the viewer menu, then verify both. */
const stageViewer = async (page: Page): Promise<void> => {
  const openMenu = async (): Promise<void> => {
    if (
      !(await page
        .getByText(/Ambient occlusion is/u)
        .first()
        .isVisible())
    ) {
      await page.getByRole('button', { name: 'Viewer settings' }).first().focus();
      await page.keyboard.press('Enter');
      await sleep(page, 900);
    }
  };
  const switchState = async (label: string): Promise<string | undefined> =>
    page
      .getByRole('menuitem')
      .filter({ has: page.getByText(label, { exact: true }) })
      .first()
      .locator('[data-state="checked"], [data-state="unchecked"]')
      .first()
      .evaluate((element: HTMLElement) => element.dataset['state']);
  const ensure = async (label: string, wanted: 'checked' | 'unchecked'): Promise<void> => {
    await openMenu();
    if ((await switchState(label)) !== wanted) {
      await page.getByText(label, { exact: true }).last().click();
      await sleep(page, 1500);
      await openMenu();
    }
    if ((await switchState(label)) !== wanted) {
      throw new UsageError(`Viewer setting "${label}" did not become ${wanted}.`);
    }
  };
  await ensure('Axes', 'unchecked');
  await ensure('Post-processing', 'checked');
  await page.keyboard.press('Escape');
  await sleep(page, 800);
  const fitView = page.getByRole('button', { name: 'Fit view' }).first();
  await fitView.click();
  await sleep(page, 3000);
  const box = await fitView.boundingBox();
  if (box !== null) {
    await page.mouse.move(box.x + box.width / 2, 540);
    await page.mouse.wheel(0, -50);
    await sleep(page, 2000);
  }
};

/**
 * Screenshot the app window as macOS draws it, shadow included.
 *
 * @returns The PNG path.
 */
const captureWindow = async (app: ElectronApplication, page: Page, theme: Theme): Promise<string> => {
  await setTheme(app, page, theme);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  await page.mouse.move(700, 120);
  const sourceId = await app.evaluate(({ app: electronApp, BrowserWindow }) => {
    const [appWindow] = BrowserWindow.getAllWindows();
    if (appWindow === undefined) {
      throw new Error('No app window.');
    }
    appWindow.setIgnoreMouseEvents(true);
    electronApp.focus({ steal: true });
    appWindow.moveTop();
    appWindow.focus();
    return appWindow.getMediaSourceId();
  });
  await sleep(page, 1200);
  const windowNumber = sourceId.split(':')[1] ?? '';
  if (!/^\d+$/u.test(windowNumber)) {
    throw new UsageError(`Unexpected window source id "${sourceId}".`);
  }
  const file = join(outputDirectory, `tau-desktop-${theme}.png`);
  execFileSync('/usr/sbin/screencapture', ['-x', `-l${windowNumber}`, file]);
  // ponytail: a size floor catches the content-less frame macOS returns without Screen Recording permission.
  if (!existsSync(file) || statSync(file).size < minimumCaptureBytes) {
    throw new MissingDependencyError(
      `${file} is missing or empty; grant Screen Recording to this terminal in System Settings, then rerun.`,
    );
  }
  return file;
};

const main = async (): Promise<void> => {
  if (values.profile === undefined) {
    throw new UsageError('Pass --profile <Electron userData directory that holds the hero project>.');
  }
  if (process.platform !== 'darwin') {
    throw new MissingDependencyError('The capture uses macOS screencapture.');
  }
  const profile = resolve(values.profile);
  const projectDirectory = join(profile, 'home', projectSlug);
  if (!existsSync(join(projectDirectory, 'tau.json'))) {
    throw new UsageError(`No ${projectSlug} project in ${profile}/home; follow the setup steps in this file's header.`);
  }
  const rendererUrl = values['renderer-url'];
  const apiUrl = values['api-url'];
  const { origin } = parseUrlFlag('renderer-url', rendererUrl);
  parseUrlFlag('api-url', apiUrl);
  const catalog = await fetchCatalog(apiUrl);
  writeWorkbenchLayout(projectDirectory);
  mkdirSync(outputDirectory, { recursive: true });

  // The `electron` package's main export is the path of its binary.
  const electronPath: unknown = createRequire(join(desktopDirectory, 'package.json'))('electron');
  if (typeof electronPath !== 'string') {
    throw new MissingDependencyError('Electron is not installed; run pnpm install.');
  }
  const app = await electron.launch({
    executablePath: electronPath,
    args: [desktopDirectory, `--user-data-dir=${profile}`],
    cwd: desktopDirectory,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Environment names are SCREAMING_SNAKE.
    env: { ...readUiEnvironment(), ...process.env, TAU_API_URL: apiUrl, ELECTRON_RENDERER_URL: rendererUrl },
    timeout: 120_000,
  });
  try {
    await app.context().route('**/v1/models', async (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: catalog,
        headers: { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true' },
      }),
    );
    const page = await app.firstWindow({ timeout: 120_000 });
    await page.waitForLoadState('domcontentloaded');
    await app.evaluate(
      ({ BrowserWindow }, size) => {
        const [appWindow] = BrowserWindow.getAllWindows();
        appWindow?.setFullScreen(false);
        appWindow?.unmaximize();
        appWindow?.setContentSize(size.width, size.height);
        appWindow?.center();
      },
      { width: windowWidth, height: windowHeight },
    );
    await sleep(page, 6000);
    console.log('→ opening the project');
    await openProject(page);
    await stageKinematics(page);
    await stageViewer(page);
    for (const theme of themes) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- one window, so the themes are captured one after another.
      console.log(`✓ ${await captureWindow(app, page, theme)}`);
    }
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setIgnoreMouseEvents(false);
    });
    await setTheme(app, page, 'light');
  } finally {
    // A close failure must not hide the step that failed.
    await app.close().catch((error: unknown) => {
      console.error('closing the app failed:', error);
    });
  }

  if (values['write-assets']) {
    for (const theme of themes) {
      const target = join(repoRoot, 'docs/assets', `tau-desktop-${theme}.webp`);
      const source = join(outputDirectory, `tau-desktop-${theme}.png`);
      try {
        execFileSync('cwebp', ['-quiet', '-q', '90', '-alpha_q', '100', '-exact', source, '-o', target]);
      } catch (error) {
        throw new MissingDependencyError(`cwebp failed (brew install webp): ${String(error)}`);
      }
      console.log(`✓ ${target}`);
    }
  }
};

try {
  await main();
} catch (error) {
  console.error('readme-hero-capture failed:', error instanceof Error ? error.message : error);
  if (error instanceof NetworkError) {
    process.exit(2);
  }
  process.exit(error instanceof MissingDependencyError ? 3 : 1);
}
