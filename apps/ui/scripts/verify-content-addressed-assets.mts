/**
 * Prove that each browser runtime in a built client still has the bytes its manifest names.
 *
 * The PicoGK browser host (`picogk-browser/<sha256>/`) and the C# language server
 * (`csharp-language/<sha256>/`) are served under the hash of their `assets-manifest.json`. In the
 * browser, each loader hashes every file it fetches and refuses the runtime on any difference.
 * The build emits these trees unchanged, but later deploy steps rewrite JavaScript in place:
 * Sentry's debug-ID injection appends a snippet to every `.js` file it is pointed at. A rewritten
 * file passes every build-time check and fails only in a user's browser, as
 * "PicoGK runtime resource integrity mismatch". Run this after the last step that can change
 * `build/client`, so a deploy cannot ship a runtime its own loader refuses.
 *
 * Usage: node apps/ui/scripts/verify-content-addressed-assets.mts <client-dir>
 * Exit codes: 0 every tree verified, 1 a tree failed, 2 usage.
 */
/* oxlint-disable no-await-in-loop -- Hash one runtime file at a time to bound memory on large WASM trees. */
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

/** The served roots whose subdirectories are named by the SHA-256 of their manifest. */
export const contentAddressedRoots = ['picogk-browser', 'csharp-language'] as const;

const manifestName = 'assets-manifest.json';
const digestPattern = /^[a-f\d]{64}$/u;

type Entry = { readonly path: string; readonly sha256: string; readonly byteLength: number };

const isEntry = (value: unknown): value is Entry =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Partial<Entry>).path === 'string' &&
  typeof (value as Partial<Entry>).sha256 === 'string' &&
  typeof (value as Partial<Entry>).byteLength === 'number';

/** Every `{ path, sha256, byteLength }` record in a manifest, wherever its format nests them. */
const collectEntries = (value: unknown, entries: Entry[] = []): Entry[] => {
  if (isEntry(value)) {
    entries.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) {
      collectEntries(item, entries);
    }
  } else if (typeof value === 'object' && value !== null) {
    for (const item of Object.values(value)) {
      collectEntries(item, entries);
    }
  }
  return entries;
};

const sha256 = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');

const readOptional = async (file: string): Promise<Uint8Array<ArrayBuffer> | undefined> => {
  try {
    return Uint8Array.from(await readFile(file));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
};

const listDirectories = async (directory: string): Promise<string[]> => {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
};

/**
 * Check every content-addressed runtime tree under a built client directory.
 * @param client - The built client directory, such as `apps/ui/build/client`.
 * @returns How many trees were checked, and one line per file that differs from its manifest, sorted.
 */
export const verifyContentAddressedAssets = async (
  client: string,
): Promise<{ readonly trees: number; readonly problems: readonly string[] }> => {
  const problems: string[] = [];
  let trees = 0;
  for (const root of contentAddressedRoots) {
    for (const identity of await listDirectories(path.join(client, root))) {
      const tree = `${root}/${identity}`;
      const manifestBytes = await readOptional(path.join(client, tree, manifestName));
      if (!digestPattern.test(identity) || !manifestBytes) {
        problems.push(`${tree}: not a content-addressed runtime (no ${manifestName} under a SHA-256 name)`);
        continue;
      }
      trees += 1;
      if (sha256(manifestBytes) !== identity) {
        problems.push(`${tree}/${manifestName}: does not hash to its directory name`);
        continue;
      }
      const entries = collectEntries(JSON.parse(new TextDecoder().decode(manifestBytes)) as unknown);
      if (entries.length === 0) {
        problems.push(`${tree}/${manifestName}: lists no files`);
      }
      for (const entry of entries) {
        const bytes = await readOptional(path.join(client, tree, entry.path));
        if (!bytes) {
          problems.push(`${tree}/${entry.path}: missing`);
        } else if (bytes.byteLength !== entry.byteLength || sha256(bytes) !== entry.sha256) {
          problems.push(
            `${tree}/${entry.path}: ${String(bytes.byteLength)} bytes with SHA-256 ${sha256(bytes)}, ` +
              `but the manifest records ${String(entry.byteLength)} bytes with ${entry.sha256}`,
          );
        }
      }
    }
  }
  return { trees, problems: problems.toSorted() };
};

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const [client, ...extra] = process.argv.slice(2);
  if (!client || extra.length > 0) {
    console.error('Usage: node apps/ui/scripts/verify-content-addressed-assets.mts <client-dir>');
    process.exit(2);
  }
  const { trees, problems } = await verifyContentAddressedAssets(client);
  for (const problem of problems) {
    console.error(`::error::Content-addressed runtime changed after its manifest was written: ${problem}`);
  }
  if (problems.length > 0) {
    process.exit(1);
  }
  console.log(`Verified ${String(trees)} content-addressed runtime tree(s) under ${client}.`);
}
