/** Opt-in publication for new installers; the legacy Mac archive publisher remains independent. */
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import { linuxDebKinds } from '#shared/linux-installation.js';
import {
  desktopArtifactKinds,
  desktopArtifactName,
  desktopReleaseBaseUrl,
  desktopReleaseIdentity,
  desktopReleaseTargets,
  parseDesktopArtifactManifest,
} from '#shared/desktop-release.js';
import type { DesktopArtifact, DesktopArtifactKind, DesktopArtifactManifest } from '#shared/desktop-release.js';
import { isNewerVersion } from '#main/updater.js';
/* oxlint-disable no-restricted-imports -- Adjacent publication helpers are script-owned interfaces. */
import {
  createDesktopInstallerCatalog,
  createDesktopRouteDescriptor,
  desktopManifestDigest,
  verifyDesktopRouteDescriptor,
} from './desktop-route-publication.mjs';
import type { DesktopRouteTrust } from './desktop-route-publication.mjs';
import { requireDesktopPublicationAuthority } from './desktop-publication-authority.mjs';
import { fetchDesktopQualifiedReceipts } from './desktop-receipt-provenance.mjs';
import {
  desktopAptSnapshotPrefix,
  readDesktopAptSnapshot,
  prepareDesktopAptPublication,
} from './desktop-apt-publication.mjs';
import { renewDesktopApt } from './renew-desktop-apt.mjs';
/* oxlint-enable no-restricted-imports */

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
};
const hashes = async (path: string) => {
  const sha256 = createHash('sha256');
  const sha512 = createHash('sha512');
  for await (const chunk of createReadStream(path)) {
    if (!(chunk instanceof Uint8Array)) {
      throw new TypeError('Expected binary artifact stream');
    }
    sha256.update(chunk);
    sha512.update(chunk);
  }
  const info = await stat(path);
  return { sha256: sha256.digest('hex'), sha512: sha512.digest('base64'), size: info.size };
};
const readJson = async (path: string): Promise<unknown> => JSON.parse(await readFile(path, 'utf8')) as unknown;
const intentSchema = z.strictObject({
  schemaVersion: z.literal(1),
  tag: z.string(),
  version: z.string(),
  channel: z.enum(['production', 'staging']),
  sourceCommit: z.string().regex(/^[a-f\d]{40}$/u),
  manifestSha256: z.string().regex(/^[a-f\d]{64}$/u),
});

/** Transport seam keeps ordering, immutable retry and monotonic intent executable in tests. */
export type DesktopRouteStore = {
  read(key: string): Promise<{ bytes: Uint8Array<ArrayBuffer>; etag: string } | undefined>;
  put(key: string, path: string, condition: { immutable?: boolean; etag?: string }): Promise<void>;
  verify(key: string, path: string): Promise<void>;
};

/** Verify local final bytes before the first object-store mutation. */
export const verifyDesktopRouteFiles = async (root: string, input: unknown): Promise<DesktopArtifactManifest> => {
  const manifest = parseDesktopArtifactManifest(input);
  await Promise.all(
    manifest.artifacts.map(async (artifact) => {
      const actual = await hashes(resolve(root, artifact.name));
      if (actual.size > 5 * 1024 ** 3) {
        throw new Error('Artifact exceeds single-object publication limit');
      }
      if (actual.sha256 !== artifact.sha256 || actual.sha512 !== artifact.sha512 || actual.size !== artifact.size) {
        throw new Error(`Artifact bytes differ: ${artifact.name}`);
      }
    }),
  );
  return manifest;
};

/** Immutable writes are idempotent only for byte-identical content; never clobber a published object. */
export const mirrorDesktopRouteFile = async (store: DesktopRouteStore, key: string, path: string): Promise<void> => {
  try {
    await store.put(key, path, { immutable: true });
  } catch {
    // A retry may find an existing immutable object. Only exact public-byte readback admits it.
    await store.verify(key, path);
    return;
  }
  await store.verify(key, path);
};

