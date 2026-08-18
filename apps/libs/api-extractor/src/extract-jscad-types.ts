#!/usr/bin/env node
/* oxlint-disable no-bitwise, complexity -- Utility script using TS Compiler API with bitwise flag checks */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import ts from 'typescript';
import type { ApiData, ApiEntry } from '#api-extraction.types.js';

type TsExtractionContext = {
  checker: ts.TypeChecker;
  printer: ts.Printer;
  program: ts.Program;
};

/**
 * Extract @jscad/modeling type declarations into a single bundled .d.ts file
 * using the TypeScript Compiler API.
 *
 * Walks the module graph from `@jscad/modeling/src/index.d.ts`, resolving all
 * exports through barrel files, and emits structured `declare module` blocks
 * for both the main package and each subpath (e.g. `@jscad/modeling/primitives`).
 *
 * The output is consumed by Monaco's `addExtraLib` for IntelliSense support.
 */

// =============================================================================
// Configuration
// =============================================================================

const jscadSourceDirectory = join(import.meta.dirname, '../../../../node_modules/@jscad/modeling/src');
const entryPath = join(jscadSourceDirectory, 'index.d.ts');

/** Files containing cross-cutting foundation types referenced across namespaces. */
const foundationTypeFiles = [
  'colors/types.d.ts',
  'geometries/geom2/type.d.ts',
  'geometries/geom3/type.d.ts',
  'geometries/path2/type.d.ts',
  'geometries/poly2/type.d.ts',
  'geometries/poly3/type.d.ts',
  'geometries/types.d.ts',
  'maths/vec1/type.d.ts',
  'maths/vec2/type.d.ts',
  'maths/vec3/type.d.ts',
  'maths/vec4/type.d.ts',
  'maths/mat4/type.d.ts',
  'maths/line2/type.d.ts',
  'maths/line3/type.d.ts',
  'maths/plane/type.d.ts',
  'maths/types.d.ts',
  'measurements/types.d.ts',
  'utils/recursiveArray.d.ts',
  'utils/corners.d.ts',
].map((p) => join(jscadSourceDirectory, p));

/** Built-in TypeScript types that never need resolution. */
const builtinTypes = new Set([
  'Array',
  'ReadonlyArray',
  'Promise',
  'Map',
  'Set',
  'Record',
  'Partial',
  'Required',
  'Readonly',
  'Pick',
  'Omit',
  'Exclude',
  'Extract',
  'NonNullable',
  'ReturnType',
  'InstanceType',
  'Parameters',
  'ConstructorParameters',
  'Function',
  'Object',
  'String',
  'Number',
  'Boolean',
  'Error',
  'Date',
  'RegExp',
  'Iterator',
  'Iterable',
  'IterableIterator',
  'AsyncIterator',
  'string',
  'number',
  'boolean',
  'void',
  'undefined',
  'null',
  'never',
  'any',
  'unknown',
  'object',
  'symbol',
  'bigint',
]);

// =============================================================================
// Types
// =============================================================================

type ExtractionResult = {
  declarations: string[];
  nestedNamespaces: Map<string, ExtractionResult>;
  /** All type names referenced in declarations */
  typeReferences: Set<string>;
  /** All names defined (exported) in this namespace */
  definedNames: Set<string>;
};

type FoundationType = {
  name: string;
  declaration: string;
};

// =============================================================================
// Program & Symbol Resolution
// =============================================================================

function createJscadProgram(): ts.Program {
  return ts.createProgram([entryPath], {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    declaration: true,
    allowJs: false,
    strict: false,
    noEmit: true,
  });
}

function resolveSymbol(symbol: ts.Symbol, checker: ts.TypeChecker): ts.Symbol {
  if (symbol.flags & ts.SymbolFlags.Alias) {
    try {
      return checker.getAliasedSymbol(symbol);
    } catch {
      return symbol;
    }
  }

  return symbol;
}

function isModuleSymbol(symbol: ts.Symbol): boolean {
  return Boolean(symbol.flags & (ts.SymbolFlags.Module | ts.SymbolFlags.ValueModule));
}

// =============================================================================
// Declaration Printing
// =============================================================================

