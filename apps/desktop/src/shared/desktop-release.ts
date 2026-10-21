import { z } from 'zod';

/** Distribution identity shared by packaging, publishing and the installed updater. */
export type DesktopReleaseChannel = 'production' | 'staging';

export const desktopDownloadOrigin = (channel: DesktopReleaseChannel): string =>
  channel === 'staging' ? 'https://downloads.taucad.dev' : 'https://downloads.tau.new';

export const stagingPackageVersion = (sequence: number): string => {
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > 99_989_999) {
    throw new TypeError('Staging sequence must be an integer from 1 to 99989999');
  }
  return `${1 + Math.floor(sequence / 10_000)}.${Math.floor(sequence / 100) % 100}.${sequence % 100}`;
};

export const desktopReleaseIdentity = (tag: string): { channel: DesktopReleaseChannel; version: string } => {
  const staging = /^desktop-staging@\d+\.\d+\.\d+-staging\.([1-9]\d*)$/u.exec(tag);
  if (staging) {
    return { channel: 'staging', version: stagingPackageVersion(Number(staging[1])) };
  }
  const production = /^desktop@(\d+\.\d+\.\d+)$/u.exec(tag);
  // Existing production 0.x versions remain valid; staging uses the independent 1.x sequence.
  if (production && /^(?:0|[1-9]\d{0,3})\.(?:0|[1-9]\d?)\.(?:0|[1-9]\d?)$/u.test(production[1]!)) {
    return { channel: 'production', version: production[1]! };
  }
  throw new TypeError(`Invalid desktop release tag: ${tag}`);
};

export const desktopArchiveName = (platform: string, arch: string): string => {
  if (platform === 'darwin' && (arch === 'arm64' || arch === 'x64')) {
    return `Tau-macos-${arch}.zip`;
  }
  if (platform === 'linux' && arch === 'x64') {
    return 'Tau-linux-x64.tar.gz';
  }
  if (platform === 'win32' && arch === 'x64') {
    return 'Tau-win32-x64.zip';
  }
  throw new TypeError(`Unsupported desktop distribution: ${platform}-${arch}`);
};

export const desktopReleaseBaseUrl = (tag: string): string =>
  `${desktopDownloadOrigin(desktopReleaseIdentity(tag).channel)}/releases/${encodeURIComponent(tag)}`;

/** Supported release targets; this does not widen the runtime architecture matrix. */
export const desktopReleaseTargets = ['darwin-arm64', 'darwin-x64', 'win32-x64', 'linux-x64'] as const;
export type DesktopReleaseTarget = (typeof desktopReleaseTargets)[number];

/** Roles describe use of the same final bytes, never a second mutable download. */
export const desktopArtifactKinds = {
  'macos-zip': { platform: 'darwin', format: 'zip', roles: ['archive', 'update'] },
  'macos-dmg': { platform: 'darwin', format: 'dmg', roles: ['installer'] },
  'windows-zip': { platform: 'win32', format: 'zip', roles: ['archive'] },
  'windows-nsis': { platform: 'win32', format: 'exe', roles: ['installer', 'update'] },
  'linux-tar': { platform: 'linux', format: 'tar.gz', roles: ['archive'] },
  'linux-deb-runtime': { platform: 'linux', format: 'deb', roles: ['runtime', 'repository'] },
  'linux-deb-selector': { platform: 'linux', format: 'deb', roles: ['installer', 'repository'] },
  'linux-appimage': { platform: 'linux', format: 'AppImage', roles: ['installer', 'update'] },
} as const;
export type DesktopArtifactKind = keyof typeof desktopArtifactKinds;

