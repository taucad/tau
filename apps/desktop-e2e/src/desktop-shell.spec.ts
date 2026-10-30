/* oxlint-disable no-template-curly-in-string -- These placeholders are expanded by Bash, never JavaScript. */
import { access, readFile, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BrowserWindow } from 'electron';
import { launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import {
  createTerminalProject,
  expectTerminalFile,
  typeTerminalCommand,
  openTerminalPane,
  startTerminalWriter,
  expectTerminalWriterStopped,
  survivingTerminalWriter,
  terminalWordPosition,
  terminalRegion,
  terminalAction,
  expectTerminalRunning,
  reportShellDiagnostics,
} from '#support/shell-qualification.js';

let session: DesktopSession | undefined;

beforeEach(async () => {
  // These keyboard fixtures certify Linux only. A missing native row is not a skipped passing row.
  if (process.platform !== 'linux') {
    throw new Error(
      'Linux Terminal qualification required. macOS PTY remains unverified; Windows awaits its provider.',
    );
  }
  await access('/usr/bin/socat', constants.X_OK);
});

afterEach(async (context) => {
  if (context.task.result?.state === 'fail' && session) {
    await reportShellDiagnostics(session);
    await session.capture(`shell-qualification-${context.task.id}`);
  }
  await session?.close();
  session = undefined;
});

/** The pane starts its own session when it mounts; unavailable prerequisites fail the test, never skip it. */
const startTerminal = async (preserveProfile = false): Promise<{ session: DesktopSession; root: string }> => {
  session = await launchDesktopApp({
    token: 'offline-shell-qualification',
    preserveProfile,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Environment variables retain their wire names.
    env: { TAU_DEBUG: 'false' },
  });
  const root = await createTerminalProject(session);
  await expectTerminalRunning(session.page);
  return { session, root };
};

describe('production Electron Terminal keyboard qualification', () => {
  it('should preserve cwd, variables and interactive input, then start clean after EOF', async () => {
    const { session: desktop, root } = await startTerminal();
    const { page } = desktop;
    await typeTerminalCommand(
      page,
      "mkdir nested; cd nested; export TAU_FIXTURE_VALUE='state λ'; printf '%s' \"$PWD\" > cwd.txt",
    );
    await expectTerminalFile(root, 'nested/cwd.txt', join(root, 'nested'));
    await typeTerminalCommand(page, 'printf \'%s\' "$TAU_FIXTURE_VALUE" > state.txt');
    await expectTerminalFile(root, 'nested/state.txt', 'state λ');
    // A shell read is an interactive prompt-driven utility with no optional interpreter dependency.
    await typeTerminalCommand(page, "read -r -p 'Fixture input: ' answer; printf '%s' \"$answer\" > answer.txt");
    await typeTerminalCommand(page, 'interactive answer');
    await expectTerminalFile(root, 'nested/answer.txt', 'interactive answer');
    await page.keyboard.press('Control+d');
    await page.getByRole('button', { name: 'Start a new Terminal', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Start a new Terminal', exact: true }).click();
    await expectTerminalRunning(page);
    await typeTerminalCommand(page, 'printf \'%s|%s\' "$PWD" "${TAU_FIXTURE_VALUE-unset}" > fresh.txt');
    await expectTerminalFile(root, 'fresh.txt', `${root}|unset`);
  });

  it('should interrupt a foreground command without closing Tau and edit the next line', async () => {
    const { session: desktop, root } = await startTerminal();
    const { page } = desktop;
    await typeTerminalCommand(page, 'printf ready > interrupt-ready.txt; sleep 60; printf wrong > completed.txt');
    await expectTerminalFile(root, 'interrupt-ready.txt', 'ready');
    await page.keyboard.press('Control+c');
    await typeTerminalCommand(page, 'printf \'%s\' "$?" > interrupt-status.txt');
    await expectTerminalFile(root, 'interrupt-status.txt', '130');
    await expect(stat(join(root, 'completed.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
    await page.keyboard.type('printf right > edit.txtX');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Enter');
    await expectTerminalFile(root, 'edit.txt', 'right');
  });

  it('should bracket multiline Unicode paste until Enter and copy a mouse-selected word through the clipboard', async () => {
    const { session: desktop, root } = await startTerminal();
    const { page, application } = desktop;
    await typeTerminalCommand(
      page,
      String.raw`bind 'set enable-bracketed-paste on'; printf ready > paste-ready.txt; printf 'readline-%s\n' ready`,
    );
    await expectTerminalFile(root, 'paste-ready.txt', 'ready');
    await expect
      .poll(async () => page.locator('[data-terminal-screen-mirror]').textContent())
      .toContain('readline-ready');
    await application.evaluate(({ clipboard }) => {
      clipboard.writeText("printf '%s' 'λ東京' > pasted-one.txt\nprintf '%s' '$literal' > pasted-two.txt");
    });
    // The platform's terminal paste chord; plain Ctrl+V is ^V for the shell.
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+v' : 'Control+Shift+V');
    await expect
      .poll(async () => page.locator('[data-terminal-screen-mirror]').textContent())
      .toContain('pasted-two.txt');
    await expect(stat(join(root, 'pasted-one.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(stat(join(root, 'pasted-two.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
    await page.keyboard.press('Enter');
    await expectTerminalFile(root, 'pasted-one.txt', 'λ東京');
    await expectTerminalFile(root, 'pasted-two.txt', '$literal');
    await typeTerminalCommand(page, String.raw`stty size > copy-size.txt; printf 'copy%s\n' fixture`);
    await expect.poll(async () => page.locator('[data-terminal-screen-mirror]').textContent()).toContain('copyfixture');
    const word = await terminalWordPosition(page, { root, sizeFile: 'copy-size.txt', word: 'copyfixture' });
    await page.mouse.dblclick(word.x, word.y);
    await application.evaluate(({ clipboard }) => {
      clipboard.writeText('not copied');
    });
    await page.keyboard.press('Control+c');
    await expect.poll(async () => application.evaluate(({ clipboard }) => clipboard.readText())).toBe('copyfixture');
  });

  it('should resize the actual PTY and preserve the session when another tab hides it', async () => {
    const { session: desktop, root } = await startTerminal();
    const { page } = desktop;
    await typeTerminalCommand(page, 'export TAU_HIDDEN_SESSION=retained; stty size > size-before.txt');
    await expect.poll(async () => readFile(join(root, 'size-before.txt'), 'utf8')).toMatch(/^\d+ \d+\r?\n$/u);
    const before = await readFile(join(root, 'size-before.txt'), 'utf8');
    await page.setViewportSize({ width: 1100, height: 650 });
    await page.evaluate(
      async () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              resolve();
            });
          });
        }),
    );
    await typeTerminalCommand(page, 'stty size > size-after.txt');
    await expect.poll(async () => readFile(join(root, 'size-after.txt'), 'utf8')).toMatch(/^\d+ \d+\r?\n$/u);
    expect(await readFile(join(root, 'size-after.txt'), 'utf8')).not.toBe(before);
    await page.getByRole('button', { name: 'Open workbench tab', exact: true }).first().click();
    // The item's name ends with its keyboard shortcut.
    await page.getByRole('menuitem', { name: /^Details/u }).click();
    await page.locator('.dv-tab[data-tab-panel-id="workbench:terminal"]').click();
    await typeTerminalCommand(page, 'printf %s "$TAU_HIDDEN_SESSION" > hidden-state.txt');
    await expectTerminalFile(root, 'hidden-state.txt', 'retained');
  });

  it('should restore a passive pane after renderer reload without replaying input', async () => {
    const { session: desktop, root } = await startTerminal();
    const { page } = desktop;
    await typeTerminalCommand(page, 'printf once >> reload-count.txt');
    await expectTerminalFile(root, 'reload-count.txt', 'once');
    await page.keyboard.type('printf replayed >> reload-count.txt');
    // Wait for the ordinary layout write before the renderer goes away.
    await expect.poll(async () => readFile(join(root, '.tau/workbench/layout.json'), 'utf8')).toContain('terminal');
    await page.reload();
    /* The restored pane starts a session of its own; the typed-but-unsent line is not carried into it. */
    await expectTerminalRunning(page);
    expect(await readFile(join(root, 'reload-count.txt'), 'utf8')).toBe('once');
    await typeTerminalCommand(page, 'printf fresh > after-reload.txt');
    await expectTerminalFile(root, 'after-reload.txt', 'fresh');
    expect(await readFile(join(root, 'reload-count.txt'), 'utf8')).toBe('once');
  });

  it('should stop an external writer on named Close and reopen with a clean session', async () => {
    const { session: desktop, root } = await startTerminal();
    const { page } = desktop;
    const writer = await startTerminalWriter(page, root);
    await page.keyboard.type('printf replayed > close-replay.txt');
    await page.locator('.dv-tab[data-tab-panel-id="workbench:terminal"]').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Close', exact: true }).click();
    await terminalRegion(page).waitFor({ state: 'detached' });
    await expectTerminalWriterStopped(writer);
    await openTerminalPane(page);
    await expectTerminalRunning(page);
    await typeTerminalCommand(page, 'printf fresh > after-close.txt');
    await expectTerminalFile(root, 'after-close.txt', 'fresh');
    await expect(stat(join(root, 'close-replay.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('should stop the old project writer before accepting input in a different project', async () => {
    const { session: desktop, root } = await startTerminal();
    const { page } = desktop;
    const writer = await startTerminalWriter(page, root);
    await page.keyboard.type('printf stale > project-replay.txt');
    await page.goto('app://tau/projects/new');
    await page.getByLabel('Project Name *').fill('Other shell project');
    await page.getByRole('button', { name: /^Create Project/u }).click();
    await page.waitForURL(/\/w\//u);
    await expectTerminalWriterStopped(writer);
    await openTerminalPane(page);
    await expectTerminalRunning(page);
    await typeTerminalCommand(page, 'printf %s "$PWD" > project-cwd.txt');
    const otherRoot = join(desktop.homeRoot, 'other-shell-project');
    await expectTerminalFile(otherRoot, 'project-cwd.txt', otherRoot);
    await expect(stat(join(root, 'project-replay.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(stat(join(otherRoot, 'project-replay.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('should stop owned writers on normal app quit and restart without replaying input', async () => {
    const { session: desktop, root } = await startTerminal(true);
    const { page, application } = desktop;
    const projectUrl = page.url();
    const writer = await startTerminalWriter(page, root);
    await page.keyboard.type('printf stale > quit-replay.txt');
    await expect.poll(async () => readFile(join(root, '.tau/workbench/layout.json'), 'utf8')).toContain('terminal');
    await application.evaluate(({ app }) => {
      app.quit();
    });
    await expect.poll(() => application.process().exitCode, { timeout: 30_000 }).toBe(0);
    await expectTerminalWriterStopped(writer);
    await desktop.close();
    session = await launchDesktopApp({ token: 'offline-shell-qualification', profileRoot: dirname(desktop.homeRoot) });
    await session.page.goto(projectUrl);
    await expectTerminalRunning(session.page);
    await expect(stat(join(root, 'quit-replay.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
    await typeTerminalCommand(session.page, 'printf restarted > after-quit.txt');
    await expectTerminalFile(root, 'after-quit.txt', 'restarted');
    await expect(stat(join(root, 'quit-replay.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('should replace access only after the trusted decision and never replay typed work', async () => {
    const { session: desktop, root } = await startTerminal();
    const { page } = desktop;
    await typeTerminalCommand(page, 'export TAU_OLD_SESSION=old; printf once >> executions.txt');
    await expectTerminalFile(root, 'executions.txt', 'once');
    const writer = await startTerminalWriter(page, root);
    await page.keyboard.type('printf replayed >> executions.txt');
    await terminalAction(page, 'Request access');
    await page.getByLabel('Hosts to reach', { exact: true }).fill('fixture.invalid');
    await page
      .getByRole('form', { name: 'Request Terminal access' })
      .getByRole('button', { name: 'Request access', exact: true })
      .click();
    const decision = page.locator('[data-slot="terminal-access-decision"]');
    await decision.getByRole('button', { name: 'Allow and restart', exact: true }).click();
    await expect
      .poll(async () => page.getByRole('status').allTextContents())
      .toContain('The Terminal restarted with new access.');
    await expectTerminalRunning(page);
    // At the first observed replacement session, the old writer must already be gone.
    expect(await survivingTerminalWriter(writer)).toEqual([]);
    await expectTerminalWriterStopped(writer);
    await typeTerminalCommand(page, 'printf \'%s\' "${TAU_OLD_SESSION-unset}" > replaced.txt');
    await expectTerminalFile(root, 'replaced.txt', 'unset');
    expect(await readFile(join(root, 'executions.txt'), 'utf8')).toBe('once');
  });

  it('should keep output as data and expose output written after focus to accessibility', async () => {
    const { session: desktop, root } = await startTerminal();
    const { page, application } = desktop;
    await application.evaluate(({ clipboard }) => {
      clipboard.writeText('fixture clipboard');
    });
    // Prove the existing harness observer catches the production main-process action before relying on a negative.
    await application.evaluate(async ({ shell }) => {
      await shell.openExternal('https://fixture.invalid/observer-control');
    });
    expect(await application.evaluate(() => Reflect.get(globalThis, '__TAU_E2E_EXTERNAL_URL__') as unknown)).toBe(
      'https://fixture.invalid/observer-control',
    );
    await application.evaluate(() => {
      Reflect.deleteProperty(globalThis, '__TAU_E2E_EXTERNAL_URL__');
    });
    const title = await page.title();
    const location = page.url();
    const windowCount = application.windows().length;
    await typeTerminalCommand(
      page,
      String.raw`stty size > output-size.txt; printf '\033]52;c;cmVwbGFjZWQ=\007\033]0;spoofed title\007'; printf '\033]8;;https://fixture.invalid/osc8\007untrusted-link\033]8;;\007\n'; printf '\033]8;;file:///tmp/tau-shell-output-canary\007file-link\033]8;;\007\n'; printf '<script>window.open("https://fixture.invalid")</script>\n'; for ((i=0; i<256; i++)); do printf '\033]0;'; printf '%4096s' x; printf '\007'; done; printf done > output-done.txt; printf 'escape-stream-%s\n' drained`,
    );
    await expectTerminalFile(root, 'output-done.txt', 'done');
    await expect
      .poll(async () => page.locator('[data-terminal-screen-mirror]').textContent(), { timeout: 30_000 })
      .toContain('escape-stream-drained');
    expect(await application.evaluate(({ clipboard }) => clipboard.readText())).toBe('fixture clipboard');
    expect(await page.title()).toBe(title);
    expect(page.url()).toBe(location);
    expect(application.windows()).toHaveLength(windowCount);
    expect(await application.evaluate(() => Reflect.has(globalThis, '__TAU_E2E_EXTERNAL_URL__'))).toBe(false);
    const fileLink = await terminalWordPosition(page, { root, sizeFile: 'output-size.txt', word: 'file-link' });
    await page.keyboard.down('Control');
    try {
      await page.mouse.click(fileLink.x, fileLink.y);
    } finally {
      await page.keyboard.up('Control');
    }
    expect(await application.evaluate(() => Reflect.has(globalThis, '__TAU_E2E_EXTERNAL_URL__'))).toBe(false);
    expect(page.url()).toBe(location);
    expect(application.windows()).toHaveLength(windowCount);
    await typeTerminalCommand(
      page,
      String.raw`for ((i=0; i<5000; i++)); do printf 'output %s\n' "$i"; done; printf flood-finished > flood.txt`,
    );
    await expectTerminalFile(root, 'flood.txt', 'flood-finished');
    await typeTerminalCommand(page, String.raw`printf 'after-focus-%s\n' 'visible'`);
    await expect
      .poll(async () => page.locator('[data-terminal-screen-mirror]').textContent())
      .toContain('after-focus-visible');
    expect(await page.locator('[data-terminal-announcer] > div').count()).toBeLessThanOrEqual(100);
    await page.keyboard.press('Shift+Escape');
    await expect
      .poll(async () =>
        page.locator('[data-slot="terminal-chrome"]').evaluate((element) => element === document.activeElement),
      )
      .toBe(true);
    await page.getByRole('button', { name: 'Find', exact: true }).click();
    await page.getByRole('textbox', { name: 'Find in Terminal', exact: true }).fill('after-focus-visible');
    await page.keyboard.press('Enter');
    expect(await page.getByRole('status').allTextContents()).not.toContain('No match for “after-focus-visible”.');
  });

  it('should retain readable output and keyboard escape at 200 percent zoom and forced colors', async () => {
    const { session: desktop, root } = await startTerminal();
    const { page, application } = desktop;
    const window = await application.browserWindow(page);
    // Keep the CSS viewport on the desktop layout so zoom itself, not a layout switch, is under test. The project
    // helper emulates a 1440 by 900 viewport, which zoom would halve to the phone layout, where no Terminal is
    // offered; the emulated viewport, not the window, has to double.
    await page.setViewportSize({ width: 2880, height: 1800 });
    await window.evaluate((nativeWindow: BrowserWindow) => {
      nativeWindow.setContentSize(2880, 1800);
      nativeWindow.webContents.setZoomFactor(2);
    });
    await expect.poll(async () => page.evaluate(() => innerWidth)).toBe(1440);
    await page.emulateMedia({ forcedColors: 'active' });
    expect(await window.evaluate((nativeWindow: BrowserWindow) => nativeWindow.webContents.getZoomFactor())).toBe(2);
    expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
    await typeTerminalCommand(page, String.raw`printf 'zoom-%s\n' visible; printf zoomed > zoom.txt`);
    await expectTerminalFile(root, 'zoom.txt', 'zoomed');
    await expect
      .poll(async () => page.locator('[data-terminal-screen-mirror]').textContent())
      .toContain('zoom-visible');
    await page.keyboard.press('Shift+Escape');
    await expect
      .poll(async () =>
        page.locator('[data-slot="terminal-chrome"]').evaluate((element) => element === document.activeElement),
      )
      .toBe(true);
    await page.keyboard.press('Tab');
    await expect
      .poll(async () =>
        page
          .getByRole('button', { name: 'Find', exact: true })
          .evaluate((element) => element === document.activeElement),
      )
      .toBe(true);
    await page.keyboard.press('Enter');
    await expect
      .poll(async () =>
        page
          .getByRole('textbox', { name: 'Find in Terminal', exact: true })
          .evaluate((element) => element === document.activeElement),
      )
      .toBe(true);
    await page.keyboard.type('zoom-visible');
    await page.keyboard.press('Escape');
    await expect
      .poll(async () =>
        page
          .getByRole('textbox', { name: 'Terminal', exact: true })
          .evaluate((element) => element === document.activeElement),
      )
      .toBe(true);
  });
});
