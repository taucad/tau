/* oxlint-disable no-bitwise -- The TypeScript compiler API models symbol and modifier state as bit flags. */

/**
 * The one TypeScript front-end. One `ts.Program`, one {@link ApiCorpus}.
 *
 * It replaces three divergent implementations whose disagreements were
 * structural rather than cosmetic:
 *
 * - Overloads. `extract-jscad-types` joined overload text with newlines;
 *   `extract-replicad-api` emitted one entry per overload, so the same concept
 *   was one symbol in one kernel and four in another. Here a symbol with N
 *   overloads is one entry carrying N {@link ApiSignature}s, because the checker
 *   already merges them.
 * - Prose. Both printers ran with `removeComments: true`, so every TypeScript
 *   description in the corpus was empty. Docs come from
 *   `symbol.getDocumentationComment` and `symbol.getJsDocTags`, which read the
 *   comment the checker bound to the symbol regardless of which overload
 *   carried it.
 * - Membership. `extract-replicad-api` walked the AST syntactically, accepted
 *   `ModifierFlags.Ambient` as "exported" and recursed with `forEachChild`, so a
 *   bare `declare type` and a nested node both became top-level API. Going
 *   through `checker.getExportsOfModule` makes both impossible by construction:
 *   a non-exported declaration is not a module export, and a nested node is
 *   reached only as a member of its container.
 *
 * @module
 */

import { dirname, relative, sep } from 'node:path';

import ts from 'typescript';

import type { ApiEntryDraft } from '#model/api-corpus.js';
import { createApiCorpus } from '#model/api-corpus.js';
import type {
  ApiCorpus,
  ApiDocs,
  ApiEntryKind,
  ApiParameter,
  ApiSignature,
  ApiTypeRef,
} from '#model/api-corpus.types.js';

/** What one TypeScript extraction run needs to know. @internal */
export type TypescriptExtractionConfig = {
  /** Owner of the surface, e.g. `replicad`, `@jscad/modeling`. */
  readonly packageName: string;
  /** Absolute paths to the declaration or source entry points. */
  readonly entryPoints: readonly string[];
  readonly packageVersion: string;
  /** Curated grouping applied to every entry, container and member alike. */
  readonly groupBy?: (entry: {
    readonly name: string;
    readonly kind: ApiEntryKind;
    readonly path?: string;
  }) => string | undefined;
};

type Context = {
  readonly checker: ts.TypeChecker;
  readonly program: ts.Program;
  readonly rootDirectory: string;
  readonly groupBy: TypescriptExtractionConfig['groupBy'];
  /** Guards `export * as ns` cycles, which `@jscad/modeling`'s barrels contain. */
  readonly seenModules: Set<ts.Symbol>;
};

const compilerOptions: ts.CompilerOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  // Node10 resolves the bare relative directory imports that `@jscad/modeling`'s
  // hand-written declarations use (`export * as maths from './maths'`), which
  // Bundler resolution rejects for lacking an extension.
  moduleResolution: ts.ModuleResolutionKind.Node10,
  allowJs: false,
  noEmit: true,
  skipLibCheck: true,
  strict: false,
};

// =============================================================================
// Source location
// =============================================================================

/**
 * A stable path for a declaration: package-relative inside `node_modules`,
 * otherwise relative to the entry points' common directory. Absolute paths
 * would make every corpus machine-specific.
 */
const sourcePath = (fileName: string, rootDirectory: string): string => {
  const marker = fileName.lastIndexOf('/node_modules/');
  if (marker !== -1) {
    return fileName.slice(marker + '/node_modules/'.length);
  }
  return relative(rootDirectory, fileName).split(sep).join('/');
};

const commonDirectory = (entryPoints: readonly string[]): string => {
  const directories = entryPoints.map((entryPoint) => dirname(entryPoint).split(sep));
  const [first = []] = directories;
  let shared = first.length;
  for (const parts of directories) {
    let index = 0;
    while (index < shared && index < parts.length && parts[index] === first[index]) {
      index += 1;
    }
    shared = index;
  }
  return first.slice(0, shared).join(sep) || sep;
};

const sourceOf = (node: ts.Node, rootDirectory: string): { file: string; line: number } => {
  const file = node.getSourceFile();
  const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
  return { file: sourcePath(file.fileName, rootDirectory), line: line + 1 };
};

