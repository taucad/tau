import type { Completion } from '@codemirror/autocomplete';
import type { EditorView } from '@codemirror/view';

const completionSymbols: Readonly<Record<string, string>> = {
  function: 'method',
  method: 'method',
  constructor: 'method',
  class: 'class',
  interface: 'interface',
  type: 'interface',
  alias: 'reference',
  variable: 'variable',
  var: 'variable',
  let: 'variable',
  local: 'variable',
  parameter: 'parameter',
  constant: 'constant',
  const: 'constant',
  enum: 'enum',
  enumMember: 'enum-member',
  property: 'property',
  field: 'field',
  getter: 'property',
  setter: 'property',
  keyword: 'keyword',
  namespace: 'namespace',
  module: 'namespace',
  text: 'text',
  snippet: 'snippet',
  file: 'file',
  folder: 'folder',
  value: 'value',
  unit: 'numeric',
  color: 'color',
  reference: 'reference',
  struct: 'structure',
  event: 'event',
  operator: 'operator',
  typeParameter: 'type-parameter',
};

/** Codicon glyph for a symbol kind, shared by suggestions, symbol pickers and breadcrumbs. */
export function renderSymbolIcon(kind: string, ownerDocument: Document): HTMLElement {
  const symbol = completionSymbols[kind] ?? 'text';
  const icon = ownerDocument.createElement('span');
  icon.className = `cm-symbol codicon codicon-symbol-${symbol}`;
  icon.dataset['symbol'] = symbol;
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

/** Use the same symbol glyph family as Monaco, without loading the Monaco editor. */
export function renderCompletionIcon(completion: Completion, _state: unknown, view: EditorView): HTMLElement {
  return renderSymbolIcon(completion.type?.split(/\s+/)[0] ?? 'text', view.dom.ownerDocument);
}

const lspCompletionTypes: Readonly<Record<number, string>> = {
  1: 'text',
  2: 'method',
  3: 'function',
  4: 'constructor',
  5: 'field',
  6: 'variable',
  7: 'class',
  8: 'interface',
  9: 'module',
  10: 'property',
  11: 'unit',
  12: 'value',
  13: 'enum',
  14: 'keyword',
  15: 'snippet',
  16: 'color',
  17: 'file',
  18: 'reference',
  19: 'folder',
  20: 'enumMember',
  21: 'constant',
  22: 'struct',
  23: 'event',
  24: 'operator',
  25: 'typeParameter',
};

/** Translate standard LSP completion kinds for the shared suggestion renderer. */
export function completionTypeFromLsp(kind: number | undefined): string {
  return lspCompletionTypes[kind ?? 1] ?? 'text';
}

const lspSymbolKinds: Readonly<Record<number, string>> = {
  1: 'file',
  2: 'module',
  3: 'namespace',
  4: 'module',
  5: 'class',
  6: 'method',
  7: 'property',
  8: 'field',
  9: 'constructor',
  10: 'enum',
  11: 'interface',
  12: 'function',
  13: 'variable',
  14: 'constant',
  15: 'text',
  16: 'unit',
  17: 'value',
  18: 'value',
  19: 'namespace',
  20: 'property',
  21: 'value',
  22: 'enumMember',
  23: 'struct',
  24: 'event',
  25: 'operator',
  26: 'typeParameter',
};

/** Translate standard LSP symbol kinds (document and workspace symbols) for the shared symbol renderer. */
export function symbolKindFromLsp(kind: number | undefined): string {
  return lspSymbolKinds[kind ?? 13] ?? 'variable';
}