/** Filenames are immutable within a release directory; old archive names stay byte-for-byte stable. */
export const desktopArtifactName = (options: {
  kind: DesktopArtifactKind;
  channel: DesktopReleaseChannel;
  version: string;
  arch: 'arm64' | 'x64';
}): string => {
  const { kind, channel, version, arch } = options;
  kindSchema.parse(kind);
  versionSchema.parse(version);
  z.enum(['staging', 'production']).parse(channel);
  z.enum(['arm64', 'x64']).parse(arch);
  if (kind.startsWith('macos-')) {
    return `Tau-macos-${arch}.${kind === 'macos-dmg' ? 'dmg' : 'zip'}`;
  }
  if (arch !== 'x64') {
    throw new TypeError('Windows and Linux artifacts require x64');
  }
  switch (kind) {
    case 'windows-zip': {
      return desktopArchiveName('win32', arch);
    }
    case 'windows-nsis': {
      return 'Tau-win32-x64.exe';
    }
    case 'linux-tar': {
      return desktopArchiveName('linux', arch);
    }
    case 'linux-appimage': {
      return 'Tau-linux-x64.AppImage';
    }
    case 'linux-deb-runtime': {
      return `tau${channel === 'staging' ? '-staging' : ''}-runtime-${version}_${version}_amd64.deb`;
    }
    case 'linux-deb-selector': {
      return `tau${channel === 'staging' ? '-staging' : ''}_${version}_amd64.deb`;
    }
    default: {
      throw new TypeError('Unsupported desktop artifact kind');
    }
  }
};

const digestSchema = z.string().regex(/^[a-f\d]{64}$/u);
const sourceCommitSchema = z.string().regex(/^[a-f\d]{40}$/u);
const versionSchema = z.string().regex(/^(?:0|[1-9]\d{0,3})\.(?:0|[1-9]\d?)\.(?:0|[1-9]\d?)$/u);
const targetSchema = z.enum(desktopReleaseTargets);
const kindSchema = z.enum([
  'macos-zip',
  'macos-dmg',
  'windows-zip',
  'windows-nsis',
  'linux-tar',
  'linux-deb-runtime',
  'linux-deb-selector',
  'linux-appimage',
]);
const artifactSchema = z.strictObject({
  target: targetSchema,
  kind: kindSchema,
  name: z.string().min(1),
  format: z.enum(['zip', 'dmg', 'exe', 'tar.gz', 'deb', 'AppImage']),
  roles: z.array(z.enum(['archive', 'installer', 'update', 'runtime', 'repository'])).min(1),
  sha256: digestSchema,
  // Canonical base64 SHA512 consumed by electron-updater, including its padding.
  sha512: z.string().regex(/^[A-Za-z\d+/]{85}[AQgw]==$/u),
  size: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});
const manifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  tag: z.string(),
  channel: z.enum(['staging', 'production']),
  version: versionSchema,
  sourceCommit: sourceCommitSchema,
  artifacts: z.array(artifactSchema).min(1),
});
export type DesktopArtifact = z.infer<typeof artifactSchema>;
export type DesktopArtifactManifest = z.infer<typeof manifestSchema>;

/** Parse candidate metadata without modifying the deployed legacy download.json contract. */
export const parseDesktopArtifactManifest = (input: unknown): DesktopArtifactManifest => {
  const manifest = manifestSchema.parse(input);
  const identity = desktopReleaseIdentity(manifest.tag);
  if (identity.channel !== manifest.channel || identity.version !== manifest.version) {
    throw new TypeError('Artifact manifest channel, version and tag disagree');
  }
  const names = new Set<string>();
  const artifacts = new Set<string>();
  const targets = new Set<DesktopReleaseTarget>();
  for (const artifact of manifest.artifacts) {
    const spec = desktopArtifactKinds[artifact.kind];
    const [platform, arch] = artifact.target.split('-');
    if (
      platform !== spec.platform ||
      (arch !== 'arm64' && arch !== 'x64') ||
      artifact.format !== spec.format ||
      artifact.roles.length !== spec.roles.length ||
      !spec.roles.every((role) => artifact.roles.includes(role)) ||
      artifact.name !== desktopArtifactName({ ...manifest, kind: artifact.kind, arch })
    ) {
      throw new TypeError('Artifact target, format, roles or name disagree');
    }
    const key = `${artifact.target}:${artifact.kind}`;
    if (names.has(artifact.name) || artifacts.has(key)) {
      throw new TypeError('Duplicate desktop artifact');
    }
    names.add(artifact.name);
    artifacts.add(key);
    targets.add(artifact.target);
  }
  if (manifest.channel === 'production' && desktopReleaseTargets.some((target) => !targets.has(target))) {
    throw new TypeError('Production artifact manifests require every supported target');
  }
  for (const target of targets) {
    if (artifacts.has(`${target}:macos-dmg`) && !artifacts.has(`${target}:macos-zip`)) {
      throw new TypeError('Mac DMG requires the existing ZIP update artifact');
    }
    if (artifacts.has(`${target}:linux-deb-runtime`) !== artifacts.has(`${target}:linux-deb-selector`)) {
      throw new TypeError('APT requires both the runtime and selector artifacts');
    }
  }
  return manifest;
};

