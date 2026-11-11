/**
 * Application document policy, built per environment so each site admits only its own environment's hosts (R2
 * storage blast radius R3, principle P3: no production page names a staging host). Netlify headers cover static files
 * only and `netlify.toml` is shared by both sites, so the build writes this same policy into `build/client/_headers`
 * (`scripts/write-content-security-policy-headers.mts`) and SSR sends it itself (`entry.server.tsx`).
 */

/** Which environment's first-party hosts a policy admits. */
export type ContentSecurityPolicyEnvironment = 'production' | 'staging' | 'development';

/** The site origin (`TAU_FRONTEND_URL`) each deployed environment serves. Both Netlify sites deploy the production context. */
const environmentByFrontendOrigin: ReadonlyMap<string, ContentSecurityPolicyEnvironment> = new Map([
  ['https://tau.new', 'production'],
  ['https://taucad.dev', 'staging'],
]);

/**
 * Choose the environment from the site's `TAU_FRONTEND_URL`, set per site by tau-cloud for builds and Functions.
 * Only an exact production or staging origin selects that environment's hosts; anything else (unset, local, a typo)
 * gets the development policy, which names neither, so a misconfigured site reports its first-party requests instead
 * of admitting the other environment's.
 *
 * @param frontendUrl - The site's `TAU_FRONTEND_URL`.
 * @returns The environment whose hosts the policy admits.
 */
export const resolveContentSecurityPolicyEnvironment = (
  frontendUrl: string | undefined,
): ContentSecurityPolicyEnvironment => {
  if (frontendUrl === undefined || !URL.canParse(frontendUrl)) {
    return 'development';
  }
  return environmentByFrontendOrigin.get(new URL(frontendUrl).origin) ?? 'development';
};

/** The R2 S3 endpoint host of a bucket in Tau's Cloudflare account (presigned uploads, rollback to presigned downloads). */
const r2Endpoint = (bucket: string): string =>
  `https://${bucket}.271cffba9907a76320b6a4993f756601.r2.cloudflarestorage.com`;

type FirstPartyHosts = Readonly<{ img: readonly string[]; connect: readonly string[] }>;

/**
 * Each environment's own hosts: its public CDN, private content bucket endpoint, files service (signed LFS
 * downloads), API and Socket.IO endpoint, and dependency mirror (PicoGK browser host by digest).
 */
const firstPartyHosts: Readonly<Record<ContentSecurityPolicyEnvironment, FirstPartyHosts>> = {
  production: {
    img: ['https://cdn.tau.new'],
    connect: [
      r2Endpoint('tau-prod-content-private'),
      'https://files.tau.new',
      'https://api.tau.new',
      'wss://api.tau.new',
      'https://cdn.tau.new',
      'https://dependencies.tau.new',
    ],
  },
  staging: {
    img: ['https://cdn.taucad.dev'],
    connect: [
      r2Endpoint('tau-staging-au-content-private'),
      'https://files.taucad.dev',
      'https://api.taucad.dev',
      'wss://api.taucad.dev',
      'https://cdn.taucad.dev',
      'https://dependencies.taucad.dev',
    ],
  },
  development: { img: [], connect: [] },
};

/** Third parties every environment reaches: GitHub, the Zoo converter API, Sentry ingest and the npm registry. */
const sharedConnectSources = [
  'https://api.github.com',
  'https://api.zoo.dev',
  'https://api.kittycad.io',
  'https://*.ingest.sentry.io',
  'https://*.ingest.us.sentry.io',
  'https://registry.npmjs.org',
] as const;

/**
 * Build the report-only document policy for one environment.
 *
 * @param environment - Whose first-party hosts to admit.
 * @returns The `Content-Security-Policy-Report-Only` value.
 */
export const buildReportOnlyContentSecurityPolicy = (environment: ContentSecurityPolicyEnvironment): string => {
  const hosts = firstPartyHosts[environment];
  const imgSources = ["'self'", 'data:', 'blob:', ...hosts.img, 'https://github.com', 'https:'];
  const connectSources = ["'self'", ...hosts.connect, ...sharedConnectSources, 'wss:'];
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob:",
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imgSources.join(' ')}`,
    "font-src 'self' data:",
    `connect-src ${connectSources.join(' ')}`,
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    'upgrade-insecure-requests',
    'report-to default;',
  ].join('; ');
};

/** This site's policy, chosen once from its `TAU_FRONTEND_URL` when the server module loads. */
export const reportOnlyContentSecurityPolicy = buildReportOnlyContentSecurityPolicy(
  resolveContentSecurityPolicyEnvironment(process.env['TAU_FRONTEND_URL']),
);
