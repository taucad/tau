/* oxlint-disable no-await-in-loop -- UI steps are intentionally sequential. */
import { basename, dirname, join } from 'node:path';
import process from 'node:process';
import { setTimeout } from 'node:timers/promises';
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
 * affordances rather than `ui-e2e`'s cookie seeding. Desktop product
 * preferences are localStorage-backed and its renderer is cookie-free.
 */

const composerSelector = '[aria-label="Ask Tau to build anything..."]';

/**
 * Vitest's `expect` carries no Playwright matchers (`toBeVisible` and friends
 * ship with the separate Playwright test runner, which this suite does not use). Two helpers
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

/** Proves a fresh Electron profile contains no website privacy or footer surface. */
export const expectDesktopSurfaceBoundary = async (session: DesktopSession): Promise<void> => {
  const { page } = session;
  await expectCount(page.getByRole('button', { name: /^Decline$/iu }), 0);
  await expectCount(page.locator('footer'), 0);
  await expectCount(page.getByRole('link', { name: /^(?:Cookies|Legal)$/iu }), 0);
  expect(await page.evaluate(() => document.cookie)).toBe('');
  expect(await page.context().cookies()).toEqual([]);
  expectNoDesktopAnalytics(session);
};

/** Desktop never sends analytics; the recorder has run since launch. Call again at scenario end. */
export const expectNoDesktopAnalytics = (session: DesktopSession): void => {
  expect(session.analyticsRequests).toEqual([]);
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

/** Select a model from the active external agent's own model namespace. */
export const selectAgentModel = async (page: Page, modelName: string): Promise<void> => {
  await parkPointer(page);
  await page
    .getByRole('button', { name: /^Select model \(/u })
    .first()
    .click();
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
  await expectCount(
    page.locator('[data-radix-popper-content-wrapper]:not(:has([data-slot="tooltip-content"]))'),
    0,
    15_000,
  );
};

/** Choose the CAD kernel from the home page's kernel row. */
export const selectKernel = async (page: Page, kernelName: string): Promise<void> => {
  await page.getByRole('button', { name: kernelName, exact: true }).first().click();
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
  /* A chat refuses a message while its run is in flight ("Stop it before
   * sending another message"), and a run stays in flight until the host has
   * recorded its revision — longer than the bytes its tools wrote take to land
   * on disk, which is what most callers just waited for. */
  await expectCount(stopButtonOf(page), 0, 120_000);
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
export const cancelRun = async (page: Page, settled?: () => boolean): Promise<void> => {
  /* Strict where it can be: a live run must render its stop button, so a moved
   * selector fails here instead of turning this cancel and `sendPrompt`'s
   * idle-wait into silent no-ops (6-review C3). A turn this short can also
   * settle before the button ever renders (desktop-chat-in-project.spec.ts),
   * so the caller's own completion signal is the other way out (7-review M1). */
  const stop = stopButtonOf(page);
  await expect.poll(async () => settled?.() === true || (await stop.count()) > 0, { timeout: 15_000 }).toBe(true);
  if (settled?.() !== true && (await stop.count()) > 0) {
    await stop.click();
  }
  await expectCount(stop, 0, 120_000);
};

/**
 * N6 — assert the kernel utility bound the **N-API addon**, not the fallback.
 *
 * The engine version never crosses the runtime wire — and since one engine
 * release ships both payloads under one version, it would not distinguish them
 * anyway. The witness is the `kernel.engine` line the utility appends to the
 * shell's rotating log at startup (main names the directory through
 * `TAU_DESKTOP_LOG_DIR`), produced inside the process that loaded the engine,
 * with `native` derived from the engine's own `backend` export. A packaged app
 * whose platform package went missing renders through WebAssembly and fails
 * here rather than passing quietly.
 *
 * @param logPath - `<userData>/logs/desktop.log`.
 * @returns The resolved engine version, e.g. `0.11.0-beta.4`.
 */
export const expectNativeKernelEngine = async (logPath: string): Promise<string> => {
  let engine: { readonly native?: boolean; readonly backend?: string; readonly version?: string } | undefined;
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
  expect(engine?.backend).toBe('native');
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

/** How long a source file may take to appear before the wait is a failure. */
const waitForProjectTimeout = 180_000;
/**
 * How long the route is allowed to settle before an empty transcript counts as
 * evidence. The shell renders the seeded turn's own user message within a
 * second or two of the navigation; anything still empty this late is not
 * mid-render.
 */
const lostSeedGrace = 30_000;

/**
 * Whether the composer holds a prompt that no message in the transcript answers.
 *
 * The signature of a seeded first turn the shell dropped: the loader restored
 * the prompt as a draft and no run was ever dispatched, so waiting out the full
 * {@link waitForProjectTimeout} only delays the same failure.
 *
 * @param page - The renderer.
 * @returns True when the transcript is empty and the composer is not.
 */
const seedIsBackInComposer = async (page: Page): Promise<boolean> => {
  const composer = composerOf(page);
  if ((await page.locator('article').count()) > 0 || (await composer.count()) === 0) {
    return false;
  }
  return ((await composer.textContent({ timeout: 5000 })) ?? '').trim() !== '';
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
 * @param options.page - The renderer, when the caller drives a seeded first
 * turn. With it, a turn the shell dropped is reported the moment it is
 * diagnosable instead of at the 180 s timeout.
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
  options: { readonly extension: string; readonly page?: Page; readonly writtenAfter?: number },
): Promise<string> => {
  const { extension, page, writtenAfter = Number.NEGATIVE_INFINITY } = options;
  const projectRoot = join(directory, slug);
  const isFreshSource = (entry: string): boolean => {
    if (!entry.endsWith(extension)) {
      return false;
    }
    const stat = statSync(join(projectRoot, entry));
    return stat.size > 0 && stat.mtimeMs > writtenAfter;
  };
  /* Non-empty, not merely present: project creation scaffolds a zero-byte
   * source file and the chat's `create_file` tool fills it afterwards, so an
   * existence check passes ~2 s after submit and proves nothing about the run. */
  const freshSource = (): string | undefined =>
    existsSync(projectRoot) ? readdirSync(projectRoot).find((entry) => isFreshSource(entry)) : undefined;
  /* Hand-rolled rather than `expect.poll`: the poll retries a callback that
   * throws until its own timeout, so the diagnosis below could never cut the
   * wait short from inside one. */
  const deadline = Date.now() + waitForProjectTimeout;
  const diagnoseAfter = Date.now() + lostSeedGrace;
  for (;;) {
    const found = freshSource();
    if (found !== undefined) {
      return join(projectRoot, found);
    }
    if (page !== undefined && Date.now() > diagnoseAfter && (await seedIsBackInComposer(page))) {
      throw new Error(
        `The seeded turn was lost: the transcript is empty and the prompt is back in the composer, so no ${extension} source will ever reach ${projectRoot}.`,
      );
    }
    if (Date.now() > deadline) {
      throw new Error(
        `No non-empty ${extension} source appeared in ${projectRoot} within ${String(waitForProjectTimeout / 1000)} s.`,
      );
    }
    await setTimeout(250);
  }
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

  /* The turn's own revision marker, not `Current`: 75b24eef3 replaced the full
   * `RevisionMarker` in the transcript with the compact `ChatRevisionMarker`,
   * whose only "Current" lives inside a `CollapsibleContent` that is closed —
   * and therefore unmounted — by default. The live region is the part that is
   * always rendered (`chat-revision-marker.tsx:246-253`). */
  const turnMarker = page.getByRole('status', { name: 'Turn revision status' }).last();
  await expectVisible(turnMarker, 60_000);
  await expect.poll(async () => (await turnMarker.textContent()) ?? '', { timeout: 60_000 }).toMatch(/^Rev \d+ saved/u);
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
 * Assert the kernel re-parsed the bytes an external writer just put on disk.
 *
 * The witness is the Parameters pane. Its inputs are built from the kernel's own
 * customizer parse of the file the utility watches through
 * `fromNodeFs(projectRoot)`, so a declaration that exists *only* in the new
 * bytes cannot be listed unless that write crossed the shell's second watcher
 * and reached the kernel (charter acceptance 5, "two authorities, one disk").
 * Pair it with {@link expectGeometryFramed}, which covers the render half — the
 * viewer can be framed from the previous geometry, so framing alone proves
 * nothing about the new bytes.
 *
 * The two previous witnesses read `.tau/cache/compute/v1`. 5608f5051 deleted
 * that CAS from the product along with `createRetainedSceneStore`, and
 * `createProjectComputeStores` has had no product caller since, so both polls
 * could only ever run out their timeout.
 *
 * `.tau/parameters/<source>.json` is deliberately **not** the witness: that
 * file is the renderer's parameter *value* store (`{activeGroup, groups}`),
 * written only when a user changes a value, and never carries the source's
 * declarations.
 *
 * @param page - The renderer.
 * @param parameterLabel - The pane's label for a declaration present only in the
 *   new bytes, in `formatDisplayLabel` casing (`tauSmokeDepth` reads as
 *   `Tau Smoke Depth`).
 * @returns Nothing.
 */
export const expectKernelReparsed = async (page: Page, parameterLabel: string): Promise<void> => {
  await page
    .getByRole('button', { name: /Search/u })
    .first()
    .click();
  await page.getByPlaceholder('Search projects, chats, and actions...').fill('Open parameters');
  await page.getByText('Open parameters', { exact: true }).first().click();
  /* 60 s, not the usual 180: a watched re-parse either lands within a few
   * seconds or the write never reached the kernel at all. */
  await expectVisible(page.getByLabel(`Input for ${parameterLabel}`).first(), 60_000);
};

/** The chat id the project route carries, which names the durable log's directory. */
export const activeChatId = (page: Page): string => {
  const url = page.url();
  const chatId = new URL(url).searchParams.get('chat');
  expect(chatId, `the project route carries no chat id: ${url}`).toBeTruthy();
  return chatId!;
};

/**
 * The two witnesses that a turn ran in launcher 2 — the services utility.
 *
 * Every desktop turn is launcher 2 since D18 removed the browser placement row,
 * so every chat spec is entitled to this, not just the launcher spec:
 *
 * - `services.agent-host-served` is written inside the process that ran the
 *   agent, so the renderer cannot produce it.
 * - the durable log is on real disk under the project root; a browser-host turn
 *   would leave its runs in OPFS or IndexedDB instead.
 *
 * @param logPath - The shell's rotating diagnostics log.
 * @param projectRoot - The project's absolute directory.
 * @param chatId - The chat whose durable log must exist.
 * @returns Nothing.
 */
export const expectLauncher2Turn = async (logPath: string, projectRoot: string, chatId: string): Promise<void> => {
  await expect
    .poll(() => (existsSync(logPath) ? readFileSync(logPath, 'utf8') : ''), { timeout: 180_000 })
    .toContain('services.agent-host-served');
  const eventsPath = join(projectRoot, '.tau/chats', chatId, 'events.jsonl');
  await expect.poll(() => existsSync(eventsPath), { timeout: 180_000 }).toBe(true);
  expect(readFileSync(eventsPath, 'utf8').trim().length).toBeGreaterThan(0);
};

/**
 * Open the chat's execution picker and read back the rows it offers.
 *
 * {@link selectChatModel} picks a Tau model row by name; this one exists for the
 * rows a *host* contributes — the external ACP agents, whose presence is the
 * assertion rather than a step on the way to one.
 *
 * @param page - The desktop page.
 * @returns Every option label the picker rendered, in order.
 */
export const openExecutionPicker = async (page: Page): Promise<readonly string[]> => {
  await parkPointer(page);
  /* The agent picker has its own trigger beside the composer; `Meta+Slash`
   * opens the *model* picker, which only exists for a Tau execution. */
  await page
    .getByRole('button', { name: /^Select agent: /u })
    .first()
    .click();
  const options = page.getByRole('option');
  await expectVisible(options.first());
  return options.allTextContents();
};
