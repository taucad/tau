/* oxlint-disable no-barrel-files/no-barrel-files -- Next.js config-safe subpath */

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

const documentHeaders: Readonly<Record<string, string>> = Object.freeze({
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
});

const subresourceHeaders: Readonly<Record<string, string>> = Object.freeze({
  'Cross-Origin-Resource-Policy': 'same-origin',
});

const wasmAssetRule = '*.wasm';

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
 * Build the Next.js config fragment needed by runtime-powered pages.
 *
 * @param options - Optional route scoping.
 * @returns A Next.js config fragment with `headers()`.
 * @public
 */
export function nextRuntimeConfig(options: NextRuntimeHeadersOptions = {}): {
  turbopack: {
    rules: Record<string, { type: 'asset' }>;
  };
  headers(): Promise<NextRuntimeHeaderRule[]>;
} {
  return {
    turbopack: {
      rules: {
        [wasmAssetRule]: { type: 'asset' },
      },
    },
    headers: async () => nextRuntimeHeaders(options),
  };
}
