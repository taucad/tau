/** Validate every new distribution route before exposing an installer or update pointer. */
import { createHash, createPrivateKey, sign } from 'node:crypto';

import { z } from 'zod';
import { verifyDesktopDescriptor } from '#main/update-identity.js';

import { parseDesktopAcceptanceReceipt, parseDesktopArtifactManifest } from '#shared/desktop-release.js';
import type {
  DesktopAcceptanceRoute,
  DesktopArtifactKind,
  DesktopArtifactManifest,
  DesktopReleaseTarget,
} from '#shared/desktop-release.js';

/** Exact release trust identities configured by the protected publisher, never supplied by a receipt. */
export type DesktopRouteTrust = Partial<Record<DesktopAcceptanceRoute, string>>;
const catalogKinds = {
  'macos-zip': ['macos-dmg', 'macos-zip'],
  'windows-nsis': ['windows-nsis', 'windows-zip'],
  'linux-apt': ['linux-deb-selector', 'linux-deb-runtime', 'linux-tar'],
  'linux-appimage': ['linux-appimage', 'linux-tar'],
} as const satisfies Partial<Record<DesktopAcceptanceRoute, readonly DesktopArtifactKind[]>>;

/** Hash the canonical parsed manifest to bind operator approval to all artifact bytes. */
export const desktopManifestDigest = (manifest: DesktopArtifactManifest): string =>
  createHash('sha256')
    .update(JSON.stringify(parseDesktopArtifactManifest(manifest)))
    .digest('hex');

/** Determine complete advertised routes; archives alone never qualify a new route. */
export const desktopCandidateRoutes = (
  manifest: DesktopArtifactManifest,
): Array<{ route: keyof typeof catalogKinds; target: DesktopReleaseTarget }> => {
  const result: Array<{ route: keyof typeof catalogKinds; target: DesktopReleaseTarget }> = [];
  for (const target of ['darwin-arm64', 'darwin-x64', 'win32-x64', 'linux-x64'] as const) {
    const kinds = new Set(
      manifest.artifacts.filter((artifact) => artifact.target === target).map((artifact) => artifact.kind),
    );
    for (const [route, required] of Object.entries(catalogKinds)) {
      if (kinds.has(required[0]) && !required.every((kind) => kinds.has(kind))) {
        throw new Error(`Incomplete installer route ${target}/${route}`);
      }
      if (required.every((kind) => kinds.has(kind))) {
        result.push({ route: route as keyof typeof catalogKinds, target });
      }
    }
  }
  if (result.length === 0 || (manifest.channel === 'production' && result.length !== 5)) {
    throw new Error('Installer publication requires complete routes (all five in production)');
  }
  return result;
};

/** Require both real CI and operator VM evidence, including both Mac migration paths. */
export const qualifyDesktopRoutes = (
  input: unknown,
  proofs: readonly unknown[],
  trust: DesktopRouteTrust,
): { manifest: DesktopArtifactManifest; routes: ReturnType<typeof desktopCandidateRoutes> } => {
  const manifest = parseDesktopArtifactManifest(input);
  const receipts = proofs.map((proof) => parseDesktopAcceptanceReceipt(proof, manifest));
  const routes = desktopCandidateRoutes(manifest);
  for (const { route, target } of routes) {
    const receiptRoutes: DesktopAcceptanceRoute[] = route === 'macos-zip' ? ['macos-zip', 'macos-dmg'] : [route];
    for (const receiptRoute of receiptRoutes) {
      const identity = trust[receiptRoute];
      if (!identity?.trim()) {
        throw new Error(`Missing protected release identity for ${receiptRoute}`);
      }
      for (const environment of ['ci', 'vm'] as const) {
        const matches = receipts.filter(
          (receipt) =>
            receipt.route === receiptRoute && receipt.target === target && receipt.environment.kind === environment,
        );
        if (matches.length !== 1 || matches[0]!.trust.kind !== 'release' || matches[0]!.trust.identity !== identity) {
          throw new Error(
            `Missing or ambiguous release-qualified ${environment} receipt for ${target}/${receiptRoute}`,
          );
        }
      }
    }
  }
  return { manifest, routes };
};

export type DesktopInstallerCatalog = {
  schemaVersion: 1;
  tag: string;
  channel: 'production' | 'staging';
  version: string;
  sourceCommit: string;
  promoted: true;
  routes: Array<{
    route: keyof typeof catalogKinds;
    target: DesktopReleaseTarget;
    qualification: { ci: true; vm: true; trust: 'release' };
    artifacts: Array<{ kind: DesktopArtifactKind; name: string; sha256: string; size: number }>;
  }>;
};

