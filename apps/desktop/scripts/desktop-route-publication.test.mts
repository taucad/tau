#!/usr/bin/env node
/**
 * Purpose: Prove new-route promotion refuses unqualified, mismatched or unapproved candidates.
 * Environment: Node; ephemeral test signing key only, no external publication.
 * Usage: pnpm nx run desktop:test-route-publication
 * Exit: nonzero on weakened qualification or descriptor authentication.
 */
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { z } from 'zod';
import {
  desktopArtifactKinds,
  desktopArtifactName,
  desktopReleaseIdentity,
  parseDesktopArtifactManifest,
} from '#shared/desktop-release.js';
import type { DesktopArtifactKind } from '#shared/desktop-release.js';
/* oxlint-disable no-restricted-imports -- Test the publication gate itself. */
import {
  assertDesktopCatalogRetainsRoutes,
  createDesktopInstallerCatalog,
  createDesktopRouteDescriptor,
  desktopManifestDigest,
  qualifyDesktopRoutes,
  qualifyDesktopScopedRoutes,
} from './desktop-route-publication.mjs';
/* oxlint-enable no-restricted-imports */

const tag = 'desktop-staging@0.1.0-staging.102';
const identity = desktopReleaseIdentity(tag);
const artifact = (kind: DesktopArtifactKind) => ({
  kind,
  target: kind.startsWith('windows') ? 'win32-x64' : 'linux-x64',
  name: desktopArtifactName({ ...identity, kind, arch: 'x64' }),
  ...desktopArtifactKinds[kind],
  sha256: 'a'.repeat(64),
  sha512: Buffer.alloc(64, 1).toString('base64'),
  size: 123,
});
// Platform belongs to the catalog definition, not the wire artifact.
const wireArtifact = (kind: DesktopArtifactKind) => {
  const { platform: _platform, ...entry } = artifact(kind);
  return entry;
};
const manifest = parseDesktopArtifactManifest({
  schemaVersion: 1,
  tag,
  ...identity,
  sourceCommit: 'b'.repeat(40),
  artifacts: [wireArtifact('windows-nsis'), wireArtifact('windows-zip')],
});
/** Synthetic consumer evidence exercises publication admission; it proves no native qualification. */
const windowsHost = () => ({
  platform: 'win32',
  runner: 'synthetic-consumer',
  nativeArch: 'x64',
  osBuild: 26_100,
  account: 'standard-user',
  uac: 'enabled',
  defender: 'enabled',
  download: 'browser-internet-zone',
  reputationScope: 'qualification-mirror',
  manualEvidence: ['initial', 'reinstall'].map((stage, index) => ({
    stage,
    nonce: '123e4567-e89b-42d3-a456-426614174000',
    hostSha256: 'e'.repeat(64),
    artifactSha256: (index === 0 ? 'c' : 'a').repeat(64),
    observedAt: 200,
    smartScreen: 'not-shown',
    screenshots: ['security-settings', 'installer-result'].map((kind) => ({
      kind,
      name: `${stage}-${kind}.png`,
      capturedAt: 150,
      sha256: 'f'.repeat(64),
      size: 10,
    })),
  })),
});
const receipt = (environment: 'ci' | 'vm') => ({
  schemaVersion: 1,
  status: 'passed',
  tag,
  ...identity,
  sourceCommit: manifest.sourceCommit,
  target: 'win32-x64',
  route: 'windows-nsis',
  artifacts: [{ name: manifest.artifacts[0]!.name, sha256: manifest.artifacts[0]!.sha256 }],
  baseline: { version: '1.1.1', artifactSha256: 'c'.repeat(64) },
  installed: { version: identity.version, executableSha256: 'd'.repeat(64) },
  environment: {
    os: 'Windows11',
    arch: 'x64',
    kind: environment,
    sandbox: 'enabled',
    ...(environment === 'vm' ? { host: windowsHost() } : {}),
  },
  trust: { kind: 'release', identity: 'CN=Expected publisher' },
  checks: { cleanInstall: true, upgrade: true, dataPreserved: true },
  suite: 'installedA-to-B',
  logs: 'artifact://test-evidence',
});
const missingHost = receipt('vm');
delete missingHost.environment.host;
assert.throws(
  () => qualifyDesktopRoutes(manifest, [receipt('ci'), missingHost], { 'windows-nsis': 'CN=Expected publisher' }),
  /Clean-host receipt facts/u,
);
const receipts = [receipt('ci'), receipt('vm')];
/** Observed host facts every Mac clean-host receipt carries. */
const cleanHost = (nativeArch: 'arm64' | 'x64') => ({
  platform: 'darwin',
  runner: 'local-mac-1',
  productVersion: '26.0.1',
  nativeArch,
  translated: false,
  sip: 'enabled',
  gatekeeper: 'enabled',
  quarantine: {
    downloaded: '0083;6720a1b2;Chromium;4D3F1C2B-0000-4000-8000-000000000001',
    installed: '0083;6720a1b2;Chromium;4D3F1C2B-0000-4000-8000-000000000001',
  },
  assessment: 'Notarized Developer ID',
  staple: 'validated-offline',
  installedPath: '/Applications/Tau.app',
  launch: 'open',
});
const trust = { 'windows-nsis': 'CN=Expected publisher' };
const approval = {
  schemaVersion: 1,
  tag,
  ...identity,
  sourceCommit: manifest.sourceCommit,
  manifestSha256: desktopManifestDigest(manifest),
  approved: true,
};
const catalog = createDesktopInstallerCatalog({ manifest, receipts, trust, approval });
assert.equal(catalog.routes[0]!.route, 'windows-nsis');
assert.equal(catalog.routes[0]!.artifacts.length, 2);
for (const proofs of [
  [],
  [receipt('ci')],
  [...receipts, receipt('vm')],
  [{ ...receipt('ci'), trust: { kind: 'test', identity: trust['windows-nsis'] } }, receipt('vm')],
  [{ ...receipt('ci'), sourceCommit: 'f'.repeat(40) }, receipt('vm')],
]) {
  assert.throws(() => qualifyDesktopRoutes(manifest, proofs, trust));
}
assert.throws(() => qualifyDesktopRoutes(manifest, receipts, { 'windows-nsis': 'CN=Other publisher' }));
assert.throws(() =>
  createDesktopInstallerCatalog({
    manifest,
    receipts,
    trust,
    approval: { ...approval, manifestSha256: '0'.repeat(64) },
  }),
);
assert.throws(() =>
  createDesktopInstallerCatalog({ manifest, receipts, trust, approval: { ...approval, approved: false } }),
);
assert.throws(() => qualifyDesktopRoutes({ ...manifest, artifacts: [manifest.artifacts[0]] }, receipts, trust));
const issuedAt = '2026-10-21T00:00:00.000Z';
const windows = createDesktopRouteDescriptor({ manifest, route: 'windows-nsis', issuedAt });
assert.equal((windows as { keyId: string }).keyId, 'authenticode');
const appimage = parseDesktopArtifactManifest({
  ...manifest,
  artifacts: [
    wireArtifact('linux-appimage'),
    wireArtifact('linux-appimage-deb-runtime'),
    wireArtifact('linux-appimage-deb-selector'),
    wireArtifact('linux-tar'),
  ],
});
const key = generateKeyPairSync('ed25519');
const privateKey = key.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
const signed = createDesktopRouteDescriptor({
  manifest: appimage,
  route: 'linux-appimage',
  issuedAt,
  keyId: 'test-ephemeral',
  privateKey,
}) as { descriptor: string; signature: string };
assert.ok(
  verify(null, Buffer.from(signed.descriptor, 'base64'), key.publicKey, Buffer.from(signed.signature, 'base64')),
);
assert.equal(JSON.parse(Buffer.from(signed.descriptor, 'base64').toString()).expiresAt, '2026-10-28T00:00:00.000Z');
assert.throws(() =>
  createDesktopRouteDescriptor({ manifest: appimage, route: 'linux-appimage', issuedAt, keyId: 'test-ephemeral' }),
);
const renewed = createDesktopRouteDescriptor({
  manifest: appimage,
  route: 'linux-appimage',
  issuedAt: '2026-10-22T00:00:00.000Z',
  keyId: 'test-ephemeral',
  privateKey,
}) as typeof signed;
const old = z.record(z.string(), z.unknown()).parse(JSON.parse(Buffer.from(signed.descriptor, 'base64').toString()));
const next = z.record(z.string(), z.unknown()).parse(JSON.parse(Buffer.from(renewed.descriptor, 'base64').toString()));
assert.deepEqual(
  { ...old, issuedAt: next['issuedAt'], expiresAt: next['expiresAt'] },
  next,
  'Renewal must retain exact candidate identity',
);
console.log('Route qualification and descriptor signing checks passed');

