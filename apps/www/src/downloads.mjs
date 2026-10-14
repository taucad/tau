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
 * @type {(browser: {userAgentData?: {platform?: string, mobile?: boolean}, platform?: string, userAgent?: string, maxTouchPoints?: number}) => keyof typeof desktopDownloads | undefined}
 */
export const detectDesktopPlatform = (browser) => {
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

/** @type {(platform: keyof typeof desktopDownloads) => string} */
export const desktopDownloadHref = (platform) => `${downloadsOrigin}/latest/${desktopDownloads[platform].file}`;

/** @type {(platform: keyof typeof desktopDownloads) => string} */
export const desktopDownloadLabel = (platform) =>
  `${desktopDownloads[platform].icon}<span>Download for ${desktopDownloads[platform].label}</span>`;
