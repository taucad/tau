import * as monaco from 'monaco-editor';
import type { MonacoWorkspaceFs } from '#lib/monaco-workspace-fs/monaco-workspace-fs.types.js';
import type { TauTypeScriptLanguageServiceWorker } from '#lib/monaco-typescript-extras/ts-worker-extras.types.js';

export type TauWorkspaceSymbol = Readonly<{
  name: string;
  kind: monaco.languages.SymbolKind;
  uri: monaco.Uri;
  range: monaco.IRange;
}>;

function mapNavigateToKind(kind: string | undefined): monaco.languages.SymbolKind {
  switch (kind) {
    case 'class': {
      return monaco.languages.SymbolKind.Class;
    }
    case 'interface': {
      return monaco.languages.SymbolKind.Interface;
    }
    case 'enum': {
      return monaco.languages.SymbolKind.Enum;
    }
    case 'module': {
      return monaco.languages.SymbolKind.Module;
    }
    case 'function':
    case 'local function': {
      return monaco.languages.SymbolKind.Function;
    }
    case 'method':
    case 'local method': {
      return monaco.languages.SymbolKind.Method;
    }
    case 'property': {
      return monaco.languages.SymbolKind.Property;
    }
    case 'constructor': {
      return monaco.languages.SymbolKind.Constructor;
    }
    case 'var':
    case 'local var':
    case 'let':
    case 'const': {
      return monaco.languages.SymbolKind.Variable;
    }
    default: {
      return monaco.languages.SymbolKind.Variable;
    }
  }
}

type NavigateToItem = Readonly<{
  name: string;
  kind: string;
  fileName: string;
  textSpan: { start: number; length: number };
}>;

/**
 * Workspace-wide symbol search via `getNavigateToItems` after Tau filesystem warm-up.
 *
 * Monaco Editor exposes no `registerWorkspaceSymbolProvider` host API; this helper is
 * used by tests and future quick-access UI.
 */
export async function searchTauWorkspaceSymbols(
  options: Readonly<{
    monaco: typeof monaco;
    workspaceFs: MonacoWorkspaceFs;
    getTsWorker: () => Promise<(...uris: monaco.Uri[]) => Promise<unknown>>;
    query: string;
    /** Cap for `findFiles` warm-up. */
    maxFiles?: number;
    maxResults?: number;
    token?: monaco.CancellationToken;
  }>,
): Promise<readonly TauWorkspaceSymbol[]> {
  const { monaco: editor, workspaceFs, getTsWorker, query } = options;
  const maxFiles = options.maxFiles ?? 200;
  const maxResults = options.maxResults ?? 100;

  if (query.trim() === '') {
    return [];
  }

  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs', '.cts', '.cjs'];
  const gathered: monaco.Uri[] = [];
  for (const extension of extensions) {
    if (options.token?.isCancellationRequested) {
      return [];
    }
    // oxlint-disable-next-line no-await-in-loop -- maxFiles budget is applied sequentially across extensions
    const batch = await workspaceFs.findFiles(extension, { maxResults: maxFiles });
    for (const uri of batch) {
      gathered.push(uri);
    }
    if (gathered.length >= maxFiles) {
      break;
    }
  }

  await workspaceFs.materialiseUrisForWorkspaceEdit(gathered);

  const workerFactory = await getTsWorker();
  const primaryUri = gathered[0] ?? editor.Uri.file('/unused');
  const worker = (await workerFactory(primaryUri)) as TauTypeScriptLanguageServiceWorker;

  const items = (await worker.getNavigateToItems(query, maxResults, undefined, false, false)) as
    | readonly NavigateToItem[]
    | undefined;
  if (!items?.length) {
    return [];
  }

  const out: TauWorkspaceSymbol[] = [];
  for (const item of items) {
    const uri = monaco.Uri.parse(item.fileName);
    const model = editor.editor.getModel(uri);
    if (!model) {
      continue;
    }
    const start = model.getPositionAt(item.textSpan.start);
    const end = model.getPositionAt(item.textSpan.start + item.textSpan.length);
    out.push({
      name: item.name,
      kind: mapNavigateToKind(item.kind),
      uri,
      range: {
        startLineNumber: start.lineNumber,
        startColumn: start.column,
        endLineNumber: end.lineNumber,
        endColumn: end.column,
      },
    });
  }
  return out;
}