/**
 * Ensure a declaration string starts with `export`. Preserves `declare`
 * since the output is a raw module `.d.ts` file where `export declare`
 * is valid and correct.
 */
function addExportModifier(text: string): string {
  if (text.startsWith('export ')) {
    return text;
  }
  if (text.startsWith('declare ')) {
    return 'export ' + text;
  }
  return 'export ' + text;
}

/**
 * Print a declaration node using the printer, handling each node kind appropriately.
 * Returns `undefined` for node kinds that should be skipped (re-export specifiers, etc.).
 */
function printDeclarationText(
  input: {
    decl: ts.Declaration;
    resolved: ts.Symbol;
    exportName: string;
    sourceFile: ts.SourceFile;
    printedStatements: Set<ts.Node>;
  },
  context: TsExtractionContext,
): string | undefined {
  const { decl, resolved, exportName, sourceFile, printedStatements } = input;
  const { checker, printer } = context;
  if (ts.isFunctionDeclaration(decl)) {
    return addExportModifier(printer.printNode(ts.EmitHint.Unspecified, decl, sourceFile).trim());
  }

  if (ts.isInterfaceDeclaration(decl)) {
    return addExportModifier(printer.printNode(ts.EmitHint.Unspecified, decl, sourceFile).trim());
  }

  if (ts.isTypeAliasDeclaration(decl)) {
    return addExportModifier(printer.printNode(ts.EmitHint.Unspecified, decl, sourceFile).trim());
  }

  if (ts.isVariableDeclaration(decl)) {
    const statement = decl.parent.parent;
    if (ts.isVariableStatement(statement)) {
      // Avoid printing the same multi-declaration statement more than once
      if (printedStatements.has(statement)) {
        return undefined;
      }

      printedStatements.add(statement);
      return addExportModifier(printer.printNode(ts.EmitHint.Unspecified, statement, sourceFile).trim());
    }

    // Fallback: construct from type checker
    const type = checker.getTypeOfSymbolAtLocation(resolved, decl);
    return `export const ${exportName}: ${checker.typeToString(type)};`;
  }

  if (ts.isClassDeclaration(decl)) {
    return addExportModifier(printer.printNode(ts.EmitHint.Unspecified, decl, sourceFile).trim());
  }

  if (ts.isEnumDeclaration(decl)) {
    return addExportModifier(printer.printNode(ts.EmitHint.Unspecified, decl, sourceFile).trim());
  }

  // Skip re-export nodes – the resolved symbol's actual declaration is what we want
  if (ts.isExportSpecifier(decl) || ts.isExportAssignment(decl)) {
    return undefined;
  }

  return undefined;
}

// =============================================================================
// Type Reference Collection
// =============================================================================

/**
 * Walk an AST node and collect all type reference identifier names.
 */
function collectTypeReferences(node: ts.Node): Set<string> {
  const references = new Set<string>();

  function walk(n: ts.Node): void {
    if (ts.isTypeReferenceNode(n)) {
      if (ts.isIdentifier(n.typeName)) {
        references.add(n.typeName.text);
      } else if (ts.isQualifiedName(n.typeName)) {
        // For Namespace.Type, collect the root name
        let root: ts.EntityName = n.typeName;
        while (ts.isQualifiedName(root)) {
          root = root.left;
        }

        if (ts.isIdentifier(root)) {
          references.add(root.text);
        }
      }
    }

    ts.forEachChild(n, walk);
  }

  walk(node);
  return references;
}

// =============================================================================
// Module Export Extraction
// =============================================================================

/**
 * Extract all exports from a module symbol, recursively handling nested namespaces.
 * Also resolves file-local types (like `type Vec = Vec1 | Vec2 | Vec3`) that are
 * referenced by exported declarations but not themselves exported.
 */
