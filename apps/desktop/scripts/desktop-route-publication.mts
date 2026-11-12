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
  'linux-appimage': ['linux-appimage', 'linux-appimage-deb-runtime', 'linux-appimage-deb-selector', 'linux-tar'],
} as const satisfies Partial<Record<DesktopAcceptanceRoute, readonly DesktopArtifactKind[]>>;

/** Hash the canonical parsed manifest to bind operator approval to all artifact bytes. */
export const desktopManifestDigest = (manifest: DesktopArtifactManifest): string =>
  createHash('sha256')
    .update(JSON.stringify(parseDesktopArtifactManifest(manifest)))
    .digest('hex');

/**
 * Explicitly selected publication scope the publisher workflows accept. `all` keeps the original admission. `macos`
 * and `linux` are platform scopes (D-H5, operator ruling 2026-11-10: each platform is promoted on its own receipts from
 * its own candidate): `macos` must carry exactly the Apple silicon ZIP and DMG, `linux` exactly the linux-x64 APT and
 * AppImage routes, and neither any other architecture's or platform's artifact. Intel is excluded by operator ruling
 * until a GPU-capable Intel Mac host can qualify it.
 */
export const desktopPublicationScopes = ['all', 'macos', 'linux'] as const;
export type DesktopPublicationScope = (typeof desktopPublicationScopes)[number];
/** Route admission and publication accept the same scopes. */
export const desktopAdmissionScopes = desktopPublicationScopes;
export type DesktopAdmissionScope = (typeof desktopAdmissionScopes)[number];
/** Every route and artifact of each platform scope: a platform candidate carries exactly these and nothing else. */
const platformScopes = {
  macos: {
    name: 'Mac-only',
    target: 'darwin-arm64',
    routes: ['macos-zip'],
    kinds: ['macos-dmg', 'macos-zip'],
    refusal: (channel: string) => `Mac-only publication requires exactly ${channel} ZIP and DMG for Apple silicon`,
  },
  linux: {
    name: 'Linux-only',
    target: 'linux-x64',
    routes: ['linux-apt', 'linux-appimage'],
    kinds: [
      'linux-appimage',
      'linux-appimage-deb-runtime',
      'linux-appimage-deb-selector',
      'linux-deb-runtime',
      'linux-deb-selector',
      'linux-tar',
    ],
    refusal: () => 'Linux-only publication requires exactly the APT and AppImage routes for linux-x64',
  },
} as const satisfies Record<
  Exclude<DesktopAdmissionScope, 'all'>,
  {
    name: string;
    target: DesktopReleaseTarget;
    routes: ReadonlyArray<keyof typeof catalogKinds>;
    kinds: readonly DesktopArtifactKind[];
    refusal: (channel: string) => string;
  }
>;

/** Determine complete advertised routes; archives alone never qualify a new route. */
export const desktopCandidateRoutes = (
  manifest: DesktopArtifactManifest,
  scope: DesktopAdmissionScope = 'all',
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
  if (result.length === 0) {
    throw new Error('Installer publication requires complete routes');
  }
  // D-H5: production publishes every route of the promoted platform scope from that platform's own candidate. The
  // all-platform scope's routes are all five, so an `all` production candidate still needs every one of them.
  if (scope === 'all') {
    if (manifest.channel === 'production' && result.length !== 5) {
      throw new Error('Installer publication requires complete routes (all five in production)');
    }
    return result;
  }
  const platform = platformScopes[scope];
  const present = manifest.artifacts.map((artifact) => `${artifact.target}:${artifact.kind}`).sort();
  const expected = platform.kinds.map((kind) => `${platform.target}:${kind}`).sort();
  const routes = result.map(({ route, target }) => `${target}:${route}`).sort();
  if (
    JSON.stringify(present) !== JSON.stringify(expected) ||
    JSON.stringify(routes) !== JSON.stringify(platform.routes.map((route) => `${platform.target}:${route}`).sort())
  ) {
    throw new Error(platform.refusal(manifest.channel));
  }
  return result;
};

/**
 * Clean-host (operator VM) acceptance state of one admitted route. `pending` is admitted only for a staging Mac-only
 * publication, whose operator has ruled that CI evidence suffices until clean-host testing is done by hand; it is
 * published as such and never presented as clean-host qualified.
 */
export type DesktopCleanHostQualification = 'passed' | 'pending';

/**
 * Require real CI evidence for every route of the explicitly selected scope, and operator VM evidence for every route
 * except where a staging Mac-only publication explicitly records clean-host acceptance as pending. A VM receipt that is
 * present must still be complete, unambiguous and release-trusted; it is never silently ignored.
 */
