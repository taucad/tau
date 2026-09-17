/**
 * Bundled-types population deletes and rewrites every bundled `.d.ts` into
 * OPFS, which is the ~885 ms line in worker startup. The payload is baked into
 * the bundle, so it only changes when the build does: stamping the build
 * identity into the mount turns every warm boot into one small read.
 *
 * ponytail: the identity is the build's, not the payload's, so a payload that
 * changes *within* one build identity is not detected. Only a dev server can
 * do that (`tauBuildId` is minted per build / per dev-server start), so
 * regenerating bundled declarations against a running dev server needs a dev
 * server restart. Upgrade path if that ever bites: emit a payload digest at
 * build time and stamp that instead (charter D19, R1 AR-R1-5).
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

/**
 * Field-joined text of a payload. The `\0` separator keeps field boundaries
 * significant: the fields ("ab","c") and ("a","bc") must not hash alike.
 */
const payloadText = (payload: BundledTypesPayload): string => {
  const fields: string[] = [];
  for (const entry of payload) {
    fields.push(entry.packageName, entry.content, JSON.stringify(entry.packageJson ?? null));
    for (const [path, content] of Object.entries(entry.files ?? {})) {
      fields.push(path, content);
    }
  }
  return fields.join('\0');
};

/**
 * Content hash of a bundled-types payload.
 *
 * ponytail: `crypto.subtle` is guaranteed here — this runs in the worker that
 * mounts OPFS, which is secure-context-only. SHA-256 over the encoded payload
 * costs ~35 ms against ~640 ms for the 32-bit rolling hash it replaced (L01),
 * and only runs when the build identity missed.
 *
 * @param payload - Declaration bundles about to be mirrored under `/node_modules`.
 * @returns Digest identifying this exact payload.
 * @public
 */
export const hashBundledTypesPayload = async (payload: BundledTypesPayload): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payloadText(payload)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
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
 * The stamp carries the build identity first and the payload digest second, so
 * the warm path is one small read and one string compare: the payload is baked
 * into the bundle and cannot change without the build changing. Hashing the
 * 11.9 MiB payload only happens when the identity missed, where it still saves
 * the rewrite for a rebuild whose declarations are unchanged.
 *
 * @param fileService - Workspace file service owning the `/node_modules` mount.
 * @param payload - Declaration bundles to mirror.
 * @param mirror - `populate` performs the (expensive) mirroring; `buildIdentity`
 *   identifies the build that produced `payload` (`tauBuildId`) and is
 *   `undefined` where no build injected one, which falls back to comparing the
 *   payload digest.
 * @returns `'skipped'` when the mount already held this payload, `'populated'` otherwise.
 * @public
 */
export async function ensureBundledTypesMount(
  fileService: BundledTypesSentinelFileService,
  payload: BundledTypesPayload,
  mirror: {
    readonly populate: (payload: BundledTypesPayload) => Promise<void>;
    readonly buildIdentity?: string;
  },
): Promise<'skipped' | 'populated'> {
  const { populate, buildIdentity } = mirror;
  // An absent or unreadable stamp means "assume nothing about the mount".
  const current = await fileService.readFile(bundledTypesSentinelPath, 'utf8').catch(() => undefined);
  const [stampedIdentity, stampedHash] =
    typeof current === 'string' ? current.split('\n', 2).map((line) => line.trim()) : [];
  if (buildIdentity !== undefined && stampedIdentity === buildIdentity) {
    return 'skipped';
  }
  const hash = await hashBundledTypesPayload(payload);
  const outcome = stampedHash === hash ? 'skipped' : 'populated';
  if (outcome === 'populated') {
    // Exactly the pre-sentinel call, so nothing about stamping can reach the
    // declarations the editor depends on.
    await populate(payload);
  }
  // Stamped afterwards and separately: the stamp is an optimisation, never a
  // dependency. A mount that refuses it degrades to repopulating every boot,
  // and a population that died never gets stamped as current. A stamp that is
  // already current is left alone, so a realm without a build identity reads
  // and writes nothing on a warm boot.
  if (stampedIdentity !== (buildIdentity ?? '') || stampedHash !== hash) {
    await populate([sentinelEntry(`${buildIdentity ?? ''}\n${hash}`)]).catch((error: unknown) => {
      console.warn('[FM-Worker] bundled types stamp not written; every boot will repopulate', error);
    });
  }
  return outcome;
}
