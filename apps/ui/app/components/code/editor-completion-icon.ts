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

/** Use the same symbol glyph family as Monaco, without loading the Monaco editor. */
export function renderCompletionIcon(completion: Completion, _state: unknown, view: EditorView): HTMLElement {
  const kind = completion.type?.split(/\s+/)[0] ?? 'text';
  const symbol = completionSymbols[kind] ?? 'text';
  const icon = view.dom.ownerDocument.createElement('span');
  icon.className = `cm-symbol codicon codicon-symbol-${symbol}`;
  icon.dataset['symbol'] = symbol;
  icon.setAttribute('aria-hidden', 'true');
  return icon;
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
