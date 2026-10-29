import { definitionLinkMarkdown } from '#components/code/editor-documentation.js';
import { URI, Utils } from 'vscode-uri';
import type { KclValueView } from '@taucad/kcl-wasm-lib/bindings/KclValueView';
import { WorkspacePathResolver } from '@taucad/fs-client/workspace-path-resolver';
import type { EditorDocument } from '#lib/editor-document.js';
import type { EditorLanguageEnvironment } from '#lib/editor-language-environment.js';
import {
  kclCallAt,
  kclExportedBinding,
  kclOccurrenceAt,
  kclOutline,
  kclRelatedOccurrences,
} from '#lib/kcl-language/kcl-bindings.js';
import type {
  KclBindingKind,
  KclIndex,
  KclOccurrence,
  KclOutlineSymbol,
  KclParameter,
} from '#lib/kcl-language/kcl-bindings.js';
import { loadKclStdlib } from '#lib/kcl-language/kcl-stdlib.js';
import type { KclStdlib, KclStdlibEntry } from '#lib/kcl-language/kcl-stdlib.js';
import type { KclSymbolService } from '#lib/kcl-language/lsp/kcl-symbol-service.js';
import { decodeTextFile } from '#utils/filesystem.utils.js';

/** A source file with the exact text a result's offsets refer to. */
export type KclSource = Readonly<{ uri: string; version: number; text: string }>;

/** A span in a workspace file, with 1-based line and column for navigation. */
export type KclLocation = Readonly<{
  uri: string;
  from: number;
  to: number;
  line: number;
  column: number;
  /** The whole line the span sits on, for a reference list preview. */
  lineText: string;
}>;

/** Where a definition lives: a workspace file, or a module of the read-only standard library. */
export type KclTarget =
  | Readonly<{ kind: 'file'; uri: string; line: number; column: number }>
  | Readonly<{ kind: 'stdlib'; module: string; line: number; column: number }>;

export type KclNavigationContext = Readonly<{
  document: EditorDocument;
  environment: EditorLanguageEnvironment;
  symbols: Pick<KclSymbolService, 'getIndex' | 'getVariableValue'>;
}>;

/** Workspace scans stop here; past it the result would be partial anyway. */
export const kclWorkspaceFileLimit = 512;

const stdlibRoot = 'file:///__kcl_std__/';

/** Read every project `.kcl` file, preferring the open editor text over the stored file. */
export async function kclWorkspaceSources(
  environment: EditorLanguageEnvironment,
  limit = kclWorkspaceFileLimit,
): Promise<Readonly<{ sources: KclSource[]; truncated: boolean }>> {
  const paths = new WorkspacePathResolver(environment.fileManagerRef.getSnapshot().context.rootDirectory);
  const files = await environment.treeService.searchFiles('.kcl', { maxResults: limit + 1 });
  const sources: KclSource[] = [];
  for (const file of files.slice(0, limit)) {
    const path = file.path.startsWith('/') ? paths.toRelativePath(file.path) : file.path;
    if (!path?.endsWith('.kcl') || file.type !== 'file' || (file.provenance && file.provenance.source !== 'project')) {
      continue;
    }
    const loaded = environment.session.get(path);
    if (loaded) {
      sources.push({ uri: loaded.uri, version: loaded.version, text: loaded.text });
      continue;
    }
    // oxlint-disable-next-line eslint/no-await-in-loop -- one bounded, ordered snapshot of the workspace.
    const result = await environment.contentService.resolve(path);
    if (result.kind === 'text') {
      sources.push({ uri: URI.file(`/${path}`).toString(), version: 1, text: decodeTextFile(result.content) });
    }
  }
  return { sources, truncated: files.length > limit };
}

function lineAndColumn(text: string, offset: number): Readonly<{ line: number; column: number; lineText: string }> {
  const start = text.lastIndexOf('\n', offset - 1) + 1;
  const end = text.indexOf('\n', offset);
  return {
    line: text.slice(0, offset).split('\n').length,
    column: offset - start + 1,
    lineText: text.slice(start, end === -1 ? text.length : end),
  };
}

function location(source: Pick<KclSource, 'uri' | 'text'>, span: Readonly<{ from: number; to: number }>): KclLocation {
  return { uri: source.uri, from: span.from, to: span.to, ...lineAndColumn(source.text, span.from) };
}

