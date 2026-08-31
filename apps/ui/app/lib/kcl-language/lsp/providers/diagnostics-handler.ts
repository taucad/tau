/**
 * Diagnostics handler for KCL LSP.
 * Subscribes to publishDiagnostics notifications and converts them to Monaco markers.
 *
 * Uses MonacoMarkerService for marker storage, ensuring diagnostics are never
 * silently dropped when the target model doesn't exist yet.
 */

import type * as Monaco from 'monaco-editor';
import type * as LSP from 'vscode-languageserver-protocol';
import type { MonacoMarkerService } from '#lib/monaco-marker-service.js';
import { lspSeverityToMonaco } from '#lib/kcl-language/lsp/utils/position-utils.js';

export const kclMarkerOwner = 'kcl-lsp';

/**
 * Handle LSP publishDiagnostics notification and set Monaco markers.
 * Uses MarkerService to store markers regardless of model existence.
 */
export function handleDiagnostics(
  monaco: typeof Monaco,
  parameters: LSP.PublishDiagnosticsParams,
  markerService?: MonacoMarkerService,
): void {
  const { uri } = parameters;

  const markers: Monaco.editor.IMarkerData[] = parameters.diagnostics.map((diagnostic) => ({
    severity: lspSeverityToMonaco(monaco, diagnostic.severity),
    startLineNumber: diagnostic.range.start.line + 1,
    startColumn: diagnostic.range.start.character + 1,
    endLineNumber: diagnostic.range.end.line + 1,
    endColumn: diagnostic.range.end.character + 1,
    message: typeof diagnostic.message === 'string' ? diagnostic.message : diagnostic.message.value,
    source: diagnostic.source,
    code: typeof diagnostic.code === 'string' ? diagnostic.code : String(diagnostic.code ?? ''),
  }));

  if (markerService) {
    // Use marker service -- markers stored even when model doesn't exist
    markerService.setMarkers(uri, kclMarkerOwner, markers);
  } else {
    // Fallback: direct Monaco markers (requires model to exist)
    const monacoUri = monaco.Uri.parse(uri);
    const model = monaco.editor.getModel(monacoUri);
    if (model) {
      monaco.editor.setModelMarkers(model, kclMarkerOwner, markers);
    }
  }
}

/**
 * Clear all KCL diagnostics for a given URI.
 */
export function clearDiagnostics(monaco: typeof Monaco, uri: string, markerService?: MonacoMarkerService): void {
  if (markerService) {
    markerService.clearMarkers(uri, kclMarkerOwner);
  } else {
    const monacoUri = monaco.Uri.parse(uri);
    const model = monaco.editor.getModel(monacoUri);
    if (model) {
      monaco.editor.setModelMarkers(model, kclMarkerOwner, []);
    }
  }
}

/**
 * Create a notification handler that processes diagnostics.
 */
export function createDiagnosticsHandler(
  monaco: typeof Monaco,
  markerService?: MonacoMarkerService,
): (notification: LSP.NotificationMessage) => void {
  return (notification: LSP.NotificationMessage) => {
    if (notification.method === 'textDocument/publishDiagnostics') {
      handleDiagnostics(monaco, notification.params as LSP.PublishDiagnosticsParams, markerService);
    }
  };
}