// =============================================================================
// Prose
// =============================================================================

const tagText = (tag: ts.JSDocTagInfo): string => ts.displayPartsToString(tag.text).trim();

/** Split `<caption>Title</caption>` + fenced code into the model's example shape. */
const parseExample = (raw: string): { caption?: string; code: string } => {
  const caption = /<caption>([\S\s]*?)<\/caption>/u.exec(raw);
  const body = (caption === null ? raw : raw.slice(caption.index + caption[0].length)).trim();
  const fenced = /^```[\w-]*\n([\S\s]*?)\n?```$/u.exec(body);
  const code = fenced === null ? body : (fenced[1] ?? '');
  return caption === null ? { code } : { caption: caption[1]?.trim(), code };
};

const collectDocs = (symbol: ts.Symbol, checker: ts.TypeChecker): ApiDocs | undefined => {
  const comment = ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim();
  const tags = symbol.getJsDocTags(checker);

  const paragraphs = comment === '' ? [] : comment.split(/\n\s*\n/u).map((part) => part.trim());
  const [summary, ...rest] = paragraphs;
  const remarkParagraphs = [...rest, ...tags.filter((tag) => tag.name === 'remarks').map((tag) => tagText(tag))].filter(
    (part) => part !== '',
  );

  const examples = tags.filter((tag) => tag.name === 'example').map((tag) => parseExample(tagText(tag)));
  const throws = tags
    .filter((tag) => tag.name === 'throws')
    .map((tag) => tagText(tag))
    .filter((part) => part !== '');
  const seeAlso = tags
    .filter((tag) => tag.name === 'see')
    .map((tag) => tagText(tag))
    .filter((part) => part !== '');

  const docs: ApiDocs = {
    ...(summary === undefined || summary === '' ? {} : { summary }),
    ...(remarkParagraphs.length === 0 ? {} : { remarks: remarkParagraphs.join('\n\n') }),
    ...(examples.length === 0 ? {} : { examples }),
    ...(throws.length === 0 ? {} : { throws }),
    ...(seeAlso.length === 0 ? {} : { seeAlso }),
  };
  return Object.keys(docs).length === 0 ? undefined : docs;
};

const deprecationOf = (symbol: ts.Symbol, checker: ts.TypeChecker): string | true | undefined => {
  const tag = symbol.getJsDocTags(checker).find((candidate) => candidate.name === 'deprecated');
  if (tag === undefined) {
    return undefined;
  }
  const text = tagText(tag);
  return text === '' ? true : text;
};

// =============================================================================
// Signatures
// =============================================================================

const typeRef = (text: string | undefined): ApiTypeRef | undefined =>
  // Ponytail: `ApiTypeRef.ref` stays unresolved. Cross-linking needs a second
  // pass over the finished corpus; add it when a renderer actually follows one.
  text === undefined || text === '' ? undefined : { text };

const parameterOf = (parameter: ts.ParameterDeclaration, checker: ts.TypeChecker): ApiParameter => {
  const file = parameter.getSourceFile();
  const symbol = checker.getSymbolAtLocation(parameter.name);
  // The checker hands back the `@param` body verbatim, hyphen separator included.
  const description =
    symbol === undefined
      ? ''
      : ts
          .displayPartsToString(symbol.getDocumentationComment(checker))
          .trim()
          .replace(/^[-–—:]\s*/u, '');
  const declaredType =
    parameter.type === undefined
      ? checker.typeToString(checker.getTypeAtLocation(parameter))
      : parameter.type.getText(file);

  return {
    name: parameter.name.getText(file),
    optional: parameter.questionToken !== undefined || parameter.initializer !== undefined,
    ...(typeRef(declaredType) === undefined ? {} : { type: typeRef(declaredType) }),
    ...(parameter.initializer === undefined ? {} : { defaultValue: parameter.initializer.getText(file) }),
    ...(parameter.dotDotDotToken === undefined ? {} : { variadic: true }),
    ...(description === '' ? {} : { description }),
  };
};

/**
 * One {@link ApiSignature} per overload.
 *
 * `text` is `node.getText()` rather than a printer's output: `getText` starts at
 * the node's own first token, so it carries the verbatim declaration — default
 * values included — without the leading JSDoc block that `printNode` would
 * inline into the signature.
 */
