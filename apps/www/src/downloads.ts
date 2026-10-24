import { downloadsOrigin } from '#www/environment.js';
import { platformIcons } from '#www/platform-icons.js';

/** The published architectures are explicit; browser OS hints do not establish CPU compatibility. */
export const desktopDownloads = {
  mac: {
    label: 'Mac',
    icon: platformIcons.apple,
    file: 'Tau-macos-arm64.zip',
    detail: 'Apple silicon · ZIP download',
    install: 'Open the ZIP, move Tau to Applications, then launch Tau and sign in.',
    updates: 'Updates download automatically. Tau asks before restarting and saves your projects first.',
  },
  macIntel: {
    label: 'Intel',
    icon: platformIcons.apple,
    file: 'Tau-macos-x64.zip',
    detail: 'Intel Mac · ZIP download',
    install: 'Open the ZIP, move Tau to Applications, then launch Tau and sign in.',
    updates: 'Updates download automatically. Tau asks before restarting and saves your projects first.',
  },
  windows: {
    label: 'Windows',
    icon: platformIcons.windows,
    file: 'Tau-win32-x64.zip',
    detail: 'Windows x64 · ZIP download',
    install: 'Extract the ZIP to a folder you own, then launch Tau.exe and sign in.',
    updates: 'Download and install new versions manually. Keep your project files when replacing the app.',
  },
  linux: {
    label: 'Linux',
    icon: platformIcons.linux,
    file: 'Tau-linux-x64.tar.gz',
    detail: 'Linux x64 · tar.gz download',
    install: 'Extract the archive to a folder you own, then launch Tau and sign in.',
    updates: 'Download and install new versions manually. Keep your project files when replacing the app.',
  },
};

/**
 * Select an OS from low-entropy browser hints, without persisting or transmitting them.
 * @param browser - Navigator's optional platform hints and user agent fallback.
 * @returns A supported desktop OS, or no recommendation for mobile/unknown hosts.
 */
export const detectDesktopPlatform = (browser: {
  userAgentData?: { platform?: string; mobile?: boolean };
  platform?: string;
  userAgent?: string;
  maxTouchPoints?: number;
}): keyof typeof desktopDownloads | undefined => {
  const ua = browser.userAgent ?? '';
  const hints = [browser.userAgentData?.platform, browser.platform, ua];
  const platform = hints.find((value) => value !== undefined && value.length > 0) ?? '';
  if (
    browser.userAgentData?.mobile === true ||
    /Android|iPhone|iPad|iPod|CrOS|Mobile/iu.test(`${platform} ${ua}`) ||
    (/Mac/iu.test(platform) && (browser.maxTouchPoints ?? 0) > 1)
  ) {
    return undefined;
  }
  if (/Mac/iu.test(platform)) {
    return 'mac';
  }
  if (/Win/iu.test(platform)) {
    return 'windows';
  }
  if (/Linux/iu.test(platform) && !/aarch64|arm/iu.test(hints.join(' '))) {
    return 'linux';
  }
  return undefined;
};

/**
 * @param platform - Published desktop build.
 * @returns The production archive URL.
 */
export const desktopDownloadHref = (platform: keyof typeof desktopDownloads): string =>
  `${downloadsOrigin}/latest/${desktopDownloads[platform].file}`;

/**
 * @param platform - Published desktop build.
 * @returns Label markup from checked-in icon and product constants only.
 */
export const desktopDownloadLabel = (platform: keyof typeof desktopDownloads): string =>
  `${desktopDownloads[platform].icon}<span>Download for ${desktopDownloads[platform].label}</span>`;

/** Promoted installer catalog is opt-in; legacy callers above keep their existing downloads. */
export type QualifiedDesktopDownload = {
  readonly platform: keyof typeof desktopDownloads | 'linuxPortable';
  readonly label: string;
  readonly detail: string;
  readonly install: string;
  readonly updates: string;
  readonly href: string;
  readonly sha256: string;
  readonly size: number;
  readonly alternatives: ReadonlyArray<{ name: string; href: string; sha256: string; size: number }>;
};