/** Resolve an import path against the importing file, as the KCL executor does. */
export function resolveKclImport(uri: string, importPath: string): string {
  return Utils.joinPath(Utils.joinPath(URI.parse(uri), '..'), importPath).toString();
}

/** The exported declaration an occurrence stands for in another file, if it names one. */
function importOrigin(uri: string, target: KclOccurrence): Readonly<{ uri: string; name: string }> | undefined {
  if (target.importedFrom) {
    return { uri: resolveKclImport(uri, target.importedFrom), name: target.name };
  }
  const { binding } = target;
  if (binding?.kind === 'import' && binding.importPath && binding.importedName) {
    return { uri: resolveKclImport(uri, binding.importPath), name: binding.importedName };
  }
  if (binding?.topLevel && binding.exported) {
    return { uri, name: binding.name };
  }
  return undefined;
}

/** The occurrences in one file that refer to `origin`, an exported declaration of `origin.uri`. */
function occurrencesOfOrigin(
  source: KclSource,
  index: KclIndex,
  origin: Readonly<{ uri: string; name: string }>,
): KclOccurrence[] {
  if (source.uri === origin.uri) {
    const binding = kclExportedBinding(index, origin.name);
    return binding ? index.occurrences.filter((occurrence) => occurrence.binding === binding) : [];
  }
  const fromOrigin = (path: string | undefined): boolean =>
    path !== undefined && resolveKclImport(source.uri, path) === origin.uri;
  const glob = index.globImports.some(fromOrigin);
  return index.occurrences.filter((occurrence) => {
    if (occurrence.importedFrom) {
      return occurrence.name === origin.name && fromOrigin(occurrence.importedFrom);
    }
    const { binding } = occurrence;
    if (binding) {
      // An aliased import is a new name; only `import name from` keeps referring to the original.
      return (
        binding.kind === 'import' &&
        binding.importedName === origin.name &&
        binding.name === origin.name &&
        fromOrigin(binding.importPath)
      );
    }
    return glob && occurrence.name === origin.name;
  });
}

/**
 * Every reference to the symbol at `offset`, declaration included. Exported names are followed into
 * each project file that imports them; anything else stays within the current file.
 */
export async function kclReferences(context: KclNavigationContext, offset: number): Promise<KclLocation[]> {
  const { document, environment, symbols } = context;
  const current: KclSource = { uri: document.uri, version: document.version, text: document.text };
  const index = await symbols.getIndex(current.uri, current.text);
  const target = kclOccurrenceAt(index, offset);
  if (!target) {
    return [];
  }
  const origin = importOrigin(current.uri, target);
  if (!origin) {
    return kclRelatedOccurrences(index, target).map((occurrence) => location(current, occurrence));
  }
  const { sources } = await kclWorkspaceSources(environment);
  const ordered = [current, ...sources.filter((source) => source.uri !== current.uri)];
  const results = await Promise.all(
    ordered.map(async (source) =>
      occurrencesOfOrigin(source, await symbols.getIndex(source.uri, source.text), origin).map((occurrence) =>
        location(source, occurrence),
      ),
    ),
  );
  return results.flat();
}

/** The open file's functions, variables and types, nested by the function that declares them. */
export async function kclDocumentSymbols(
  context: Pick<KclNavigationContext, 'document' | 'symbols'>,
): Promise<KclOutlineSymbol[]> {
  return kclOutline(await context.symbols.getIndex(context.document.uri, context.document.text));
}

export type KclWorkspaceSymbol = Readonly<{ name: string; kind: KclBindingKind; location: KclLocation }>;

