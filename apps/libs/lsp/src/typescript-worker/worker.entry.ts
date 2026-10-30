// oxlint-disable-next-line typescript/triple-slash-reference -- vite/client is an ambient declaration file, not an importable module.
/// <reference types="vite/client" />
import { createSyncFsClient } from '@taucad/lsp-fs/sync';
import type { TauSyncFsInitMessage } from '@taucad/lsp-fs/sync';
import { TypeScriptProjectService } from '#typescript-worker/typescript-service.js';
import type ts from 'typescript';
import type {
  TypeScriptWorkerCommand,
  TypeScriptWorkerRequest,
  TypeScriptWorkerResponse,
} from '#typescript-worker/protocol.js';

// Vite bundles the TypeScript standard declarations into the TS-only worker.
// They are never fetched by non-editor routes or unrelated languages.
const standardLibraryModules = import.meta.glob('../../../../../node_modules/typescript/lib/lib.*.d.ts', {
  eager: true,
  query: '?raw',
  import: 'default',
});
const standardLibraries = Object.fromEntries(
  Object.entries(standardLibraryModules).map(([path, text]) => [path.split('/').at(-1) ?? path, text as string]),
);

type WorkerInit = Readonly<{ type: 'tau:typescript-init'; syncFs?: TauSyncFsInitMessage }>;

let service: TypeScriptProjectService | undefined;
let syncFs: ReturnType<typeof createSyncFsClient> | undefined;

function requireField<T>(value: T | undefined, name: string): T {
  if (value === undefined) {
    throw new TypeError(`TypeScript worker requires ${name}`);
  }
  return value;
}

