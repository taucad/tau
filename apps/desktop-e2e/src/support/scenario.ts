/* oxlint-disable no-await-in-loop -- UI steps are intentionally sequential. */
import { basename, dirname, join } from 'node:path';
import process from 'node:process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { expect } from 'vitest';
import type { Locator, Page } from 'playwright';
import type { DesktopSession } from '#support/desktop-app.js';

/**
 * The shared Z scenario (work items Z3 and Z4).
 *
 * Both tiers drive the same path — connect a folder, pick a kernel, pick a
 * model, submit a prompt — and differ only in which model runs and how tight
 * the assertions are afterwards. It is written against the desktop shell's own
 * affordances rather than `ui-e2e`'s cookie seeding, because `app://` is not a
 * cookieable scheme: `document.cookie` is refused
 * (`EXCLUDE_NONCOOKIEABLE_SCHEME`), so every `useCookie` preference — kernel,
 * chat model, cookie consent — has to be set by clicking.
 */

const composerSelector = '[aria-label="Ask Tau to build anything..."]';

/**
 * Vitest's `expect` carries no Playwright matchers (`toBeVisible` and friends
 * ship with `@playwright/test`, which this suite does not use). Two helpers
 * over `locator.waitFor` and `expect.poll` cover everything the specs assert.
 */
export const expectVisible = async (locator: Locator, timeout = 30_000): Promise<void> => {
  await locator.first().waitFor({ state: 'visible', timeout });
};

/** Assert a locator settles on an exact match count. */
export const expectCount = async (locator: Locator, count: number, timeout = 30_000): Promise<void> => {
  await expect.poll(async () => locator.count(), { timeout }).toBe(count);
};

/** The composer editor, on the home page and inside a project alike. */
export const composerOf = (page: Page): Locator => page.locator(composerSelector).first();

/** The chat's stop button — present exactly while a run is in flight. */
export const stopButtonOf = (page: Page): Locator => page.locator('button:has(svg.lucide-square)').last();

const filesPaneOf = (page: Page): Locator => page.getByRole('region', { name: /^Files for /u }).first();

/** One file-tree row, addressed by its project-relative path. */
export const fileTreeItemOf = (page: Page, path: string): Locator =>
  filesPaneOf(page).locator(`[data-testid="file-tree-item"][data-file-tree-path="${path}"]`);

/** Dismiss the cookie banner if it is up. Declining is the privacy-preserving option. */
export const declineCookieBanner = async (page: Page): Promise<void> => {
  const decline = page.getByRole('button', { name: /^Decline$/iu });
  try {
    await decline.first().waitFor({ state: 'visible', timeout: 3000 });
    await decline.first().click();
  } catch {
    // Consent was already recorded or Global Privacy Control dismissed it.
  }
};

/** Assert the shell resolved the seeded credential into a real session. */
export const expectSignedIn = async (page: Page): Promise<void> => {
  const session = await page.evaluate(async () => {
    const environment = (globalThis as unknown as { ENV: Record<string, string> }).ENV;
    const response = await fetch(`${environment['TAU_API_URL']!}/v1/auth/get-session`);
    const body = await response.text();
    return { body: body.slice(0, 200), ok: response.ok, status: response.status };
  });
  /* `ok` first: a CORS rejection or a 5xx body is neither `'null'` nor a
   * session, and asserting only "not null" passed both. */
  expect(session.ok, `get-session answered HTTP ${String(session.status)}: ${session.body}`).toBe(true);
  expect(session.body, 'the desktop shell is not authenticated').not.toBe('null');
};

/**
 * Point the composer's location toggle at the picked folder.
 *
 * @param session - The launched app.
 * @returns Nothing.
 */
export const connectPickedFolder = async (session: DesktopSession): Promise<void> => {
  const { page } = session;
  await parkPointer(page);
  const trigger = page.getByRole('button', { name: /^Create in /u }).first();
  await trigger.click();
  await page
    .getByRole('button', { name: /Connect a folder/u })
    .first()
    .click();
  /* The native dialog is answered by `TAU_E2E_PICK_DIRECTORY`, so the folder
   * is registered without a modal, and the trigger renames itself. */
  await expect
    .poll(async () => trigger.getAttribute('aria-label'), { timeout: 60_000 })
    .toBe(`Create in ${basename(session.pickedDirectory)}`);
};

