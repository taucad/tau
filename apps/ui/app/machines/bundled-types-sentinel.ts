/**
 * Bundled-types population deletes and rewrites every bundled `.d.ts` into
 * OPFS, which is the ~885 ms line in worker startup. The payload is baked into
 * the bundle, so it only changes when the build does: stamping a content hash
 * into the mount turns every warm boot into one small read.
 */

import type { BundledTypesMountEntry, BundledTypesPayload } from '@taucad/filesystem/bundled-types-mount';

/**
 * Package root holding the stamp. `/node_modules` is a guarded mount — only
 * package-shaped replacements may be written — so the stamp travels as one
 * more package rather than a loose file. Deliberately not dot-prefixed:
 * hidden entries are filtered or rejected by enough storage tooling that an
 * ordinary name is the cheaper choice, and nothing imports this name.
 */
const sentinelPackageName = 'tau-bundled-types';

/**
 * Stamp file recording which payload populated the mount.
 *
 * @public
 */
export const bundledTypesSentinelPath = `/node_modules/${sentinelPackageName}/stamp.txt`;

/** Minimal slice of `WorkspaceFileService` the sentinel needs. */
type BundledTypesSentinelFileService = {
  readFile: (path: string, options: 'utf8') => Promise<string | Uint8Array<ArrayBuffer>>;
};

/** Modulus keeping the rolling hash inside 32 bits without bitwise operators. */
const hashModulus = 4_294_967_296;

/**
 * Content hash of a bundled-types payload.
 *
 * ponytail: 32-bit polynomial rolling hash — cheap enough to run before every
 * boot, and it only has to tell one build's payload from another's. Swap in
 * `crypto.subtle.digest('SHA-256', ...)` if a collision ever ships stale
 * declarations.
 *
 * @param payload - Declaration bundles about to be mirrored under `/node_modules`.
 * @returns Digest identifying this exact payload.
 * @public
 */
export const hashBundledTypesPayload = (payload: BundledTypesPayload): string => {
  let hash = 2_166_136_261;
  // The trailing zero terminator keeps field boundaries significant: the
  // fields ("ab","c") and ("a","bc") must not hash alike.
  const absorb = (text: string): void => {
    for (let index = 0; index < text.length; index++) {
      hash = (hash * 31 + (text.codePointAt(index) ?? 0)) % hashModulus;
    }
    hash = (hash * 31) % hashModulus;
  };
  for (const entry of payload) {
    absorb(entry.packageName);
    absorb(entry.content);
    absorb(JSON.stringify(entry.packageJson ?? null));
    for (const [path, content] of Object.entries(entry.files ?? {})) {
      absorb(path);
      absorb(content);
    }
  }
  return hash.toString(16);
};

const sentinelEntry = (stamp: string): BundledTypesMountEntry => ({
  packageName: sentinelPackageName,
  content: 'export {};\n',
  files: { 'stamp.txt': stamp },
  packageJson: { name: sentinelPackageName, private: true, types: 'index.d.ts' },
});

/**
 * Populate the bundled-types mount unless it already holds this payload.
 *
 * @param fileService - Workspace file service owning the `/node_modules` mount.
 * @param payload - Declaration bundles to mirror.
 * @param populate - Performs the (expensive) mirroring.
 * @returns `'skipped'` when the stamp matched, `'populated'` otherwise.
 * @public
 */
export async function ensureBundledTypesMount(
  fileService: BundledTypesSentinelFileService,
  payload: BundledTypesPayload,
  populate: (payload: BundledTypesPayload) => Promise<void>,
): Promise<'skipped' | 'populated'> {
  const stamp = hashBundledTypesPayload(payload);
  // An absent or unreadable stamp means "assume nothing about the mount".
  const current = await fileService.readFile(bundledTypesSentinelPath, 'utf8').catch(() => undefined);
  if (typeof current === 'string' && current.trim() === stamp) {
    return 'skipped';
  }
  // Exactly the pre-sentinel call, so nothing about stamping can reach the
  // declarations the editor depends on.
  await populate(payload);
  // Stamped afterwards and separately: the stamp is an optimisation, never a
  // dependency. A mount that refuses it degrades to repopulating every boot,
  // and a population that died never gets stamped as current.
  await populate([sentinelEntry(stamp)]).catch((error: unknown) => {
    console.warn('[FM-Worker] bundled types stamp not written; every boot will repopulate', error);
  });
  return 'populated';
}