// A complete production candidate must prove both Mac migration paths and both Linux routes.
const productionTag = 'desktop@0.2.0';
const productionIdentity = desktopReleaseIdentity(productionTag);
const productionArtifacts = [
  ['macos-zip', 'darwin-arm64'],
  ['macos-dmg', 'darwin-arm64'],
  ['macos-zip', 'darwin-x64'],
  ['macos-dmg', 'darwin-x64'],
  ['windows-zip', 'win32-x64'],
  ['windows-nsis', 'win32-x64'],
  ['linux-tar', 'linux-x64'],
  ['linux-deb-runtime', 'linux-x64'],
  ['linux-deb-selector', 'linux-x64'],
  ['linux-appimage', 'linux-x64'],
  ['linux-appimage-deb-runtime', 'linux-x64'],
  ['linux-appimage-deb-selector', 'linux-x64'],
].map(([kind, target]) => {
  const definition = desktopArtifactKinds[kind as DesktopArtifactKind];
  return {
    kind,
    target,
    format: definition.format,
    roles: [...definition.roles],
    name: desktopArtifactName({
      ...productionIdentity,
      kind: kind as DesktopArtifactKind,
      arch: target!.endsWith('arm64') ? 'arm64' : 'x64',
    }),
    sha256: 'a'.repeat(64),
    sha512: Buffer.alloc(64, 1).toString('base64'),
    size: 123,
  };
});
const production = parseDesktopArtifactManifest({
  schemaVersion: 1,
  tag: productionTag,
  ...productionIdentity,
  sourceCommit: manifest.sourceCommit,
  artifacts: productionArtifacts,
});
const requirements = [
  { route: 'macos-zip', target: 'darwin-arm64', kinds: ['macos-zip'] },
  { route: 'macos-dmg', target: 'darwin-arm64', kinds: ['macos-zip', 'macos-dmg'] },
  { route: 'macos-zip', target: 'darwin-x64', kinds: ['macos-zip'] },
  { route: 'macos-dmg', target: 'darwin-x64', kinds: ['macos-zip', 'macos-dmg'] },
  { route: 'windows-nsis', target: 'win32-x64', kinds: ['windows-nsis'] },
  { route: 'linux-apt', target: 'linux-x64', kinds: ['linux-deb-runtime', 'linux-deb-selector'] },
  {
    route: 'linux-appimage',
    target: 'linux-x64',
    kinds: ['linux-appimage', 'linux-appimage-deb-runtime', 'linux-appimage-deb-selector'],
  },
];
const productionTrust = {
  'macos-zip': 'TEAM',
  'macos-dmg': 'TEAM',
  'windows-nsis': 'CN=Expected publisher',
  'linux-apt': 'fingerprint',
  'linux-appimage': 'ed25519-key',
};
const productionReceipts = requirements.flatMap((requirement) =>
  ['ci', 'vm'].map((environment) => ({
    ...receipt('ci'),
    tag: productionTag,
    ...productionIdentity,
    route: requirement.route,
    target: requirement.target,
    artifacts: production.artifacts
      .filter((artifact) => artifact.target === requirement.target && requirement.kinds.includes(artifact.kind))
      .map(({ name, sha256 }) => ({ name, sha256 })),
    baseline: { version: '0.1.0', artifactSha256: 'c'.repeat(64) },
    installed: { version: '0.2.0', executableSha256: 'd'.repeat(64) },
    environment: {
      os: 'qualified fixture',
      arch: requirement.target.endsWith('arm64') ? 'arm64' : 'x64',
      kind: environment,
      sandbox: 'enabled',
      ...(environment === 'vm' && requirement.target === 'win32-x64' ? { host: windowsHost() } : {}),
      ...(environment === 'vm' && requirement.target.startsWith('darwin-')
        ? { host: cleanHost(requirement.target.endsWith('arm64') ? 'arm64' : 'x64') }
        : {}),
    },
    trust: { kind: 'release', identity: productionTrust[requirement.route as keyof typeof productionTrust] },
  })),
);
assert.equal(qualifyDesktopRoutes(production, productionReceipts, productionTrust).routes.length, 5);
for (const remove of [
  (proof: (typeof productionReceipts)[number]) => proof.target === 'darwin-x64',
  (proof: (typeof productionReceipts)[number]) => proof.route === 'macos-dmg',
  (proof: (typeof productionReceipts)[number]) => proof.route === 'linux-appimage',
]) {
  assert.throws(() =>
    qualifyDesktopRoutes(
      production,
      productionReceipts.filter((proof) => !remove(proof)),
      productionTrust,
    ),
  );
}
assert.throws(() =>
  qualifyDesktopRoutes(
    production,
    [
      { ...productionReceipts[0], artifacts: [{ name: 'Tau-macos-arm64.zip', sha256: 'e'.repeat(64) }] },
      ...productionReceipts.slice(1),
    ],
    productionTrust,
  ),
);
assert.throws(() =>
  qualifyDesktopRoutes(
    { ...production, artifacts: production.artifacts.filter((artifact) => artifact.kind !== 'linux-appimage') },
    productionReceipts,
    productionTrust,
  ),
);

