/**
 * Monaco completion provider for KCL LSP.
 *
 * Priority order:
 * 1. LSP server (stdlib functions with snippets)
 * 2. Symbol Service (user-defined variables, functions, parameters)
 * 3. Imported symbols (resolved from imported files)
 */

import type * as Monaco from 'monaco-editor';
import { CompletionTriggerKind } from 'vscode-languageserver-protocol';
import type * as LSP from 'vscode-languageserver-protocol';
import type { KclLspClient } from '#lib/kcl-language/lsp/kcl-lsp-client.js';
import type { KclSymbolService, KclSymbol, KclParameterInfo } from '#lib/kcl-language/lsp/kcl-symbol-service.js';
import { createKclLogger } from '#lib/kcl-language/lsp/kcl-logs.js';
import { monacoToLspPosition, lspToMonacoRange } from '#lib/kcl-language/lsp/utils/position-utils.js';
import { lspToMonacoCompletionKind, formatDocumentation } from '#lib/kcl-language/lsp/utils/lsp-kind-utils.js';

const log = createKclLogger('Completion Provider');

/**
 * Create a Monaco completion provider that uses the LSP client.
 * Falls back to symbol service for user-defined symbols.
 */
export function createCompletionProvider(
  monaco: typeof Monaco,
  client: KclLspClient,
  symbolService?: KclSymbolService,
): Monaco.languages.CompletionItemProvider {
  return {
    triggerCharacters: ['.', '|', '('],

    // oxlint-disable-next-line max-params -- Monaco editor API contract
    async provideCompletionItems(
      model: Monaco.editor.ITextModel,
      position: Monaco.Position,
      context: Monaco.languages.CompletionContext,
      _token: Monaco.CancellationToken,
    ): Promise<Monaco.languages.CompletionList | undefined> {
      const uri = model.uri.toString();
      log.debug('provideCompletionItems called, uri:', uri, 'position:', position.lineNumber, position.column);

      const suggestions: Monaco.languages.CompletionItem[] = [];
      const seenLabels = new Set<string>();

      // Get word at position for range calculation
      const wordInfo = model.getWordAtPosition(position);
      const wordRange = wordInfo
        ? new monaco.Range(position.lineNumber, wordInfo.startColumn, position.lineNumber, wordInfo.endColumn)
        : new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column);

      // 1. Get LSP completions (stdlib functions)
      // Wait for LSP to be ready before requesting completions
      if (!client.ready) {
        log.debug('LSP client not ready, waiting...');
        await client.waitForReady();
        log.debug('LSP client now ready');
      }

      const lspPosition = monacoToLspPosition(position);
      log.debug('Requesting LSP completions at position:', JSON.stringify(lspPosition), 'uri:', uri);

      // Log the line content for debugging
      const lineContent = model.getLineContent(position.lineNumber);
      log.debug('Line content:', JSON.stringify(lineContent), 'word at pos:', wordInfo?.word);

      try {
        const lspResult = await client.textDocumentCompletion({
          textDocument: { uri },
          position: lspPosition,
          context: {
            triggerKind:
              context.triggerKind === monaco.languages.CompletionTriggerKind.TriggerCharacter
                ? CompletionTriggerKind.TriggerCharacter
                : CompletionTriggerKind.Invoked,
            triggerCharacter: context.triggerCharacter,
          },
        });
        log.debug('LSP completion result:', lspResult ? 'received' : 'empty');

        if (lspResult) {
          const lspItems = 'items' in lspResult ? lspResult.items : lspResult;
          log.debug('LSP returned', lspItems.length, 'completions');

          for (const item of lspItems) {
            const labelText = getLabelText(item.label);
            if (!seenLabels.has(labelText)) {
              seenLabels.add(labelText);
              suggestions.push(convertLspCompletionItem(monaco, item, wordRange));
            }
          }
        } else {
          log.debug('No LSP completions returned');
        }
      } catch (error) {
        log.debug('Error getting LSP completions:', error);
      }

      // ════════════════════════════════════════════════════════════════════════
      // AUGMENTATION: Client-side symbol completions via WASM AST
      // Remove this block when KCL LSP provides user-defined symbol completions
      // ════════════════════════════════════════════════════════════════════════

      // Error Resilience: Symbol service provides fallback completions even when LSP fails
      // All symbol service calls are wrapped to ensure partial failures don't break completions
      if (symbolService?.isInitialized) {
        try {
          // 2. Get stdlib symbols (built-in functions from parsed stdlib sources)
          // This provides stdlib completions when LSP returns null
          if (symbolService.hasStdlib) {
            const stdlibSymbols: KclSymbol[] = symbolService.getStdlibSymbols();
            log.debug('Symbol service returned', stdlibSymbols.length, 'stdlib symbols');
            addSymbolsToSuggestions(stdlibSymbols, { isStdlib: true });
          }

          // 3. Get local symbols (variables, functions, parameters)
          // These may be from the last successful parse if current parse failed
          const localSymbols = symbolService.getCompletableSymbols(uri);
          log.debug('Symbol service returned', localSymbols.length, 'local symbols');
          addSymbolsToSuggestions(localSymbols, {});

          // 4. Get imported symbols (resolved to actual definitions)
          const fileManager = client.getFileManager();
          try {
            const importedSymbols = await symbolService.getImportedSymbolsForCompletion(uri, fileManager);
            log.debug('Symbol service returned', importedSymbols.length, 'imported symbols');
            addSymbolsToSuggestions(importedSymbols, { isImported: true });
          } catch (error) {
            log.debug('Error getting imported symbols (non-fatal):', error);
          }
        } catch (error) {
          // Symbol service error should not prevent returning whatever completions we have
          log.debug('Error getting symbol service completions (non-fatal):', error);
        }
      }

      /**
       * Helper to add symbols to suggestions while deduplicating
       */
      function addSymbolsToSuggestions(symbols: KclSymbol[], options: SymbolCompletionOptions): void {
        for (const symbol of symbols) {
          if (!seenLabels.has(symbol.name)) {
            seenLabels.add(symbol.name);
            suggestions.push(convertSymbolToCompletion(monaco, symbol, wordRange, options));
          }
        }
      }

      log.debug('Returning', suggestions.length, 'total completions');

      return {
        suggestions,
        incomplete: false,
      };
    },

    async resolveCompletionItem(
      item: Monaco.languages.CompletionItem,
      _token: Monaco.CancellationToken,
    ): Promise<Monaco.languages.CompletionItem> {
      // If we have original LSP item data, resolve it
      const extendedItem = item as Monaco.languages.CompletionItem & {
        data?: LSP.CompletionItem;
      };
      const lspItem = extendedItem.data;
      if (lspItem) {
        try {
          const resolved = await client.completionItemResolve(lspItem);
          if (resolved.documentation) {
            item.documentation = formatDocumentation(resolved.documentation);
          }
        } catch (error) {
          log.debug('Error resolving completion item:', error);
        }
      }

      return item;
    },
  };
}

