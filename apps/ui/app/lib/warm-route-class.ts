/**
 * Prefetch a route class's interactive tier (progressive loading PL8). Loaded on demand by `warm-next-step.ts` once the
 * page is idle, so none of it is on the interactive tier of the page that warms.
 *
 * Each file becomes a `<link rel="prefetch">`: a lowest-priority fetch into the HTTP cache that evaluates nothing, so a
 * later click finds the module there. The build's `/assets/*` files are immutable, so a file the page already holds is
 * answered from the cache without a request.
 */
import { parseWarmManifest, sendHrefs, warmHrefs, warmManifestPath } from '#lib/warm-manifest.js';
import type { WarmManifest } from '#lib/warm-manifest.js';

/** The part of a window this module touches. */
export type WarmTarget = Readonly<{
  document: Pick<Document, 'createElement' | 'head' | 'querySelectorAll'>;
  fetch: (input: string, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'json'>>;
}>;

/** The build's warm manifest, or `undefined` when it is missing or unreadable. */
const readManifest = async (host: WarmTarget): Promise<WarmManifest | undefined> => {
  try {
    const response = await host.fetch(warmManifestPath, { credentials: 'same-origin', priority: 'low' });
    return response.ok ? parseWarmManifest(await response.json()) : undefined;
  } catch {
    // Warming is optional: an offline page, a desktop build without the file or a malformed body warms nothing.
    return undefined;
  }
};

/** Add a prefetch link for each URL the page holds no element for; the URLs added. */
const prefetchAll = (host: WarmTarget, hrefs: readonly string[]): string[] => {
  const present = new Set(
    [...host.document.querySelectorAll('link[href], script[src]')].map(
      (element) => element.getAttribute('href') ?? element.getAttribute('src'),
    ),
  );
  const added = hrefs.filter((href) => !present.has(href));
  for (const href of added) {
    const link = host.document.createElement('link');
    link.rel = 'prefetch';
    link.href = href;
    host.document.head.append(link);
  }
  return added;
};

/**
 * Prefetch the send tier of the class a send opens (WP-12 step 2): what a first send fetches after Enter, the viewer,
 * three.js and the agent host worker's code included. Called on an explicit intent, a composer's first keystroke, never on idle.
 * Each file is a `<link rel="prefetch">`, so nothing is evaluated before the send.
 *
 * @param options - The class the send opens, and the window (the global one by default).
 * @returns The URLs it added a prefetch link for; empty when the manifest is missing or has no send tier.
 */
export async function warmSendTier({
  target,
  host = globalThis,
}: Readonly<{ target: string; host?: WarmTarget }>): Promise<string[]> {
  const manifest = await readManifest(host);
  return manifest === undefined ? [] : prefetchAll(host, sendHrefs(manifest, target));
}

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
  const manifest = await readManifest(host);
  return manifest === undefined ? [] : prefetchAll(host, warmHrefs(manifest, target, loaded));
}
