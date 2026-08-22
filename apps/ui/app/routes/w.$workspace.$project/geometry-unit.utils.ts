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