function extractModuleContent(moduleSymbol: ts.Symbol, context: TsExtractionContext): ExtractionResult {
  const { checker, printer } = context;
  const declarations: string[] = [];
  const nestedNamespaces = new Map<string, ExtractionResult>();
  const typeReferences = new Set<string>();
  const definedNames = new Set<string>();
  const visitedSourceFiles = new Set<ts.SourceFile>();
  const printedStatements = new Set<ts.Node>();

  let moduleExports: ts.Symbol[];
  try {
    moduleExports = checker.getExportsOfModule(moduleSymbol);
  } catch {
    return { declarations, nestedNamespaces, typeReferences, definedNames };
  }

  for (const exportSymbol of moduleExports) {
    const resolved = resolveSymbol(exportSymbol, checker);

    // Nested namespace: export * as X from './Y'
    if (isModuleSymbol(resolved)) {
      const nested = extractModuleContent(resolved, context);
      if (nested.declarations.length > 0 || nested.nestedNamespaces.size > 0) {
        nestedNamespaces.set(exportSymbol.name, nested);
        definedNames.add(exportSymbol.name);

        // Bubble up unresolved type refs from nested namespace
        for (const ref of nested.typeReferences) {
          if (!nested.definedNames.has(ref)) {
            typeReferences.add(ref);
          }
        }
      }

      continue;
    }

    // Value or type export
    definedNames.add(exportSymbol.name);

    const decls = resolved.getDeclarations();
    if (!decls || decls.length === 0) {
      continue;
    }

    for (const decl of decls) {
      const sourceFile = decl.getSourceFile();
      if (!sourceFile.fileName.includes('@jscad/modeling')) {
        continue;
      }

      visitedSourceFiles.add(sourceFile);

      // Collect type references from the declaration
      for (const ref of collectTypeReferences(decl)) {
        typeReferences.add(ref);
      }

      const text = printDeclarationText(
        {
          decl,
          resolved,
          exportName: exportSymbol.name,
          sourceFile,
          printedStatements,
        },
        context,
      );

      if (text) {
        declarations.push(text);
      }
    }
  }

  // --- Resolve file-local types ---
  // Some declarations reference non-exported types from their source file
  // (e.g. `type Vec = Vec1 | Vec2 | Vec3` in translate.d.ts).
  // We scan visited source files for matching type declarations.
  const localTypeDecls: string[] = [];
  for (const ref of typeReferences) {
    if (definedNames.has(ref) || builtinTypes.has(ref)) {
      continue;
    }

    for (const sourceFile of visitedSourceFiles) {
      let found = false;
      for (const statement of sourceFile.statements) {
        if (ts.isTypeAliasDeclaration(statement) && statement.name.text === ref) {
          localTypeDecls.push(
            addExportModifier(printer.printNode(ts.EmitHint.Unspecified, statement, sourceFile).trim()),
          );
          definedNames.add(ref);

          // oxlint-disable-next-line max-depth -- for completeness
          for (const innerRef of collectTypeReferences(statement)) {
            typeReferences.add(innerRef);
          }

          found = true;
          break;
        }

        if (ts.isInterfaceDeclaration(statement) && statement.name.text === ref) {
          localTypeDecls.push(
            addExportModifier(printer.printNode(ts.EmitHint.Unspecified, statement, sourceFile).trim()),
          );
          definedNames.add(ref);

          // oxlint-disable-next-line max-depth -- for completeness
          for (const innerRef of collectTypeReferences(statement)) {
            typeReferences.add(innerRef);
          }

          found = true;
          break;
        }
      }

      if (found) {
        break;
      }
    }
  }

  // Prepend local types so they appear before usages
  return {
    declarations: [...localTypeDecls, ...declarations],
    nestedNamespaces,
    typeReferences,
    definedNames,
  };
}

// =============================================================================
// Foundation Type Resolution
// =============================================================================

/**
 * Build a lookup from type name to its resolved symbol/source-file by scanning
 * the known foundation type files.
 */
