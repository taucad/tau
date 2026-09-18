/**
 * The lease a publications suite hands the materializer, and the in-memory
 * store behind it (charter W4c).
 *
 * It lives here rather than beside the suites because `app/testing/**` is the
 * API's test-support tree (`apps/api/AGENTS.md`), and a fixture that spawns git
 * has no business compiling into a Nest feature directory.
 *
 * The materializer no longer reads a repository on a volume: it is given a
 * lease directory hydrated from the manifest, used, and disposed (D9, NI1).
 * Proving what it does with one therefore needs a real `hydrateLease` —
 * packed refs with peeled lines, one pack, no loose objects — which is what
 * this builds by pushing a seeded repository into a lease and committing it
 * through W2's own `commitLease`.
 *
 * The store under it is a `Map` rather than MinIO on purpose. What the port
 * does with bytes is proved against real object storage by the conformance and
 * commit suites (W1, W2, D32); what these suites prove is the materializer, and
 * keeping them off infrastructure keeps them fast and deterministic.
 */

import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { commitLease } from '#api/git/store/commit.js';
import { hydrateLease } from '#api/git/store/lease.js';
import type { RepositoryLease } from '#api/git/store/lease.js';
import { repositoryLocator } from '#api/git/store/locator.js';
import type { ManifestBytes, RepositoryLocator, RepositoryStore, StoredObject } from '#api/git/store/port.js';

/** One repository's prefix, the way the S3 adapter composes it (D24). */
const prefixOf = (locator: RepositoryLocator): string => `${locator.ownerId}/${locator.projectId}`;

/**
 * A `RepositoryStore` that keeps manifests and packs in memory.
 *
 * Conditional-write semantics are the port's: a commit whose expected token is
 * not the one held answers `'lost'` rather than overwriting, so a caller that
 * races here fails the same way it fails against real storage.
 *
 * @returns A store usable by `hydrateLease` and `commitLease`.
 */
export const createMemoryRepositoryStore = (): RepositoryStore => {
  const manifests = new Map<string, { bytes: ManifestBytes; token: { token: string } }>();
  const objects = new Map<string, Uint8Array<ArrayBuffer>>();
  const objectKey = (locator: RepositoryLocator, key: string): string => `${prefixOf(locator)}/${key}`;

  return {
    capabilities: { conditionalWrite: true, delete: true, list: true, maxObjectBytes: 5 * 1024 * 1024 * 1024 },

    readManifest: async (locator) => {
      const held = manifests.get(prefixOf(locator));
      return held === undefined ? undefined : { manifest: held.bytes, token: held.token };
    },

    commitManifest: async (locator, next, expected) => {
      const held = manifests.get(prefixOf(locator));
      const heldToken = held === undefined ? 'absent' : held.token.token;
      const offered = expected === 'absent' ? 'absent' : expected.token;
      if (heldToken !== offered) {
        return 'lost';
      }
      const token = { token: randomBytes(8).toString('hex') };
      manifests.set(prefixOf(locator), { bytes: next, token });
      return token;
    },

    putObject: async (locator, key, body, options) => {
      /* The adapter refuses a declared length that disagrees with the body, so a
         caller that computed its length over different bytes than it uploads
         must fail here too rather than only against R2 (review F6). */
      if (options.contentLength !== body.byteLength) {
        throw new Error(
          `putObject declared ${String(options.contentLength)} bytes for '${key}' but the body is ${String(body.byteLength)}.`,
        );
      }
      objects.set(objectKey(locator, key), body);
    },

    getObject: async (locator, key, range) => {
      const bytes = objects.get(objectKey(locator, key));
      if (bytes === undefined) {
        throw new Error(`memory store holds no object '${key}'`);
      }
      const slice = range === undefined ? bytes : bytes.subarray(range.start, range.end + 1);
      return Readable.from([Buffer.from(slice)]);
    },

    listObjects: async function* listObjects(locator, prefix): AsyncIterable<StoredObject> {
      const scope = `${prefixOf(locator)}/`;
      for (const [key, bytes] of objects) {
        if (key.startsWith(`${scope}${prefix}`)) {
          yield { key: key.slice(scope.length), bytes: bytes.byteLength, modifiedAt: undefined };
        }
      }
    },

    deleteObjects: async (locator, keys) => {
      for (const key of keys) {
        objects.delete(objectKey(locator, key));
      }
    },
  };
};

/* eslint-disable @typescript-eslint/naming-convention -- process environment names */
/** The hook's fail-closed admission flag, as the smart-HTTP route sets it. */
const pushEnvironment: Record<string, string> = {
  PATH: process.env['PATH'] ?? '/usr/bin:/bin',
  HOME: '/nonexistent',
  LANG: 'C',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  TAU_GIT_PUSH_ADMITTED: '1',
};
/* eslint-enable @typescript-eslint/naming-convention -- end of the process environment map */

/**
 * Pushes a seeded repository into this project's store and hydrates the result.
 *
 * The push runs stock `receive-pack` against the lease's own `pre-receive`
 * hook, so a fixture that would be refused in production is refused here too.
 *
 * @param args - The store, the repository's owner and id, and the seeded source.
 * @returns A lease holding the pushed history. The caller disposes it.
 */
export const seedLease = async (args: {
  store: RepositoryStore;
  ownerId: string;
  projectId: string;
  /** A non-bare repository with the branch and tags to publish. */
  source: string;
}): Promise<RepositoryLease> => {
  const locator = repositoryLocator({ ownerId: args.ownerId, projectId: args.projectId });
  const receiving = await hydrateLease({ store: args.store, locator });
  try {
    execFileSync('git', ['push', receiving.directory, '+refs/heads/*:refs/heads/*', '+refs/tags/*:refs/tags/*'], {
      cwd: args.source,
      env: pushEnvironment as NodeJS.ProcessEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await commitLease({ store: args.store, lease: receiving, committedBy: args.ownerId });
  } finally {
    await receiving.dispose();
  }
  return hydrateLease({ store: args.store, locator });
};
