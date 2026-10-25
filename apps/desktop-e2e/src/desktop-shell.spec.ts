/* oxlint-disable no-template-curly-in-string -- These placeholders are expanded by Bash, never JavaScript. */
import { access, readFile, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { createTerminalProject, expectTerminalFile, typeTerminalCommand } from '#support/shell-qualification.js';

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
  if (context.task.result?.state === 'fail') {
    await session?.capture(`shell-qualification-${context.task.id}`);
  }
  await session?.close();
  session = undefined;
});

/** Start only by clicking trusted chrome; unavailable prerequisites fail the test. */
const startTerminal = async (): Promise<{ session: DesktopSession; root: string }> => {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Environment variables retain their wire names.
  session = await launchDesktopApp({ token: 'offline-shell-qualification', env: { TAU_DEBUG: 'false' } });
  const root = await createTerminalProject(session);
  await session.page.getByRole('button', { name: 'Start Terminal', exact: true }).click();
  await session.page.getByRole('button', { name: 'Restart', exact: true }).waitFor();
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
    await page.getByRole('button', { name: 'Restart', exact: true }).waitFor();
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
    await page.getByRole('menuitem', { name: 'Details', exact: true }).click();
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
    await page.getByRole('button', { name: 'Start Terminal', exact: true }).waitFor();
    expect(await readFile(join(root, 'reload-count.txt'), 'utf8')).toBe('once');
    await page.getByRole('button', { name: 'Start Terminal', exact: true }).click();
    await page.getByRole('button', { name: 'Restart', exact: true }).waitFor();
    await typeTerminalCommand(page, 'printf fresh > after-reload.txt');
    await expectTerminalFile(root, 'after-reload.txt', 'fresh');
    expect(await readFile(join(root, 'reload-count.txt'), 'utf8')).toBe('once');
  });

  it('should replace access only after the trusted decision and never replay typed work', async () => {
    const { session: desktop, root } = await startTerminal();
    const { page } = desktop;
    await typeTerminalCommand(page, 'export TAU_OLD_SESSION=old; printf once >> executions.txt');
    await expectTerminalFile(root, 'executions.txt', 'once');
    await page.keyboard.type('printf replayed >> executions.txt');
    await page.getByRole('button', { name: 'Request access', exact: true }).click();
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
    await page.getByRole('button', { name: 'Restart', exact: true }).waitFor();
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
    const title = await page.title();
    await typeTerminalCommand(
      page,
      String.raw`printf '\033]52;c;cmVwbGFjZWQ=\007\033]0;spoofed title\007'; printf '<script>window.open("https://fixture.invalid")</script>\n'; printf done > output-done.txt`,
    );
    await expectTerminalFile(root, 'output-done.txt', 'done');
    expect(await application.evaluate(({ clipboard }) => clipboard.readText())).toBe('fixture clipboard');
    expect(await page.title()).toBe(title);
    expect(await application.evaluate(() => Reflect.has(globalThis, '__TAU_E2E_EXTERNAL_URL__'))).toBe(false);
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
});