/** Top-level declarations across project files whose name contains every character of `query` in order. */
export async function kclWorkspaceSymbols(
  context: Pick<KclNavigationContext, 'environment' | 'symbols'>,
  query: string,
): Promise<KclWorkspaceSymbol[]> {
  const needle = query.toLowerCase();
  const matches = (name: string): boolean => {
    let cursor = 0;
    for (const character of needle) {
      cursor = name.toLowerCase().indexOf(character, cursor) + 1;
      if (cursor === 0) {
        return false;
      }
    }
    return true;
  };
  const { sources } = await kclWorkspaceSources(context.environment);
  const found = await Promise.all(
    sources.map(async (source) => {
      const index = await context.symbols.getIndex(source.uri, source.text);
      return kclOutline(index)
        .filter((symbol) => matches(symbol.binding.name))
        .map(
          (symbol): KclWorkspaceSymbol => ({
            name: symbol.binding.name,
            kind: symbol.binding.kind,
            location: location(source, symbol.binding),
          }),
        );
    }),
  );
  return found.flat();
}

/** Same-file occurrences of the symbol at `offset`, for highlighting; declarations count as writes. */
export async function kclOccurrences(
  context: Pick<KclNavigationContext, 'document' | 'symbols'>,
  offset: number,
): Promise<Array<Readonly<{ from: number; to: number; kind: 'read' | 'write' }>>> {
  const index = await context.symbols.getIndex(context.document.uri, context.document.text);
  const target = kclOccurrenceAt(index, offset);
  return target
    ? kclRelatedOccurrences(index, target).map((occurrence) => ({
        from: occurrence.from,
        to: occurrence.to,
        kind: occurrence.declaration ? 'write' : 'read',
      }))
    : [];
}

function stdlibTarget(entry: Pick<KclStdlibEntry, 'module' | 'line' | 'column'>): KclTarget {
  return { kind: 'stdlib', module: entry.module, line: entry.line, column: entry.column };
}

async function readSource(environment: EditorLanguageEnvironment, uri: string): Promise<KclSource | undefined> {
  const parsed = URI.parse(uri);
  if (parsed.scheme !== 'file') {
    return undefined;
  }
  const path = parsed.path.replace(/^\//u, '');
  const loaded = environment.session.get(path);
  if (loaded) {
    return { uri: loaded.uri, version: loaded.version, text: loaded.text };
  }
  const result = await environment.contentService.resolve(path);
  return result.kind === 'text' ? { uri, version: 1, text: decodeTextFile(result.content) } : undefined;
}

/** The exported declaration `name` in the file at `uri`, or the top of that file when it has none. */
async function exportedTarget(
  context: KclNavigationContext,
  uri: string,
  name: string | undefined,
): Promise<KclTarget | undefined> {
  const source = await readSource(context.environment, uri);
  if (!source) {
    return undefined;
  }
  const binding = name ? kclExportedBinding(await context.symbols.getIndex(source.uri, source.text), name) : undefined;
  const position = binding ? lineAndColumn(source.text, binding.from) : { line: 1, column: 1 };
  return { kind: 'file', uri: source.uri, line: position.line, column: position.column };
}

/** Resolve the definition of the name at `offset` through its scope, imports and the standard library. */
export async function kclDefinition(context: KclNavigationContext, offset: number): Promise<KclTarget | undefined> {
  const { document, symbols } = context;
  const index = await symbols.getIndex(document.uri, document.text);
  const target = kclOccurrenceAt(index, offset);
  if (!target) {
    return undefined;
  }
  const origin = importOrigin(document.uri, target);
  if (origin && origin.uri !== document.uri) {
    return exportedTarget(context, origin.uri, origin.name);
  }
  const { binding } = target;
  if (binding?.kind === 'module' && binding.importPath) {
    return exportedTarget(context, resolveKclImport(document.uri, binding.importPath), undefined);
  }
  if (binding) {
    const position = lineAndColumn(document.text, binding.from);
    return { kind: 'file', uri: document.uri, line: position.line, column: position.column };
  }
  for (const path of index.globImports) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- the first glob import that exports the name wins.
    const found = await exportedTarget(context, resolveKclImport(document.uri, path), target.name);
    if (found && found.line > 1) {
      return found;
    }
  }
  const library = await loadKclStdlib();
  const stdlib = library.lookup(target.name);
  return stdlib ? stdlibTarget(stdlib) : undefined;
}

