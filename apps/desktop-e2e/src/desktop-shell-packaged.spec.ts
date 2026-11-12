import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';
import { desktopE2EPackagedExecutable } from '#support/config.js';
import { launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import {
  createTerminalProject,
  expectTerminalFile,
  expectTerminalRunning,
  reportShellDiagnostics,
  typeTerminalCommand,
} from '#support/shell-qualification.js';

let session: DesktopSession | undefined;

afterEach(async (context) => {
  if (context.task.result?.state === 'fail' && session) {
    await reportShellDiagnostics(session);
    await session.capture(`shell-packaged-${context.task.id}`);
  }
  await session?.close();
  session = undefined;
});

/*
 * DSK-21 packaged shell smoke (operator ruling 2026-11-12): the packaged app, not the development build, starts its
 * shipped shell provider, and a command typed into the Terminal writes real bytes in the project. The executable is
 * required, never defaulted, so this row cannot pass against a development build. On macOS the human Terminal runs the
 * system Zsh with the person's startup files (operator ruling 2026-11-01T18:57Z); elsewhere it runs Bash.
 */
const terminalShell =
  process.platform === 'darwin'
    ? { prompt: /%\s*$/u, version: 'ZSH_VERSION' }
    : { prompt: /\$\s*$/u, version: 'BASH_VERSION' };

describe('packaged Terminal smoke', () => {
  it('should run the shipped Terminal shell from the packaged app and write into the project', async () => {
    session = await launchDesktopApp({
      packaged: true,
      packagedExecutable: desktopE2EPackagedExecutable(),
      token: 'offline-shell-packaged',
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Environment variables retain their wire names.
      env: { TAU_DEBUG: 'false' },
    });
    expect(await session.application.evaluate(({ app }) => app.isPackaged)).toBe(true);
    const root = await createTerminalProject(session);
    await expectTerminalRunning(session.page, terminalShell.prompt);
    await typeTerminalCommand(
      session.page,
      `printf '%s' "$${terminalShell.version}" > shell-version.txt; printf 'packaged-%s' ok > packaged-smoke.txt`,
    );
    await expectTerminalFile(root, 'packaged-smoke.txt', 'packaged-ok');
    expect(await readFile(join(root, 'shell-version.txt'), 'utf8')).toMatch(/^\d+\.\d+/u);
  });
});
