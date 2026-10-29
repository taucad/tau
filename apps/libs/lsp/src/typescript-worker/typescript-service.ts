import ts from 'typescript';
import { URI } from 'vscode-uri';
import type { SyncFsClient } from '@taucad/lsp-fs/sync';

/** Changes use UTF-16 offsets into the preceding document version. */
export type TypeScriptTextChange = Readonly<{ from: number; to: number; insert: string }>;

export type TypeScriptDiagnostic = Readonly<{
  code: number;
  category: ts.DiagnosticCategory;
  message: string;
  start: number;
  length: number;
  fileUri?: string;
}>;

export type TypeScriptLocation = Readonly<{
  uri: string;
  line: number;
  column: number;
  start: number;
  length: number;
}>;

/** Exact worker text used for an edit; the document owner compares it before mutation. */
export type TypeScriptEditBasis = Readonly<{
  uri: string;
  baseText: string;
  workerVersion?: number;
  changes: ReadonlyArray<Readonly<{ from: number; to: number; insert: string }>>;
}>;

export type TypeScriptServiceOptions = Readonly<{
  syncFs: Pick<
    SyncFsClient,
    'readFileText' | 'fileExists' | 'directoryExists' | 'getDirectories' | 'getScriptVersionForPath'
  >;
  standardLibraries: Readonly<Record<string, string>>;
  compilerOptions?: ts.CompilerOptions;
}>;

const libraryRoot = '/__typescript_lib__';

export const defaultTypeScriptCompilerOptions: ts.CompilerOptions = {
  allowImportingTsExtensions: true,
  allowJs: true,
  allowNonTsExtensions: true,
  allowSyntheticDefaultImports: true,
  checkJs: true,
  esModuleInterop: true,
  experimentalDecorators: true,
  jsx: ts.JsxEmit.ReactJSX,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  noEmit: true,
  target: ts.ScriptTarget.ESNext,
};

type OpenFile = { text: string; version: number };
type ExtraFile = { text: string; version: number };

const toPath = (uri: string): string => {
  const parsed = URI.parse(uri);
  if (parsed.scheme !== 'file') {
    throw new TypeError(`TypeScript service expected file URI: ${uri}`);
  }
  return parsed.path;
};

const toUri = (path: string): string => URI.file(path).toString();
const isScriptPath = (path: string): boolean => /\.(?:ts|tsx|js|jsx|mts|cts|mjs|cjs)$/u.test(path);

const normalizeLibraryMap = (libraries: Readonly<Record<string, string>>): Map<string, string> =>
  new Map(Object.entries(libraries).map(([name, text]) => [`${libraryRoot}/${name.split('/').at(-1) ?? name}`, text]));

const diagnosticToWire = (diagnostic: ts.Diagnostic): TypeScriptDiagnostic => ({
  code: diagnostic.code,
  category: diagnostic.category,
  message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
  start: diagnostic.start ?? 0,
  length: diagnostic.length ?? 0,
  ...(diagnostic.file ? { fileUri: toUri(diagnostic.file.fileName) } : {}),
});

/** One editor-independent TypeScript language service for a project session. */
export class TypeScriptProjectService {
  private readonly openFiles = new Map<string, OpenFile>();
  private readonly moduleAliases = new Map<string, string>();
  private readonly extraFiles = new Map<string, ExtraFile>();
  private readonly projectFiles = new Set<string>();
  private readonly libraries: Map<string, string>;
  private readonly host: ts.LanguageServiceHost;
  private readonly service: ts.LanguageService;
  private readonly syncFs: TypeScriptServiceOptions['syncFs'];
  private readonly options: ts.CompilerOptions;