/** The KCL type a runtime value has, named as the standard library declares it. */
export function kclValueTypeName(value: KclValueView): string | undefined {
  switch (value.type) {
    case 'Number': {
      return 'number';
    }
    case 'String': {
      return 'string';
    }
    case 'Bool': {
      return 'bool';
    }
    case 'Tuple':
    case 'HomArray': {
      const [first] = value.value;
      return first ? kclValueTypeName(first) : undefined;
    }
    case 'TagIdentifier': {
      return 'TaggedEdge';
    }
    case 'TagDeclarator': {
      return 'TagDecl';
    }
    case 'Function': {
      return 'fn';
    }
    case 'Plane':
    case 'Face':
    case 'BoundedEdge':
    case 'Segment':
    case 'Sketch':
    case 'Solid':
    case 'Helix':
    case 'ImportedGeometry':
    case 'CameraView':
    case 'NamedView':
    case 'GdtAnnotation': {
      return value.type;
    }
    default: {
      return undefined;
    }
  }
}

/**
 * Go to Type Definition: the declared or executed type of the name at `offset`, resolved to a type
 * declared in this file or in the standard library.
 */
export async function kclTypeDefinition(context: KclNavigationContext, offset: number): Promise<KclTarget | undefined> {
  const { document, symbols } = context;
  const index = await symbols.getIndex(document.uri, document.text);
  const target = kclOccurrenceAt(index, offset);
  const binding = target?.binding;
  if (!binding) {
    return undefined;
  }
  let { typeName } = binding;
  if (!typeName && binding.kind === 'tag') {
    typeName = 'TagDecl';
  }
  if (!typeName && binding.topLevel && (binding.kind === 'variable' || binding.kind === 'function')) {
    const value = symbols.getVariableValue(document.uri, binding.name);
    typeName = value ? kclValueTypeName(value) : undefined;
  }
  if (binding.kind === 'type') {
    typeName = binding.name;
  }
  if (!typeName) {
    return undefined;
  }
  const local = index.occurrences.find(
    (occurrence) => occurrence.declaration && occurrence.binding?.kind === 'type' && occurrence.name === typeName,
  );
  if (local) {
    const position = lineAndColumn(document.text, local.from);
    return { kind: 'file', uri: document.uri, line: position.line, column: position.column };
  }
  const library = await loadKclStdlib();
  const stdlib = library.lookupType(typeName);
  return stdlib ? stdlibTarget(stdlib) : undefined;
}

/** Open a target: workspace files in the editor, standard library modules as read-only source. */
export async function openKclTarget(environment: EditorLanguageEnvironment, target: KclTarget): Promise<void> {
  if (target.kind === 'file') {
    await environment.navigate({ uri: target.uri, line: target.line, column: target.column });
    return;
  }
  const library = await loadKclStdlib();
  const text = library.source(target.module);
  if (text === undefined) {
    throw new Error(`KCL standard library module unavailable: ${target.module}`);
  }
  await environment.navigate({
    uri: `${stdlibRoot}${target.module.replaceAll('::', '/')}.kcl`,
    line: target.line,
    column: target.column,
    declaration: { text },
  });
}

/** The signature of a function a call names: declared in this file, or in the standard library. */
function calleeSignature(
  stdlib: KclStdlib,
  occurrence: KclOccurrence,
): Readonly<{ name: string; parameters: readonly KclParameter[]; returnType?: string }> | undefined {
  if (occurrence.binding?.signature) {
    return { name: occurrence.binding.name, parameters: occurrence.binding.signature };
  }
  if (occurrence.binding) {
    return undefined;
  }
  const entry = stdlib.lookup(occurrence.name);
  return entry?.kind === 'function' && entry.parameters
    ? { name: entry.name, parameters: entry.parameters, returnType: entry.returnType }
    : undefined;
}

export type KclSignature = Readonly<{
  label: string;
  /** Each parameter's `[from, to)` span in `label`. */
  parameters: ReadonlyArray<readonly [number, number]>;
  activeParameter: number;
}>;

/**
 * Signature help computed from the AST, for calls the KCL server leaves unanswered: functions
 * declared in the project, and labeled arguments of standard library functions.
 */
