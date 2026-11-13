import { existsSync } from 'node:fs';
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
 * Packaged shell smoke: the packaged app, not the development build, starts its
 * shipped shell provider, and a command typed into the Terminal writes real bytes in the project. The executable is
 * required, never defaulted, so this row cannot pass against a development build. On macOS the human Terminal runs the
 * system Zsh with the person's startup files, so its prompt is theirs: readiness waits for any drawn prompt line, and
 * the version marker the command writes proves which shell ran. Elsewhere the Terminal runs Bash.
 */
const terminalShell =
  process.platform === 'darwin'
    ? { prompt: /\S/u, version: 'ZSH_VERSION' }
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

    /*
     * The Terminal reads the project's real git store, read-only, with the git the app bundles: `git status` answers
     * once Tau has created the store. The packaged bundle's own `bin` folder leads the launch's `PATH`; on Linux the
     * shell runs that git, while a macOS login Zsh lets `/etc/zprofile` move the system folders ahead of it.
     */
    await expect.poll(() => existsSync(join(root, '.git', 'HEAD')), { timeout: 30_000 }).toBe(true);
    await typeTerminalCommand(
      session.page,
      `git status --porcelain > git-status.txt 2>&1; printf '%s' "$?" > git-status-exit.txt; git --version > git-version.txt 2>&1; command -v git > git-path.txt; printf '%s' "$PATH" > git-search-path.txt`,
    );
    await expectTerminalFile(root, 'git-status-exit.txt', '0');
    expect(await readFile(join(root, 'git-status.txt'), 'utf8')).not.toMatch(/fatal|error/iu);
    expect(await readFile(join(root, 'git-version.txt'), 'utf8')).toMatch(/^git version \d+\.\d+/u);
    const bundledBin = `/git/${process.platform}-${process.arch}/bin`;
    expect(await readFile(join(root, 'git-search-path.txt'), 'utf8')).toContain(bundledBin);
    const gitPath = await readFile(join(root, 'git-path.txt'), 'utf8');
    const resolvedGit = gitPath.trim();
    expect(
      process.platform === 'linux' ? resolvedGit.endsWith(`${bundledBin}/git`) : resolvedGit !== '',
      resolvedGit,
    ).toBe(true);
  });
});
