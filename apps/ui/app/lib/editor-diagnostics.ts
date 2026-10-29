import { Topic } from '@taucad/events';
import { URI } from 'vscode-uri';
import { assertRootedPath } from '@taucad/utils/path';

export type EditorDiagnostic = Readonly<{
  from: number;
  to: number;
  message: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
  source?: string;
  code?: string | number;
}>;

export type DiagnosticChange = Readonly<{ uri: string; owner: string; diagnostics: readonly EditorDiagnostic[] }>;

/** Diagnostics remain available when no document or view is mounted. */
export class EditorDiagnostics {
  readonly #store = new Map<string, Map<string, readonly EditorDiagnostic[]>>();
  readonly #changes = new Topic<DiagnosticChange>({ name: 'EditorDiagnostics.changes' });

  public subscribe(listener: (event: DiagnosticChange) => void, options?: { signal?: AbortSignal }): () => void {
    return this.#changes.subscribe(listener, options);
  }

  public get(uri: string): ReadonlyMap<string, readonly EditorDiagnostic[]> {
    return this.#store.get(uri) ?? new Map();
  }

  public set(uri: string, owner: string, diagnostics: readonly EditorDiagnostic[]): void {
    let byOwner = this.#store.get(uri);
    if (!byOwner) {
      byOwner = new Map();
      this.#store.set(uri, byOwner);
    }
    if (diagnostics.length === 0) {
      byOwner.delete(owner);
      if (byOwner.size === 0) {
        this.#store.delete(uri);
      }
    } else {
      byOwner.set(owner, [...diagnostics]);
    }
    this.#changes.emit({ uri, owner, diagnostics });
  }

  public clearOwner(owner: string): void {
    for (const [uri, byOwner] of this.#store) {
      if (byOwner.has(owner)) {
        this.set(uri, owner, []);
      }
    }
  }

  public remove(uri: string): void {
    for (const owner of this.#store.get(uri)?.keys() ?? []) {
      this.set(uri, owner, []);
    }
  }

  public rename(oldPath: string, newPath: string): void {
    const oldUri = URI.file(`/${assertRootedPath(oldPath)}`).toString();
    const newUri = URI.file(`/${assertRootedPath(newPath)}`).toString();
    const old = this.#store.get(oldUri);
    if (!old) {
      return;
    }
    const entries = [...old];
    this.remove(oldUri);
    for (const [owner, diagnostics] of entries) {
      this.set(newUri, owner, diagnostics);
    }
  }

  public clear(): void {
    for (const uri of this.#store.keys()) {
      this.remove(uri);
    }
  }
}