/** Record monotonic intent before mutable pointers; interruption resumes only the same or a newer candidate. */
export const admitDesktopRoutePromotion = async (options: {
  store: DesktopRouteStore;
  root: string;
  manifest: DesktopArtifactManifest;
  isAncestor: (older: string, newer: string) => boolean;
}): Promise<void> => {
  const { store, root, manifest } = options;
  const key = 'latest/installer-promotion.json';
  const previous = await store.read(key);
  const next = {
    schemaVersion: 1,
    tag: manifest.tag,
    version: manifest.version,
    channel: manifest.channel,
    sourceCommit: manifest.sourceCommit,
    manifestSha256: desktopManifestDigest(manifest),
  };
  if (previous) {
    const current = intentSchema.parse(JSON.parse(new TextDecoder().decode(previous.bytes)));
    if (
      current.channel !== manifest.channel ||
      (!isNewerVersion(manifest.version, current.version) && JSON.stringify(current) !== JSON.stringify(next)) ||
      !options.isAncestor(current.sourceCommit, manifest.sourceCommit)
    ) {
      throw new Error('Stale, divergent or conflicting installer promotion');
    }
  }
  const path = resolve(root, 'installer-promotion.json');
  await writeFile(path, JSON.stringify(next) + '\n');
  await store.put(key, path, previous ? { etag: previous.etag } : { immutable: true });
};

const completionSchema = intentSchema.extend({
  completedAt: z.iso.datetime(),
  pointers: z
    .array(
      z.strictObject({
        key: z.string().regex(/^(?:latest\/[a-z0-9.-]+\.json|apt\/dists\/(?:stable|staging)\/InRelease)$/u),
        sha256: z.string().regex(/^[a-f\d]{64}$/u),
      }),
    )
    .min(1),
});

const expectedPointers = (manifest: DesktopArtifactManifest): string[] =>
  [
    'latest/installers.json',
    ...(['windows-nsis', 'linux-appimage'] as const)
      .filter((route) => manifest.artifacts.some((item) => item.kind === route))
      .map((route) => `latest/desktop-update-${route}-x64.json`),
    ...(manifest.artifacts.some((item) => linuxDebKinds.some((kind) => kind === item.kind))
      ? [`apt/dists/${manifest.channel === 'production' ? 'stable' : 'staging'}/InRelease`]
      : []),
  ].sort();
const requireCompletePointers = (manifest: DesktopArtifactManifest, keys: string[]): void => {
  if (JSON.stringify([...keys].sort()) !== JSON.stringify(expectedPointers(manifest))) {
    throw new Error('Completion receipt omits or duplicates an advertised route');
  }
};

/** Renewal requires the completed candidate and every recorded mutable pointer to still match. */
export const assertCompletedDesktopPromotion = async (
  store: DesktopRouteStore,
  manifest: DesktopArtifactManifest,
  recover?: (key: string, bytes: Uint8Array<ArrayBuffer>, previousSha256: string) => Promise<void>,
): Promise<void> => {
  const [intentObject, completedObject] = await Promise.all([
    store.read('latest/installer-promotion.json'),
    store.read('latest/installer-completed.json'),
  ]);
  if (!intentObject || !completedObject) {
    throw new Error('No completed installer promotion');
  }
  const intent = intentSchema.parse(JSON.parse(new TextDecoder().decode(intentObject.bytes)));
  const completed = completionSchema.parse(JSON.parse(new TextDecoder().decode(completedObject.bytes)));
  if (
    intent.manifestSha256 !== desktopManifestDigest(manifest) ||
    JSON.stringify({
      schemaVersion: completed.schemaVersion,
      tag: completed.tag,
      version: completed.version,
      channel: completed.channel,
      sourceCommit: completed.sourceCommit,
      manifestSha256: completed.manifestSha256,
    }) !== JSON.stringify(intent)
  ) {
    throw new Error('Incomplete or different installer promotion');
  }
  requireCompletePointers(
    manifest,
    completed.pointers.map((item) => item.key),
  );
  for (const pointer of completed.pointers) {
    // oxlint-disable-next-line no-await-in-loop -- Verify each small committed metadata pointer before renewal.
    const actual = await store.read(pointer.key);
    if (!actual) {
      throw new Error('Published pointer is missing');
    }
    if (createHash('sha256').update(actual.bytes).digest('hex') !== pointer.sha256) {
      if (!recover || pointer.key === 'latest/installers.json') {
        throw new Error('Published pointer differs from completion receipt');
      }
      // oxlint-disable-next-line no-await-in-loop -- Authenticate exact same-candidate drift before retrying interrupted renewal.
      await recover(pointer.key, actual.bytes, pointer.sha256);
    }
  }
};

