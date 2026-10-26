/**
 * The engine family and OS class runtime telemetry stamps on a page's entries (AR-W4-21). Closed values only: no
 * user-agent string and no version ever leaves the page.
 *
 * @module
 */

/** Engine family. */
export type PlatformClass = 'chromium' | 'firefox' | 'webkit' | 'electron';
/** OS class. */
export type OsClass = 'windows' | 'macos' | 'linux' | 'ios' | 'android' | 'other';

/** What the classification reads, so it can be tested without a browser. */
export type NavigatorFacts = Readonly<{
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  userAgentData?: Readonly<{ brands?: ReadonlyArray<Readonly<{ brand: string }>>; platform?: string }>;
}>;

/**
 * The page's navigator facts, or none during SSR.
 *
 * @returns The facts.
 */
const browserNavigator = (): NavigatorFacts =>
  typeof navigator === 'undefined' ? {} : (navigator as unknown as NavigatorFacts);

/**
 * The engine family: client hints when present (any Chromium brand), else the user-agent tests the UI already uses.
 *
 * @param facts - The navigator facts.
 * @param isDesktop - Whether this is the desktop renderer, which is always `electron`.
 * @returns The engine family.
 */
export const platformClass = (facts: NavigatorFacts = browserNavigator(), isDesktop = false): PlatformClass => {
  if (isDesktop) {
    return 'electron';
  }
  if (facts.userAgentData?.brands?.some(({ brand }) => /chrom/iu.test(brand)) === true) {
    return 'chromium';
  }
  const agent = facts.userAgent ?? '';
  if (agent.includes('Firefox/')) {
    return 'firefox';
  }
  if (agent.includes('Safari/') && !agent.includes('Chrome') && !agent.includes('Chromium')) {
    return 'webkit';
  }
  return 'chromium';
};

/**
 * The OS class: client hints' platform when present, else `navigator.platform` and the user agent.
 *
 * @param facts - The navigator facts.
 * @returns The OS class.
 */
export const osClass = (facts: NavigatorFacts = browserNavigator()): OsClass => {
  const hinted = facts.userAgentData?.platform?.toLowerCase();
  if (hinted !== undefined && hinted !== '') {
    if (hinted.includes('windows')) {
      return 'windows';
    }
    if (hinted.includes('mac')) {
      return 'macos';
    }
    if (hinted.includes('android')) {
      return 'android';
    }
    if (hinted.includes('linux') || hinted.includes('chrome os')) {
      return 'linux';
    }
  }
  const agent = facts.userAgent ?? '';
  const platform = facts.platform ?? '';
  if (/iPhone|iPad|iPod/u.test(agent) || (platform === 'MacIntel' && (facts.maxTouchPoints ?? 0) > 1)) {
    return 'ios';
  }
  if (agent.includes('Android')) {
    return 'android';
  }
  if (platform.startsWith('Win')) {
    return 'windows';
  }
  if (platform.startsWith('Mac')) {
    return 'macos';
  }
  if (/Linux|X11/u.test(platform) || /Linux|X11/u.test(agent)) {
    return 'linux';
  }
  return 'other';
};
