/**
 * Stamp the web build's release label (short commit) into a finished `ui:build` output, and publish it as
 * `<build>/client/tau-release.json`.
 *
 * `ui:build` compiles the placeholder `unstampedBuildRelease` into its server graph and never reads the commit, so its
 * Nx cache key holds sources and configuration only and a rebuild of an unchanged tree is a cache hit (ST-9). The
 * deploy runs this after the build, so the deployed server reports the commit it was deployed from and the API learns
 * the release from `/tau-release.json`, as before. The label has the placeholder's length, so every byte offset, and
 * with it the server source maps, stays valid.
 *
 * The release comes from `COMMIT_REF` (Netlify) or `GITHUB_SHA` (GitHub Actions), as `resolveTauBuildRelease` reads
 * it. Without either, the build stays unstamped and reports no release, like a local build.
 *
 * Usage: node scripts/stamp-build-release.mts <build-dir>   (from apps/ui, after `pnpm nx build ui`)
 * Exit codes: 0 stamped or nothing to stamp, 1 the server graph holds no placeholder, 2 usage.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
/* oxlint-disable no-restricted-imports -- Native Node build step shares the build configuration's release seam. */
import { resolveTauBuildRelease, unstampedBuildRelease } from '../build-environment.ts';
/* oxlint-enable no-restricted-imports */

/** The file the API polls for the deployed release. */
export const releaseManifestName = 'tau-release.json';

const placeholderLiteral = new RegExp(`(["'\`])${unstampedBuildRelease}\\1`, 'gu');

/** The JavaScript files of a server build, relative to `serverDirectory`. */
const serverScripts = async (serverDirectory: string): Promise<string[]> => {
  const names = await readdir(serverDirectory, { recursive: true });
  return names
    .map(String)
    .filter((name) => /\.[cm]?js$/u.test(name))
    .toSorted();
};

/**
 * Replace the release placeholder in every server script and write the release manifest.
 *
 * @param buildDirectory - `apps/ui/build`: it holds `server/` and `client/`.
 * @param release - The 12-hex release label.
 * @returns The server scripts that held the placeholder.
 */
export const stampBuildRelease = async (buildDirectory: string, release: string): Promise<string[]> => {
  if (release.length !== unstampedBuildRelease.length) {
    throw new Error(`A release label is ${String(unstampedBuildRelease.length)} characters, got "${release}".`);
  }
  const serverDirectory = path.join(buildDirectory, 'server');
  const stamped: string[] = [];
  for (const name of await serverScripts(serverDirectory)) {
    const file = path.join(serverDirectory, name);
    // oxlint-disable-next-line no-await-in-loop -- One server file at a time bounds memory.
    const source = await readFile(file, 'utf8');
    const next = source.replaceAll(placeholderLiteral, (_literal, quote: string) => `${quote}${release}${quote}`);
    if (next !== source) {
      // oxlint-disable-next-line no-await-in-loop -- See above.
      await writeFile(file, next);
      stamped.push(name);
    }
  }
  if (stamped.length === 0) {
    throw new Error(
      `No server script under ${serverDirectory} holds the release placeholder: build it with \`pnpm nx build ui\` ` +
        'before stamping, and stamp each build once.',
    );
  }
  await writeFile(path.join(buildDirectory, 'client', releaseManifestName), `${JSON.stringify({ release })}\n`);
  return stamped;
};

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const [buildDirectory, ...extra] = process.argv.slice(2);
  if (!buildDirectory || extra.length > 0) {
    console.error('Usage: node scripts/stamp-build-release.mts <build-dir>');
    process.exit(2);
  }
  const release = resolveTauBuildRelease(process.env);
  if (release === undefined) {
    console.log('No COMMIT_REF or GITHUB_SHA: the build stays unstamped and reports no release.');
  } else {
    try {
      const stamped = await stampBuildRelease(buildDirectory, release);
      console.log(
        `Stamped release ${release} into ${String(stamped.length)} server script(s) and ${releaseManifestName}.`,
      );
    } catch (error) {
      console.error(`::error::${(error as Error).message}`);
      process.exit(1);
    }
  }
}
