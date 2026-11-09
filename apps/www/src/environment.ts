/**
 * Production origins the rendered pages link to. The client reads them too, so they live outside content.ts.
 * `appOrigin` names the app only where an absolute address is required (the agent page and its prompt); page links
 * into the app use {@link appHref}.
 */
export const appOrigin = 'https://tau.new';
export const docsOrigin = 'https://docs.tau.new';
export const downloadsOrigin = 'https://downloads.tau.new';

/**
 * The app's Home for a link from these pages. Bare `/` serves this site again without the `tau-entry=app` preference,
 * which the `data-open-app` click hook writes only on a plain left click with cookies allowed. The UI's marketing edge
 * hands any `/` with a non-campaign query to the app, and the app then records the preference and drops the query.
 */
export const appHomePath = '/?app';

/**
 * A link into the Tau app. Every page here is served through the app's own hostname (the UI's marketing edge
 * function), so a same-origin path reaches the app wherever the page loaded: local development, a site's netlify.app
 * address, staging or production, with nothing rewritten after load.
 * @param path - The app path, starting with `/`.
 * @returns The same-origin link; `/` becomes {@link appHomePath}.
 */
export const appHref = (path: `/${string}`): string => (path === '/' ? appHomePath : path);

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
 * Keep the staging download channel visibly distinct from production. The note claims no signing or notarization
 * state: a staging release may be notarized or not, and neither the archive link nor the installer catalog says which.
 * @param hostname - The hostname serving the page.
 * @returns Staging update guidance, or no override on production.
 */
export const stagingDesktopNote = (hostname: string): string | undefined =>
  stagingDocsOrigins.has(hostname)
    ? 'This staging build connects to taucad.dev and updates automatically from the staging channel. Tau asks before restarting and saves your projects first.'
    : undefined;