/**
 * Select a chat model by name through the composer's own selector.
 *
 * @param page - The renderer page.
 * @param modelName - The catalog name, e.g. `Haiku 4.5`.
 * @returns Nothing.
 */
export const selectChatModel = async (page: Page, modelName: string): Promise<void> => {
  await parkPointer(page);
  await composerOf(page).click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Slash' : 'Control+Slash');
  await page.getByRole('option', { name: modelName, exact: true }).first().click();
};

/**
 * Park the pointer in a dead corner.
 *
 * The kernel buttons open a hover card on hover, and a Radix popper left open
 * over the composer swallows the next click. Escape alone is not enough — the
 * card reopens while the pointer still rests on its trigger.
 */
export const parkPointer = async (page: Page): Promise<void> => {
  await page.mouse.move(4, 4);
  await page.keyboard.press('Escape');
  await expectCount(page.locator('[data-radix-popper-content-wrapper]'), 0, 15_000);
};

/** Choose the CAD kernel from the home page's kernel row. */
export const selectKernel = async (page: Page, kernelName: string): Promise<void> => {
  await page.getByRole('button', { name: kernelName, exact: true }).click();
  await parkPointer(page);
};

/**
 * Type a prompt into whichever composer is on screen and submit it.
 *
 * Deliberately does **not** assert that a run started: whether the server
 * dispatches one is residual R1's business, and coupling every caller to it
 * made tests fail for a reason they do not test. The callers that need a live
 * run say so themselves; the ones that only need the project created assert
 * the project.
 */
export const sendPrompt = async (page: Page, prompt: string): Promise<void> => {
  await parkPointer(page);
  const composer = composerOf(page);
  await composer.click();
  await composer.fill(prompt);
  await page.keyboard.press('Enter');
};

/** Submit from the home page, which also creates the project, and route into it. */
export const submitPrompt = async (page: Page, prompt: string): Promise<string> => {
  await sendPrompt(page, prompt);
  await page.waitForURL(/\/w\/[^/]+\/[^/?]+/u, { timeout: 120_000 });
  const { pathname } = new URL(page.url());
  return pathname.slice(pathname.lastIndexOf('/') + 1);
};

/**
 * Stop the in-flight run, if one started, and wait for the chat to be idle.
 *
 * The wait for the stop button to *appear* lives here rather than in
 * {@link sendPrompt}, because this is the only caller it earns anything for: a
 * cancel that samples before the run has bound would find nothing, return
 * immediately, and let the run proceed underneath the test. Every other caller
 * has its own real signal (a routed URL, bytes on disk, a rendered transcript)
 * and only paid latency for it — 60 s per home-composer submit, since the home
 * page never renders a stop button at all.
 */
export const cancelRun = async (page: Page): Promise<void> => {
  await stopButtonOf(page)
    .waitFor({ state: 'visible', timeout: 15_000 })
    .catch(() => undefined);
  if ((await stopButtonOf(page).count()) > 0) {
    await stopButtonOf(page).click();
  }
  await expectCount(stopButtonOf(page), 0, 120_000);
};

/**
 * N6 — assert the kernel utility loaded the **native** engine.
 *
 * The engine version never crosses the runtime wire, so the witness is the
 * `kernel.engine` line the utility appends to the shell's rotating log at
 * startup (main names the directory through `TAU_DESKTOP_LOG_DIR`). Produced
 * inside the process that loaded the engine, and `native` is derived from the
 * resolved version rather than hard-coded.
 *
 * @param logPath - `<userData>/logs/desktop.log`.
 * @returns The resolved engine version, e.g. `0.11.0-beta.1+native`.
 */
