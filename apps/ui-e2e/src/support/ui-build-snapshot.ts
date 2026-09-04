import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import process from 'node:process';
import { dirname, resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const buildLockScript = resolve(import.meta.dirname, '../../../../tools/build-lock.mjs');
/** The file kinds that can reference another emitted file. */
const scannable = /\.(?:js|mjs|css|html)$/u;
/** A reference to a sibling (`./x`), or to `assets/x` / `/assets/x`. */
const reference = /["'](?:\.\/|\/?assets\/)([^"'\s]+?)["']/gu;
/** An emitted asset ends in `-<8-character hash>.<ext>`. */
const hashedAsset = /-([A-Za-z0-9_-]{8})\.(?:js|mjs|css|wasm|woff2?|ttf|otf|png|svg|json|map)$/u;

/**
 * Whether a referenced name looks like a file the build emitted.
 *
 * A "hash" made only of lowercase letters is almost surely a word in a string
 * literal — `"./dist/nextjs/browser-node-builtins.mjs"` inside a bundled
 * package, say — rather than an asset this tree should contain.
 */
const isEmittedAsset = (name: string): boolean => {
  const hash = hashedAsset.exec(name)?.[1];
  return hash !== undefined && /[A-Z0-9_-]/u.test(hash);
};

const scanReferences = (root: string, candidatesFor: (from: string, name: string) => readonly string[]): string[] => {
  if (!existsSync(root)) {
    return [];
  }
  const missing: string[] = [];
  for (const entry of readdirSync(root, { encoding: 'utf8', recursive: true })) {
    const file = resolve(root, entry);
    if (!scannable.test(entry) || !statSync(file).isFile()) {
      continue;
    }
    for (const match of readFileSync(file, 'utf8').matchAll(reference)) {
      const name = match[1]!;
      if (isEmittedAsset(name) && !candidatesFor(file, name).some((candidate) => existsSync(candidate))) {
        missing.push(`${entry} → ${name}`);
      }
    }
  }
  return missing;
};

/**
 * Emitted files a UI build snapshot references but does not contain.
 *
 * `react-router build` empties `apps/ui/build` before its client pass
 * (`cleanBuildDirectory` is unconditional — see `tools/build-lock.mjs`), and
 * `cp -R` walks straight past files that vanish under it. A copy taken while a
 * peer session rebuilds therefore looks structurally fine — `server/index.js`
 * and `client/assets` both exist — while missing much of its content (observed
 * on this machine: 1638 of 2438 client assets, and 2486 dangling references).
 * RR7 deletes `build/client/.vite/manifest.json` after its SSR pass, so there
 * is no manifest to check against: the references the built JS and CSS carry
 * are the manifest.
 *
 * @param buildRoot - The snapshot's `build` directory.
 * @returns The dangling references, empty when the snapshot is complete.
 */
export const missingSnapshotFiles = (buildRoot: string): readonly string[] => {
  const client = resolve(buildRoot, 'client');
  const server = resolve(buildRoot, 'server');
  return [
    ...new Set([
      ...(existsSync(resolve(server, 'index.js')) ? [] : ['server/index.js']),
      // A client reference is a sibling, `assets/x` or `/assets/x` — all under `build/client`.
      ...scanReferences(client, (from, name) => [
        resolve(dirname(from), name),
        resolve(client, name),
        resolve(client, 'assets', name),
      ]),
      // A server reference is a sibling chunk, `./assets/x` under `build/server`,
      // or a client module named by the route manifest, which lives under `build/client/assets`.
      ...scanReferences(server, (from, name) => [
        resolve(dirname(from), name),
        resolve(server, name),
        resolve(server, 'assets', name),
        resolve(client, name),
        resolve(client, 'assets', name),
      ]),
    ]),
  ];
};

/**
 * Copy the built UI aside so a peer session's rebuild cannot pull the tree out
 * from under a running E2E server.
 *
 * The snapshot lives under `apps/ui` so the server bundle's bare imports still
 * resolve through `apps/ui/node_modules`. The copy takes the builders' own lock
 * (`tools/build-lock.mjs`, keyed on the same output directory) so a build cannot
 * start mid-copy; {@link missingSnapshotFiles} then proves the result. The lock
 * is the fix, the verification is the proof.
 *
 * @param uiRoot - The `apps/ui` directory.
 * @returns The snapshot directory; its build is at `<snapshot>/build`.
 */
export const snapshotUiBuild = async (uiRoot: string): Promise<string> => {
  /* oxlint-disable no-await-in-loop -- snapshot attempts are deliberately sequential. */
  const source = resolve(uiRoot, 'build');
  const deadline = Date.now() + 180_000;
  let reason = 'the build directory never became readable';
  while (Date.now() < deadline) {
    const snapshot = await mkdtemp(resolve(uiRoot, '.chat-e2e-'));
    try {
      await execFileAsync(process.execPath, [
        buildLockScript,
        source,
        '--',
        'cp',
        '-R',
        source,
        resolve(snapshot, 'build'),
      ]);
      const missing = missingSnapshotFiles(resolve(snapshot, 'build'));
      if (missing.length === 0) {
        return snapshot;
      }
      reason = `${String(missing.length)} references dangle (first: ${missing[0]!})`;
    } catch (error) {
      reason = error instanceof Error ? error.message : String(error);
    }
    await rm(snapshot, { force: true, recursive: true });
    await setTimeout(250);
  }
  throw new Error(`The built Tau UI did not remain available long enough to snapshot: ${reason}`);
  /* oxlint-enable no-await-in-loop */
};
