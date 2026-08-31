/**
 * Monaco code action provider for KCL LSP.
 */

import type * as Monaco from 'monaco-editor';
import { DiagnosticSeverity } from 'vscode-languageserver-protocol';
import type * as LSP from 'vscode-languageserver-protocol';
import type { KclLspClient } from '#lib/kcl-language/lsp/kcl-lsp-client.js';
import { createKclLogger } from '#lib/kcl-language/lsp/kcl-logs.js';
import { monacoToLspRange, lspToMonacoRange } from '#lib/kcl-language/lsp/utils/position-utils.js';

const log = createKclLogger('Code Action Provider');

/**
 * Create a Monaco code action provider that uses the LSP client.
 */
export function createCodeActionProvider(
  monaco: typeof Monaco,
  client: KclLspClient,
): Monaco.languages.CodeActionProvider {
  return {
    // oxlint-disable-next-line max-params -- Monaco editor API contract
    async provideCodeActions(
      model: Monaco.editor.ITextModel,
      range: Monaco.Range,
      context: Monaco.languages.CodeActionContext,
      _token: Monaco.CancellationToken,
    ): Promise<Monaco.languages.CodeActionList | undefined> {
      // Error Resilience: LSP errors should not break the editor
      try {
        const diagnostics: LSP.Diagnostic[] = context.markers.map((marker) => ({
          range: {
            start: {
              line: marker.startLineNumber - 1,
              character: marker.startColumn - 1,
            },
            end: {
              line: marker.endLineNumber - 1,
              character: marker.endColumn - 1,
            },
          },
          message: marker.message,
          severity: markerSeverityToLsp(monaco, marker.severity),
          source: marker.source ?? undefined,
          code:
            typeof marker.code === 'string'
              ? marker.code
              : typeof marker.code === 'number'
                ? String(marker.code)
                : undefined,
        }));

        const result = await client.textDocumentCodeAction({
          textDocument: { uri: model.uri.toString() },
          range: monacoToLspRange(range),
          context: {
            diagnostics,
            only: context.only ? [context.only] : undefined,
          },
        });

        if (!result) {
          return undefined;
        }

        const actions: Monaco.languages.CodeAction[] = result.map((item) => {
          if ('command' in item && !('edit' in item)) {
            // Command
            const command = item as LSP.Command;

            return {
              title: command.title,
              command: {
                id: command.command,
                title: command.title,
                arguments: command.arguments,
              },
            };
          }

          // CodeAction
          const codeAction = item;

          return {
            title: codeAction.title,
            kind: codeAction.kind,
            diagnostics: codeAction.diagnostics?.map((diagnostic) => ({
              severity: lspSeverityToMarker(monaco, diagnostic.severity),
              startLineNumber: diagnostic.range.start.line + 1,
              startColumn: diagnostic.range.start.character + 1,
              endLineNumber: diagnostic.range.end.line + 1,
              endColumn: diagnostic.range.end.character + 1,
              message: typeof diagnostic.message === 'string' ? diagnostic.message : diagnostic.message.value,
            })),
            isPreferred: codeAction.isPreferred,
            edit: codeAction.edit ? convertWorkspaceEdit(monaco, codeAction.edit) : undefined,
            command: codeAction.command
              ? {
                  id: codeAction.command.command,
                  title: codeAction.command.title,
                  arguments: codeAction.command.arguments,
                }
              : undefined,
          };
        });

        return {
          actions,
          dispose() {
            // Empty dispose
          },
        };
      } catch (error) {
        log.debug('Code action error (non-fatal):', error);
        return undefined;
      }
    },
  };
}

/**
 * Convert Monaco MarkerSeverity to LSP DiagnosticSeverity.
 */
function markerSeverityToLsp(monaco: typeof Monaco, severity: Monaco.MarkerSeverity): LSP.DiagnosticSeverity {
  // Use Monaco enum values for comparison
  if (severity === monaco.MarkerSeverity.Error) {
    return DiagnosticSeverity.Error;
  }

  if (severity === monaco.MarkerSeverity.Warning) {
    return DiagnosticSeverity.Warning;
  }

  if (severity === monaco.MarkerSeverity.Info) {
    return DiagnosticSeverity.Information;
  }

  // Hint or default
  return DiagnosticSeverity.Hint;
}

/**
 * Convert LSP DiagnosticSeverity to Monaco MarkerSeverity.
 */
function lspSeverityToMarker(monaco: typeof Monaco, severity?: LSP.DiagnosticSeverity): Monaco.MarkerSeverity {
  if (severity === DiagnosticSeverity.Error) {
    return monaco.MarkerSeverity.Error;
  }

  if (severity === DiagnosticSeverity.Warning) {
    return monaco.MarkerSeverity.Warning;
  }

  if (severity === DiagnosticSeverity.Information) {
    return monaco.MarkerSeverity.Info;
  }

  if (severity === DiagnosticSeverity.Hint) {
    return monaco.MarkerSeverity.Hint;
  }

  return monaco.MarkerSeverity.Error;
}

/**
 * Convert LSP WorkspaceEdit to Monaco WorkspaceEdit.
 */
function convertWorkspaceEdit(monaco: typeof Monaco, edit: LSP.WorkspaceEdit): Monaco.languages.WorkspaceEdit {
  const edits: Monaco.languages.IWorkspaceTextEdit[] = [];

  if (edit.changes) {
    for (const [uri, textEdits] of Object.entries(edit.changes)) {
      for (const textEdit of textEdits) {
        edits.push({
          resource: monaco.Uri.parse(uri),
          textEdit: {
            range: lspToMonacoRange(monaco, textEdit.range),
            text: textEdit.newText,
          },
          versionId: undefined,
        });
      }
    }
  }

  return { edits };
}