function buildFoundationTypeMap(
  checker: ts.TypeChecker,
  program: ts.Program,
): Map<string, { symbol: ts.Symbol; sourceFile: ts.SourceFile }> {
  const map = new Map<string, { symbol: ts.Symbol; sourceFile: ts.SourceFile }>();

  for (const filePath of foundationTypeFiles) {
    const sourceFile = program.getSourceFile(filePath);
    if (!sourceFile) {
      continue;
    }

    const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
    if (!moduleSymbol) {
      continue;
    }

    let moduleExports: ts.Symbol[];
    try {
      moduleExports = checker.getExportsOfModule(moduleSymbol);
    } catch {
      continue;
    }

    for (const exp of moduleExports) {
      const resolved = resolveSymbol(exp, checker);
      const decls = resolved.getDeclarations();
      if (decls && decls.length > 0) {
        const declSourceFile = decls[0]!.getSourceFile();
        // Map by the export name (e.g. 'Vec3' from `export { default as Vec3 }`)
        map.set(exp.name, { symbol: resolved, sourceFile: declSourceFile });
        // Also map by the resolved symbol's own name — needed for default exports
        // where the export name is 'default' but the symbol name is 'RecursiveArray'
        if (resolved.name !== exp.name && resolved.name !== 'default') {
          map.set(resolved.name, {
            symbol: resolved,
            sourceFile: declSourceFile,
          });
        }
      }
    }
  }

  return map;
}

/**
 * Resolve foundation types: collect type definitions for all type references that
 * are not defined within any namespace (and are not built-in). Transitively
 * resolves types referenced by other foundation types.
 */
function resolveFoundationTypes(
  namespaces: Map<string, ExtractionResult>,
  context: TsExtractionContext,
): FoundationType[] {
  const { checker, printer, program } = context;
  const typeMap = buildFoundationTypeMap(checker, program);
  const resolved = new Map<string, FoundationType>();
  const pending = new Set<string>();

  // Collect all globally-defined names across namespaces
  const allDefinedNames = new Set<string>();
  function collectDefined(result: ExtractionResult): void {
    for (const name of result.definedNames) {
      allDefinedNames.add(name);
    }

    for (const nested of result.nestedNamespaces.values()) {
      collectDefined(nested);
    }
  }

  for (const ns of namespaces.values()) {
    collectDefined(ns);
  }

  // Seed with unresolved type references from all namespaces
  function collectUnresolved(result: ExtractionResult): void {
    for (const ref of result.typeReferences) {
      if (!result.definedNames.has(ref) && !builtinTypes.has(ref)) {
        pending.add(ref);
      }
    }

    for (const nested of result.nestedNamespaces.values()) {
      collectUnresolved(nested);
    }
  }

  for (const ns of namespaces.values()) {
    collectUnresolved(ns);
  }

  // Iteratively resolve until no new types are discovered
  while (pending.size > 0) {
    const name = pending.values().next().value!;
    pending.delete(name);

    if (resolved.has(name)) {
      continue;
    }

    const entry = typeMap.get(name);
    if (!entry) {
      continue;
    }

    const decls = entry.symbol.getDeclarations();
    if (!decls || decls.length === 0) {
      continue;
    }

    for (const decl of decls) {
      // Skip re-export nodes
      if (ts.isExportSpecifier(decl) || ts.isExportAssignment(decl)) {
        continue;
      }

      const declSourceFile = decl.getSourceFile();
      const text = addExportModifier(printer.printNode(ts.EmitHint.Unspecified, decl, declSourceFile).trim());

      // Transitively resolve referenced types
      for (const innerRef of collectTypeReferences(decl)) {
        if (!resolved.has(innerRef) && !allDefinedNames.has(innerRef) && !builtinTypes.has(innerRef)) {
          pending.add(innerRef);
        }
      }

      resolved.set(name, { name, declaration: text });
      break; // Use first valid declaration
    }
  }

  return [...resolved.values()];
}

// =============================================================================
// Output Generation
// =============================================================================

function indentBlock(text: string, spaces: number): string {
  const prefix = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((line) => (line.trim() ? prefix + line : ''))
    .join('\n');
}

function formatNamespaceBlock(name: string, content: ExtractionResult, spaces: number): string {
  const pad = ' '.repeat(spaces);
  const lines: string[] = [];

  lines.push(`${pad}export namespace ${name} {`);

  for (const decl of content.declarations) {
    lines.push(indentBlock(decl, spaces + 2));
  }

  for (const [nestedName, nestedContent] of content.nestedNamespaces) {
    lines.push(formatNamespaceBlock(nestedName, nestedContent, spaces + 2));
  }

  lines.push(`${pad}}`);
  return lines.join('\n');
}