  public constructor(config: TypeScriptServiceOptions) {
    this.syncFs = config.syncFs;
    this.libraries = normalizeLibraryMap(config.standardLibraries);
    this.options = { ...defaultTypeScriptCompilerOptions, ...config.compilerOptions };
    this.host = {
      getCompilationSettings: () => this.options,
      getScriptFileNames: () => [
        ...new Set([
          ...this.openFiles.keys(),
          ...[...this.extraFiles.keys()].filter((path) => isScriptPath(path)),
          ...this.projectFiles,
        ]),
      ],
      getScriptVersion: (path) => this.versionOf(path),
      getScriptSnapshot: (path) => {
        const text = this.textOf(path);
        return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
      },
      getCurrentDirectory: () => '/',
      getDefaultLibFileName: (options) => `${libraryRoot}/${ts.getDefaultLibFileName(options)}`,
      fileExists: (path) => this.exists(path),
      readFile: (path) => this.textOf(path),
      directoryExists: (path) => this.directoryExists(path),
      getDirectories: (path) => this.getDirectories(path),
      resolveModuleNames: (names, containingFile) =>
        names.map((name) => {
          const alias = this.moduleAliases.get(name);
          return alias
            ? {
                resolvedFileName: alias,
                extension: alias.endsWith('.d.mts')
                  ? ts.Extension.Dmts
                  : alias.endsWith('.d.cts')
                    ? ts.Extension.Dcts
                    : ts.Extension.Dts,
              }
            : ts.resolveModuleName(name, containingFile, this.options, this.host).resolvedModule;
        }),
      useCaseSensitiveFileNames: () => true,
      getNewLine: () => '\n',
    };
    this.service = ts.createLanguageService(this.host, ts.createDocumentRegistry(true, '/'));
  }

  public setModuleAlias(specifier: string, uri: string): void {
    const path = toPath(uri);
    if (this.moduleAliases.get(specifier) !== path) {
      this.moduleAliases.set(specifier, path);
      this.service.cleanupSemanticCache();
    }
  }

  public declarationImports(
    text: string,
  ): Array<{ name: string; from: number; to: number; reference?: 'path' | 'types' }> {
    const info = ts.preProcessFile(text, true, true);
    return [
      ...info.importedFiles.map((ref) => ({ name: ref.fileName, from: ref.pos + 1, to: ref.end + 1 })),
      ...info.referencedFiles.map(
        (ref) =>
          ({
            name: ref.fileName,
            from: ref.pos,
            to: ref.end,
            reference: 'path',
          }) as const,
      ),
      ...info.typeReferenceDirectives.map(
        (ref) =>
          ({
            name: ref.fileName,
            from: ref.pos,
            to: ref.end,
            reference: 'types',
          }) as const,
      ),
    ];
  }

  public open(uri: string, text: string, version: number): void {
    const path = toPath(uri);
    this.openFiles.set(path, { text, version });
  }

  public change(
    event: Readonly<{
      uri: string;
      previousVersion: number;
      version: number;
      changes: readonly TypeScriptTextChange[];
    }>,
  ): void {
    const { uri, previousVersion, version, changes } = event;
    const path = toPath(uri);
    const current = this.openFiles.get(path);
    if (!current || current.version !== previousVersion || version <= previousVersion) {
      throw new Error(`Stale TypeScript document change: ${uri} ${previousVersion}→${version}`);
    }
    const sorted = [...changes].sort((a, b) => b.from - a.from);
    let { text } = current;
    let precedingFrom = text.length + 1;
    for (const change of sorted) {
      if (change.from < 0 || change.to < change.from || change.to > text.length || change.to > precedingFrom) {
        throw new RangeError(`Invalid TypeScript text change: ${uri} ${change.from}:${change.to}`);
      }
      text = `${text.slice(0, change.from)}${change.insert}${text.slice(change.to)}`;
      precedingFrom = change.from;
    }
    this.openFiles.set(path, { text, version });
  }

  public close(uri: string): void {
    this.openFiles.delete(toPath(uri));
  }

  public setExtraLib(uri: string, text: string, version = 1): void {
    this.extraFiles.set(toPath(uri), { text, version });
  }

  public removeExtraLib(uri: string): void {
    this.extraFiles.delete(toPath(uri));
  }

