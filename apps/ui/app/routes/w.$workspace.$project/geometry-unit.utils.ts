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

// oxlint-disable-next-line typescript/no-restricted-types -- Workbench records use null for no selected entry.
type GeometryEntryView = { readonly entryPath?: string | null };

/** Restored viewer paths remain discoverable before their CAD units are admitted. */
export const listGeometryEntryPaths = (
  units: ReadonlyMap<string, unknown>,
  views: ReadonlyMap<string, GeometryEntryView> | Readonly<Record<string, GeometryEntryView>>,
  mainEntryPath: string,
): string[] => {
  const paths = new Set(units.keys());
  if (mainEntryPath) {
    paths.add(mainEntryPath);
  }
  const records: Iterable<GeometryEntryView> =
    views instanceof Map
      ? (views as ReadonlyMap<string, GeometryEntryView>).values()
      : Object.values(views as Readonly<Record<string, GeometryEntryView>>);
  for (const view of records) {
    if (view.entryPath) {
      paths.add(view.entryPath);
    }
  }
  return sortGeometryUnitEntries(
    [...paths].map((path): [string, string] => [path, path]),
    mainEntryPath,
  ).map(([path]) => path);
};

/** Resolve the displayed entry from live panel bindings, independent of editor persistence. */
export const findEntryGraphics = <T>(
  graphics: ReadonlyMap<string, T>,
  // oxlint-disable-next-line typescript/no-restricted-types -- A live empty viewer has a null entry.
  entryPaths: ReadonlyMap<string, string | null>,
  entryPath: string,
): T | undefined => {
  for (const [viewId, actor] of graphics) {
    if (entryPaths.get(viewId) === entryPath) {
      return actor;
    }
  }
  return undefined;
};
