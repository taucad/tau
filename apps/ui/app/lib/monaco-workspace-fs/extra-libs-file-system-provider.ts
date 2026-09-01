import type * as monaco from 'monaco-editor';
import type { MonacoFileSystemProvider } from '#lib/monaco-workspace-fs/monaco-workspace-fs.types.js';

function extraLibsLookupKey(uri: monaco.Uri): string {
  const path = uri.path.startsWith('/') ? uri.path : `/${uri.path}`;
  return `file://${path}`;
}

function peekExtraLib(editor: typeof monaco, uri: monaco.Uri): boolean {
  const key = extraLibsLookupKey(uri);
  return Boolean(
    editor.typescript.typescriptDefaults.getExtraLibs()[key] ??
    editor.typescript.javascriptDefaults.getExtraLibs()[key],
  );
}

/**
 * Virtual typings that live only in `typescriptDefaults` / `javascriptDefaults` getExtraLibs().
 */
export function createExtraLibsFileSystemProvider(editor: typeof monaco): MonacoFileSystemProvider {
  return {
    scheme: 'extraLibs',

    async readText(uri: monaco.Uri): Promise<string> {
      const key = extraLibsLookupKey(uri);
      const ts = editor.typescript.typescriptDefaults.getExtraLibs()[key];
      const js = editor.typescript.javascriptDefaults.getExtraLibs()[key];
      const content = ts?.content ?? js?.content;
      if (content === undefined) {
        throw new Error(`Extra lib not registered: ${key}`);
      }
      return content;
    },

    peekText(uri: monaco.Uri): string | undefined {
      const key = extraLibsLookupKey(uri);
      return (
        editor.typescript.typescriptDefaults.getExtraLibs()[key]?.content ??
        editor.typescript.javascriptDefaults.getExtraLibs()[key]?.content
      );
    },

    languageId(uri: monaco.Uri): string | undefined {
      const { path } = uri;
      if (path.endsWith('.tsx')) {
        return 'typescriptreact';
      }
      if (path.endsWith('.ts')) {
        return 'typescript';
      }
      if (path.endsWith('.jsx')) {
        return 'javascriptreact';
      }
      if (path.endsWith('.js')) {
        return 'javascript';
      }
      return 'typescript';
    },

    isReadOnly(): boolean {
      return true;
    },

    openInEditor(): boolean {
      return true;
    },

    onDidChange(uri: monaco.Uri, listener: () => void): monaco.IDisposable {
      const notifyIfPresent = (): void => {
        setTimeout(() => {
          if (peekExtraLib(editor, uri)) {
            listener();
          }
        }, 0);
      };
      const subs: monaco.IDisposable[] = [
        editor.typescript.typescriptDefaults.onDidExtraLibsChange(notifyIfPresent),
        editor.typescript.javascriptDefaults.onDidExtraLibsChange(notifyIfPresent),
      ];
      return {
        dispose(): void {
          for (const s of subs) {
            s.dispose();
          }
        },
      };
    },

    findFiles(pattern: string, options?: { maxResults?: number }): monaco.Uri[] {
      const max = options?.maxResults ?? 100;
      const keys = new Set([
        ...Object.keys(editor.typescript.typescriptDefaults.getExtraLibs()),
        ...Object.keys(editor.typescript.javascriptDefaults.getExtraLibs()),
      ]);
      const needleRaw = pattern.replaceAll('*', '');
      const needle = needleRaw.toLowerCase();
      const out: monaco.Uri[] = [];
      for (const key of keys) {
        if (out.length >= max) {
          break;
        }
        if (!key.startsWith('file:')) {
          continue;
        }
        const fileUri = editor.Uri.parse(key);
        if (fileUri.scheme !== 'file') {
          continue;
        }
        if (needle !== '' && !fileUri.path.toLowerCase().includes(needle)) {
          continue;
        }
        out.push(fileUri.with({ scheme: 'extraLibs' }));
      }
      return out;
    },
  };
}