const signatureOf = (signature: ts.Signature, checker: ts.TypeChecker): ApiSignature | undefined => {
  const declaration = signature.getDeclaration();
  // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Synthesized signatures have no declaration.
  if (declaration === undefined) {
    return undefined;
  }
  const file = declaration.getSourceFile();
  const returnTypeText =
    declaration.type === undefined ? checker.typeToString(signature.getReturnType()) : declaration.type.getText(file);
  const description = ts.displayPartsToString(signature.getDocumentationComment(checker)).trim();

  return {
    parameters: declaration.parameters.map((parameter) => parameterOf(parameter, checker)),
    text: declaration.getText(file).trim(),
    ...(typeRef(returnTypeText) === undefined ? {} : { returnType: typeRef(returnTypeText) }),
    ...(declaration.typeParameters === undefined || declaration.typeParameters.length === 0
      ? {}
      : { typeParameters: declaration.typeParameters.map((parameter) => parameter.getText(file)) }),
    ...(description === '' ? {} : { description }),
  };
};

const signaturesOf = (node: ts.Node, checker: ts.TypeChecker): ApiSignature[] => {
  const type = checker.getTypeAtLocation(node);
  return type
    .getCallSignatures()
    .map((signature) => signatureOf(signature, checker))
    .filter((signature): signature is ApiSignature => signature !== undefined);
};

// =============================================================================
// Members
// =============================================================================

const memberKind = (node: ts.Node): ApiEntryKind | undefined => {
  if (ts.isConstructorDeclaration(node) || ts.isConstructSignatureDeclaration(node)) {
    return 'constructor';
  }
  if (ts.isMethodDeclaration(node) || ts.isMethodSignature(node)) {
    return 'method';
  }
  if (ts.isPropertyDeclaration(node) || ts.isPropertySignature(node) || ts.isAccessor(node)) {
    return 'property';
  }
  return undefined;
};

const isHidden = (node: ts.ClassElement | ts.TypeElement, name: string): boolean => {
  const flags = ts.getCombinedModifierFlags(node);
  return (flags & ts.ModifierFlags.Private) !== 0 || name.startsWith('_') || name.startsWith('#');
};

const memberName = (node: ts.ClassElement | ts.TypeElement): string => {
  if (ts.isConstructorDeclaration(node) || ts.isConstructSignatureDeclaration(node)) {
    return 'constructor';
  }
  return node.name === undefined ? '' : node.name.getText(node.getSourceFile());
};

const memberEntries = (
  container: ts.ClassDeclaration | ts.InterfaceDeclaration,
  path: string,
  context: Context,
): ApiEntryDraft[] => {
  const { checker, groupBy, rootDirectory } = context;
  const byName = new Map<string, { kind: ApiEntryKind; draft: ApiEntryDraft; signatures: ApiSignature[] }>();

  for (const node of container.members) {
    const kind = memberKind(node);
    const name = memberName(node);
    if (kind === undefined || name === '' || isHidden(node, name)) {
      continue;
    }

    const flags = ts.getCombinedModifierFlags(node);
    const symbol = node.name === undefined ? undefined : checker.getSymbolAtLocation(node.name);
    const signatures = kind === 'property' ? [] : signaturesOf(node, checker);

    const existing = byName.get(name);
    if (existing !== undefined && existing.kind === kind) {
      existing.signatures.push(...signatures);
      continue;
    }

    const declaredType = ts.isPropertyDeclaration(node) || ts.isPropertySignature(node) ? node.type : undefined;
    const draft: ApiEntryDraft = {
      name,
      kind,
      path,
      ...(groupBy?.({ name, kind, path }) === undefined ? {} : { category: groupBy({ name, kind, path }) }),
      ...(symbol === undefined || collectDocs(symbol, checker) === undefined
        ? {}
        : { docs: collectDocs(symbol, checker) }),
      ...(symbol === undefined || deprecationOf(symbol, checker) === undefined
        ? {}
        : { deprecated: deprecationOf(symbol, checker) }),
      ...(declaredType === undefined ? {} : { type: typeRef(declaredType.getText(node.getSourceFile())) }),
      visibility: (flags & ts.ModifierFlags.Protected) === 0 ? 'public' : 'protected',
      ...((flags & ts.ModifierFlags.Static) === 0 ? {} : { static: true }),
      source: sourceOf(node, rootDirectory),
      languageSpecific: { language: 'typescript' },
    };
    byName.set(name, { kind, draft, signatures });
  }

  return [...byName.values()].map(({ draft, signatures }) =>
    signatures.length === 0 ? draft : { ...draft, signatures },
  );
};