/** Commit a publication receipt only after all advertised route pointers have public readback. */
export const completeDesktopPromotion = async (
  store: DesktopRouteStore,
  options: { root: string; manifest: DesktopArtifactManifest; pointers: Array<{ key: string; path: string }> },
): Promise<void> => {
  const { root, manifest, pointers } = options;
  requireCompletePointers(
    manifest,
    pointers.map((item) => item.key),
  );
  const records = [];
  for (const pointer of pointers) {
    // oxlint-disable-next-line no-await-in-loop -- The completion marker must follow each successful public readback.
    await store.verify(pointer.key, pointer.path);
    // oxlint-disable-next-line no-await-in-loop -- Hash exact locally read-back bytes.
    const digest = await hashes(pointer.path);
    records.push({ key: pointer.key, sha256: digest.sha256 });
  }
  const path = resolve(root, 'installer-completed.json');
  await writeFile(
    path,
    JSON.stringify({
      schemaVersion: 1,
      tag: manifest.tag,
      version: manifest.version,
      channel: manifest.channel,
      sourceCommit: manifest.sourceCommit,
      manifestSha256: desktopManifestDigest(manifest),
      completedAt: new Date().toISOString(),
      pointers: records,
    }) + '\n',
  );
  await store.put('latest/installer-completed.json', path, {});
  await store.verify('latest/installer-completed.json', path);
};