/**
 * Collect the set of foundation type names that a namespace (and its nested
 * children) reference but do not define themselves.
 */
function getNeededImports(content: ExtractionResult, foundationTypeNames: Set<string>): Set<string> {
  const needed = new Set<string>();

  function collect(result: ExtractionResult): void {
    for (const ref of result.typeReferences) {
      if (!result.definedNames.has(ref) && foundationTypeNames.has(ref)) {
        needed.add(ref);
      }
    }

    for (const nested of result.nestedNamespaces.values()) {
      collect(nested);
    }
  }

  collect(content);
  return needed;
}

function generateOutput(
  namespaces: Map<string, ExtractionResult>,
  foundationTypes: FoundationType[],
): Record<string, string> {
  const modules: Record<string, string> = {};
  const foundationTypeNames = new Set(foundationTypes.map((ft) => ft.name));

  // ── Main module: @jscad/modeling ──────────────────────────────────────
  const mainLines: string[] = [
    '// Bundled type declarations for @jscad/modeling.',
    '// Auto-generated by extract-jscad-types.ts - do not edit manually.',
    '',
  ];

  if (foundationTypes.length > 0) {
    for (const ft of foundationTypes) {
      mainLines.push(ft.declaration);
    }
    mainLines.push('');
  }

  for (const [name, content] of namespaces) {
    mainLines.push(formatNamespaceBlock(name, content, 0), '');
  }

  modules['@jscad/modeling'] = mainLines.join('\n');

  // ── Subpath modules: @jscad/modeling/<name> ───────────────────────────
  for (const [name, content] of namespaces) {
    const subLines: string[] = [];

    const needed = getNeededImports(content, foundationTypeNames);
    if (needed.size > 0) {
      subLines.push(`import type { ${[...needed].sort().join(', ')} } from '@jscad/modeling';`);
      subLines.push('');
    }

    for (const decl of content.declarations) {
      subLines.push(decl);
    }

    for (const [nestedName, nestedContent] of content.nestedNamespaces) {
      subLines.push(formatNamespaceBlock(nestedName, nestedContent, 0));
    }

    modules[`@jscad/modeling/${name}`] = subLines.join('\n') + '\n';
  }

  return modules;
}

// =============================================================================
// Structured API Extraction (for JSON export)
// =============================================================================

/**
 * Extract parameter info from a function declaration.
 */
function extractParameters(decl: ts.FunctionDeclaration, checker: ts.TypeChecker): ApiEntry['parameters'] {
  return decl.parameters.map((parameter) => {
    const parameterType = parameter.type
      ? parameter.type.getText(parameter.getSourceFile())
      : checker.typeToString(checker.getTypeAtLocation(parameter));
    return {
      name: parameter.name.getText(parameter.getSourceFile()),
      type: parameterType,
      optional: Boolean(parameter.questionToken) || parameter.initializer !== undefined,
    };
  });
}

/**
 * Classify a declaration into its API entry kind.
 */
function classifyDeclaration(decl: ts.Declaration): ApiEntry['kind'] | undefined {
  if (ts.isFunctionDeclaration(decl)) {
    return 'function';
  }

  if (ts.isTypeAliasDeclaration(decl)) {
    return 'type';
  }

  if (ts.isInterfaceDeclaration(decl)) {
    return 'interface';
  }

  if (ts.isVariableDeclaration(decl)) {
    return 'constant';
  }

  if (ts.isEnumDeclaration(decl)) {
    return 'enum';
  }

  return undefined;
}

/**
 * Walk a module symbol and extract structured API entries.
 */
