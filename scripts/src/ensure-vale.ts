/**
 * Make sure the Vale binary that `@vvago/vale` ships is present, downloading it on demand.
 *
 * `@vvago/vale`'s postinstall downloads the platform binary from GitHub releases. GitHub answers
 * 504 for minutes at a time, and that postinstall used to fail whole `pnpm install` runs on CI
 * rows that never lint prose (CP-3 of the CI affected-first program). The postinstall is now off
 * (`allowBuilds` in pnpm-workspace.yaml), and only `scripts:validate-prose` calls this. It runs the
 * package's own downloader, which is a no-op once the binary exists, with bounded retries.
 *
 * Usage: node scripts/src/ensure-vale.ts
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../..');

/** The `@vvago/vale` package directory and its binary. */
export const valePaths = (
  workspaceRoot: string = root,
): { readonly packageDirectory: string; readonly binary: string } => {
  const packageDirectory = resolve(workspaceRoot, 'node_modules/@vvago/vale');
  return {
    packageDirectory,
    binary: resolve(packageDirectory, 'bin', process.platform === 'win32' ? 'vale.exe' : 'vale'),
  };
};

/**
 * Run `download` until `exists` holds, at most `attempts` times, waiting `retryDelay * attempt` between tries.
 *
 * @returns `true` when the binary exists at the end.
 */
export const ensureWithRetries = async (
  exists: () => boolean,
  download: () => void,
  {
    attempts = 3,
    retryDelay = 10_000,
    wait = sleep,
  }: {
    attempts?: number;
    /** Milliseconds; multiplied by the attempt number. */
    retryDelay?: number;
    /** Waits the given milliseconds. */
    wait?: (duration: number) => Promise<unknown>;
  } = {},
): Promise<boolean> => {
  for (let attempt = 1; attempt <= attempts && !exists(); attempt += 1) {
    try {
      download();
    } catch (error) {
      console.warn(`ensure-vale: download attempt ${attempt} of ${attempts} failed: ${String(error)}`);
      if (attempt < attempts) {
        // oxlint-disable-next-line no-await-in-loop -- attempts are sequential by design
        await wait(retryDelay * attempt);
      }
    }
  }
  return exists();
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { packageDirectory, binary } = valePaths();
  const ok = await ensureWithRetries(
    () => existsSync(binary),
    () => execFileSync(process.execPath, ['index.js'], { cwd: packageDirectory, stdio: 'inherit' }),
  );
  if (!ok) {
    console.error(`ensure-vale: ${binary} is missing after every download attempt`);
    process.exit(1);
  }
}