/** Public projection consumed by the opt-in website catalog, derived only after explicit approval. */
export const createDesktopInstallerCatalog = (options: {
  manifest: unknown;
  receipts: readonly unknown[];
  trust: DesktopRouteTrust;
  approval: unknown;
}): DesktopInstallerCatalog => {
  const { manifest, routes } = qualifyDesktopRoutes(options.manifest, options.receipts, options.trust);
  z.strictObject({
    schemaVersion: z.literal(1),
    tag: z.literal(manifest.tag),
    sourceCommit: z.literal(manifest.sourceCommit),
    channel: z.literal(manifest.channel),
    version: z.literal(manifest.version),
    manifestSha256: z.literal(desktopManifestDigest(manifest)),
    approved: z.literal(true),
  }).parse(options.approval);
  return {
    schemaVersion: 1,
    tag: manifest.tag,
    channel: manifest.channel,
    version: manifest.version,
    sourceCommit: manifest.sourceCommit,
    promoted: true,
    routes: routes.map(({ route, target }) => ({
      route,
      target,
      qualification: { ci: true, vm: true, trust: 'release' },
      artifacts: manifest.artifacts
        .filter(
          (artifact) =>
            artifact.target === target &&
            (catalogKinds[route] as readonly DesktopArtifactKind[]).includes(artifact.kind),
        )
        .map(({ kind, name, sha256, size }) => ({ kind, name, sha256, size })),
    })),
  };
};

/** Produce a bounded-lived, immutable-candidate descriptor; refresh changes time/signature, never candidate identity. */
export const createDesktopRouteDescriptor = (options: {
  manifest: DesktopArtifactManifest;
  route: 'windows-nsis' | 'linux-appimage';
  issuedAt: string;
  keyId?: string;
  privateKey?: string;
}): unknown => {
  const manifest = parseDesktopArtifactManifest(options.manifest);
  const artifact = manifest.artifacts.find((entry) => entry.kind === options.route);
  const issued = Date.parse(options.issuedAt);
  if (!artifact || !Number.isFinite(issued) || new Date(issued).toISOString() !== options.issuedAt) {
    throw new Error('Missing artifact or canonical descriptor issue time');
  }
  const keyId = options.route === 'windows-nsis' ? 'authenticode' : options.keyId;
  if (!keyId || !/^[A-Za-z0-9._-]{1,80}$/u.test(keyId)) {
    throw new Error('Missing descriptor key identity');
  }
  const descriptor = {
    schemaVersion: 1,
    keyId,
    tag: manifest.tag,
    channel: manifest.channel,
    version: manifest.version,
    sourceCommit: manifest.sourceCommit,
    arch: 'x64',
    route: options.route,
    path: `releases/${encodeURIComponent(manifest.tag)}/${artifact.name}`,
    size: artifact.size,
    sha512: artifact.sha512,
    issuedAt: options.issuedAt,
    expiresAt: new Date(issued + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
  if (options.route === 'windows-nsis') {
    return descriptor;
  }
  if (!options.privateKey) {
    throw new Error('AppImage descriptor requires release signing key');
  }
  const key = createPrivateKey(options.privateKey);
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new Error('AppImage descriptor requires Ed25519');
  }
  const bytes = Buffer.from(JSON.stringify(descriptor));
  return {
    schemaVersion: 1,
    keyId,
    descriptor: bytes.toString('base64'),
    signature: sign(null, bytes, key).toString('base64'),
  };
};

/** Authenticate immutable descriptor bytes against their manifest; historical expiry is not offer admission. */
export const verifyDesktopRouteDescriptor = (options: {
  manifest: DesktopArtifactManifest;
  route: 'windows-nsis' | 'linux-appimage';
  document: unknown;
  keys: Readonly<Record<string, string>>;
  offer?: boolean;
}): void => {
  const { manifest, route } = options;
  const artifact = manifest.artifacts.find((entry) => entry.kind === route);
  if (!artifact) {
    throw new Error('Descriptor route is absent from manifest');
  }
  const input = route === 'linux-appimage' ? verifyDesktopDescriptor(options.document, options.keys) : options.document;
  const parsed = z
    .strictObject({
      schemaVersion: z.literal(1),
      keyId: route === 'windows-nsis' ? z.literal('authenticode') : z.string(),
      tag: z.literal(manifest.tag),
      channel: z.literal(manifest.channel),
      version: z.literal(manifest.version),
      sourceCommit: z.literal(manifest.sourceCommit),
      arch: z.literal('x64'),
      route: z.literal(route),
      path: z.literal(`releases/${encodeURIComponent(manifest.tag)}/${artifact.name}`),
      size: z.literal(artifact.size),
      sha512: z.literal(artifact.sha512),
      issuedAt: z.iso.datetime(),
      expiresAt: z.iso.datetime(),
    })
    .parse(input);
  const issued = Date.parse(parsed.issuedAt),
    descriptorExpires = Date.parse(parsed.expiresAt);
  if (
    descriptorExpires <= issued ||
    descriptorExpires - issued > 7 * 24 * 60 * 60 * 1000 ||
    issued > Date.now() + 300_000
  ) {
    throw new Error('Invalid descriptor validity window');
  }
  if (options.offer && descriptorExpires <= Date.now()) {
    throw new Error('Expired descriptor cannot be published as an offer');
  }
};
