import type { BrowserSettings } from '@taucad/types/browser';

/** Accept only ordinary web URLs, without ambiguous embedded credentials. */
export const isBrowserUrl = (input: string): boolean => {
  try {
    const url = new URL(input);
    return (
      ['https:', 'http:'].includes(url.protocol) && url.hostname !== '' && url.username === '' && url.password === ''
    );
  } catch {
    return false;
  }
};

/** Resolve an address or search query without converting forbidden schemes into web navigation. */
export const browserAddress = (input: string, engine: BrowserSettings['searchEngine']): string => {
  const value = input.trim();
  if (
    !value ||
    value.length > 8192 ||
    [...value].some((character) => (character.codePointAt(0) ?? 0) < 32 || character.codePointAt(0) === 127)
  ) {
    throw new Error('Enter a web address or search term.');
  }
  const isLocalAddress = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/iu.test(value);
  const isHostAddress =
    !/\s/u.test(value) && /^(?:[^/:]+\.[^/:]+|localhost|\[[\da-f:]+\])(?::\d+)?(?:\/|$)/iu.test(value);
  if (/^[a-z][a-z\d+.-]*:/iu.test(value) && !isHostAddress) {
    if (!isBrowserUrl(value)) {
      throw new Error('Only http and https web addresses are supported.');
    }
    return new URL(value).href;
  }
  if (isHostAddress) {
    const address = `${isLocalAddress ? 'http' : 'https'}://${value}`;
    if (!isBrowserUrl(address)) {
      throw new Error('Enter a web address without a username or password.');
    }
    return new URL(address).href;
  }
  const search = new URL(
    engine === 'google'
      ? 'https://www.google.com/search'
      : engine === 'bing'
        ? 'https://www.bing.com/search'
        : 'https://duckduckgo.com/',
  );
  search.searchParams.set('q', value);
  return search.href;
};

/** Explicit containment preferences, independent of the privileged app renderer. */
export const browserPreferences = {
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  webSecurity: true,
  allowRunningInsecureContent: false,
  webviewTag: false,
  navigateOnDragDrop: false,
  safeDialogs: true,
  spellcheck: true,
} as const;
