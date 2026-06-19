/**
 * Entry-file suffixes that must not show the file-operation "Open" action.
 *
 * GeoSpec test files are not CAD entry points — opening them in the viewer
 * would not focus a meaningful render.
 */
export const openRenderButtonIgnoreSuffixes = ['geospec.ts'] as const;

export function shouldShowOpenRenderButton(path: string): boolean {
  return !openRenderButtonIgnoreSuffixes.some((suffix) => path.endsWith(suffix));
}