  /** Admit rooted project scripts only when workspace symbol search needs them. */
  public setProjectFiles(uris: readonly string[]): void {
    this.projectFiles.clear();
    for (const uri of uris) {
      this.projectFiles.add(toPath(uri));
    }
  }

  public getDiagnostics(uri: string): TypeScriptDiagnostic[] {
    const path = toPath(uri);
    return [
      ...this.service.getSyntacticDiagnostics(path),
      ...this.service.getSemanticDiagnostics(path),
      ...this.service.getSuggestionDiagnostics(path),
    ].map((diagnostic) => diagnosticToWire(diagnostic));
  }

  public getCompletions(uri: string, position: number): ts.WithMetadata<ts.CompletionInfo> | undefined {
    return this.service.getCompletionsAtPosition(toPath(uri), position, { includeCompletionsForModuleExports: true });
  }

  public getCompletionDetails(
    request: Readonly<{
      uri: string;
      position: number;
      name: string;
      source?: string;
      data?: ts.CompletionEntryData;
    }>,
  ): ts.CompletionEntryDetails | undefined {
    const { uri, position, name, source, data } = request;
    return this.service.getCompletionEntryDetails(toPath(uri), position, name, undefined, source, undefined, data);
  }

  public getCompletionDetailsWithBases(
    request: Readonly<{
      uri: string;
      position: number;
      name: string;
      source?: string;
      data?: ts.CompletionEntryData;
    }>,
  ): Readonly<{
    details: ts.CompletionEntryDetails | undefined;
    codeActions: ReadonlyArray<{ description: string; edits: TypeScriptEditBasis[] }>;
  }> {
    const details = this.getCompletionDetails(request);
    return {
      details,
      codeActions: (details?.codeActions ?? []).map((action) => ({
        description: action.description,
        edits: this.captureEditBases(action.changes),
      })),
    };
  }

  public getQuickInfo(uri: string, position: number): ts.QuickInfo | undefined {
    return this.service.getQuickInfoAtPosition(toPath(uri), position);
  }

  /** Read only declarations already installed in this worker's virtual library map. */
  public readDeclaration(uri: string): string | undefined {
    const parsed = URI.parse(uri);
    if (
      parsed.scheme !== 'file' ||
      parsed.authority ||
      parsed.query ||
      parsed.fragment ||
      !parsed.path.endsWith('.d.ts')
    ) {
      return undefined;
    }
    return this.libraries.get(parsed.path) ?? this.extraFiles.get(parsed.path)?.text;
  }

  public getSignatureHelp(uri: string, position: number): ts.SignatureHelpItems | undefined {
    return this.service.getSignatureHelpItems(toPath(uri), position, undefined);
  }

  public getDefinition(uri: string, position: number): readonly ts.DefinitionInfo[] | undefined {
    return this.service.getDefinitionAtPosition(toPath(uri), position);
  }

  public getDefinitionLocations(uri: string, position: number): TypeScriptLocation[] {
    return (this.getDefinition(uri, position) ?? []).map((entry) => this.locationOf(entry));
  }

  public getReferences(uri: string, position: number): readonly ts.ReferenceEntry[] | undefined {
    return this.service.getReferencesAtPosition(toPath(uri), position);
  }

  public getReferenceLocations(uri: string, position: number): TypeScriptLocation[] {
    return (this.getReferences(uri, position) ?? []).map((entry) => this.locationOf(entry));
  }

  public getImplementation(uri: string, position: number): readonly ts.ImplementationLocation[] | undefined {
    return this.service.getImplementationAtPosition(toPath(uri), position);
  }

  public getTypeDefinition(uri: string, position: number): readonly ts.DefinitionInfo[] | undefined {
    return this.service.getTypeDefinitionAtPosition(toPath(uri), position);
  }

  public getImplementationLocations(uri: string, position: number): TypeScriptLocation[] {
    return (this.getImplementation(uri, position) ?? []).map((entry) => this.locationOf(entry));
  }

  public getTypeDefinitionLocations(uri: string, position: number): TypeScriptLocation[] {
    return (this.getTypeDefinition(uri, position) ?? []).map((entry) => this.locationOf(entry));
  }