export const expectNativeKernelEngine = async (logPath: string): Promise<string> => {
  let engine: { readonly native?: boolean; readonly version?: string } | undefined;
  await expect
    .poll(
      () => {
        const line = (existsSync(logPath) ? readFileSync(logPath, 'utf8') : '')
          .split('\n')
          .findLast((entry) => entry.includes('kernel.engine'));
        engine = line ? (JSON.parse(line.slice(line.indexOf('{'))) as typeof engine) : undefined;
        return engine?.native;
      },
      { timeout: 180_000 },
    )
    .toBe(true);
  expect(engine?.version).toContain('+native');
  return engine!.version!;
};

/** Open the Files pane through the command palette when it is not already up. */
export const ensureFilesPane = async (page: Page): Promise<void> => {
  if (
    !(await filesPaneOf(page)
      .isVisible()
      .catch(() => false))
  ) {
    await page
      .getByRole('button', { name: /Search/u })
      .first()
      .click();
    await page.getByPlaceholder('Search projects, chats, and actions...').fill('Open files');
    await page.getByText('Open files', { exact: true }).first().click();
  }
  await expectVisible(filesPaneOf(page), 30_000);
};

/** One viewer bridge's camera state, for the framing assertion and its report. */
type ViewerBridgeState = {
  readonly actorError: string | undefined;
  readonly actorStatus: string;
  readonly framed: boolean;
};

const viewerBridgeStates = async (page: Page): Promise<ViewerBridgeState[]> =>
  page.evaluate(() => {
    const bridges =
      (
        globalThis as typeof globalThis & {
          __TAU_SECTION_VIEW_TEST_BRIDGES__?: ReadonlyArray<{
            getCamera(): { actorError?: string; actorStatus: string };
            isGeometryFramed(): boolean;
          }>;
        }
      ).__TAU_SECTION_VIEW_TEST_BRIDGES__ ?? [];
    return bridges.map((bridge) => ({
      actorError: bridge.getCamera().actorError,
      actorStatus: bridge.getCamera().actorStatus,
      framed: bridge.isGeometryFramed(),
    }));
  });

/**
 * Wait until a viewer bridge reports a framed camera.
 *
 * `ui-e2e` requires *every* bridge to be framed; the desktop workbench mounts
 * viewer bridges that never receive geometry (the file browser's preview, a
 * second editor group), so this asserts at least one framed bridge and no
 * bridge in an error state — the same guarantee for the viewport under test.
 *
 * @param page - The renderer page.
 * @returns Nothing.
 */
export const expectGeometryFramed = async (page: Page): Promise<void> => {
  try {
    await expect
      .poll(
        async () => {
          const states = await viewerBridgeStates(page);
          return states.some((state) => state.framed) && states.every((state) => state.actorError === undefined);
        },
        { timeout: 120_000 },
      )
      .toBe(true);
  } catch (error) {
    throw new Error(`Geometry did not reach a framed camera state: ${JSON.stringify(await viewerBridgeStates(page))}`, {
      cause: error,
    });
  }
};

/** Wait for the run to finish — the stop button is the liveness signal. */
export const waitForRunToSettle = async (page: Page, settleTimeout: number): Promise<void> => {
  await expectCount(stopButtonOf(page), 0, settleTimeout);
};

/**
 * Poll the real filesystem for the project directory the shell wrote.
 *
 * The strongest assertion this suite can make and no browser suite can: the
 * bytes are on disk, in the folder the native dialog handed the renderer.
 *
 * @param directory - The picked workspace root.
 * @param slug - The project slug taken from the URL.
 * @param options - What counts as the source.
 * @param options.extension - The source extension the kernel owns.
 * @param options.writtenAfter - Milliseconds (`mtimeMs`). Only a source last
 * written after this instant counts. Pass the seed's mtime when the turn
 * under test follows a seeded one, so the seed's own bytes cannot satisfy the
 * wait. Never truncate the seed instead: a harness write into the workspace
 * is captured faithfully as an empty base revision and reads as a Tau defect.
 * @returns The absolute path of the non-empty source file on disk.
 */
