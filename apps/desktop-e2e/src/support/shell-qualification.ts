import { readFile, readdir, writeFile, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import process from 'node:process';
import { expect } from 'vitest';
import type { BrowserWindow } from 'electron';
import type { Locator, Page } from 'playwright';
import type { DesktopSession } from '#support/desktop-app.js';

/**
 * The Terminal pane's own region. The workbench group around it is also a region named for its active tab, so the
 * pane is the Terminal region inside that group.
 */
export const terminalRegion = (page: Page): Locator =>
  page.getByRole('region', { name: 'Terminal', exact: true }).getByRole('region', { name: 'Terminal', exact: true });

/**
 * On a failed row, print the shell's own diagnostics into the job log: the desktop log's shell, Terminal and supervisor
 * lines (probe outcome, refusals) and the Terminal pane's visible text. Reporting only; it never changes a verdict.
 *
 * @param session - The failed row's session, before it closes.
 */
export const reportShellDiagnostics = async (session: DesktopSession): Promise<void> => {
  const log = await readFile(session.logPath, 'utf8').catch((error: unknown) => `unreadable: ${String(error)}`);
  const lines = log
    .split('\n')
    .filter((line) => /shell|terminal|pty|supervisor|sandbox/iu.test(line))
    .slice(-60)
    .map((line) => line.slice(0, 600));
  const pane = await terminalRegion(session.page)
    .textContent({ timeout: 2000 })
    .then((text) => text ?? '')
    .catch(() => 'no Terminal pane');
  console.info('SHELL DIAGNOSTICS', JSON.stringify({ lines, pane: pane.slice(0, 2000) }));
};

/**
 * Wait until the pane's own session is live. The Terminal starts itself when the pane mounts — there is no Start
 * button, and `Restart`, `Find` and `Request access` are the pane's context-menu items, not inner header controls —
 * so readiness is the shell's own first prompt, which neither a refusal nor an ended session can ever print.
 *
 * @param page - The desktop page showing the Terminal pane.
 */
export const expectTerminalRunning = async (page: Page): Promise<void> => {
  await page.getByRole('textbox', { name: 'Terminal', exact: true }).waitFor({ timeout: 60_000 });
  /*
   * A prompt alone is not the new session. An access replacement keeps the renderer and clears the old screen
   * asynchronously, so the mirror can still be showing the replaced shell's `$` while the pane is starting — and a
   * command typed into that gap is discarded. The pane says so itself: it renders this status for the whole of idle,
   * starting and checking, and nothing else does, so its absence is the only running signal there is from outside.
   */
  await page
    .getByRole('status', { name: 'Starting Terminal', exact: true })
    .waitFor({ state: 'detached', timeout: 60_000 });
  await expect
    .poll(async () => page.locator('[data-terminal-screen-mirror] > div').allTextContents(), { timeout: 60_000 })
    .toEqual(expect.arrayContaining([expect.stringMatching(/\$\s*$/u)]));
};

/**
 * Choose one of the pane's own actions the way a person does, from the Terminal actions menu the pane advertises as
 * Shift+F10 and opens on a real right-click. They are deliberately not buttons in an inner header.
 *
 * @param page - The desktop page showing the Terminal pane.
 * @param name - The action to choose.
 */
export const terminalAction = async (page: Page, name: 'Find' | 'Request access' | 'Restart'): Promise<void> => {
  await terminalRegion(page).click({ button: 'right' });
  await page.getByRole('menuitem', { name, exact: true }).click();
};

/**
 * A native question Tau's main process asked, as the harness recorded it.
 */
export type NativeQuestion = Readonly<{ message: string; buttons: readonly string[] }>;

const unloadAnswers = '__TAU_E2E_UNLOAD_QUESTIONS__';

/**
 * Answer the window's running-Terminal question the way a person would, and record it.
 *
 * A running session holds the page's unload (T15), so reloading the window or closing it asks first through
 * `dialog.showMessageBoxSync` — a native modal no browser automation can reach, which is why the answer is installed
 * before the navigation rather than clicked afterwards. Only the operating system's message box stands in; the hold
 * itself, the main process's handler and the session's end are the production ones, and
 * {@link nativeQuestionsAsked} proves the question was really put.
 *
 * @param session - The running desktop session.
 * @param choice - The button a person would press.
 */
export const answerUnloadQuestion = async (
  session: DesktopSession,
  choice: 'Keep open' | 'Close and stop',
): Promise<void> => {
  await session.application.evaluate(
    ({ dialog }, [key, answer]) => {
      const asked: NativeQuestion[] = (Reflect.get(globalThis, key!) as NativeQuestion[] | undefined) ?? [];
      Reflect.set(globalThis, key!, asked);
      dialog.showMessageBoxSync = (...args: readonly unknown[]): number => {
        const options = (args.length > 1 ? args[1] : args[0]) as { message: string; buttons: string[] };
        asked.push({ message: options.message, buttons: [...options.buttons] });
        return options.buttons.indexOf(answer!);
      };
    },
    [unloadAnswers, choice],
  );
};

/**
 * The native questions this session has asked since {@link answerUnloadQuestion} was installed.
 *
 * @param session - The desktop session.
 * @returns Each question's message and buttons, oldest first.
 */
export const nativeQuestionsAsked = async (session: DesktopSession): Promise<readonly NativeQuestion[]> =>
  session.application.evaluate(
    (_electron, key) => (Reflect.get(globalThis, key) as NativeQuestion[] | undefined) ?? [],
    unloadAnswers,
  );

/**
 * Paste the clipboard into the Terminal the way a person does: a real click into the terminal, then the platform's
 * paste chord.
 *
 * The chord is deliberately left to the browser — AurigaX never encodes it, and the renderer turns the `paste` event
 * Chromium delivers into a bracketed `terminal.paste` — so this is the only path there is, and the click comes first
 * because Chromium's paste needs a selection inside the editing host, which a person's click is what establishes.
 *
 * @param session - The running desktop session.
 */
export const pasteIntoTerminal = async (session: DesktopSession): Promise<void> => {
  const { page } = session;
  const canvas = await page
    .getByRole('textbox', { name: 'Terminal', exact: true })
    .locator('canvas')
    .first()
    .boundingBox();
  expect(canvas).not.toBeNull();
  await page.mouse.click(canvas!.x + canvas!.width / 2, canvas!.y + canvas!.height / 2);
  // Plain Ctrl+V is ^V for the shell; macOS needs no help, since Cmd+V reaches the paste event through AurigaX.
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+v' : 'Control+Shift+V');
};

/**
 * Copy the terminal's selection the way a person does, through the window's own copy command.
 *
 * This is the path the Edit menu and its accelerator take: Chromium's copy fires the `copy` event the renderer
 * answers with the terminal's selection. `Ctrl+C` is not that path and must not be — in a terminal it is the
 * interrupt, which another row certifies, so it reaches the shell as `SIGINT` and copies nothing.
 *
 * @param session - The running desktop session.
 */
export const copyTerminalSelection = async (session: DesktopSession): Promise<void> => {
  const window = await session.application.browserWindow(session.page);
  await window.evaluate((nativeWindow: BrowserWindow) => {
    nativeWindow.webContents.copy();
  });
};

/**
 * Open the production workbench surface through its ordinary menu, unless it is already open.
 *
 * A project whose saved layout already holds the Terminal offers no Terminal item in the tab menu, because the pane
 * is there — and it starts its own session on mount, so there is nothing to open.
 *
 * @param page - The desktop page.
 */
export const openTerminalPane = async (page: Page): Promise<void> => {
  if ((await terminalRegion(page).count()) > 0) {
    return;
  }
  await page.getByRole('button', { name: 'Open workbench tab', exact: true }).first().click();
  await page.getByRole('menuitem', { name: 'Terminal', exact: true }).click();
  await terminalRegion(page).waitFor();
};

/** Create an offline project through the same form a person uses. */
export const createTerminalProject = async (session: DesktopSession): Promise<string> => {
  const { page } = session;
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('app://tau/projects/new');
  await page.getByLabel('Project Name *').fill('Shell qualification');
  await page.getByRole('button', { name: /^Create Project/u }).click();
  await page.waitForURL(/\/w\//u, { timeout: 60_000 });
  await openTerminalPane(page);
  return join(session.homeRoot, 'shell-qualification');
};

/** Input goes through real keyboard events, never a direct bridge call. */
export const typeTerminalCommand = async (page: Page, command: string): Promise<void> => {
  await page.getByRole('textbox', { name: 'Terminal', exact: true }).focus();
  await page.keyboard.type(command);
  await page.keyboard.press('Enter');
};

/** External file bytes cannot be satisfied by echoed input in the terminal. */
export const expectTerminalFile = async (root: string, path: string, expected: string): Promise<void> => {
  await expect
    .poll(async () => readFile(join(root, path), 'utf8').catch(() => undefined), { timeout: 30_000 })
    .toBe(expected);
};

/** Locate a rendered word using the actual PTY grid and accessible screen, then let Playwright send real pointer input. */
export const terminalWordPosition = async (
  page: Page,
  options: { readonly root: string; readonly sizeFile: string; readonly word: string },
): Promise<{ x: number; y: number }> => {
  const size = await readFile(join(options.root, options.sizeFile), 'utf8');
  const [rows, columns] = size.trim().split(/\s+/u).map(Number);
  expect(rows).toBeGreaterThan(0);
  expect(columns).toBeGreaterThan(0);
  const visibleRows = await page.locator('[data-terminal-screen-mirror] > div').allTextContents();
  const row = visibleRows.findIndex((text) => text.trim() === options.word);
  expect(row, `the output must visibly contain ${options.word}`).toBeGreaterThanOrEqual(0);
  const canvas = await page
    .getByRole('textbox', { name: 'Terminal', exact: true })
    .locator('canvas')
    .first()
    .boundingBox();
  expect(canvas).not.toBeNull();
  return { x: canvas!.x + (canvas!.width / columns!) * 3, y: canvas!.y + (canvas!.height / rows!) * (row + 0.5) };
};

/** Observe Linux host process identities, including start time so PID reuse cannot look like a surviving writer. */
type ObservedProcess = {
  readonly pid: number;
  readonly parent: number;
  readonly started: string;
  readonly command: string;
};

const processSnapshot = async (): Promise<readonly ObservedProcess[]> => {
  const names = await readdir('/proc');
  const rows = await Promise.all(
    names
      .filter((name) => /^\d+$/u.test(name))
      .map(async (name) => {
        try {
          const owner = await stat(`/proc/${name}`);
          if (owner.uid !== process.getuid?.()) {
            return [];
          }
          const [status, command] = await Promise.all([
            readFile(`/proc/${name}/stat`, 'utf8'),
            readFile(`/proc/${name}/cmdline`, 'utf8'),
          ]);
          const fields = status.slice(status.lastIndexOf(')') + 2).split(' ');
          return [{ pid: Number(name), parent: Number(fields[1]), started: fields[19]!, command }];
        } catch (error) {
          if (error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ESRCH')) {
            return [];
          }
          throw error;
        }
      }),
  );
  return rows.flat();
};

/** A writer observed from outside Electron and its sandbox; no namespace-local PID is treated as a host PID. */
export type TerminalWriter = {
  readonly path: string;
  readonly processes: readonly ObservedProcess[];
};

/** Start a real shell child, prove it writes repeatedly, then capture its host process tree. */
export const startTerminalWriter = async (page: Page, root: string): Promise<TerminalWriter> => {
  const name = `heartbeat-${randomUUID()}`;
  const scriptPath = join(root, `${name}.sh`);
  const path = join(root, `${name}.txt`);
  await writeFile(
    scriptPath,
    `while :; do printf x >> '${path.replaceAll("'", String.raw`'\''`)}'; sleep 0.02; done\n`,
  );
  await typeTerminalCommand(page, `bash '${scriptPath.replaceAll("'", String.raw`'\''`)}' &`);
  await expect
    .poll(
      async () => {
        const bytes = await readFile(path);
        return bytes.byteLength;
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThan(2);
  const snapshot = await processSnapshot();
  const roots = snapshot.filter(({ command }) => command.split('\0').includes(scriptPath));
  expect(roots, 'the external observer must find the running writer, not just an old file').toHaveLength(1);
  const shell = snapshot.find(({ pid }) => pid === roots[0]!.parent);
  expect(shell?.command.split('\0'), 'the writer must be a child of the real interactive session').toEqual(
    expect.arrayContaining(['--noprofile', '--norc', '-i']),
  );
  const owned = new Set([shell!.pid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of snapshot) {
      if (owned.has(row.parent) && !owned.has(row.pid)) {
        owned.add(row.pid);
        changed = true;
      }
    }
  }
  return { path, processes: snapshot.filter(({ pid }) => owned.has(pid)) };
};

/** Return captured processes still alive under the same host identity. */
export const survivingTerminalWriter = async (writer: TerminalWriter): Promise<readonly number[]> => {
  const snapshot = await processSnapshot();
  return writer.processes
    .filter((owned) => snapshot.some((row) => row.pid === owned.pid && row.started === owned.started))
    .map(({ pid }) => pid);
};

/** Cleanup is judged before the harness's fallback process killer or root deletion runs. */
export const expectTerminalWriterStopped = async (writer: TerminalWriter): Promise<void> => {
  await expect.poll(async () => survivingTerminalWriter(writer), { timeout: 10_000 }).toEqual([]);
  const stoppedBytes = await readFile(writer.path);
  // A bounded observation window detects writers that escaped the originally observed process tree.
  const stableUntil = performance.now() + 300;
  await expect
    .poll(
      async () => {
        expect(await readFile(writer.path)).toEqual(stoppedBytes);
        return performance.now() >= stableUntil;
      },
      { timeout: 2000, interval: 25 },
    )
    .toBe(true);
};