const catalogRecord = (input: unknown, fields: readonly string[]): Record<string, unknown> => {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Invalid installer catalog record');
  }
  const value = input as Record<string, unknown>;
  if (Object.keys(value).length !== fields.length || fields.some((field) => !Object.hasOwn(value, field))) {
    throw new TypeError('Unknown or missing installer catalog fields');
  }
  return value;
};
const catalogString = (value: unknown, pattern: RegExp): string => {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new TypeError('Invalid installer catalog identity');
  }
  return value;
};

/**
 * Admit a publisher-produced projection only after explicit cutover and complete route qualification.
 * @param options - Opt-in selection and untrusted latest/installers.json document.
 * @returns Qualified installer choices, or undefined while the existing archive catalog remains selected.
 */
export const createDesktopDownloadCatalog = (options: {
  enabled: boolean;
  channel: 'production' | 'staging';
  qualification: unknown;
}): readonly QualifiedDesktopDownload[] | undefined => {
  if (!options.enabled) {
    return undefined;
  }
  const document = catalogRecord(options.qualification, [
    'schemaVersion',
    'tag',
    'channel',
    'version',
    'sourceCommit',
    'promoted',
    'routes',
  ]);
  if (document['schemaVersion'] !== 1 || document['promoted'] !== true || document['channel'] !== options.channel) {
    throw new TypeError('Installer catalog is unpromoted, incompatible or belongs to another channel');
  }
  const tag = catalogString(document['tag'], /^desktop(?:-staging)?@[^/]+$/u);
  const version = catalogString(document['version'], /^(?:0|[1-9]\d{0,3})\.(?:0|[1-9]\d?)\.(?:0|[1-9]\d?)$/u);
  catalogString(document['sourceCommit'], /^[a-f\d]{40}$/u);
  const staging = /^desktop-staging@\d+\.\d+\.\d+-staging\.([1-9]\d*)$/u.exec(tag);
  const sequence = staging ? Number(staging[1]) : 0;
  const mapped = `${1 + Math.floor(sequence / 10_000)}.${Math.floor(sequence / 100) % 100}.${sequence % 100}`;
  if (
    options.channel === 'production'
      ? tag !== `desktop@${version}`
      : !staging || !Number.isSafeInteger(sequence) || sequence > 99_989_999 || mapped !== version
  ) {
    throw new TypeError('Installer catalog tag and version disagree');
  }
  if (!Array.isArray(document['routes']) || document['routes'].length === 0) {
    throw new TypeError('Installer catalog has no qualified routes');
  }
  const suffix = options.channel === 'staging' ? '-staging' : '';
  const origin = options.channel === 'staging' ? 'https://downloads.taucad.dev' : downloadsOrigin;
  const base = `${origin}/releases/${encodeURIComponent(tag)}`;
  const routeDefinitions = {
    'macos-zip:darwin-arm64': {
      platform: 'mac',
      primary: 'macos-dmg',
      names: { 'macos-dmg': 'Tau-macos-arm64.dmg', 'macos-zip': 'Tau-macos-arm64.zip' },
      detail: 'Apple silicon · DMG installer',
      install: 'Open the DMG, drag Tau to Applications, eject the disk image, then launch Tau.',
      updates: desktopDownloads.mac.updates,
    },
    'macos-zip:darwin-x64': {
      platform: 'macIntel',
      primary: 'macos-dmg',
      names: { 'macos-dmg': 'Tau-macos-x64.dmg', 'macos-zip': 'Tau-macos-x64.zip' },
      detail: 'Intel Mac · DMG installer',
      install: 'Open the DMG, drag Tau to Applications, eject the disk image, then launch Tau.',
      updates: desktopDownloads.macIntel.updates,
    },
    'windows-nsis:win32-x64': {
      platform: 'windows',
      primary: 'windows-nsis',
      names: { 'windows-nsis': 'Tau-win32-x64.exe', 'windows-zip': 'Tau-win32-x64.zip' },
      detail: 'Windows x64 · per-user installer',
      install:
        'Run the Tau installer for your account. Existing ZIP users make this move once; keep your projects and profile.',
      updates:
        'Updates download automatically. Restart now saves work before installation; ordinary quit does not install.',
    },
    'linux-apt:linux-x64': {
      platform: 'linux',
      primary: 'linux-deb-selector',
      names: {
        'linux-deb-selector': `tau${suffix}_${version}_amd64.deb`,
        'linux-deb-runtime': `tau${suffix}-runtime-${version}_${version}_amd64.deb`,
        'linux-tar': 'Tau-linux-x64.tar.gz',
      },
      detail: 'Linux x64 · APT system installation',
      install: `Enroll the signed Tau repository first, then install tau${suffix} through APT so its exact runtime dependency is installed too.`,
      updates:
        'APT owns updates. Automatic updates require administrator enrollment and remain subject to system timers, holds and policy. Restart Tau to use a newly installed version.',
    },
    'linux-appimage:linux-x64': {
      platform: 'linuxPortable',
      primary: 'linux-appimage',
      names: { 'linux-appimage': 'Tau-linux-x64.AppImage', 'linux-tar': 'Tau-linux-x64.tar.gz' },
      detail: 'Linux x64 · portable AppImage',
      install:
        'Verify the published signing identity and digest, make the image executable, and keep it in a writable folder. Launch with the operating system sandbox enabled.',
      updates:
        'Authenticated updates download automatically. Restart now saves work before replacement; ordinary quit does not install. Read-only images and unsupported filesystems require manual replacement.',
    },
  } as const;
  const seen = new Set<string>();
  const immutableArtifacts = new Map<string, { sha256: string; size: number }>();
  const result: QualifiedDesktopDownload[] = [];
  for (const input of document['routes']) {
    const route = catalogRecord(input, ['route', 'target', 'qualification', 'artifacts']);
    const key = `${catalogString(route['route'], /^[a-z-]+$/u)}:${catalogString(route['target'], /^[a-z\d-]+$/u)}`;
    if (!Object.hasOwn(routeDefinitions, key) || seen.has(key)) {
      throw new TypeError('Unsupported or duplicate installer route');
    }
    seen.add(key);
    const definition = routeDefinitions[key as keyof typeof routeDefinitions];
    const proof = catalogRecord(route['qualification'], ['ci', 'vm', 'trust']);
    if (proof['ci'] !== true || proof['vm'] !== true || proof['trust'] !== 'release') {
      throw new TypeError('Installer route has not passed release qualification');
    }
    if (!Array.isArray(route['artifacts']) || route['artifacts'].length !== Object.keys(definition.names).length) {
      throw new TypeError('Installer route artifacts are incomplete');
    }
    const artifacts = new Map<string, { name: string; href: string; sha256: string; size: number }>();
    for (const item of route['artifacts']) {
      const artifact = catalogRecord(item, ['kind', 'name', 'sha256', 'size']);
      const kind = catalogString(artifact['kind'], /^[a-z-]+$/u);
      const names: Readonly<Record<string, string>> = definition.names;
      if (
        !Object.hasOwn(names, kind) ||
        artifact['name'] !== names[kind] ||
        artifacts.has(kind) ||
        typeof artifact['size'] !== 'number' ||
        !Number.isSafeInteger(artifact['size']) ||
        artifact['size'] <= 0
      ) {
        throw new TypeError('Installer artifact name, kind or size is invalid');
      }
      const name = names[kind]!;
      const sha256 = catalogString(artifact['sha256'], /^[a-f\d]{64}$/u);
      const prior = immutableArtifacts.get(name);
      if (prior && (prior.sha256 !== sha256 || prior.size !== artifact['size'])) {
        throw new TypeError('Shared immutable artifact has inconsistent bytes');
      }
      immutableArtifacts.set(name, { sha256, size: artifact['size'] });
      artifacts.set(kind, {
        name,
        href: `${base}/${name}`,
        sha256,
        size: artifact['size'],
      });
    }
    const primary = artifacts.get(definition.primary)!;
    result.push({
      platform: definition.platform,
      label: definition.platform === 'linuxPortable' ? 'Linux portable' : desktopDownloads[definition.platform].label,
      detail: definition.detail,
      install: definition.install,
      updates: definition.updates,
      href: definition.platform === 'linux' ? '#linux-installation' : primary.href,
      sha256: primary.sha256,
      size: primary.size,
      alternatives: [...artifacts.entries()]
        .filter(([kind]) => definition.platform === 'linux' || kind !== definition.primary)
        .map(([, artifact]) => artifact),
    });
  }
  if (options.channel === 'production' && seen.size !== Object.keys(routeDefinitions).length) {
    throw new TypeError('Production installer catalog requires every supported route');
  }
  return result;
};
