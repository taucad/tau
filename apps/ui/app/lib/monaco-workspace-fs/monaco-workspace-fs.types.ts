import type * as Monaco from 'monaco-editor';

/**
 * Writable/read-only filesystem-backed Monaco scheme (e.g. `file`, `extraLibs`, `inmemory`).
 */
export type MonacoFileSystemProvider = Readonly<{
  scheme: string;
  languageId?(uri: Monaco.Uri): string | undefined;
  isReadOnly?(uri: Monaco.Uri): boolean;
  readText(uri: Monaco.Uri): Promise<string>;
  peekText?(uri: Monaco.Uri): string | undefined;
  openInEditor?(uri: Monaco.Uri): boolean;
  onDidChange(uri: Monaco.Uri, listener: () => void): Monaco.IDisposable;
  findFiles?(
    pattern: string,
    options?: { maxResults?: number },
  ): Promise<readonly Monaco.Uri[]> | readonly Monaco.Uri[];
}>;

/**
 * Read-only synthetic content (VS Code `TextDocumentContentProvider` analogue).
 */
export type MonacoTextDocumentContentProvider = Readonly<{
  scheme: string;
  languageId?(uri: Monaco.Uri): string | undefined;
  provideTextDocumentContent(uri: Monaco.Uri): Promise<string>;
  onDidChange?(uri: Monaco.Uri, listener: () => void): Monaco.IDisposable;
}>;

/**
 * Read-only text slice for AST work without registering an `ITextModel`.
 */
export type WorkspaceTextProvider = Readonly<{
  text: string;
  dispose(): void;
  lineLength(lineNumber1Based: number): number;
}>;

export type WorkspaceFsModelServiceBinding = {
  refreshContent(uri: Monaco.Uri): Promise<void>;
};

export type MonacoWorkspaceFs = Readonly<{
  registerFileSystemProvider(provider: MonacoFileSystemProvider): Monaco.IDisposable;
  registerTextDocumentContentProvider(provider: MonacoTextDocumentContentProvider): Monaco.IDisposable;
  hasProvider(scheme: string): boolean;
  getFileSystemProvider(scheme: string): MonacoFileSystemProvider | undefined;
  getTextDocumentProvider(scheme: string): MonacoTextDocumentContentProvider | undefined;
  openTextDocument(uri: Monaco.Uri): Promise<Monaco.editor.ITextModel | undefined>;
  openTextProvider(uri: Monaco.Uri): Promise<WorkspaceTextProvider | undefined>;
  peekModel(uri: Monaco.Uri): Monaco.editor.ITextModel | undefined;
  materialiseUrisForWorkspaceEdit(uris: readonly Monaco.Uri[]): Promise<void>;
  findFiles(pattern: string, options?: { maxResults?: number }): Promise<readonly Monaco.Uri[]>;
  canMaterialise(uri: Monaco.Uri): boolean;
  bindModelService(modelService: WorkspaceFsModelServiceBinding): void;
  dispose(): void;
}>;