/** A route receipt proves installed behavior, not permission to promote publicly. */
export const desktopAcceptanceRoutes = {
  'macos-zip': ['macos-zip'],
  'macos-dmg': ['macos-dmg', 'macos-zip'],
  'windows-nsis': ['windows-nsis'],
  'linux-apt': ['linux-deb-runtime', 'linux-deb-selector'],
  'linux-appimage': ['linux-appimage'],
} as const satisfies Record<string, readonly DesktopArtifactKind[]>;
export type DesktopAcceptanceRoute = keyof typeof desktopAcceptanceRoutes;

const receiptSchema = z.strictObject({
  schemaVersion: z.literal(1),
  status: z.literal('passed'),
  tag: z.string(),
  channel: z.enum(['staging', 'production']),
  version: versionSchema,
  sourceCommit: sourceCommitSchema,
  target: targetSchema,
  route: z.enum(['macos-zip', 'macos-dmg', 'windows-nsis', 'linux-apt', 'linux-appimage']),
  artifacts: z.array(z.strictObject({ name: z.string().min(1), sha256: digestSchema })).min(1),
  baseline: z.strictObject({ version: versionSchema, artifactSha256: digestSchema }),
  installed: z.strictObject({ version: versionSchema, executableSha256: digestSchema }),
  environment: z.strictObject({
    os: z.string().min(1),
    arch: z.enum(['arm64', 'x64']),
    kind: z.enum(['ci', 'vm']),
    sandbox: z.literal('enabled'),
  }),
  trust: z.strictObject({ kind: z.enum(['test', 'release']), identity: z.string().min(1) }),
  checks: z.strictObject({ cleanInstall: z.literal(true), upgrade: z.literal(true), dataPreserved: z.literal(true) }),
  suite: z.string().min(1),
  logs: z.string().min(1),
});
export type DesktopAcceptanceReceipt = z.infer<typeof receiptSchema>;

/** Bind untrusted installed-acceptance evidence to this exact candidate, route and architecture. */
export const parseDesktopAcceptanceReceipt = (input: unknown, candidate: unknown): DesktopAcceptanceReceipt => {
  const manifest = parseDesktopArtifactManifest(candidate);
  const receipt = receiptSchema.parse(input);
  if (
    receipt.tag !== manifest.tag ||
    receipt.channel !== manifest.channel ||
    receipt.version !== manifest.version ||
    receipt.sourceCommit !== manifest.sourceCommit ||
    receipt.installed.version !== manifest.version ||
    !receipt.target.endsWith(`-${receipt.environment.arch}`)
  ) {
    throw new TypeError('Acceptance receipt identity disagrees with candidate');
  }
  const baseline = receipt.baseline.version.split('.').map(Number);
  const next = receipt.version.split('.').map(Number);
  const difference = next.findIndex((part, index) => part !== baseline[index]);
  if (difference === -1 || next[difference]! < baseline[difference]!) {
    throw new TypeError('Acceptance requires an upgrade from an older baseline');
  }
  const requiredKinds: readonly DesktopArtifactKind[] = desktopAcceptanceRoutes[receipt.route];
  const requiredArtifacts = manifest.artifacts.filter(
    (artifact) => artifact.target === receipt.target && requiredKinds.includes(artifact.kind),
  );
  if (
    requiredArtifacts.length !== requiredKinds.length ||
    requiredArtifacts.some((artifact) => artifact.sha256 === receipt.baseline.artifactSha256) ||
    receipt.artifacts.length !== requiredArtifacts.length ||
    new Set(receipt.artifacts.map((artifact) => artifact.name)).size !== receipt.artifacts.length ||
    requiredArtifacts.some(
      (artifact) =>
        !receipt.artifacts.some((proof) => proof.name === artifact.name && proof.sha256 === artifact.sha256),
    )
  ) {
    throw new TypeError('Acceptance receipt artifacts disagree with candidate route');
  }
  return receipt;
};