const enumMembers = (container: ts.EnumDeclaration, path: string, context: Context): ApiEntryDraft[] =>
  container.members.map((node) => {
    const name = node.name.getText(node.getSourceFile());
    const symbol = context.checker.getSymbolAtLocation(node.name);
    return {
      name,
      kind: 'enumMember',
      path,
      ...(symbol === undefined || collectDocs(symbol, context.checker) === undefined
        ? {}
        : { docs: collectDocs(symbol, context.checker) }),
      source: sourceOf(node, context.rootDirectory),
      languageSpecific: { language: 'typescript' },
    };
  });

// =============================================================================
// Entries
// =============================================================================

const declarationKind = (declaration: ts.Declaration): ApiEntryKind | undefined => {
  if (ts.isClassDeclaration(declaration)) {
    return 'class';
  }
  if (ts.isInterfaceDeclaration(declaration)) {
    return 'interface';
  }
  if (ts.isTypeAliasDeclaration(declaration)) {
    return 'type';
  }
  if (ts.isEnumDeclaration(declaration)) {
    return 'enum';
  }
  if (ts.isFunctionDeclaration(declaration)) {
    return 'function';
  }
  if (ts.isVariableDeclaration(declaration)) {
    return 'constant';
  }
  return undefined;
};

/** The declaration header, i.e. everything before the member block. Keeps `extends`/`implements`. */
const headerText = (declaration: ts.ClassDeclaration | ts.InterfaceDeclaration): string => {
  const text = declaration.getText(declaration.getSourceFile());
  const brace = text.indexOf('{');
  return (brace === -1 ? text : text.slice(0, brace)).trim();
};

const isModuleSymbol = (symbol: ts.Symbol): boolean =>
  (symbol.flags & (ts.SymbolFlags.Module | ts.SymbolFlags.ValueModule | ts.SymbolFlags.NamespaceModule)) !== 0 &&
  (symbol.flags & ts.SymbolFlags.Class) === 0;

const resolveAlias = (symbol: ts.Symbol, checker: ts.TypeChecker): ts.Symbol => {
  if ((symbol.flags & ts.SymbolFlags.Alias) === 0) {
    return symbol;
  }
  try {
    return checker.getAliasedSymbol(symbol);
  } catch {
    return symbol;
  }
};

const ownDeclarations = (symbol: ts.Symbol, program: ts.Program): ts.Declaration[] =>
  (symbol.getDeclarations() ?? []).filter((declaration) => {
    const file = declaration.getSourceFile();
    return !program.isSourceFileDefaultLibrary(file);
  });

const entryOf = (
  symbol: ts.Symbol,
  location: { readonly name: string; readonly path: string | undefined },
  context: Context,
): ApiEntryDraft | undefined => {
  const { name, path } = location;
  const { checker, groupBy, program, rootDirectory } = context;
  const declarations = ownDeclarations(symbol, program);
  const [primary] = declarations;
  if (primary === undefined) {
    return undefined;
  }

  const kind = declarationKind(primary);
  if (kind === undefined) {
    return undefined;
  }

  const signatures = kind === 'function' || kind === 'constant' ? signaturesOf(primary, checker) : [];
  const resolvedKind: ApiEntryKind = kind === 'constant' && signatures.length > 0 ? 'function' : kind;
  const category = groupBy?.({ name, kind: resolvedKind, path });
  const docs = collectDocs(symbol, checker);
  const deprecated = deprecationOf(symbol, checker);
  const memberPath = path === undefined || path === '' ? name : `${path}.${name}`;

  const members = ((): ApiEntryDraft[] => {
    if (ts.isClassDeclaration(primary) || ts.isInterfaceDeclaration(primary)) {
      return declarations
        .filter((declaration) => ts.isClassDeclaration(declaration) || ts.isInterfaceDeclaration(declaration))
        .flatMap((declaration) => memberEntries(declaration, memberPath, context));
    }
    return ts.isEnumDeclaration(primary) ? enumMembers(primary, memberPath, context) : [];
  })();

  const declaredType = ((): ApiTypeRef | undefined => {
    if (ts.isTypeAliasDeclaration(primary)) {
      return typeRef(primary.type.getText(primary.getSourceFile()));
    }
    if (ts.isClassDeclaration(primary) || ts.isInterfaceDeclaration(primary)) {
      return typeRef(headerText(primary));
    }
    if (ts.isVariableDeclaration(primary) && signatures.length === 0) {
      return typeRef(
        primary.type === undefined
          ? checker.typeToString(checker.getTypeAtLocation(primary))
          : primary.type.getText(primary.getSourceFile()),
      );
    }
    return undefined;
  })();

  return {
    name,
    kind: resolvedKind,
    ...(path === undefined ? {} : { path }),
    ...(category === undefined ? {} : { category }),
    ...(signatures.length === 0 ? {} : { signatures }),
    ...(declaredType === undefined ? {} : { type: declaredType }),
    ...(docs === undefined ? {} : { docs }),
    ...(deprecated === undefined ? {} : { deprecated }),
    ...(members.length === 0 ? {} : { members }),
    source: sourceOf(primary, rootDirectory),
    languageSpecific: { language: 'typescript' },
  };
};