  public getRenameInfo(uri: string, position: number): ts.RenameInfo {
    return this.service.getRenameInfo(toPath(uri), position, { allowRenameOfImportPath: true });
  }

  public findRenameLocations(uri: string, position: number): readonly ts.RenameLocation[] | undefined {
    return this.service.findRenameLocations(toPath(uri), position, false, false, {
      providePrefixAndSuffixTextForRename: true,
    });
  }

  public getRenameEdits(uri: string, position: number, newName: string): TypeScriptEditBasis[] {
    const locations = this.findRenameLocations(uri, position) ?? [];
    const grouped = new Map<string, ts.TextChange[]>();
    for (const location of locations) {
      const changes = grouped.get(location.fileName) ?? [];
      changes.push({
        span: location.textSpan,
        newText: `${location.prefixText ?? ''}${newName}${location.suffixText ?? ''}`,
      });
      grouped.set(location.fileName, changes);
    }
    return this.captureEditBases([...grouped].map(([fileName, textChanges]) => ({ fileName, textChanges })));
  }

  public getEditsForFileRename(oldUri: string, newUri: string): readonly ts.FileTextChanges[] {
    return this.service.getEditsForFileRename(toPath(oldUri), toPath(newUri), {}, {});
  }

  public getFileRenameEditsWithBases(oldUri: string, newUri: string): TypeScriptEditBasis[] {
    return this.captureEditBases(this.getEditsForFileRename(oldUri, newUri));
  }

  public getFormattingEdits(uri: string, options: ts.FormatCodeSettings): readonly ts.TextChange[] {
    return this.service.getFormattingEditsForDocument(toPath(uri), options);
  }

  public getFormattingEditsWithBases(uri: string, options: ts.FormatCodeSettings): TypeScriptEditBasis[] {
    return this.captureEditBases([{ fileName: toPath(uri), textChanges: this.getFormattingEdits(uri, options) }]);
  }

  public getRangeFormattingEdits(
    request: Readonly<{
      uri: string;
      start: number;
      end: number;
      options: ts.FormatCodeSettings;
    }>,
  ): readonly ts.TextChange[] {
    const { uri, start, end, options } = request;
    return this.service.getFormattingEditsForRange(toPath(uri), start, end, options);
  }

  public getRangeFormattingEditsWithBases(
    request: Readonly<{
      uri: string;
      start: number;
      end: number;
      options: ts.FormatCodeSettings;
    }>,
  ): TypeScriptEditBasis[] {
    return this.captureEditBases([
      { fileName: toPath(request.uri), textChanges: this.getRangeFormattingEdits(request) },
    ]);
  }

  public getCodeFixes(
    request: Readonly<{
      uri: string;
      start: number;
      end: number;
      errorCodes: readonly number[];
    }>,
  ): readonly ts.CodeFixAction[] {
    const { uri, start, end, errorCodes } = request;
    return this.service.getCodeFixesAtPosition(toPath(uri), start, end, errorCodes, {}, {});
  }

  public getCodeFixesWithBases(
    request: Readonly<{
      uri: string;
      start: number;
      end: number;
      errorCodes: readonly number[];
    }>,
  ): ReadonlyArray<{ description: string; fixName: string; edits: TypeScriptEditBasis[] }> {
    return this.getCodeFixes(request).map((action) => ({
      description: action.description,
      fixName: action.fixName,
      edits: this.captureEditBases(action.changes),
    }));
  }

  public getNavigationTree(uri: string): ts.NavigationTree {
    return this.service.getNavigationTree(toPath(uri));
  }

  public getOutliningSpans(uri: string): readonly ts.OutliningSpan[] {
    return this.service.getOutliningSpans(toPath(uri));
  }

  public getNavigateToItems(search: string, maxResults = 100): readonly ts.NavigateToItem[] {
    return this.service.getNavigateToItems(search, maxResults);
  }

