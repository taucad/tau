import * as monaco from 'monaco-editor';
import type { TauTypeScriptLanguageServiceWorker } from '#lib/monaco-typescript-extras/ts-worker-extras.types.js';

export type TauCallHierarchyItem = Readonly<{
  name: string;
  kind: monaco.languages.SymbolKind;
  uri: monaco.Uri;
  range: monaco.IRange;
  selectionRange: monaco.IRange;
}>;

export type TauCallHierarchyIncomingCall = Readonly<{
  from: TauCallHierarchyItem;
  fromLocations: readonly monaco.languages.Location[];
}>;

export type TauCallHierarchyOutgoingCall = Readonly<{
  to: TauCallHierarchyItem;
  fromRanges: readonly monaco.IRange[];
}>;

type CallHierarchyItemLike = Readonly<{
  file: string;
  name: string;
  span: { start: number; length: number };
}>;

type CallHierarchyIncomingCallLike = Readonly<{
  from: CallHierarchyItemLike;
  fromSpans: ReadonlyArray<{ start: number; length: number }>;
}>;

type CallHierarchyOutgoingCallLike = Readonly<{
  to: CallHierarchyItemLike;
  fromSpans: ReadonlyArray<{ start: number; length: number }>;
}>;

function spanToRange(model: monaco.editor.ITextModel, span: { start: number; length: number }): monaco.IRange {
  const start = model.getPositionAt(span.start);
  const end = model.getPositionAt(span.start + span.length);
  return {
    startLineNumber: start.lineNumber,
    startColumn: start.column,
    endLineNumber: end.lineNumber,
    endColumn: end.column,
  };
}

/**
 * Bridges TS worker call-hierarchy RPCs to Monaco shapes. Monaco lacks a public
 * `CallHierarchyProvider` registrar in `monaco.d.ts`; exposed for tests / tooling.
 */
export async function tauPrepareCallHierarchy(
  worker: TauTypeScriptLanguageServiceWorker,
  fileName: string,
  position: number,
): Promise<readonly TauCallHierarchyItem[] | undefined> {
  const raw = (await worker.prepareCallHierarchy(fileName, position)) as
    | CallHierarchyItemLike
    | readonly CallHierarchyItemLike[]
    | undefined;
  if (!raw) {
    return undefined;
  }
  const items: readonly CallHierarchyItemLike[] = Array.isArray(raw) ? raw : [raw];
  const out: TauCallHierarchyItem[] = [];
  for (const item of items) {
    const uri = monaco.Uri.parse(item.file);
    const model = monaco.editor.getModel(uri);
    if (!model) {
      continue;
    }
    out.push({
      name: item.name,
      kind: monaco.languages.SymbolKind.Function,
      uri,
      range: spanToRange(model, item.span),
      selectionRange: spanToRange(model, item.span),
    });
  }
  return out;
}

export async function tauProvideCallHierarchyIncomingCalls(
  worker: TauTypeScriptLanguageServiceWorker,
  fileName: string,
  position: number,
): Promise<readonly TauCallHierarchyIncomingCall[]> {
  const raw = (await worker.provideCallHierarchyIncomingCalls(fileName, position)) as
    | readonly CallHierarchyIncomingCallLike[]
    | undefined;
  if (!raw?.length) {
    return [];
  }
  const out: TauCallHierarchyIncomingCall[] = [];
  for (const call of raw) {
    const uri = monaco.Uri.parse(call.from.file);
    const model = monaco.editor.getModel(uri);
    if (!model) {
      continue;
    }
    out.push({
      from: {
        name: call.from.name,
        kind: monaco.languages.SymbolKind.Function,
        uri,
        range: spanToRange(model, call.from.span),
        selectionRange: spanToRange(model, call.from.span),
      },
      fromLocations: call.fromSpans.map((span) => ({
        uri,
        range: spanToRange(model, span),
      })),
    });
  }
  return out;
}

export async function tauProvideCallHierarchyOutgoingCalls(
  worker: TauTypeScriptLanguageServiceWorker,
  fileName: string,
  position: number,
): Promise<readonly TauCallHierarchyOutgoingCall[]> {
  const raw = (await worker.provideCallHierarchyOutgoingCalls(fileName, position)) as
    | readonly CallHierarchyOutgoingCallLike[]
    | undefined;
  if (!raw?.length) {
    return [];
  }
  const fromModel = monaco.editor.getModel(monaco.Uri.parse(fileName));
  const out: TauCallHierarchyOutgoingCall[] = [];
  for (const call of raw) {
    const uri = monaco.Uri.parse(call.to.file);
    const model = monaco.editor.getModel(uri);
    if (!model) {
      continue;
    }
    out.push({
      to: {
        name: call.to.name,
        kind: monaco.languages.SymbolKind.Function,
        uri,
        range: spanToRange(model, call.to.span),
        selectionRange: spanToRange(model, call.to.span),
      },
      fromRanges: fromModel ? call.fromSpans.map((span) => spanToRange(fromModel, span)) : [],
    });
  }
  return out;
}
