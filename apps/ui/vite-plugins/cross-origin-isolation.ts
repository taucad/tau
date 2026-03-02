import type { Plugin, PreviewServer, ViteDevServer } from 'vite';

/**
 * Vite plugin that sets Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy
 * headers on every dev/preview response. Required for SharedArrayBuffer (used by
 * multi-threaded OpenCASCADE). Production headers are set in netlify.toml.
 *
 * Uses `configureServer` middleware (not `server.headers`) so that headers apply to
 * all responses including those served by framework plugins like React Router SSR.
 *
 * @see https://github.com/vitejs/vite/issues/3909#issuecomment-934044912
 */
export function crossOriginIsolation(): Plugin {
  const headers: Record<string, string> = {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'credentialless',
  };

  function applyHeaders(server: ViteDevServer | PreviewServer): void {
    server.middlewares.use((_request, response, next) => {
      for (const [key, value] of Object.entries(headers)) {
        response.setHeader(key, value);
      }

      next();
    });
  }

  return {
    name: 'cross-origin-isolation',
    configureServer: applyHeaders,
    configurePreviewServer: applyHeaders,
  };
}