/**
 * Every export of a module symbol, recursing through `export * as ns` into
 * namespace entries so a container's path survives into its members.
 */
const moduleEntries = (moduleSymbol: ts.Symbol, path: string | undefined, context: Context): ApiEntryDraft[] => {
  if (context.seenModules.has(moduleSymbol)) {
    return [];
  }
  context.seenModules.add(moduleSymbol);

  const { checker } = context;
  let exportSymbols: ts.Symbol[];
  try {
    exportSymbols = checker.getExportsOfModule(moduleSymbol);
  } catch {
    return [];
  }

  const drafts: ApiEntryDraft[] = [];
  for (const exportSymbol of exportSymbols) {
    const { name } = exportSymbol;
    const resolved = resolveAlias(exportSymbol, checker);

    if (isModuleSymbol(resolved)) {
      const nestedPath = path === undefined || path === '' ? name : `${path}.${name}`;
      const members = moduleEntries(resolved, nestedPath, context);
      if (members.length === 0) {
        continue;
      }
      const category = context.groupBy?.({ name, kind: 'namespace', path });
      drafts.push({
        name,
        kind: 'namespace',
        ...(path === undefined ? {} : { path }),
        ...(category === undefined ? {} : { category }),
        ...(collectDocs(resolved, checker) === undefined ? {} : { docs: collectDocs(resolved, checker) }),
        members,
        languageSpecific: { language: 'typescript' },
      });
      continue;
    }

    const draft = entryOf(resolved, { name, path }, context);
    if (draft !== undefined) {
      drafts.push(draft);
    }
  }

  return drafts;
};

// =============================================================================
// Entry point
// =============================================================================

/**
 * Extract one package's TypeScript API surface into an {@link ApiCorpus}.
 *
 * @param config - Package identity, entry points and optional grouping.
 * @returns One corpus, ids and totals assigned by `createApiCorpus`.
 * @throws When an entry point is not a resolvable module.
 * @internal
 */
export const extractTypescriptApi = (config: TypescriptExtractionConfig): ApiCorpus => {
  const entryPoints = [...config.entryPoints];
  const program = ts.createProgram(entryPoints, compilerOptions);
  const checker = program.getTypeChecker();
  const context: Context = {
    checker,
    program,
    rootDirectory: commonDirectory(entryPoints),
    groupBy: config.groupBy,
    seenModules: new Set<ts.Symbol>(),
  };

  const byName = new Map<string, ApiEntryDraft>();

  for (const entryPoint of entryPoints) {
    const file = program.getSourceFile(entryPoint);
    if (file === undefined) {
      throw new Error(`Entry point not in program: ${entryPoint}`);
    }
    const moduleSymbol = checker.getSymbolAtLocation(file);
    if (moduleSymbol === undefined) {
      throw new Error(`Entry point is not a module: ${entryPoint}`);
    }
    for (const draft of moduleEntries(moduleSymbol, undefined, context)) {
      if (!byName.has(draft.name)) {
        byName.set(draft.name, draft);
      }
    }
  }

  return createApiCorpus(
    {
      language: 'typescript',
      packageName: config.packageName,
      packageVersion: config.packageVersion,
      extractor: `TypeScript ${ts.version}`,
      extractionDate: new Date().toISOString(),
    },
    [...byName.values()],
  );
};
