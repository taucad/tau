/**
 * Prefetch a route class's interactive tier (progressive loading PL8). Loaded on demand by `warm-next-step.ts` once the
 * page is idle, so none of it is on the interactive tier of the page that warms.
 *
 * Each file becomes a `<link rel="prefetch">`: a lowest-priority fetch into the HTTP cache that evaluates nothing, so a
 * later click finds the module there. The build's `/assets/*` files are immutable, so a file the page already holds is
 * answered from the cache without a request.
 */
import { parseWarmManifest, warmHrefs, warmManifestPath } from '#lib/warm-manifest.js';

/** The part of a window this module touches. */
export type WarmTarget = Readonly<{
  document: Pick<Document, 'createElement' | 'head' | 'querySelectorAll'>;
  fetch: (input: string, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'json'>>;
}>;

/**
 * Fetch the warm manifest and prefetch one class's interactive files.
 *
 * @param options - The class to warm, the class the page already loaded, and the window (the global one by default).
 * @returns The URLs it added a prefetch link for; empty when the manifest is missing or unreadable.
 */
export async function warmRouteClass({
  target,
  loaded,
  host = globalThis,
}: Readonly<{ target: string; loaded?: string; host?: WarmTarget }>): Promise<string[]> {
  let body: unknown;
  try {
    const response = await host.fetch(warmManifestPath, { credentials: 'same-origin', priority: 'low' });
    if (!response.ok) {
      return [];
    }
    body = await response.json();
  } catch {
    // Warming is optional: an offline page, a desktop build without the file or a malformed body warms nothing.
    return [];
  }
  const manifest = parseWarmManifest(body);
  if (manifest === undefined) {
    return [];
  }
  const present = new Set(
    [...host.document.querySelectorAll('link[href], script[src]')].map(
      (element) => element.getAttribute('href') ?? element.getAttribute('src'),
    ),
  );
  const hrefs = warmHrefs(manifest, target, loaded).filter((href) => !present.has(href));
  for (const href of hrefs) {
    const link = host.document.createElement('link');
    link.rel = 'prefetch';
    link.href = href;
    host.document.head.append(link);
  }
  return hrefs;
}
