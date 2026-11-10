declare const tauPicogkBrowserAssets: { readonly url: string; readonly sha256: string } | undefined;

/**
 * Place the build's manifest identity: a same-origin bundle path (`/picogk-browser/…`) under the app base, a
 * digest mirror URL (`https://…/blobs/sha256/…`) as it is.
 *
 * @param prepared - The identity the build defined, if any.
 * @param base - The app's base URL, ending in `/`.
 * @returns The manifest identity the runtime loads.
 */
export const placePicogkBrowserAssets = (
  prepared: { readonly url: string; readonly sha256: string } | undefined,
  base: string,
): { readonly url: string; readonly sha256: string } | undefined =>
  prepared && (prepared.url.startsWith('/') ? { ...prepared, url: `${base}${prepared.url.slice(1)}` } : prepared);

/** The prepared build identity used by both runtime registration and the project picker. */
export const picogkBrowserAssets = (): { readonly url: string; readonly sha256: string } | undefined =>
  placePicogkBrowserAssets(
    // oxlint-disable-next-line unicorn/no-typeof-undefined -- Vite injects this identifier; source-only consumers do not define it.
    typeof tauPicogkBrowserAssets === 'undefined' ? undefined : tauPicogkBrowserAssets,
    import.meta.env.BASE_URL,
  );