  public getInlayHints(uri: string, start: number, end: number): readonly ts.InlayHint[] {
    return this.service.provideInlayHints(
      toPath(uri),
      { start, length: end - start },
      {
        includeInlayParameterNameHints: 'all',
        includeInlayParameterNameHintsWhenArgumentMatchesName: true,
      },
    );
  }

  public prepareCallHierarchy(
    uri: string,
    position: number,
  ): ts.CallHierarchyItem | readonly ts.CallHierarchyItem[] | undefined {
    return this.service.prepareCallHierarchy(toPath(uri), position);
  }

  public getIncomingCalls(uri: string, position: number): readonly ts.CallHierarchyIncomingCall[] {
    return this.service.provideCallHierarchyIncomingCalls(toPath(uri), position);
  }

  public getOutgoingCalls(uri: string, position: number): readonly ts.CallHierarchyOutgoingCall[] {
    return this.service.provideCallHierarchyOutgoingCalls(toPath(uri), position);
  }

  public assertVersion(uri: string, expectedVersion: number): void {
    const actual = this.openFiles.get(toPath(uri))?.version;
    if (actual !== expectedVersion) {
      throw new Error(
        `Stale TypeScript request: ${uri}, expected ${expectedVersion}, worker has ${actual ?? 'closed'}`,
      );
    }
  }

  public dispose(): void {
    this.service.dispose();
    this.openFiles.clear();
    this.extraFiles.clear();
    this.projectFiles.clear();
  }

  private captureEditBases(changes: readonly ts.FileTextChanges[]): TypeScriptEditBasis[] {
    return changes.map((file) => {
      const baseText = this.textOf(file.fileName);
      if (baseText === undefined) {
        throw new Error(`TypeScript edit target unavailable: ${file.fileName}`);
      }
      const workerVersion = this.openFiles.get(file.fileName)?.version;
      return {
        uri: toUri(file.fileName),
        baseText,
        ...(workerVersion === undefined ? {} : { workerVersion }),
        changes: file.textChanges.map(({ span, newText }) => ({
          from: span.start,
          to: span.start + span.length,
          insert: newText,
        })),
      };
    });
  }

  private textOf(path: string): string | undefined {
    return (
      this.openFiles.get(path)?.text ??
      this.extraFiles.get(path)?.text ??
      this.libraries.get(path) ??
      this.syncFs.readFileText(toUri(path))
    );
  }

  private versionOf(path: string): string {
    const local = this.openFiles.get(path) ?? this.extraFiles.get(path);
    if (local) {
      return String(local.version);
    }
    if (this.libraries.has(path)) {
      return '1';
    }
    return this.syncFs.getScriptVersionForPath(toUri(path)) ?? '0';
  }

  private exists(path: string): boolean {
    return (
      this.openFiles.has(path) ||
      this.extraFiles.has(path) ||
      this.libraries.has(path) ||
      this.syncFs.fileExists(toUri(path))
    );
  }

  private directoryExists(path: string): boolean {
    if (path === libraryRoot || path === '/node_modules' || path.endsWith('/@types')) {
      return true;
    }
    const prefix = `${path.endsWith('/') ? path : `${path}/`}`;
    if ([...this.extraFiles.keys(), ...this.libraries.keys()].some((name) => name.startsWith(prefix))) {
      return true;
    }
    return this.syncFs.directoryExists(toUri(path));
  }

  private getDirectories(path: string): string[] {
    return this.syncFs.getDirectories(toUri(path));
  }

  private locationOf(entry: { fileName: string; textSpan: ts.TextSpan }): TypeScriptLocation {
    const source = this.service.getProgram()?.getSourceFile(entry.fileName);
    const lineAndCharacter = source?.getLineAndCharacterOfPosition(entry.textSpan.start);
    return {
      uri: toUri(entry.fileName),
      line: (lineAndCharacter?.line ?? 0) + 1,
      column: (lineAndCharacter?.character ?? 0) + 1,
      start: entry.textSpan.start,
      length: entry.textSpan.length,
    };
  }
}