/**
 * Convert LSP CompletionItem to Monaco CompletionItem.
 */
/**
 * Extract label text from an LSP CompletionItem label.
 * In LSP 3.17, CompletionItem.label is always a string.
 * CompletionItemLabelDetails (used for labelDetails property) only has detail and description fields.
 */
function getLabelText(label: string | LSP.CompletionItemLabelDetails): string {
  if (typeof label === 'string') {
    return label;
  }

  // CompletionItemLabelDetails only has detail and description, no label field
  return label.detail ?? label.description ?? '';
}

function convertLspCompletionItem(
  monaco: typeof Monaco,
  item: LSP.CompletionItem,
  wordRange: Monaco.IRange,
): Monaco.languages.CompletionItem {
  const labelText = getLabelText(item.label);
  const insertText = item.insertText ?? labelText;

  let range: Monaco.IRange | undefined;
  if (item.textEdit && 'range' in item.textEdit) {
    range = lspToMonacoRange(monaco, item.textEdit.range);
  }

  // Use word range (or zero-width cursor position) if no textEdit.range specified
  const defaultRange = range ?? wordRange;

  return {
    label: labelText,
    kind: lspToMonacoCompletionKind(monaco, item.kind),
    detail: item.detail,
    documentation: formatDocumentation(item.documentation),
    insertText,
    insertTextRules:
      item.insertTextFormat === 2 ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
    range: defaultRange,
    sortText: item.sortText ?? `0_${labelText}`, // LSP items first
    filterText: item.filterText,
    preselect: item.preselect,
  };
}

type SymbolCompletionOptions = {
  isImported?: boolean;
  isStdlib?: boolean;
};

/**
 * Convert a KCL symbol to a Monaco completion item.
 */
// oxlint-disable-next-line max-params -- 4th param is already an options object
function convertSymbolToCompletion(
  monaco: typeof Monaco,
  symbol: KclSymbol,
  range: Monaco.IRange,
  options: SymbolCompletionOptions = {},
): Monaco.languages.CompletionItem {
  const { isImported = false, isStdlib = false } = options;
  const formattedCompletion = formatSymbolCompletion(monaco, symbol);

  // Sort order: stdlib (0_), then local (1_), then imported (2_)
  let sortPrefix = '1_';
  if (isStdlib) {
    sortPrefix = '0_';
  } else if (isImported) {
    sortPrefix = '2_';
  }

  return {
    label: symbol.name,
    kind: formattedCompletion.kind,
    detail: formattedCompletion.detail,
    documentation: { value: formattedCompletion.documentation },
    insertText: formattedCompletion.insertText,
    insertTextRules: formattedCompletion.insertTextRules,
    range,
    sortText: `${sortPrefix}${symbol.name}`,
  };
}

