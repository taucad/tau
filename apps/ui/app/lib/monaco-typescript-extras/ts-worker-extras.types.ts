/**
 * TS language-service worker methods used by Tau adapters but omitted from
 * `monaco.d.ts` `TypeScriptWorker`.
 */
export type TauTypeScriptLanguageServiceWorker = {
  getDefinitionAtPosition(fileName: string, position: number): Promise<readonly unknown[] | undefined>;
  getReferencesAtPosition(fileName: string, position: number): Promise<readonly unknown[] | undefined>;
  getRenameInfo(fileName: string, position: number, options: unknown): Promise<unknown>;
  findRenameLocations(
    fileName: string,
    position: number,
    findInStrings: boolean,
    findInComments: boolean,
    providePrefixAndSuffixTextForRename: boolean,
  ): Promise<readonly unknown[] | undefined>;
  /**
   * TypeScript language-service operation that returns the text edits
   * needed across every project file when a TS/JS module is renamed
   * (e.g. updating `import './a'` → `import './lib/a'` in every
   * consumer). Wired into Tau via the
   * `ts-rename-participant.ts` adapter on `MOVE` events for
   * `.ts` / `.tsx` / `.js` / `.jsx` files.
   *
   * Mirrors the upstream tsserver shape `getEditsForFileRename`; both
   * `oldFilePath` and `newFilePath` must be file URIs accepted by the
   * worker (typically `monaco.Uri.toString()` form). `formatOptions`
   * and `preferences` are forwarded verbatim.
   *
   * @returns An array of {@link FileTextChangesLike} describing the
   *          per-file edit lists, or `undefined` if the worker fails
   *          to resolve the rename (e.g. the new path is not part of
   *          the TS project graph).
   */
  getEditsForFileRename(
    oldFilePath: string,
    newFilePath: string,
    formatOptions?: unknown,
    preferences?: unknown,
  ): Promise<readonly FileTextChangesLike[] | undefined>;
  getLibFiles(): Promise<Record<string, string>>;
  getImplementationAtPosition(fileName: string, position: number): Promise<readonly unknown[] | undefined>;
  getTypeDefinitionAtPosition(fileName: string, position: number): Promise<readonly unknown[] | undefined>;
  getNavigateToItems(
    searchValue: string,
    maxResultCount?: number,
    fileName?: string,
    excludeDtsFiles?: boolean,
    excludeLibFiles?: boolean,
  ): Promise<readonly unknown[] | undefined>;
  prepareCallHierarchy(fileName: string, position: number): Promise<unknown>;
  provideCallHierarchyIncomingCalls(fileName: string, position: number): Promise<readonly unknown[] | undefined>;
  provideCallHierarchyOutgoingCalls(fileName: string, position: number): Promise<readonly unknown[] | undefined>;
};

/**
 * Subset of `ts.FileTextChanges` that the TS worker emits over the
 * comlink boundary. `textChanges` is an array of (span + newText)
 * pairs the participant translates into Monaco `IIdentifiedSingleEditOperation`s.
 */
export type FileTextChangesLike = Readonly<{
  fileName: string;
  textChanges: ReadonlyArray<
    Readonly<{
      span: Readonly<{ start: number; length: number }>;
      newText: string;
    }>
  >;
}>;

export type TsDefinitionLike = Readonly<{
  fileName: string;
  textSpan: { start: number; length: number };
}>;
