import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
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
 * required, never defaulted, so this row cannot pass against a development build.
 */
describe('packaged Terminal smoke', () => {
  it('should run Bash from the packaged app and write into the project', async () => {
    session = await launchDesktopApp({
      packaged: true,
      packagedExecutable: desktopE2EPackagedExecutable(),
      token: 'offline-shell-packaged',
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Environment variables retain their wire names.
      env: { TAU_DEBUG: 'false' },
    });
    expect(await session.application.evaluate(({ app }) => app.isPackaged)).toBe(true);
    const root = await createTerminalProject(session);
    await expectTerminalRunning(session.page);
    await typeTerminalCommand(
      session.page,
      String.raw`printf '%s' "$BASH_VERSION" > bash-version.txt; printf 'packaged-%s' ok > packaged-smoke.txt`,
    );
    await expectTerminalFile(root, 'packaged-smoke.txt', 'packaged-ok');
    expect(await readFile(join(root, 'bash-version.txt'), 'utf8')).toMatch(/^\d+\.\d+/u);
  });
});
