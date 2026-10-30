import type { TypeScriptTextChange } from '#typescript-worker/typescript-service.js';

/** Editor-independent request names supported by the TypeScript worker. */
export type TypeScriptRequestKind =
  | 'diagnostics'
  | 'completions'
  | 'completionDetails'
  | 'completionDetailsWithBases'
  | 'quickInfo'
  | 'readDeclaration'
  | 'signatureHelp'
  | 'documentHighlights'
  | 'definition'
  | 'definitionLocations'
  | 'references'
  | 'referenceLocations'
  | 'implementation'
  | 'implementationLocations'
  | 'typeDefinition'
  | 'typeDefinitionLocations'
  | 'renameInfo'
  | 'renameLocations'
  | 'renameEdits'
  | 'fileRenameEdits'
  | 'fileRenameEditsWithBases'
  | 'format'
  | 'formatWithBases'
  | 'rangeFormat'
  | 'rangeFormatWithBases'
  | 'codeFixes'
  | 'codeFixesWithBases'
  | 'navigationTree'
  | 'outliningSpans'
  | 'workspaceSymbols'
  | 'workspaceSymbolLocations'
  | 'inlayHints'
  | 'prepareCallHierarchy'
  | 'incomingCalls'
  | 'outgoingCalls'
  | 'incomingCallLocations'
  | 'outgoingCallLocations';

export type TypeScriptWorkerCommand = Readonly<
  | { kind: 'setModuleAlias'; specifier: string; uri: string }
  | { kind: 'declarationImports'; text: string }
  | { kind: 'open'; uri: string; text: string; version: number }
  | { kind: 'change'; uri: string; previousVersion: number; version: number; changes: readonly TypeScriptTextChange[] }
  | { kind: 'close'; uri: string }
  | { kind: 'setExtraLib'; uri: string; text: string; version: number }
  | { kind: 'removeExtraLib'; uri: string }
  | { kind: 'setProjectFiles'; uris: readonly string[] }
  | {
      kind: TypeScriptRequestKind;
      uri?: string;
      expectedVersion?: number;
      position?: number;
      name?: string;
      newName?: string;
      source?: string;
      data?: unknown;
      start?: number;
      end?: number;
      oldUri?: string;
      newUri?: string;
      codes?: readonly number[];
      search?: string;
      maxResults?: number;
      triggerCharacter?: string;
      retrigger?: boolean;
    }
>;

export type TypeScriptWorkerRequest = Readonly<{ id: number; command: TypeScriptWorkerCommand }>;
export type TypeScriptWorkerResponse = Readonly<
  { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string }
>;