export const waitForProjectOnDisk = async (
  directory: string,
  slug: string,
  options: { readonly extension: string; readonly writtenAfter?: number },
): Promise<string> => {
  const { extension, writtenAfter = Number.NEGATIVE_INFINITY } = options;
  const projectRoot = join(directory, slug);
  const isFreshSource = (entry: string): boolean => {
    if (!entry.endsWith(extension)) {
      return false;
    }
    const stat = statSync(join(projectRoot, entry));
    return stat.size > 0 && stat.mtimeMs > writtenAfter;
  };
  let found: string | undefined;
  await expect
    .poll(
      () => {
        /* Non-empty, not merely present: project creation scaffolds a
         * zero-byte source file and the chat's `create_file` tool fills it
         * afterwards, so an existence check passes ~2 s after submit and
         * proves nothing about the run. */
        found = existsSync(projectRoot) ? readdirSync(projectRoot).find((entry) => isFreshSource(entry)) : undefined;
        return found;
      },
      { timeout: 180_000 },
    )
    .toBeDefined();
  return join(projectRoot, found!);
};

/**
 * Edit a project file from outside the app and restore it afterwards.
 *
 * @param filePath - The file to rewrite.
 * @param mutate - Produces the new contents from the old.
 * @returns A restore function.
 */
export const externalEdit = (filePath: string, mutate: (source: string) => string): (() => void) => {
  const original = readFileSync(filePath, 'utf8');
  writeFileSync(filePath, mutate(original), 'utf8');
  return () => {
    writeFileSync(filePath, original, 'utf8');
  };
};

/**
 * The blueprint's strict "a model got built" set, shared by both replay tiers.
 *
 * Everything here is asserted after the run has produced its source: the
 * transcript's final line, exactly one published revision, a live viewer with
 * framed geometry, the native engine witness, and the file tree. The
 * two-authorities-one-disk external edit is deliberately **not** here — it is
 * its own test, because it is red for a reason unrelated to the chat run.
 *
 * @param options - The scripted closing line, the page, the shell log to read
 *   N6 from, and the source on disk.
 * @returns Nothing.
 */
export const expectModelBuilt = async (options: {
  readonly finalText: string;
  readonly logPath: string;
  readonly page: Page;
  readonly sourcePath: string;
}): Promise<void> => {
  const { finalText, logPath, page, sourcePath } = options;

  /* The scripted transcript ends with this line — `ui-e2e` budgets 180 s for
   * it in a browser; a cold Electron launch and an out-of-process OpenSCAD
   * render ride on top of that here. */
  await expectVisible(page.getByText(finalText, { exact: true }), 420_000);

  await expectCount(page.getByText('Current', { exact: true }), 1, 60_000);
  await expectCount(page.getByText(/ROOT_UNAVAILABLE/u), 0);
  await expectCount(page.getByText('File not found', { exact: true }), 0);
  await expectCount(page.getByRole('status', { name: 'Waiting for geometry' }), 0, 120_000);
  await expectVisible(page.getByTestId('cad-viewer-canvas-region').locator('canvas'), 60_000);
  /* Before the Files pane opens: the file browser mounts viewer bridges of its
   * own that never receive geometry. */
  await expectGeometryFramed(page);
  const engineVersion = await expectNativeKernelEngine(logPath);
  await ensureFilesPane(page);
  await expectVisible(fileTreeItemOf(page, 'main.scad'), 60_000);
  expect(readFileSync(sourcePath, 'utf8').length).toBeGreaterThan(0);
  console.info(`[desktop-e2e] kernel engine: ${engineVersion}`);
};

type ComputeCacheEntry = {
  readonly actionDigest: string;
  readonly codecId: string;
  readonly contentDigest: string;
};

