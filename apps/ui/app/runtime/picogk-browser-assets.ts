declare const tauPicogkBrowserAssets: { readonly url: string; readonly sha256: string } | undefined;

/** The prepared build identity used by both runtime registration and the project picker. */
export const picogkBrowserAssets = (): { readonly url: string; readonly sha256: string } | undefined => {
  // oxlint-disable-next-line unicorn/no-typeof-undefined -- Vite injects this identifier; source-only consumers do not define it.
  if (typeof tauPicogkBrowserAssets === 'undefined') {
    return undefined;
  }
  return { ...tauPicogkBrowserAssets, url: `${import.meta.env.BASE_URL}${tauPicogkBrowserAssets.url.slice(1)}` };
};