export const qualifyDesktopScopedRoutes = (
  input: unknown,
  proofs: readonly unknown[],
  policy: { trust: DesktopRouteTrust; scope: DesktopAdmissionScope },
): {
  manifest: DesktopArtifactManifest;
  routes: Array<ReturnType<typeof desktopCandidateRoutes>[number] & { cleanHost: DesktopCleanHostQualification }>;
} => {
  const { trust, scope } = policy;
  const manifest = parseDesktopArtifactManifest(input);
  const receipts = proofs.map((proof) => parseDesktopAcceptanceReceipt(proof, manifest));
  const routes = desktopCandidateRoutes(manifest, z.enum(desktopAdmissionScopes).parse(scope));
  // A platform scope admits only its own platform's receipts; any other platform's evidence is refused, not ignored.
  if (
    scope !== 'all' &&
    receipts.some(
      (receipt) => !receipt.route.startsWith(`${scope}-`) || receipt.target !== platformScopes[scope].target,
    )
  ) {
    throw new Error(`${platformScopes[scope].name} publication cannot admit another platform route`);
  }
  // Only a staging Mac-only publication may record clean-host acceptance as pending; production always needs VM receipts.
  const cleanHostMayBePending = scope === 'macos' && manifest.channel === 'staging';
  return {
    manifest,
    routes: routes.map(({ route, target }) => {
      const receiptRoutes: DesktopAcceptanceRoute[] = route === 'macos-zip' ? ['macos-zip', 'macos-dmg'] : [route];
      const qualified = (environment: 'ci' | 'vm', receiptRoute: DesktopAcceptanceRoute): boolean => {
        const matches = receipts.filter(
          (receipt) =>
            receipt.route === receiptRoute && receipt.target === target && receipt.environment.kind === environment,
        );
        if (matches.length === 0 && environment === 'vm' && cleanHostMayBePending) {
          return false;
        }
        if (
          matches.length !== 1 ||
          matches[0]!.trust.kind !== 'release' ||
          matches[0]!.trust.identity !== trust[receiptRoute]
        ) {
          throw new Error(
            `Missing or ambiguous release-qualified ${environment} receipt for ${target}/${receiptRoute}`,
          );
        }
        return true;
      };
      for (const receiptRoute of receiptRoutes) {
        if (!trust[receiptRoute]?.trim()) {
          throw new Error(`Missing protected release identity for ${receiptRoute}`);
        }
        qualified('ci', receiptRoute);
      }
      const vm = receiptRoutes.map((receiptRoute) => qualified('vm', receiptRoute));
      // One catalog route pairs ZIP and DMG; clean-host acceptance of only one of them is not a coherent state.
      if (vm.some((passed) => passed !== vm[0])) {
        throw new Error(`Partial clean-host receipts for ${target}/${route}`);
      }
      return { route, target, cleanHost: vm[0] ? 'passed' : 'pending' };
    }),
  };
};

/** Require both real CI and operator VM evidence for every route, including both Mac migration paths. */
export const qualifyDesktopRoutes = (
  input: unknown,
  proofs: readonly unknown[],
  trust: DesktopRouteTrust,
): ReturnType<typeof qualifyDesktopScopedRoutes> => qualifyDesktopScopedRoutes(input, proofs, { trust, scope: 'all' });

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
    /**
     * `vm: true` is clean-host (operator VM) acceptance; `vm: 'pending'` marks a staging Mac route admitted on CI
     * evidence alone, which consumers must neither treat as clean-host qualified nor accept in production.
     */
    qualification: { ci: true; vm: true | 'pending'; trust: 'release' };
    artifacts: Array<{ kind: DesktopArtifactKind; name: string; sha256: string; size: number }>;
  }>;
};

/** Public projection consumed by the opt-in website catalog, derived only after explicit approval. */
export const createDesktopInstallerCatalog = (options: {
  manifest: unknown;
  receipts: readonly unknown[];
  trust: DesktopRouteTrust;
  approval: unknown;
  scope?: DesktopAdmissionScope;
}): DesktopInstallerCatalog => {
  const { manifest, routes } = qualifyDesktopScopedRoutes(options.manifest, options.receipts, {
    trust: options.trust,
    scope: options.scope ?? 'all',
  });
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
    routes: routes.map(({ route, target, cleanHost }) => ({
      route,
      target,
      qualification: { ci: true, vm: cleanHost === 'passed' ? true : 'pending', trust: 'release' },
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

/**
 * A narrower catalog must not silently withdraw a route an earlier promotion advertised: the website would fall back
 * for that platform while its signed update descriptors and APT metadata stop being renewed. Absent platforms that
 * were never promoted keep the website's legacy archive choices.
 */
export const assertDesktopCatalogRetainsRoutes = (previous: unknown, next: DesktopInstallerCatalog): void => {
  if (previous === undefined) {
    return;
  }
  const prior = z
    .object({
      channel: z.literal(next.channel),
      routes: z.array(z.object({ route: z.string(), target: z.string() })),
    })
    .parse(previous);
  const kept = new Set(next.routes.map(({ route, target }) => `${route}:${target}`));
  const dropped = prior.routes.filter(({ route, target }) => !kept.has(`${route}:${target}`));
  if (dropped.length > 0) {
    throw new Error(
      `Installer catalog would withdraw previously promoted routes: ${dropped.map(({ route, target }) => `${target}/${route}`).join(', ')}`,
    );
  }
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
