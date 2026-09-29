/**
 * Sort geometry unit entries so that the main entry path appears first,
 * with remaining entries sorted alphabetically.
 */
export const sortGeometryUnitEntries = <T>(entries: Array<[string, T]>, mainEntryPath: string): Array<[string, T]> =>
  [...entries].sort(([a], [b]) => {
    if (a === mainEntryPath) {
      return -1;
    }
    if (b === mainEntryPath) {
      return 1;
    }
    return a.localeCompare(b);
  });

/** Restored viewer paths remain discoverable before their CAD units are admitted. */
export const listGeometryEntryPaths = (
  units: ReadonlyMap<string, unknown>,
  views: Readonly<Record<string, { readonly entryPath?: string }>>,
  mainEntryPath: string,
): string[] => {
  const paths = new Set(units.keys());
  if (mainEntryPath) {
    paths.add(mainEntryPath);
  }
  for (const view of Object.values(views)) {
    if (view.entryPath) {
      paths.add(view.entryPath);
    }
  }
  return sortGeometryUnitEntries(
    [...paths].map((path): [string, string] => [path, path]),
    mainEntryPath,
  ).map(([path]) => path);
};