const collect = async (root: string, tag: string, sourceCommit: string): Promise<DesktopArtifactManifest> => {
  const identity = desktopReleaseIdentity(tag);
  const artifacts: DesktopArtifact[] = [];
  for (const target of desktopReleaseTargets) {
    const [platform, arch] = target.split('-');
    for (const [kind, definition] of Object.entries(desktopArtifactKinds)) {
      if (platform !== definition.platform) {
        continue;
      }
      const name = desktopArtifactName({
        kind: kind as DesktopArtifactKind,
        ...identity,
        arch: arch as 'arm64' | 'x64',
      });
      const path = resolve(root, name);
      if (!existsSync(path)) {
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- Bound hashing of large final artifacts.
      const digest = await hashes(path);
      artifacts.push({
        target,
        kind: kind as DesktopArtifactKind,
        name,
        format: definition.format,
        roles: [...definition.roles],
        ...digest,
      });
    }
  }
  return parseDesktopArtifactManifest({ schemaVersion: 1, tag, ...identity, sourceCommit, artifacts });
};
const issueDescriptors = async (root: string, manifest: DesktopArtifactManifest, prefix: string): Promise<string[]> => {
  const files: string[] = [];
  const privateKey = manifest.artifacts.some((item) => item.kind === 'linux-appimage')
    ? await readFile(required('TAU_APPIMAGE_PRIVATE_KEY_FILE'), 'utf8')
    : undefined;
  for (const route of ['windows-nsis', 'linux-appimage'] as const) {
    if (!manifest.artifacts.some((artifact) => artifact.kind === route)) {
      continue;
    }
    const options = {
      manifest,
      route,
      issuedAt: required('TAU_UPDATE_ISSUED_AT'),
      ...(route === 'linux-appimage'
        ? {
            keyId: required('TAU_APPIMAGE_KEY_ID'),
            privateKey,
          }
        : {}),
    };
    const descriptor = createDesktopRouteDescriptor(options);
    const name = `${prefix}desktop-update-${route}-x64.json`;
    // oxlint-disable-next-line no-await-in-loop -- Freeze each signed descriptor as one complete file.
    await writeFile(resolve(root, name), JSON.stringify(descriptor) + '\n');
    files.push(name);
  }
  return files;
};

/** Run only as an explicit publish-desktop operation; no route is enabled by the legacy prepare/mirror/promote calls. */
export const publishDesktopRoutes = async (operation: string): Promise<void> => {
  const tag = required('DESKTOP_RELEASE_TAG');
  const sourceCommit = required('TAU_DESKTOP_SOURCE_SHA');
  const root = resolve(required('DESKTOP_ASSETS_DIR'));
  await mkdir(root, { recursive: true });
  const manifestPath = resolve(root, 'desktop-artifacts.json');
  if (operation === 'prepare-routes') {
    const manifest = await collect(root, tag, sourceCommit);
    // Existing generated files must retain original signed bytes on retries.
    if (existsSync(manifestPath)) {
      const old = parseDesktopArtifactManifest(await readJson(manifestPath));
      if (desktopManifestDigest(old) !== desktopManifestDigest(manifest)) {
        throw new Error('Prepared route manifest already describes different bytes');
      }
      for (const route of ['windows-nsis', 'linux-appimage']) {
        if (
          manifest.artifacts.some((artifact) => artifact.kind === route) &&
          !existsSync(resolve(root, `desktop-update-${route}-x64.json`))
        ) {
          throw new Error(
            'Interrupted preparation: use a new empty assets directory or restore its original descriptor',
          );
        }
      }
      return;
    }
    await issueDescriptors(root, manifest, '');
    await writeFile(manifestPath, JSON.stringify(manifest) + '\n');
    return;
  }
  const manifest =
    operation === 'renew-routes'
      ? parseDesktopArtifactManifest(await readJson(manifestPath))
      : await verifyDesktopRouteFiles(root, await readJson(manifestPath));
  const taggedSource = execFileSync('git', ['rev-parse', '--verify', `refs/tags/${tag}^{commit}`], {
    encoding: 'utf8',
  }).trim();
  if (taggedSource !== sourceCommit) {
    throw new Error('Release tag does not resolve to candidate source');
  }
  if (manifest.tag !== tag || manifest.sourceCommit !== sourceCommit) {
    throw new Error('Route publication candidate identity differs');
  }
  const keys = manifest.artifacts.some((artifact) => artifact.kind === 'linux-appimage')
    ? z.record(z.string(), z.string()).parse(await readJson(required('TAU_APPIMAGE_PUBLIC_KEYS_FILE')))
    : {};
  for (const route of ['windows-nsis', 'linux-appimage'] as const) {
    if (!manifest.artifacts.some((artifact) => artifact.kind === route)) {
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- Authenticate each immutable descriptor before any mutation.
    const document = await readJson(resolve(root, `desktop-update-${route}-x64.json`));
    verifyDesktopRouteDescriptor({ manifest, route, document, keys });
  }
  const bucket = required('DESKTOP_R2_BUCKET');
  const endpoint = required('DESKTOP_R2_ENDPOINT');
  const s3 = (args: string[]) =>
    execFileSync('aws', ['--endpoint-url', endpoint, 's3api', ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  const store: DesktopRouteStore = {
    read: async (key) => {
      const destination = resolve(root, `route-remote-${randomUUID()}`);
      try {
        const metadata = z
          // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external GitHub/AWS wire field exactly.
          .object({ ETag: z.string() })
          .parse(JSON.parse(s3(['get-object', '--bucket', bucket, '--key', key, destination])));
        return { bytes: Uint8Array.from(await readFile(destination)), etag: metadata.ETag };
      } catch (error) {
        if (
          error &&
          typeof error === 'object' &&
          'stderr' in error &&
          /\((?:NoSuchKey|404)\)/u.test(String(error.stderr))
        ) {
          return undefined;
        }
        throw error;
      } finally {
        await rm(destination, { force: true });
      }
    },
    put: async (key, path, condition) => {
      s3([
        'put-object',
        '--bucket',
        bucket,
        '--key',
        key,
        '--body',
        path,
        '--cache-control',
        key.startsWith('latest/') || (key.startsWith('apt/dists/') && !key.includes('/by-hash/'))
          ? 'no-store'
          : 'public, max-age=31536000, immutable',
        '--content-type',
        key.endsWith('.json') ? 'application/json' : 'application/octet-stream',
        ...(condition.immutable ? ['--if-none-match', '*'] : []),
        ...(condition.etag ? ['--if-match', condition.etag] : []),
      ]);
    },
    verify: async (key, path) => {
      const url = `${desktopReleaseBaseUrl(tag).split('/releases/')[0]}/${key
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/')}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(120_000), redirect: 'error', cache: 'no-store' });
      if (!response.ok || !response.body) {
        throw new Error(`Public route object unavailable: ${key}`);
      }
      const hash = createHash('sha256');
      for await (const chunk of response.body) {
        hash.update(chunk);
      }
      const expected = await hashes(path);
      if (hash.digest('hex') !== expected.sha256) {
        throw new Error(`Public route bytes disagree: ${key}`);
      }
    },
  };
  const descriptors = ['windows-nsis', 'linux-appimage']
    .filter((route) => manifest.artifacts.some((artifact) => artifact.kind === route))
    .map((route) => `desktop-update-${route}-x64.json`);
  if (operation === 'mirror-routes') {
    for (const name of [
      ...manifest.artifacts.map((artifact) => artifact.name),
      ...descriptors,
      'desktop-artifacts.json',
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- Immutable objects and public-byte checks complete in publication order.
      await mirrorDesktopRouteFile(store, `releases/${tag}/${name}`, resolve(root, name));
    }
    return;
  }
  if (process.env['TAU_ENABLE_INSTALLER_PROMOTION'] !== 'true') {
    throw new Error('Installer promotion is disabled; operator release gate is required');
  }
  if (operation !== 'promote-routes' && operation !== 'renew-routes') {
    throw new Error('Unknown mutable publication operation');
  }
  await requireDesktopPublicationAuthority(manifest.channel, operation);
  execFileSync('git', ['merge-base', '--is-ancestor', manifest.sourceCommit, required('GITHUB_SHA')], {
    stdio: 'pipe',
  });
  // Validate all fresh update metadata before any feed or APT pointer mutation.
  const fresh = await issueDescriptors(root, manifest, 'fresh-');
  for (const name of fresh) {
    // oxlint-disable-next-line no-await-in-loop -- Validate every newly signed envelope before publication.
    const document = await readJson(resolve(root, name));
    verifyDesktopRouteDescriptor({
      manifest,
      route: name.includes('windows-nsis') ? 'windows-nsis' : 'linux-appimage',
      document,
      keys,
      offer: true,
    });
  }
  const catalogPath = resolve(root, 'installers.json');
  if (operation === 'promote-routes') {
    const receipts = await fetchDesktopQualifiedReceipts(manifest, root, {
      ci: required('TAU_ROUTE_CI_RUN_ID'),
      vm: required('TAU_ROUTE_VM_RUN_ID'),
    });
    const trust = z
      .record(z.string(), z.string())
      .parse(await readJson(required('TAU_ROUTE_TRUST_FILE'))) as DesktopRouteTrust;
    const catalog = createDesktopInstallerCatalog({
      manifest,
      receipts,
      trust,
      approval: await readJson(resolve(root, 'promotion-approval.json')),
    });
    // Immutable assets/descriptors must already be public before any update pointer changes.
    for (const name of [
      ...manifest.artifacts.map((artifact) => artifact.name),
      ...descriptors,
      'desktop-artifacts.json',
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- Admission verifies every public object before pointer writes.
      await store.verify(`releases/${tag}/${name}`, resolve(root, name));
    }
    await writeFile(catalogPath, JSON.stringify(catalog) + '\n');
    await admitDesktopRoutePromotion({
      store,
      root,
      manifest,
      isAncestor: (older, newer) => {
        try {
          execFileSync('git', ['merge-base', '--is-ancestor', older, newer]);
          return true;
        } catch {
          return false;
        }
      },
    });
  } else {
    await assertCompletedDesktopPromotion(store, manifest, async (key, bytes, previousSha256) => {
      if (
        key === 'latest/desktop-update-windows-nsis-x64.json' ||
        key === 'latest/desktop-update-linux-appimage-x64.json'
      ) {
        verifyDesktopRouteDescriptor({
          manifest,
          route: key.includes('windows-nsis') ? 'windows-nsis' : 'linux-appimage',
          document: JSON.parse(new TextDecoder().decode(bytes)),
          keys,
        });
        return;
      }
      const suite = manifest.channel === 'production' ? 'stable' : 'staging';
      if (key !== `apt/dists/${suite}/InRelease`) {
        throw new Error('Unexpected renewal pointer');
      }
      const snapshots: Array<Awaited<ReturnType<typeof readDesktopAptSnapshot>>> = [];
      for (const hash of [previousSha256, createHash('sha256').update(bytes).digest('hex')]) {
        const prefix = `apt/snapshots/${hash}`;
        // oxlint-disable-next-line no-await-in-loop -- Independently authenticate prior completion and interrupted renewal snapshots.
        const [pointer, inventory, signature] = await Promise.all([
          store.read(`${prefix}/InRelease`),
          store.read(`${prefix}/inventory.json`),
          store.read(`${prefix}/inventory.json.gpg`),
        ]);
        if (!pointer || !inventory || !signature || createHash('sha256').update(pointer.bytes).digest('hex') !== hash) {
          throw new Error('Incomplete renewal recovery snapshot');
        }
        // oxlint-disable-next-line no-await-in-loop -- Exact release key and signed pointer bind every retained byte.
        const snapshot = await readDesktopAptSnapshot({
          inRelease: Uint8Array.from(pointer.bytes),
          signedInventory: Uint8Array.from(inventory.bytes),
          signature: Uint8Array.from(signature.bytes),
          channel: manifest.channel,
          gnupgHome: required('TAU_APT_GNUPGHOME'),
          signingFingerprint: required('TAU_APT_SIGNING_FINGERPRINT'),
        });
        snapshots.push(snapshot);
      }
      const [prior, current] = snapshots;
      const canonicalPackages = (items: (typeof snapshots)[number]['inventory']['packages']): string =>
        JSON.stringify([...items].sort((a, b) => a.poolPath.localeCompare(b.poolPath)));
      if (
        !prior ||
        !current ||
        canonicalPackages(prior.inventory.packages) !== canonicalPackages(current.inventory.packages) ||
        prior.objects.some(
          (item) =>
            !current.objects.some(
              (entry) => entry.path === item.path && entry.sha256 === item.sha256 && entry.size === item.size,
            ),
        )
      ) {
        throw new Error('APT renewal changed retained package generations');
      }
    });
    const catalog = await store.read('latest/installers.json');
    if (!catalog) {
      throw new Error('Missing completed installer catalog');
    }
    await writeFile(catalogPath, catalog.bytes);
  }
  const aptPointers: Array<{ key: string; path: string }> = [];
  if (manifest.artifacts.some((artifact) => linuxDebKinds.some((kind) => kind === artifact.kind))) {
    const suite = manifest.channel === 'production' ? 'stable' : 'staging';
    const key = `apt/dists/${suite}/InRelease`;
    const current = await store.read(key);
    const gnupgHome = required('TAU_APT_GNUPGHOME');
    const signingFingerprint = required('TAU_APT_SIGNING_FINGERPRINT');
    let previous;
    if (current) {
      const inRelease = Uint8Array.from(current.bytes);
      const prefix = desktopAptSnapshotPrefix(inRelease);
      const [inventoryObject, signatureObject] = await Promise.all([
        store.read(`apt/${prefix}/inventory.json`),
        store.read(`apt/${prefix}/inventory.json.gpg`),
      ]);
      if (!inventoryObject || !signatureObject) {
        throw new Error('Missing authenticated APT snapshot inventory');
      }
      const signedInventory = Uint8Array.from(inventoryObject.bytes),
        signature = Uint8Array.from(signatureObject.bytes);
      const snapshot = await readDesktopAptSnapshot({
        inRelease,
        signedInventory,
        signature,
        gnupgHome,
        signingFingerprint,
        channel: manifest.channel,
      });
      const directory = resolve(root, `apt-previous-${randomUUID()}`);
      for (const object of operation === 'promote-routes' ? snapshot.objects : []) {
        const destination = resolve(directory, object.path);
        // oxlint-disable-next-line no-await-in-loop -- Retained large runtime generations stream to disk, never into memory.
        await mkdir(dirname(destination), { recursive: true });
        s3(['get-object', '--bucket', bucket, '--key', `apt/${object.path}`, destination]);
        // oxlint-disable-next-line no-await-in-loop -- Authenticate each retained object before reconstructing the cumulative index.
        const actual = await hashes(destination);
        if (actual.sha256 !== object.sha256 || actual.size !== object.size) {
          throw new Error('Retained APT bytes differ');
        }
      }
      previous = { directory, inRelease, signedInventory, signature };
    }
    const outputDirectory = resolve(root, `apt-next-${randomUUID()}`);
    const metadata = {
      channel: manifest.channel,
      issuedAt: required('TAU_UPDATE_ISSUED_AT'),
      gnupgHome,
      signingFingerprint,
      outputDirectory,
    };
    if (operation === 'renew-routes' && !previous) {
      throw new Error('Renewal requires completed APT metadata');
    }
    const apt =
      operation === 'renew-routes' && previous
        ? await renewDesktopApt({
            ...metadata,
            inRelease: previous.inRelease,
            signedInventory: previous.signedInventory,
            signature: previous.signature,
          })
        : await prepareDesktopAptPublication({
            ...metadata,
            manifest,
            artifactDirectory: root,
            ...(previous ? { previous } : {}),
          });
    if (Date.parse(apt.inventory.validUntil) <= Date.now()) {
      throw new Error('Expired APT snapshot cannot be published');
    }
    await apt.publish({
      async put(object) {
        const remoteKey = `apt/${object.path}`;
        if (object.immutable) {
          await mirrorDesktopRouteFile(store, remoteKey, object.sourcePath);
        } else if (object.expectedPreviousSha256 === undefined) {
          await store.put(remoteKey, object.sourcePath, {});
        } else {
          const prior = await store.read(remoteKey);
          const digest = prior ? createHash('sha256').update(prior.bytes).digest('hex') : null;
          if (digest !== object.expectedPreviousSha256) {
            throw new Error('APT pointer changed during publication');
          }
          await store.put(remoteKey, object.sourcePath, prior ? { etag: prior.etag } : { immutable: true });
        }
        await store.verify(remoteKey, object.sourcePath);
      },
    });
    aptPointers.push({ key, path: resolve(outputDirectory, `dists/${suite}/InRelease`) });
  }
  // Refresh only latest documents: historical running-tag descriptors remain immutable forever.
  const pointers = [{ key: 'latest/installers.json', path: catalogPath }, ...aptPointers];
  for (const name of fresh) {
    const key = `latest/${name.slice('fresh-'.length)}`;
    pointers.push({ key, path: resolve(root, name) });
    // oxlint-disable-next-line no-await-in-loop -- Authenticate the freshly signed offer before writing its pointer.
    const document = await readJson(resolve(root, name));
    verifyDesktopRouteDescriptor({
      manifest,
      route: name.includes('windows-nsis') ? 'windows-nsis' : 'linux-appimage',
      document,
      keys,
      offer: true,
    });
    // oxlint-disable-next-line no-await-in-loop -- Each descriptor is complete before the catalog commit pointer.
    await store.put(key, resolve(root, name), {});
    // oxlint-disable-next-line no-await-in-loop -- Verify published descriptor bytes before advancing.
    await store.verify(key, resolve(root, name));
  }
  if (operation === 'promote-routes') {
    await store.put('latest/installers.json', catalogPath, {});
    await store.verify('latest/installers.json', catalogPath);
  }
  await completeDesktopPromotion(store, { root, manifest, pointers });
};
