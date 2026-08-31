/* oxlint-disable no-barrel-files/no-barrel-files -- Next.js config-safe subpath */

import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';

/**
 * Minimal shape accepted by Next.js `headers()`.
 *
 * @public
 */
export type NextRuntimeHeaderRule = {
  source: string;
  headers: Array<{ key: string; value: string }>;
};

/**
 * Options for `nextRuntimeHeaders`.
 *
 * @public
 */
export type NextRuntimeHeadersOptions = {
  /**
   * Route pattern(s) for document responses that must be cross-origin
   * isolated. Defaults to every route.
   */
  document?: string | readonly string[];
  /**
   * Same-origin subresource route pattern(s). Defaults to no extra rules
   * because most Next apps serve same-origin assets through the document rule.
   */
  subresource?: string | readonly string[];
};

type NextRuntimeWebpackConfig = {
  module?: {
    rules?: unknown[];
  };
  plugins?: unknown[];
  resolve?: {
    alias?: Record<string, unknown>;
  };
};

type NextRuntimeWebpackHook = NonNullable<NextConfig['webpack']>;

type NextRuntimeWebpackContext = Pick<Parameters<NextRuntimeWebpackHook>[1], 'isServer'> & {
  webpack: {
    NormalModuleReplacementPlugin: new (
      resourceRegExp: RegExp,
      replaceResource: (resource: { request: string }) => void,
    ) => unknown;
  };
};

type NarrowNextRuntimeWebpackHook = (
  config: NextRuntimeWebpackConfig,
  context: NextRuntimeWebpackContext,
) => NextRuntimeWebpackConfig | undefined;

type InstalledWebpackHook = (
  config: NextRuntimeWebpackConfig,
  context: NextRuntimeWebpackContext,
) => NextRuntimeWebpackConfig;

/** Next.js configuration returned by {@link withTauRuntime}. @public */
export type NextRuntimeConfig = Omit<NextConfig, 'headers' | 'turbopack' | 'webpack'> & {
  headers: NonNullable<NextConfig['headers']>;
  turbopack: NonNullable<NextConfig['turbopack']>;
  webpack: InstalledWebpackHook;
};

/* Duplicated from `#cross-origin-isolation/headers.js` rather than imported:
 * this entry is loaded by Next's own config resolver, under the same class of
 * cross-entry resolution risk the Vite adapter documents in its header. Parity
 * is enforced by config.test.ts's `stays in sync with the canonical
 * documentHeaders` case, which is the source of truth here, not the literal. */
// ponytail: duplicated deliberately; the parity test is the single source of truth, not the literal.
const documentHeaders: Readonly<Record<string, string>> = Object.freeze({
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
});

const subresourceHeaders: Readonly<Record<string, string>> = Object.freeze({
  'Cross-Origin-Resource-Policy': 'same-origin',
});

const browserNodeBuiltinsModule = '@taucad/runtime/nextjs/browser-node-builtins';
const nodeBuiltinSpecifier = /^node:(?:crypto|fs(?:\/promises)?|path|url)$/;
const packageAssetsLoader = fileURLToPath(new URL('package-assets-loader.mjs', import.meta.url));
const packageAssetsTurbopackRule = {
  loaders: [packageAssetsLoader],
};

const isWebpackHook = (value: unknown): value is NarrowNextRuntimeWebpackHook => typeof value === 'function';

const configureWebpack = (
  config: NextRuntimeWebpackConfig,
  context: NextRuntimeWebpackContext,
): NextRuntimeWebpackConfig => {
  if (context.isServer) {
    return config;
  }

  const replacementPlugin = new context.webpack.NormalModuleReplacementPlugin(nodeBuiltinSpecifier, (resource) => {
    resource.request = resource.request.slice('node:'.length);
  });

  return {
    ...config,
    module: {
      ...config.module,
      rules: [
        ...(config.module?.rules ?? []),
        {
          enforce: 'pre',
          test: /\.[cm]?[jt]sx?$/,
          use: [packageAssetsLoader],
        },
      ],
    },
    plugins: [...(config.plugins ?? []), replacementPlugin],
    resolve: {
      ...config.resolve,
      alias: {
        ...config.resolve?.alias,
        fs$: browserNodeBuiltinsModule,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Node.js module name
        'fs/promises$': browserNodeBuiltinsModule,
        path$: browserNodeBuiltinsModule,
        crypto$: browserNodeBuiltinsModule,
        url$: browserNodeBuiltinsModule,
      },
    },
  };
};

const toPatterns = (value: string | readonly string[] | undefined, fallback: readonly string[]): readonly string[] =>
  value === undefined ? fallback : typeof value === 'string' ? [value] : value;

const toHeaderEntries = (headers: Readonly<Record<string, string>>): Array<{ key: string; value: string }> =>
  Object.entries(headers).map(([key, value]) => ({ key, value }));

/**
 * Build Next.js cross-origin-isolation header rules for runtime apps.
 *
 * @param options - Optional route scoping.
 * @returns Header rules suitable for `next.config.ts`.
 * @public
 * @example <caption>Scope runtime headers to a route</caption>
 * ```typescript
 * import { nextRuntimeHeaders } from '@taucad/runtime/nextjs/config';
 *
 * export default { headers: async () => nextRuntimeHeaders({ document: '/workspace/:path*' }) };
 * ```
 */
export function nextRuntimeHeaders(options: NextRuntimeHeadersOptions = {}): NextRuntimeHeaderRule[] {
  const documentPatterns = toPatterns(options.document, ['/:path*']);
  const subresourcePatterns = toPatterns(options.subresource, []);
  return [
    ...documentPatterns.map((source) => ({ source, headers: toHeaderEntries(documentHeaders) })),
    ...subresourcePatterns.map((source) => ({ source, headers: toHeaderEntries(subresourceHeaders) })),
  ];
}

/**
 * Compose application-owned Next.js configuration with the runtime invariants.
 *
 * @param config - Application-owned Next.js configuration.
 * @param options - Optional route scoping.
 * @returns The composed Next.js configuration.
 * @public
 * @example <caption>Compose application config</caption>
 * ```typescript
 * import { withTauRuntime } from '@taucad/runtime/nextjs/config';
 *
 * export default withTauRuntime({ distDir: '.next-custom' });
 * ```
 */
export const withTauRuntime = (config: NextConfig = {}, options: NextRuntimeHeadersOptions = {}): NextRuntimeConfig => {
  const appHeaders = config.headers;
  const appWebpack = isWebpackHook(config.webpack) ? config.webpack : undefined;
  return {
    ...config,
    turbopack: {
      ...config.turbopack,
      rules: {
        ...config.turbopack?.rules,
        '**/packages/**/*.{js,jsx,ts,tsx,mjs,cjs}': packageAssetsTurbopackRule,
      },
      resolveAlias: {
        ...config.turbopack?.resolveAlias,
        fs: browserNodeBuiltinsModule,
        path: browserNodeBuiltinsModule,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Node.js module name
        'node:fs': browserNodeBuiltinsModule,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Node.js module name
        'node:fs/promises': browserNodeBuiltinsModule,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Node.js module name
        'node:path': browserNodeBuiltinsModule,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Node.js module name
        'node:crypto': browserNodeBuiltinsModule,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Node.js module name
        'node:url': browserNodeBuiltinsModule,
      },
    },
    webpack: (webpackConfig: NextRuntimeWebpackConfig, context: NextRuntimeWebpackContext) =>
      configureWebpack(appWebpack?.(webpackConfig, context) ?? webpackConfig, context),
    headers: async () => [...(appHeaders ? await appHeaders() : []), ...nextRuntimeHeaders(options)],
  };
};
