import { URI } from 'vscode-uri';

/** A changed project file; a null text deletes it, as the server's JSON contract expects. */
// oxlint-disable-next-line typescript/no-restricted-types -- JSON null is the wire encoding of a deletion.
export type WorkspaceFileChange = Readonly<{ uri: string; text: string | null }>;

/**
 * The OpenSCAD files last sent to the server. A refresh lists and reads the project again and sends only files whose
 * text changed, plus deletions, so closed-file edits reach the server without resending the project.
 */
export class WorkspaceSnapshot {
  /** Workspace-relative paths of OpenSCAD sources, from a substring search that may also match other extensions. */
  public static sources(paths: readonly string[]): string[] {
    return [...new Set(paths.filter((path) => path.toLowerCase().endsWith('.scad')))].sort();
  }

  public static uriFor(path: string): string {
    return URI.file(`/${path.replace(/^\/+/u, '')}`).toString();
  }

  readonly #texts = new Map<string, string>();

  public get size(): number {
    return this.#texts.size;
  }

  /** Record the current project texts and return what changed since the previous snapshot. */
  public update(current: ReadonlyMap<string, string>): WorkspaceFileChange[] {
    const changes: WorkspaceFileChange[] = [];
    for (const [uri, text] of current) {
      if (this.#texts.get(uri) !== text) {
        changes.push({ uri, text });
        this.#texts.set(uri, text);
      }
    }
    for (const uri of this.#texts.keys()) {
      if (!current.has(uri)) {
        changes.push({ uri, text: null });
        this.#texts.delete(uri);
      }
    }
    return changes;
  }
}