function extractStructuredEntries(
  moduleSymbol: ts.Symbol,
  modulePath: string,
  context: TsExtractionContext,
): ApiEntry[] {
  const { checker, printer } = context;
  const entries: ApiEntry[] = [];
  const seenNames = new Set<string>();

  let moduleExports: ts.Symbol[];
  try {
    moduleExports = checker.getExportsOfModule(moduleSymbol);
  } catch {
    return entries;
  }

  for (const exportSymbol of moduleExports) {
    const resolved = resolveSymbol(exportSymbol, checker);

    // Nested namespace
    if (isModuleSymbol(resolved)) {
      const nestedPath = modulePath ? `${modulePath}.${exportSymbol.name}` : exportSymbol.name;
      entries.push(...extractStructuredEntries(resolved, nestedPath, context));
      continue;
    }

    const { name } = exportSymbol;
    if (seenNames.has(name)) {
      continue;
    }

    const decls = resolved.getDeclarations();
    if (!decls || decls.length === 0) {
      continue;
    }

    // Use the first declaration for classification and signature
    const primaryDecl = decls[0]!;
    if (!primaryDecl.getSourceFile().fileName.includes('@jscad/modeling')) {
      continue;
    }

    const kind = classifyDeclaration(primaryDecl);
    if (!kind) {
      continue;
    }

    seenNames.add(name);

    // Build signature from all declarations (function overloads)
    const signatures: string[] = [];
    for (const decl of decls) {
      const sourceFile = decl.getSourceFile();
      if (!sourceFile.fileName.includes('@jscad/modeling')) {
        continue;
      }

      const classifiedKind = classifyDeclaration(decl);
      if (!classifiedKind) {
        continue;
      }

      const text = printer.printNode(ts.EmitHint.Unspecified, decl, sourceFile).trim();
      signatures.push(text);
    }

    const entry: ApiEntry = {
      name,
      kind,
      module: modulePath,
      signature: signatures.join('\n'),
    };

    // Extract parameter/return info for functions
    if (kind === 'function' && ts.isFunctionDeclaration(primaryDecl)) {
      entry.parameters = extractParameters(primaryDecl, checker);
      const returnType = primaryDecl.type
        ? primaryDecl.type.getText(primaryDecl.getSourceFile())
        : checker.typeToString(checker.getReturnTypeOfSignature(checker.getSignatureFromDeclaration(primaryDecl)!));
      entry.returnType = returnType;
    }

    entries.push(entry);
  }

  return entries;
}

/**
 * Build the full structured API data JSON.
 * Exported for testing.
 */
export function buildApiData(): ApiData {
  const program = createJscadProgram();
  const checker = program.getTypeChecker();
  const printer = ts.createPrinter({ removeComments: true });

  const mainSourceFile = program.getSourceFile(entryPath);
  if (!mainSourceFile) {
    throw new Error(`Could not load entry path: ${entryPath}`);
  }

  const mainModuleSymbol = checker.getSymbolAtLocation(mainSourceFile);
  if (!mainModuleSymbol) {
    throw new Error('Could not resolve module symbol for entry path');
  }

  const rootExports = checker.getExportsOfModule(mainModuleSymbol);
  const allEntries: ApiEntry[] = [];

  const context: TsExtractionContext = { checker, printer, program };
  for (const nsExport of rootExports) {
    const resolved = resolveSymbol(nsExport, checker);
    if (!isModuleSymbol(resolved)) {
      continue;
    }

    allEntries.push(...extractStructuredEntries(resolved, nsExport.name, context));
  }

  // Add foundation types as top-level entries
  const foundationTypes = resolveFoundationTypes(
    new Map(
      rootExports
        .filter((ns) => isModuleSymbol(resolveSymbol(ns, checker)))
        .map((ns) => [ns.name, extractModuleContent(resolveSymbol(ns, checker), context)]),
    ),
    context,
  );

  for (const ft of foundationTypes) {
    // Determine kind from the declaration text
    let kind: ApiEntry['kind'] = 'type';
    if (ft.declaration.includes('interface ')) {
      kind = 'interface';
    }

    allEntries.push({
      name: ft.name,
      kind,
      module: '@jscad/modeling',
      signature: ft.declaration,
    });
  }

  const breakdown: Record<string, number> = {};
  for (const entry of allEntries) {
    breakdown[entry.kind] = (breakdown[entry.kind] ?? 0) + 1;
  }

  return {
    metadata: {
      extractionDate: new Date().toISOString(),
      source: 'TypeScript Compiler API (@jscad/modeling)',
      totalEntries: allEntries.length,
      breakdown,
    },
    entries: allEntries,
  };
}