/**
 * Format a symbol for completion based on its kind.
 */
function formatSymbolCompletion(
  monaco: typeof Monaco,
  symbol: KclSymbol,
): {
  kind: Monaco.languages.CompletionItemKind;
  detail: string;
  documentation: string;
  insertText: string;
  insertTextRules: Monaco.languages.CompletionItemInsertTextRule | undefined;
} {
  switch (symbol.kind) {
    case 'variable': {
      const typeString = formatValueType(symbol.value);
      const valueString = formatValuePreview(symbol.value);

      return {
        kind: monaco.languages.CompletionItemKind.Variable,
        detail: `(var) ${symbol.name}: ${typeString}`,
        documentation: valueString ? `@default — ${valueString}` : '',
        insertText: symbol.name,
        insertTextRules: undefined,
      };
    }

    case 'function': {
      const signature = formatFunctionSignature(symbol);
      const parameterSnippet = formatFunctionSnippet(symbol);

      return {
        kind: monaco.languages.CompletionItemKind.Function,
        detail: signature,
        documentation: symbol.importPath ? `*from* \`"${symbol.importPath}"\`` : '',
        insertText: parameterSnippet,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      };
    }

    case 'parameter': {
      const parameterType = symbol.value ? formatValueType(symbol.value) : 'unknown';

      return {
        kind: monaco.languages.CompletionItemKind.Property,
        detail: `(param) ${symbol.name}: ${parameterType}`,
        documentation: symbol.containingFunction ? `Parameter of \`${symbol.containingFunction}\`` : '',
        insertText: `${symbol.name} = `,
        insertTextRules: undefined,
      };
    }

    case 'import': {
      // Imports should be resolved to their actual type, but fallback to module
      return {
        kind: monaco.languages.CompletionItemKind.Module,
        detail: `(import) ${symbol.name}`,
        documentation: symbol.importPath ? `*from* \`"${symbol.importPath}"\`` : '',
        insertText: symbol.name,
        insertTextRules: undefined,
      };
    }

    default: {
      return {
        kind: monaco.languages.CompletionItemKind.Text,
        detail: symbol.name,
        documentation: '',
        insertText: symbol.name,
        insertTextRules: undefined,
      };
    }
  }
}

/**
 * Format a function signature for display.
 */
function formatFunctionSignature(symbol: KclSymbol): string {
  if (!symbol.parameters || symbol.parameters.length === 0) {
    return `fn ${symbol.name}()`;
  }

  const parameters = symbol.parameters.map((parameter) => formatParameterSignature(parameter)).join(', ');
  const returnType = symbol.returnType ?? '';
  const returnString = returnType ? ` -> ${returnType}` : '';

  return `fn ${symbol.name}(${parameters})${returnString}`;
}

/**
 * Format a parameter for signature display.
 */
function formatParameterSignature(parameter: KclParameterInfo): string {
  const typeString = parameter.type ?? 'unknown';
  const defaultString = parameter.hasDefault ? '?' : '';

  return `${parameter.name}${defaultString}: ${typeString}`;
}

/**
 * Format a function as a snippet for insertion.
 */
function formatFunctionSnippet(symbol: KclSymbol): string {
  if (!symbol.parameters || symbol.parameters.length === 0) {
    return `${symbol.name}()`;
  }

  // Create snippet with parameter placeholders
  const parameterSnippets = symbol.parameters.map((parameter, index) => {
    const placeholder = index + 1;

    return `${parameter.name} = \${${placeholder}}`;
  });

  return `${symbol.name}(${parameterSnippets.join(', ')})`;
}

/**
 * Format a KclValue type for display.
 */
function formatValueType(value: unknown): string {
  if (!value || typeof value !== 'object') {
    return 'unknown';
  }

  const typedValue = value as { type?: string };
  if (!typedValue.type) {
    return 'unknown';
  }

  switch (typedValue.type) {
    case 'Number': {
      return 'number';
    }

    case 'String': {
      return 'string';
    }

    case 'Bool': {
      return 'bool';
    }

    case 'Array': {
      return 'array';
    }

    case 'Object': {
      return 'object';
    }

    case 'Sketch': {
      return 'Sketch';
    }

    case 'Solid': {
      return 'Solid';
    }

    case 'Plane': {
      return 'Plane';
    }

    default: {
      return typedValue.type;
    }
  }
}

/**
 * Format a KclValue preview for display.
 */
function formatValuePreview(value: unknown): string {
  if (!value || typeof value !== 'object') {
    return '';
  }

  const typedValue = value as { type?: string; value?: unknown };
  if (!typedValue.type) {
    return '';
  }

  switch (typedValue.type) {
    case 'Number':
    case 'String':
    case 'Bool': {
      return String(typedValue.value);
    }

    default: {
      return '';
    }
  }
}
