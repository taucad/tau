import type * as Monaco from 'monaco-editor';

/**
 * Thrown when a Monaco workspace FS provider cannot resolve text for a URI.
 */
export class MonacoWorkspaceFileNotFoundError extends Error {
  public readonly uri: Monaco.Uri;

  public constructor(uri: Monaco.Uri, message = 'File not found or not materialisable as text') {
    super(message);
    this.name = 'MonacoWorkspaceFileNotFoundError';
    this.uri = uri;
  }
}