// Mac-only staging scope: both architectures, ZIP and DMG, each with exactly one CI and one VM release receipt.
const macTargets = ['darwin-arm64', 'darwin-x64'] as const;
const macWire = (target: (typeof macTargets)[number], kind: 'macos-zip' | 'macos-dmg', sha: string) => {
  const definition = desktopArtifactKinds[kind];
  return {
    kind,
    target,
    format: definition.format,
    roles: [...definition.roles],
    name: desktopArtifactName({ ...identity, kind, arch: target === 'darwin-arm64' ? 'arm64' : 'x64' }),
    sha256: sha.repeat(64),
    sha512: Buffer.alloc(64, 2).toString('base64'),
    size: 456,
  };
};
const macManifest = parseDesktopArtifactManifest({
  schemaVersion: 1,
  tag,
  ...identity,
  sourceCommit: manifest.sourceCommit,
  artifacts: [
    macWire('darwin-arm64', 'macos-zip', '1'),
    macWire('darwin-arm64', 'macos-dmg', '2'),
    macWire('darwin-x64', 'macos-zip', '3'),
    macWire('darwin-x64', 'macos-dmg', '4'),
  ],
});
const macTrust = { 'macos-zip': 'TEAM123456', 'macos-dmg': 'TEAM123456' };
const macReceipt = (
  route: 'macos-zip' | 'macos-dmg',
  target: (typeof macTargets)[number],
  environment: 'ci' | 'vm',
) => ({
  ...receipt(environment),
  route,
  target,
  artifacts: macManifest.artifacts
    .filter((artifact) => artifact.target === target && (route === 'macos-dmg' || artifact.kind === 'macos-zip'))
    .map(({ name, sha256 }) => ({ name, sha256 })),
  environment: {
    os: 'Darwin 25.0.0',
    arch: target === 'darwin-arm64' ? 'arm64' : 'x64',
    kind: environment,
    sandbox: 'enabled',
    // A Mac clean-host receipt always carries its observed host facts.
    ...(environment === 'vm'
      ? {
          host: cleanHost(target === 'darwin-arm64' ? 'arm64' : 'x64'),
        }
      : {}),
  },
  trust: { kind: 'release', identity: macTrust[route] },
});
const macReceipts = macTargets.flatMap((target) =>
  (['macos-zip', 'macos-dmg'] as const).flatMap((route) =>
    (['ci', 'vm'] as const).map((environment) => macReceipt(route, target, environment)),
  ),
);
type MacProof = (typeof macReceipts)[number];
const macApproval = { ...approval, manifestSha256: desktopManifestDigest(macManifest) };
const macCatalog = createDesktopInstallerCatalog({
  manifest: macManifest,
  receipts: macReceipts,
  trust: macTrust,
  approval: macApproval,
  scope: 'macos',
});
assert.deepEqual(
  macCatalog.routes.map(({ route, target }) => `${target}/${route}`),
  ['darwin-arm64/macos-zip', 'darwin-x64/macos-zip'],
);
assert.deepEqual(
  macCatalog.routes.map((route) => route.artifacts.map(({ kind }) => kind)),
  [
    ['macos-zip', 'macos-dmg'],
    ['macos-zip', 'macos-dmg'],
  ],
);
// The `all` scope keeps its original staging-subset admission for the same evidence.
assert.equal(qualifyDesktopRoutes(macManifest, macReceipts, macTrust).routes.length, 2);
assert.deepEqual(
  macCatalog.routes.map(({ qualification }) => qualification),
  [
    { ci: true, vm: true, trust: 'release' },
    { ci: true, vm: true, trust: 'release' },
  ],
);
const rejectMac = (
  proofs: readonly unknown[],
  change: { candidate?: unknown; trust?: Record<string, string>; scope?: string } = {},
): void => {
  assert.throws(() =>
    qualifyDesktopScopedRoutes(change.candidate ?? macManifest, proofs, {
      trust: change.trust ?? macTrust,
      scope: (change.scope ?? 'macos') as 'macos',
    }),
  );
};
// Every CI or VM receipt is individually required; single-architecture evidence is refused.
for (const index of macReceipts.keys()) {
  rejectMac(macReceipts.filter((_, other) => other !== index));
}
for (const remove of [
  (proof: MacProof) => proof.environment.kind === 'ci',
  (proof: MacProof) => proof.target === 'darwin-x64',
  (proof: MacProof) => proof.target === 'darwin-arm64',
  (proof: MacProof) => proof.route === 'macos-dmg',
]) {
  rejectMac(macReceipts.filter((proof) => !remove(proof)));
}
rejectMac([...macReceipts, macReceipts[0]]);
// Wrong channel, source, version, signer or digest on any receipt is refused.
for (const change of [
  (proof: MacProof) => ({ ...proof, channel: 'production' }),
  (proof: MacProof) => ({ ...proof, sourceCommit: 'f'.repeat(40) }),
  (proof: MacProof) => ({ ...proof, version: '1.1.3' }),
  (proof: MacProof) => ({ ...proof, installed: { ...proof.installed, version: '1.1.3' } }),
  (proof: MacProof) => ({ ...proof, trust: { kind: 'release', identity: 'OTHERTEAM1' } }),
  (proof: MacProof) => ({ ...proof, trust: { kind: 'test', identity: proof.trust.identity } }),
  (proof: MacProof) => ({ ...proof, artifacts: proof.artifacts.map((item) => ({ ...item, sha256: 'e'.repeat(64) })) }),
  (proof: MacProof) => ({ ...proof, target: proof.target === 'darwin-arm64' ? 'darwin-x64' : 'darwin-arm64' }),
]) {
  for (const index of macReceipts.keys()) {
    rejectMac(macReceipts.map((proof, other) => (other === index ? change(proof) : proof)));
  }
}
rejectMac(macReceipts, { trust: { ...macTrust, 'macos-dmg': 'OTHERTEAM1' } });
rejectMac(macReceipts, { trust: { 'macos-zip': macTrust['macos-zip'] } });
rejectMac(macReceipts, { scope: 'linux' });
// A single-architecture candidate cannot be published as the Mac-only rollout.
rejectMac(
  macReceipts.filter((proof) => proof.target === 'darwin-arm64'),
  {
    candidate: {
      ...macManifest,
      artifacts: macManifest.artifacts.filter((artifact) => artifact.target === 'darwin-arm64'),
    },
  },
);
// ZIP without its DMG is not the Mac-only rollout, even though the `all` scope may admit it.
const zipOnly = {
  ...macManifest,
  artifacts: macManifest.artifacts.filter((artifact) => artifact.kind === 'macos-zip'),
};
rejectMac(
  macReceipts.filter((proof) => proof.route === 'macos-zip'),
  { candidate: zipOnly },
);
// The Mac-only scope cannot select a Windows or Linux route, even with complete evidence for it.
const mixed = parseDesktopArtifactManifest({
  ...macManifest,
  artifacts: [...macManifest.artifacts, wireArtifact('windows-nsis'), wireArtifact('windows-zip')],
});
const mixedReceipts = [
  ...macReceipts,
  { ...receipt('ci'), artifacts: [{ name: mixed.artifacts[4]!.name, sha256: mixed.artifacts[4]!.sha256 }] },
  { ...receipt('vm'), artifacts: [{ name: mixed.artifacts[4]!.name, sha256: mixed.artifacts[4]!.sha256 }] },
];
assert.equal(qualifyDesktopRoutes(mixed, mixedReceipts, { ...macTrust, ...trust }).routes.length, 3);
rejectMac(mixedReceipts, { candidate: mixed, trust: { ...macTrust, ...trust } });
rejectMac(mixedReceipts, { trust: { ...macTrust, ...trust } });
// Production keeps the deliberate all-five-route rule; a Mac-only production candidate never parses or qualifies.
assert.throws(() =>
  qualifyDesktopScopedRoutes(
    { ...macManifest, tag: productionTag, ...productionIdentity },
    macReceipts.map((proof) => ({ ...proof, tag: productionTag, ...productionIdentity })),
    { trust: macTrust, scope: 'macos' },
  ),
);
// A narrower catalog cannot withdraw routes a previous promotion advertised; never-promoted platforms stay legacy.
assertDesktopCatalogRetainsRoutes(undefined, macCatalog);
assertDesktopCatalogRetainsRoutes(macCatalog, macCatalog);
assertDesktopCatalogRetainsRoutes({ ...macCatalog, routes: macCatalog.routes.slice(0, 1) }, macCatalog);
assert.throws(() => {
  assertDesktopCatalogRetainsRoutes(
    { ...macCatalog, routes: [...macCatalog.routes, { ...catalog.routes[0]!, target: 'win32-x64' }] },
    macCatalog,
  );
}, /withdraw previously promoted routes: win32-x64\/windows-nsis/u);
assert.throws(() => {
  assertDesktopCatalogRetainsRoutes({ ...macCatalog, channel: 'production' }, macCatalog);
});
assert.throws(() => {
  assertDesktopCatalogRetainsRoutes({ tag }, macCatalog);
});