export async function kclSignatureAt(
  context: Pick<KclNavigationContext, 'document' | 'symbols'>,
  offset: number,
): Promise<KclSignature | undefined> {
  const index = await context.symbols.getIndex(context.document.uri, context.document.text);
  const call = kclCallAt(index, offset);
  const signature = call ? calleeSignature(await loadKclStdlib(), call.callee) : undefined;
  if (!call || !signature) {
    return undefined;
  }
  const parameters: Array<readonly [number, number]> = [];
  let label = `${signature.name}(`;
  for (const [position, parameter] of signature.parameters.entries()) {
    if (position > 0) {
      label += ', ';
    }
    const text = `${parameter.labeled ? '' : '@'}${parameter.name}${parameter.optional ? '?' : ''}${parameter.type ? `: ${parameter.type}` : ''}`;
    parameters.push([label.length, label.length + text.length]);
    label += text;
  }
  label += `)${signature.returnType ? `: ${signature.returnType}` : ''}`;
  const argument = call.arguments.find((candidate) => candidate.from <= offset && offset <= candidate.to);
  const unlabeled = signature.parameters.findIndex((parameter) => !parameter.labeled);
  const given = new Set(call.arguments.map((candidate) => candidate.label));
  let activeParameter = argument
    ? signature.parameters.findIndex((parameter) => parameter.name === argument.label)
    : call.unlabeled && call.unlabeled.from <= offset && offset <= call.unlabeled.to
      ? unlabeled
      : !call.unlabeled && call.arguments.length === 0 && unlabeled !== -1
        ? unlabeled
        : signature.parameters.findIndex((parameter) => parameter.labeled && !given.has(parameter.name));
  if (activeParameter === -1) {
    activeParameter = 0;
  }
  return { label, parameters, activeParameter };
}

/** Parameter-name hints for positional arguments, as TypeScript shows them: `name:` before the value. */
export async function kclParameterHints(
  context: Pick<KclNavigationContext, 'document' | 'symbols'>,
  range: Readonly<{ from: number; to: number }>,
): Promise<Array<Readonly<{ position: number; label: string }>>> {
  const index = await context.symbols.getIndex(context.document.uri, context.document.text);
  const stdlib = await loadKclStdlib();
  return index.calls.flatMap((call) => {
    if (!call.unlabeled || call.unlabeled.from < range.from || call.unlabeled.from > range.to) {
      return [];
    }
    const parameter = calleeSignature(stdlib, call.callee)?.parameters.find((candidate) => !candidate.labeled);
    return parameter ? [{ position: call.unlabeled.from, label: `${parameter.name}:` }] : [];
  });
}

const kclDocsOrigin = 'https://zoo.dev';

/**
 * Rewrite the KCL docs links in server documentation. Standard library pages become definition
 * links, opened like F12; the language guide opens externally instead of navigating the app.
 */
export function kclDocumentationMarkdown(
  markdown: string,
  stdlib: KclStdlib | undefined,
): Readonly<{ markdown: string; targets: readonly KclTarget[] }> {
  const targets: KclTarget[] = [];
  const rewritten = markdown.replaceAll(
    /\[([^\]\n]+)\]\((\/docs\/[^)\s]+)\)/gu,
    (_link: string, label: string, href: string): string => {
      const target = stdlib ? kclDocsTarget(href, stdlib) : undefined;
      if (!target) {
        return `[${label}](${kclDocsOrigin}${href})`;
      }
      targets.push(target);
      const code = /^`[^`]+`$/u.test(label);
      return definitionLinkMarkdown(code ? label.slice(1, -1) : label, targets.length - 1, code);
    },
  );
  return { markdown: rewritten, targets };
}

/** `/docs/kcl-std/functions/std-sketch-region` names `region` in `std::sketch`. */
function kclDocsTarget(href: string, stdlib: KclStdlib): KclTarget | undefined {
  const match = /^\/docs\/kcl-std\/(functions|types|consts|modules)\/(std(?:-[\w]+)*)$/u.exec(href.split('#')[0] ?? '');
  if (!match) {
    return undefined;
  }
  const [, section, slug = ''] = match;
  const parts = slug.split('-');
  if (section === 'modules') {
    const module = parts.join('::');
    return stdlib.hasModule(module) ? { kind: 'stdlib', module, line: 1, column: 1 } : undefined;
  }
  const name = parts.at(-1) ?? '';
  const entry = section === 'types' ? stdlib.lookupType(name) : stdlib.lookup(name, parts.slice(0, -1).join('::'));
  return entry ? stdlibTarget(entry) : undefined;
}