// oxlint-disable-next-line eslint/complexity -- explicit RPC dispatch keeps every supported operation discoverable.
function run(command: TypeScriptWorkerCommand): unknown {
  const current = requireField(service, 'initialized service');
  if ('expectedVersion' in command && command.expectedVersion !== undefined && command.uri) {
    current.assertVersion(command.uri, command.expectedVersion);
  }
  switch (command.kind) {
    case 'setModuleAlias': {
      current.setModuleAlias(command.specifier, command.uri);
      return;
    }
    case 'declarationImports': {
      return current.declarationImports(command.text);
    }
    case 'open': {
      current.open(command.uri, command.text, command.version);
      return;
    }
    case 'change': {
      current.change(command);
      return;
    }
    case 'close': {
      current.close(command.uri);
      return;
    }
    case 'setExtraLib': {
      current.setExtraLib(command.uri, command.text, command.version);
      return;
    }
    case 'removeExtraLib': {
      current.removeExtraLib(command.uri);
      return;
    }
    case 'setProjectFiles': {
      current.setProjectFiles(command.uris);
      return;
    }
    case 'diagnostics': {
      return current.getDiagnostics(requireField(command.uri, 'uri'));
    }
    case 'completions': {
      return current.getCompletions(requireField(command.uri, 'uri'), requireField(command.position, 'position'));
    }
    case 'completionDetails': {
      return current.getCompletionDetails({
        uri: requireField(command.uri, 'uri'),
        position: requireField(command.position, 'position'),
        name: requireField(command.name, 'name'),
        source: command.source,
        data: command.data as ts.CompletionEntryData | undefined,
      });
    }
    case 'completionDetailsWithBases': {
      return current.getCompletionDetailsWithBases({
        uri: requireField(command.uri, 'uri'),
        position: requireField(command.position, 'position'),
        name: requireField(command.name, 'name'),
        source: command.source,
        data: command.data as ts.CompletionEntryData | undefined,
      });
    }
    case 'quickInfo': {
      return current.getQuickInfo(requireField(command.uri, 'uri'), requireField(command.position, 'position'));
    }
    case 'readDeclaration': {
      return current.readDeclaration(requireField(command.uri, 'uri'));
    }
    case 'signatureHelp': {
      return current.getSignatureHelp(requireField(command.uri, 'uri'), requireField(command.position, 'position'), {
        character: command.triggerCharacter,
        retrigger: command.retrigger,
      });
    }
    case 'documentHighlights': {
      return current.getDocumentHighlights(
        requireField(command.uri, 'uri'),
        requireField(command.position, 'position'),
      );
    }
    case 'definition': {
      return current.getDefinition(requireField(command.uri, 'uri'), requireField(command.position, 'position'));
    }
    case 'definitionLocations': {
      return current.getDefinitionLocations(
        requireField(command.uri, 'uri'),
        requireField(command.position, 'position'),
      );
    }
    case 'references': {
      return current.getReferences(requireField(command.uri, 'uri'), requireField(command.position, 'position'));
    }
    case 'referenceLocations': {
      return current.getReferenceLocations(
        requireField(command.uri, 'uri'),
        requireField(command.position, 'position'),
      );
    }
    case 'implementation': {
      return current.getImplementation(requireField(command.uri, 'uri'), requireField(command.position, 'position'));
    }
    case 'implementationLocations': {
      return current.getImplementationLocations(
        requireField(command.uri, 'uri'),
        requireField(command.position, 'position'),
      );
    }
    case 'typeDefinition': {
      return current.getTypeDefinition(requireField(command.uri, 'uri'), requireField(command.position, 'position'));
    }
    case 'typeDefinitionLocations': {
      return current.getTypeDefinitionLocations(
        requireField(command.uri, 'uri'),
        requireField(command.position, 'position'),
      );
    }
    case 'renameInfo': {
      return current.getRenameInfo(requireField(command.uri, 'uri'), requireField(command.position, 'position'));
    }
    case 'renameLocations': {
      return current.findRenameLocations(requireField(command.uri, 'uri'), requireField(command.position, 'position'));
    }
    case 'renameEdits': {
      return current.getRenameEdits(
        requireField(command.uri, 'uri'),
        requireField(command.position, 'position'),
        requireField(command.newName, 'newName'),
      );
    }
    case 'fileRenameEdits': {
      return current.getEditsForFileRename(
        requireField(command.oldUri, 'oldUri'),
        requireField(command.newUri, 'newUri'),
      );
    }
    case 'fileRenameEditsWithBases': {
      return current.getFileRenameEditsWithBases(
        requireField(command.oldUri, 'oldUri'),
        requireField(command.newUri, 'newUri'),
      );
    }
    case 'format': {
      return current.getFormattingEdits(requireField(command.uri, 'uri'), {
        indentSize: 2,
        tabSize: 2,
        convertTabsToSpaces: true,
      });
    }
    case 'formatWithBases': {
      return current.getFormattingEditsWithBases(requireField(command.uri, 'uri'), {
        indentSize: 2,
        tabSize: 2,
        convertTabsToSpaces: true,
      });
    }
    case 'rangeFormat': {
      return current.getRangeFormattingEdits({
        uri: requireField(command.uri, 'uri'),
        start: requireField(command.start, 'start'),
        end: requireField(command.end, 'end'),
        options: { indentSize: 2, tabSize: 2, convertTabsToSpaces: true },
      });
    }
    case 'rangeFormatWithBases': {
      return current.getRangeFormattingEditsWithBases({
        uri: requireField(command.uri, 'uri'),
        start: requireField(command.start, 'start'),
        end: requireField(command.end, 'end'),
        options: { indentSize: 2, tabSize: 2, convertTabsToSpaces: true },
      });
    }
    case 'codeFixes': {
      return current.getCodeFixes({
        uri: requireField(command.uri, 'uri'),
        start: requireField(command.start, 'start'),
        end: requireField(command.end, 'end'),
        errorCodes: command.codes ?? [],
      });
    }
    case 'codeFixesWithBases': {
      return current.getCodeFixesWithBases({
        uri: requireField(command.uri, 'uri'),
        start: requireField(command.start, 'start'),
        end: requireField(command.end, 'end'),
        errorCodes: command.codes ?? [],
      });
    }
    case 'navigationTree': {
      return current.getNavigationTree(requireField(command.uri, 'uri'));
    }
    case 'outliningSpans': {
      return current.getOutliningSpans(requireField(command.uri, 'uri'));
    }
    case 'workspaceSymbols': {
      return current.getNavigateToItems(requireField(command.search, 'search'), command.maxResults);
    }
    case 'workspaceSymbolLocations': {
      return current.getWorkspaceSymbolLocations(requireField(command.search, 'search'), command.maxResults);
    }
    case 'inlayHints': {
      return current.getInlayHints(
        requireField(command.uri, 'uri'),
        requireField(command.start, 'start'),
        requireField(command.end, 'end'),
      );
    }
    case 'prepareCallHierarchy': {
      return current.prepareCallHierarchy(requireField(command.uri, 'uri'), requireField(command.position, 'position'));
    }
    case 'incomingCalls': {
      return current.getIncomingCalls(requireField(command.uri, 'uri'), requireField(command.position, 'position'));
    }
    case 'outgoingCalls': {
      return current.getOutgoingCalls(requireField(command.uri, 'uri'), requireField(command.position, 'position'));
    }
    case 'incomingCallLocations': {
      return current.getIncomingCallLocations(
        requireField(command.uri, 'uri'),
        requireField(command.position, 'position'),
      );
    }
    case 'outgoingCallLocations': {
      return current.getOutgoingCallLocations(
        requireField(command.uri, 'uri'),
        requireField(command.position, 'position'),
      );
    }
  }
}

globalThis.addEventListener('message', (event: MessageEvent<WorkerInit | TypeScriptWorkerRequest>) => {
  const message = event.data;
  if ('type' in message) {
    service?.dispose();
    syncFs?.dispose();
    syncFs = message.syncFs ? createSyncFsClient(message.syncFs) : undefined;
    service = new TypeScriptProjectService({
      standardLibraries,
      syncFs: syncFs ?? {
        readFileText: () => undefined,
        fileExists: () => false,
        directoryExists: () => false,
        getDirectories: () => [],
        getScriptVersionForPath: () => undefined,
      },
    });
    return;
  }

  if (!('id' in message)) {
    return;
  }
  let response: TypeScriptWorkerResponse;
  try {
    response = { id: message.id, ok: true, result: run(message.command) };
  } catch (error) {
    response = { id: message.id, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  globalThis.postMessage(response);
});