const computeCacheEntries = (sourcePath: string): readonly ComputeCacheEntry[] => {
  const root = join(dirname(sourcePath), '.tau/cache/compute/v1/actions/sha256');
  if (!existsSync(root)) {
    return [];
  }

  const entries: ComputeCacheEntry[] = [];
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop();
    if (!directory) {
      continue;
    }
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(path);
        continue;
      }
      if (!entry.name.endsWith('.json')) {
        continue;
      }
      try {
        const record: unknown = JSON.parse(readFileSync(path, 'utf8'));
        if (
          typeof record === 'object' &&
          record !== null &&
          'actionDigest' in record &&
          typeof record.actionDigest === 'string' &&
          'codec' in record &&
          typeof record.codec === 'object' &&
          record.codec !== null &&
          'id' in record.codec &&
          typeof record.codec.id === 'string' &&
          'output' in record &&
          typeof record.output === 'object' &&
          record.output !== null &&
          'digest' in record.output &&
          typeof record.output.digest === 'string'
        ) {
          entries.push({
            actionDigest: record.actionDigest,
            codecId: record.codec.id,
            contentDigest: record.output.digest,
          });
        }
      } catch {
        // Atomic CAS publication can leave a temporary file visible for one poll.
      }
    }
  }
  return entries;
};

/** Read the immutable geometry action records published by the project compute CAS. */
export const geometryCacheEntries = (sourcePath: string): readonly ComputeCacheEntry[] =>
  computeCacheEntries(sourcePath).filter(({ codecId }) => codecId.startsWith('@taucad/middleware/geometry-'));

const computeContentPath = (sourcePath: string, digest: string): string => {
  const hexadecimal = digest.slice('sha256:'.length);
  return join(dirname(sourcePath), '.tau/cache/compute/v1/blobs/sha256', hexadecimal.slice(0, 2), hexadecimal.slice(2));
};

/** Read validated parameter-result blobs published by the project compute CAS. */
export const parameterCacheContents = (sourcePath: string): readonly string[] =>
  computeCacheEntries(sourcePath)
    .filter(({ codecId }) => codecId === '@taucad/middleware/parameters')
    .flatMap(({ contentDigest }) => {
      const path = computeContentPath(sourcePath, contentDigest);
      return existsSync(path) ? [readFileSync(path, 'utf8')] : [];
    });

/**
 * Snapshot the kernel's geometry cache before an external write.
 *
 * A re-render is only provable against a "before": the viewer can be framed
 * from the *previous* geometry, so framing alone does not witness that the new
 * bytes were rendered.
 *
 * @param sourcePath - The project source about to be rewritten.
 * @returns The immutable geometry action digests present before the write.
 */
export const geometryCacheSnapshot = (sourcePath: string): ReadonlySet<string> =>
  new Set(geometryCacheEntries(sourcePath).map(({ actionDigest }) => actionDigest));

/**
 * Assert the kernel utility re-parsed **and** re-rendered the bytes an
 * external writer just put on disk.
 *
 * Both witnesses are the kernel's own disk artifacts, written by the utility
 * process through `fromNodeFs(projectRoot)` — so they exist only if the write
 * crossed the shell's second watcher and reached the kernel (charter
 * acceptance 5, "two authorities, one disk"):
 *
 * - `parameterCache()` publishes the resolved parse into the compute CAS, so
 *   a referenced content blob naming a declaration that exists only in the
 *   new bytes cannot come from the old ones.
 * - `geometryCache()` publishes a validated geometry action record into
 *   `.tau/cache/compute/v1`, so an action digest absent from `before` proves
 *   that the new dependency identity reached the render pipeline.
 *
 * `.tau/parameters/<source>.json` is deliberately **not** the witness: that
 * file is the renderer's parameter *value* store (`{activeGroup, groups}`),
 * written only when a user changes a value, and never carries the source's
 * declarations.
 *
 * @param sourcePath - The project source that was rewritten.
 * @param token - A declaration present only in the new bytes.
 * @param before - The geometry cache snapshot taken before the write.
 * @returns Nothing.
 */
export const expectKernelReparsed = async (
  sourcePath: string,
  token: string,
  before: ReadonlySet<string>,
): Promise<void> => {
  await expect
    /* 60 s, not the usual 180: a watched re-parse either lands within a few
     * seconds or the write never reached the kernel at all. */
    .poll(() => parameterCacheContents(sourcePath).some((content) => content.includes(token)), { timeout: 60_000 })
    .toBe(true);
  await expect
    .poll(() => geometryCacheEntries(sourcePath).some(({ actionDigest }) => !before.has(actionDigest)), {
      timeout: 60_000,
    })
    .toBe(true);
};
