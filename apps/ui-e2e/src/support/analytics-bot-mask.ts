/**
 * Let PostHog capture an automated browser's events. `posthog-js` drops every capture from a client it reads as a
 * bot, and it reads one from three places: `navigator.webdriver`, the user agent string, and the brand list in
 * `navigator.userAgentData`. Playwright's `chrome-headless-shell` reports a `HeadlessChrome` brand there even when
 * the context overrides the user agent, which suppressed every capture and left the no-`$exception` checks
 * vacuous; WebKit has no `userAgentData`, so only Chromium was affected.
 *
 * Passed whole to `BrowserContext.addInitScript`, so it closes over nothing and runs before any page script.
 */
export const maskAutomationFromAnalytics = (): void => {
  Object.defineProperty(navigator, 'webdriver', { configurable: true, value: false });
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    value: navigator.userAgent.replace('HeadlessChrome', 'Chrome'),
  });
  type AgentBrand = { readonly brand: string; readonly version: string };
  type AgentData = {
    readonly brands: readonly AgentBrand[];
    readonly mobile: boolean;
    readonly platform: string;
    readonly getHighEntropyValues: (hints: readonly string[]) => Promise<unknown>;
  };
  const agentData = (navigator as Navigator & { userAgentData?: AgentData }).userAgentData;
  if (agentData === undefined) {
    return;
  }
  const brands = agentData.brands.map((entry) => ({
    ...entry,
    brand: entry.brand.replace('HeadlessChrome', 'Chrome'),
  }));
  Object.defineProperty(navigator, 'userAgentData', {
    configurable: true,
    value: {
      brands,
      mobile: agentData.mobile,
      platform: agentData.platform,
      getHighEntropyValues: async (hints: readonly string[]): Promise<unknown> => agentData.getHighEntropyValues(hints),
    },
  });
};