// Operator ruling: a staging Mac-only publication may proceed on CI receipts alone, explicitly clean-host pending.
const macCi = macReceipts.filter((proof) => proof.environment.kind === 'ci');
const ciOnlyCatalog = createDesktopInstallerCatalog({
  manifest: macManifest,
  receipts: macCi,
  trust: macTrust,
  approval: macApproval,
  scope: 'macos',
});
assert.deepEqual(
  ciOnlyCatalog.routes.map(({ target, qualification }) => [target, qualification]),
  [
    ['darwin-arm64', { ci: true, vm: 'pending', trust: 'release' }],
    ['darwin-x64', { ci: true, vm: 'pending', trust: 'release' }],
  ],
);
// The published bytes carry the marker unchanged, and nothing else about the catalog differs from a VM-qualified one.
const publishedCatalog = `${JSON.stringify(ciOnlyCatalog)}\n`;
assert.deepEqual(JSON.parse(publishedCatalog), ciOnlyCatalog);
assert.deepEqual(
  { ...ciOnlyCatalog, routes: ciOnlyCatalog.routes.map(({ qualification: _q, ...route }) => route) },
  { ...macCatalog, routes: macCatalog.routes.map(({ qualification: _q, ...route }) => route) },
);
assert.deepEqual(
  qualifyDesktopScopedRoutes(macManifest, macCi, { trust: macTrust, scope: 'macos' }).routes.map(
    ({ cleanHost }) => cleanHost,
  ),
  ['pending', 'pending'],
);
// A present VM receipt upgrades only its own architecture's route.
assert.deepEqual(
  qualifyDesktopScopedRoutes(
    macManifest,
    macReceipts.filter((proof) => proof.environment.kind === 'ci' || proof.target === 'darwin-arm64'),
    { trust: macTrust, scope: 'macos' },
  ).routes.map(({ target, cleanHost }) => `${target}:${cleanHost}`),
  ['darwin-arm64:passed', 'darwin-x64:pending'],
);
// CI evidence stays individually required and fully bound even when clean-host acceptance is pending.
for (const index of macCi.keys()) {
  rejectMac(macCi.filter((_, other) => other !== index));
}
rejectMac([...macCi, macCi[0]]);
for (const change of [
  (proof: MacProof) => ({ ...proof, sourceCommit: 'f'.repeat(40) }),
  (proof: MacProof) => ({ ...proof, version: '1.1.3' }),
  (proof: MacProof) => ({ ...proof, trust: { kind: 'release', identity: 'OTHERTEAM1' } }),
  (proof: MacProof) => ({ ...proof, trust: { kind: 'test', identity: proof.trust.identity } }),
  (proof: MacProof) => ({ ...proof, artifacts: proof.artifacts.map((item) => ({ ...item, sha256: 'e'.repeat(64) })) }),
  (proof: MacProof) => ({ ...proof, target: proof.target === 'darwin-arm64' ? 'darwin-x64' : 'darwin-arm64' }),
  // A well-formed clean-host receipt cannot stand in for the CI receipt it replaces.
  (proof: MacProof) => ({
    ...proof,
    environment: {
      ...proof.environment,
      kind: 'vm',
      host: cleanHost(proof.target === 'darwin-arm64' ? 'arm64' : 'x64'),
    },
  }),
]) {
  for (const index of macCi.keys()) {
    rejectMac(macCi.map((proof, other) => (other === index ? change(proof) : proof)));
  }
}
// A VM receipt that is present is never ignored: untrusted, mismatched, partial or duplicated VM evidence is refused.
const macVm = macReceipts.filter((proof) => proof.environment.kind === 'vm');
for (const change of [
  (proof: MacProof) => ({ ...proof, trust: { kind: 'test', identity: proof.trust.identity } }),
  (proof: MacProof) => ({ ...proof, trust: { kind: 'release', identity: 'OTHERTEAM1' } }),
  (proof: MacProof) => ({ ...proof, sourceCommit: 'f'.repeat(40) }),
  (proof: MacProof) => ({ ...proof, artifacts: proof.artifacts.map((item) => ({ ...item, sha256: 'e'.repeat(64) })) }),
]) {
  for (const vm of macVm) {
    rejectMac([...macCi, change(vm)]);
  }
}
for (const vm of macVm) {
  rejectMac([...macCi, vm]);
}
rejectMac([...macReceipts, macVm[0]]);
// CI-only evidence never qualifies the `all` scope, a production candidate or the five production routes.
assert.throws(() => qualifyDesktopRoutes(macManifest, macCi, macTrust), /vm receipt/u);
assert.throws(() =>
  qualifyDesktopScopedRoutes(
    { ...macManifest, tag: productionTag, ...productionIdentity },
    macCi.map((proof) => ({ ...proof, tag: productionTag, ...productionIdentity })),
    { trust: macTrust, scope: 'macos' },
  ),
);
const productionCi = productionReceipts.filter((proof) => proof.environment.kind === 'ci');
assert.throws(() => qualifyDesktopRoutes(production, productionCi, productionTrust), /vm receipt/u);
assert.throws(() => qualifyDesktopScopedRoutes(production, productionCi, { trust: productionTrust, scope: 'all' }));
assert.throws(() => qualifyDesktopScopedRoutes(production, productionCi, { trust: productionTrust, scope: 'macos' }));
assert.deepEqual(
  qualifyDesktopRoutes(production, productionReceipts, productionTrust).routes.map(({ cleanHost }) => cleanHost),
  ['passed', 'passed', 'passed', 'passed', 'passed'],
);
assert.throws(() => qualifyDesktopRoutes(manifest, [receipt('ci')], trust), /vm receipt/u);
assert.throws(() =>
  qualifyDesktopRoutes(
    mixed,
    mixedReceipts.filter((proof) => proof.environment.kind === 'ci'),
    {
      ...macTrust,
      ...trust,
    },
  ),
);
assert.deepEqual(catalog.routes[0]!.qualification, { ci: true, vm: true, trust: 'release' });
console.log('Mac-only scope, CI/VM receipt, clean-host pending, architecture and catalog retention checks passed');
