/** Production origins the rendered pages link to. The client reads them too, so they live outside content.mjs. */
export const appOrigin = 'https://tau.new';
export const docsOrigin = 'https://docs.tau.new';

/** Staging hosts that serve these pages through the app's proxy, mapped to their own docs origin. */
const stagingDocsOrigins = new Map([['taucad.dev', 'https://docs.taucad.dev']]);

/**
 * Point production app and docs links at the environment serving the page, so staging links stay on staging.
 * @param href - A link from the rendered page.
 * @param hostname - The hostname the visitor loaded the page from.
 * @returns The link for this environment, or `href` unchanged.
 * @type {(href: string, hostname: string) => string}
 */
export const environmentHref = (href, hostname) => {
  const docs = stagingDocsOrigins.get(hostname);
  if (docs === undefined) {
    return href;
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
 * The desktop card on a staging host, which offers the signed staging prereleases instead of the production placeholder.
 * @param hostname - The hostname the visitor loaded the page from.
 * @returns The staging card copy and link, or `undefined` outside staging.
 * @type {(hostname: string) => { href: string, label: string, note: string } | undefined}
 */
export const stagingDesktop = (hostname) =>
  stagingDocsOrigins.has(hostname)
    ? {
        href: 'https://github.com/taucad/tau/releases?q=desktop-staging&expanded=true',
        label: 'Download a staging build',
        note: 'Local files, native kernels such as Build123d and PicoGK, and your own coding agents. Staging builds for macOS, Windows and Linux connect to taucad.dev.',
      }
    : undefined;