// =============================================================================
// Main Pipeline
// =============================================================================

/**
 * Build the bundled type declarations as a map of module path to raw `.d.ts`
 * content. Each entry is registered at its own virtual file path in Monaco.
 * Exported for testing.
 */
export function buildNamespaceBundle(): Record<string, string> {
  const program = createJscadProgram();
  const checker = program.getTypeChecker();
  const printer = ts.createPrinter({ removeComments: true });

  // Get root module
  const mainSourceFile = program.getSourceFile(entryPath);
  if (!mainSourceFile) {
    throw new Error(`Could not load entry path: ${entryPath}`);
  }

  const mainModuleSymbol = checker.getSymbolAtLocation(mainSourceFile);
  if (!mainModuleSymbol) {
    throw new Error('Could not resolve module symbol for entry path');
  }

  const rootExports = checker.getExportsOfModule(mainModuleSymbol);
  console.log(`Found ${rootExports.length} top-level namespace exports`);

  const context: TsExtractionContext = { checker, printer, program };
  const namespaces = new Map<string, ExtractionResult>();

  for (const nsExport of rootExports) {
    const resolved = resolveSymbol(nsExport, checker);

    if (!isModuleSymbol(resolved)) {
      console.log(`  Skipping non-module export: ${nsExport.name}`);
      continue;
    }

    console.log(`  Processing namespace: ${nsExport.name}`);
    const content = extractModuleContent(resolved, context);
    namespaces.set(nsExport.name, content);

    const declCount = content.declarations.length;
    const nestedCount = content.nestedNamespaces.size;
    console.log(`    ${declCount} declarations, ${nestedCount} nested namespaces`);
  }

  // Resolve foundation types
  console.log('\nResolving foundation types...');
  const foundationTypes = resolveFoundationTypes(namespaces, context);
  console.log(
    `Resolved ${foundationTypes.length} foundation types: ${foundationTypes.map((ft) => ft.name).join(', ')}`,
  );

  return generateOutput(namespaces, foundationTypes);
}

function main(): void {
  try {
    console.log('Extracting @jscad/modeling type declarations...\n');

    const outputDirectory = join(import.meta.dirname, 'generated/jscad');
    mkdirSync(outputDirectory, { recursive: true });
    console.log(`Output directory: ${outputDirectory}`);

    // Generate bundled types (one raw .d.ts per module)
    const bundledTypes = buildNamespaceBundle();
    const outputPath = join(outputDirectory, 'jscad-modeling.bundled.json');
    writeFileSync(outputPath, JSON.stringify(bundledTypes));
    console.log(`\nBundled type declarations written to ${outputPath}`);
    const moduleNames = Object.keys(bundledTypes);
    console.log(`Generated ${moduleNames.length} module declarations:`);
    for (const name of moduleNames) {
      console.log(`  - ${name} (${(bundledTypes[name]!.length / 1024).toFixed(1)} KB)`);
    }

    // Write individual .d.ts files for type-level testing
    const modulesDirectory = join(outputDirectory, 'modules');
    for (const [modulePath, content] of Object.entries(bundledTypes)) {
      const targetDirectory = join(modulesDirectory, modulePath);
      mkdirSync(targetDirectory, { recursive: true });
      writeFileSync(join(targetDirectory, 'index.d.ts'), content);
    }

    // Generate structured JSON
    console.log('\n📝 Generating structured API data JSON...');
    const apiData = buildApiData();
    const jsonPath = join(outputDirectory, 'jscad-api-data.json');
    writeFileSync(jsonPath, JSON.stringify(apiData, null, 2));
    console.log(`✅ API data JSON saved to ${jsonPath}`);
    console.log(
      `   ${apiData.metadata.totalEntries} entries: ${Object.entries(apiData.metadata.breakdown)
        .map(([k, v]) => `${v} ${k}s`)
        .join(', ')}`,
    );

    console.log('\n@jscad/modeling type extraction completed successfully!');
  } catch (error) {
    console.error('Error during @jscad/modeling type extraction:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
