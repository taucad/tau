export type SiteConfiguration = {
  origin: string;
  launch: boolean;
  installerCatalog: boolean;
  analyticsEndpoint: string;
};
export function siteConfiguration(environment?: NodeJS.ProcessEnv): SiteConfiguration {
  const settings = environment ?? {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external environment, browser or wire-contract field name.
    WWW_LAUNCH: import.meta.env.WWW_LAUNCH,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Explicit default-off deployment gate.
    WWW_INSTALLER_CATALOG: import.meta.env.WWW_INSTALLER_CATALOG,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external environment, browser or wire-contract field name.
    WWW_ORIGIN: import.meta.env.WWW_ORIGIN,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external environment, browser or wire-contract field name.
    WWW_ANALYTICS_ENDPOINT: import.meta.env.WWW_ANALYTICS_ENDPOINT,
  };
  const launch = settings['WWW_LAUNCH'] === 'true';
  const rawOrigin = settings['WWW_ORIGIN'];
  const origin = rawOrigin ? new URL(rawOrigin) : undefined;
  if (
    origin &&
    (origin.protocol !== 'https:' ||
      origin.username ||
      origin.password ||
      origin.pathname !== '/' ||
      origin.search ||
      origin.hash)
  ) {
    throw new Error('WWW_ORIGIN must be an HTTPS origin without credentials, path, query or fragment.');
  }
  if (launch && !origin) {
    throw new Error('A launch build requires an explicit verified WWW_ORIGIN.');
  }
  const analyticsEndpoint = settings['WWW_ANALYTICS_ENDPOINT'] ?? '';
  if (analyticsEndpoint && analyticsEndpoint !== '/api/marketing-events') {
    throw new Error('Analytics must use the approved first-party endpoint.');
  }
  return {
    origin: origin?.origin ?? '',
    launch,
    analyticsEndpoint,
    installerCatalog: settings['WWW_INSTALLER_CATALOG'] === 'true',
  };
}
