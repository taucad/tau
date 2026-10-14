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
  if (platform === 'darwin' && arch === 'arm64') {
    return 'Tau-macos-arm64.zip';
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
