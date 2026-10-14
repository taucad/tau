/** Production origins the rendered pages link to. The client reads them too, so they live outside content.ts. */
export const appOrigin = 'https://tau.new';
export const docsOrigin = 'https://docs.tau.new';
export const downloadsOrigin = 'https://downloads.tau.new';

/** Staging hosts that serve these pages through the app's proxy, mapped to their own docs origin. */
const stagingDocsOrigins = new Map([['taucad.dev', 'https://docs.taucad.dev']]);

/**
 * Point production app and docs links at the environment serving the page, so staging links stay on staging.
 * @param href - A link from the rendered page.
 * @param hostname - The hostname the visitor loaded the page from.
 * @returns The link for this environment, or `href` unchanged.
 */
export const environmentHref: (href: string, hostname: string) => string = (href, hostname): string => {
  const docs = stagingDocsOrigins.get(hostname);
  if (docs === undefined) {
    return href;
  }
  if (href === downloadsOrigin || href.startsWith(`${downloadsOrigin}/`)) {
    return `https://downloads.taucad.dev${href.slice(downloadsOrigin.length)}`;
  }
  if (href === docsOrigin || href.startsWith(`${docsOrigin}/`)) {
    return `${docs}${href.slice(docsOrigin.length)}`;
  }
  if (href === appOrigin || href.startsWith(`${appOrigin}/`)) {
    return `https://${hostname}${href.slice(appOrigin.length)}`;
  }
  return href;
};

/**
 * Keep the staging download channel visibly distinct from production.
 * @param hostname - The hostname serving the page.
 * @returns Staging installation guidance, or no override on production.
 */
export const stagingDesktopNote = (hostname: string): string | undefined =>
  stagingDocsOrigins.has(hostname)
    ? 'This staging build connects to taucad.dev and updates automatically. It is signed without notarization; macOS may ask you to allow it in Privacy & Security.'
    : undefined;
