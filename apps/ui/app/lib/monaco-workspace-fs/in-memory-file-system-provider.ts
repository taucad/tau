import type * as Monaco from 'monaco-editor';
import type { MonacoFileSystemProvider } from '#lib/monaco-workspace-fs/monaco-workspace-fs.types.js';

type InMemoryFsState = {
  files: Map<string, string>;
  changeListeners: Map<string, Set<() => void>>;
};

function uriKey(monaco: typeof Monaco, scheme: string, pathSegments: string): Monaco.Uri {
  const normalized = pathSegments.startsWith('/') ? pathSegments : `/${pathSegments}`;
  return monaco.Uri.parse(`${scheme}:${normalized}`);
}

export type InMemoryFileSystemProvider = MonacoFileSystemProvider & {
  seedForTests(path: string, text: string): void;
  writeForTests(path: string, text: string): void;
};

/**
 * Ephemeral `inmemory://` tree for tests and scratch buffers.
 */
export function createInMemoryFileSystemProvider(
  monaco: typeof Monaco,
  scheme = 'inmemory',
): InMemoryFileSystemProvider {
  const state: InMemoryFsState = {
    files: new Map(),
    changeListeners: new Map(),
  };

  function fullKey(uri: Monaco.Uri): string {
    return `${uri.scheme}:${uri.path}`;
  }

  function notify(uri: Monaco.Uri): void {
    const key = fullKey(uri);
    const listeners = state.changeListeners.get(key);
    if (listeners) {
      for (const l of listeners) {
        l();
      }
    }
  }

  function seedForTests(path: string, text: string): void {
    const uri = uriKey(monaco, scheme, path);
    state.files.set(fullKey(uri), text);
  }

  function writeForTests(path: string, text: string): void {
    const uri = uriKey(monaco, scheme, path);
    state.files.set(fullKey(uri), text);
    notify(uri);
  }

  const provider: InMemoryFileSystemProvider = {
    scheme,

    async readText(uri: Monaco.Uri): Promise<string> {
      const text = state.files.get(fullKey(uri));
      if (text === undefined) {
        throw new Error(`inmemory: missing ${fullKey(uri)}`);
      }
      return text;
    },

    peekText(uri: Monaco.Uri): string | undefined {
      return state.files.get(fullKey(uri));
    },

    languageId(_uri: Monaco.Uri): string | undefined {
      return 'plaintext';
    },

    isReadOnly(): boolean {
      return false;
    },

    onDidChange(uri: Monaco.Uri, listener: () => void): Monaco.IDisposable {
      const key = fullKey(uri);
      let set = state.changeListeners.get(key);
      if (!set) {
        set = new Set();
        state.changeListeners.set(key, set);
      }
      set.add(listener);
      return {
        dispose(): void {
          set.delete(listener);
        },
      };
    },

    seedForTests,
    writeForTests,
  };

  return provider;
}
