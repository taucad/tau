#!/usr/bin/env node

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import ts from 'typescript';

/**
 * Bundle libcascade type declarations as raw `.d.ts` for Monaco's
 * `addExtraLib`.
 *
 * Reads `libcascade`'s own `dist/types.d.ts` (emitted by `libcascade
 * assemble`) from the installed package and shards it into one module per OCCT
 * package — the prefix before the first `_`, which is OCCT's own naming
 * convention (blueprint ruling R14). Declaration text is passed through
 * byte-for-byte; only the module framing (imports, export lists) is generated.
 *
 * Monaco registers the root at `file:///node_modules/libcascade/index.d.ts`
 * and each shard at `file:///node_modules/libcascade/<Package>/index.d.ts`,
 * relying on standard TypeScript module resolution.
 */

// =============================================================================
// Configuration
// =============================================================================

// Resolved, not path-joined: `libcascade` is a workspace dependency, so its
// install location is the package manager's business, not this script's.
//
// Nx cannot hash this source: its file map excludes `node_modules`, so a
// `{workspaceRoot}/node_modules/...` input — glob or explicit path — matches
// nothing and never invalidates. `pnpm-lock.yaml` is the target's real input.
const opencascadeDtsPath = join(
  dirname(createRequire(import.meta.url).resolve('libcascade/package.json')),
  'dist/types.d.ts',
);

/**
 * Authoring-core OCCT packages (R14). These shards materialize eagerly; every
 * other shard is cold and is fetched on demand.
 */
const eagerShards: ReadonlySet<string> = new Set([
  'gp',
  'Geom',
  'Geom2d',
  'TopoDS',
  'TopExp',
  'BRep',
  'BRepPrimAPI',
  'BRepBuilderAPI',
  'BRepAlgoAPI',
  'BRepFilletAPI',
  'BRepOffsetAPI',
  'STEPControl',
  'StlAPI',
  // The package's own surface, reachable from the root module's default export.
  'OpenCascadeInstance',
  'InitOpenCascadeOptions',
  'LibcascadeVariant',
  'CreateInstanceOptions',
]);

/** Package root module specifier. */
const packageName = 'libcascade';

// =============================================================================
// Parsing
// =============================================================================

type Declaration = {
  /** Declared symbol name. */
  name: string;
  /** Verbatim source text, including leading JSDoc. */
  text: string;
  /** Whether the declaration text already carries an `export` modifier. */
  selfExported: boolean;
};

type ParsedSurface = {
  /** Leading file comments, verbatim. */
  header: string;
  /** Statements that declare no addressable symbol (`declare global`), verbatim. */
  rootStatements: string[];
  /** Every named top-level declaration, in source order. */
  declarations: Declaration[];
  /** Names the upstream file exports as runtime values. */
  valueExports: Set<string>;
};

/**
 * Return the OCCT package a symbol belongs to: the prefix before its first
 * underscore, or the whole name when it has none (R14).
 *
 * @param name - Declared symbol name.
 * @returns The shard name.
 */
export function shardOf(name: string): string {
  const separator = name.indexOf('_');
  return separator === -1 ? name : name.slice(0, separator);
}

/**
 * Return the symbol a top-level statement declares, or `undefined` when it
 * declares none: `declare global` augments the ambient scope rather than
 * adding an addressable name, so it stays in the package root.
 *
 * @param statement - Top-level statement.
 * @returns The declared name, when there is one.
 */
function declaredName(statement: ts.Statement): string | undefined {
  if (ts.isModuleDeclaration(statement) && ts.isIdentifier(statement.name) && statement.name.text === 'global') {
    return undefined;
  }
  if (ts.isVariableStatement(statement)) {
    const [declaration] = statement.declarationList.declarations;
    return declaration && ts.isIdentifier(declaration.name) ? declaration.name.text : undefined;
  }
  const { name } = statement as ts.DeclarationStatement;
  return name !== undefined && ts.isIdentifier(name) ? name.text : undefined;
}

/**
 * Parse the upstream declaration file into its named declarations, its
 * unnamed root statements and its runtime-value export list.
 *
 * @param content - Raw `types.d.ts` source.
 * @returns The parsed surface.
 */
function parseSurface(content: string): ParsedSurface {
  const source = ts.createSourceFile('types.d.ts', content, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const declarations: Declaration[] = [];
  const rootStatements: string[] = [];
  const valueExports = new Set<string>();
  let header: string | undefined;

  for (const statement of source.statements) {
    // A declaration starts at its own JSDoc block when it has one, so the
    // documentation travels with the declaration into its shard. Everything
    // before the first declaration is the file header.
    const jsdoc = (ts.getLeadingCommentRanges(content, statement.pos) ?? []).findLast(
      (range) => range.kind === ts.SyntaxKind.MultiLineCommentTrivia && content.startsWith('/**', range.pos),
    );
    const start = jsdoc?.pos ?? statement.getStart(source);
    header ??= content.slice(0, start).trim();
    const text = content.slice(start, statement.end).trim();

    if (ts.isExportDeclaration(statement)) {
      const { exportClause } = statement;
      if (exportClause && ts.isNamedExports(exportClause) && !statement.isTypeOnly) {
        for (const element of exportClause.elements) {
          valueExports.add(element.name.text);
        }
      }
      continue;
    }

    const name = declaredName(statement);
    if (name === undefined) {
      rootStatements.push(text);
      continue;
    }
    declarations.push({
      name,
      text,
      selfExported:
        ts.canHaveModifiers(statement) &&
        (ts.getModifiers(statement) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
    });
  }

  if (declarations.length === 0 || valueExports.size === 0) {
    throw new Error(`Parsed no declarations or no value exports from ${opencascadeDtsPath}`);
  }

  return { header: header ?? '', rootStatements, declarations, valueExports };
}

// =============================================================================
// Sharding
// =============================================================================

const commentPattern = /\/\*[\S\s]*?\*\/|\/\/[^\n]*/g;
const identifierPattern = /[$A-Z_a-z][\w$]*/g;

/**
 * Build the bundled type declarations as a map of module specifier to raw
 * `.d.ts` content: the package root plus one module per OCCT package.
 * Exported for testing.
 *
 * @returns Module specifier to declaration text.
 */
export function buildBundledTypes(): Record<string, string> {
  const content = readFileSync(opencascadeDtsPath, 'utf8');
  const { header, rootStatements, declarations, valueExports } = parseSurface(content);

  const owner = new Map<string, string>();
  const shards = new Map<string, Declaration[]>();
  for (const declaration of declarations) {
    const shard = shardOf(declaration.name);
    owner.set(declaration.name, shard);
    const members = shards.get(shard);
    if (members === undefined) {
      shards.set(shard, [declaration]);
    } else {
      members.push(declaration);
    }
  }

  const bundled: Record<string, string> = {};
  for (const [shard, members] of shards) {
    const ownNames = new Set(members.map((member) => member.name));
    const body = members.map((member) => member.text).join('\n\n');

    // Every foreign symbol the shard mentions is imported. Comments are
    // stripped first; an over-import (a member name that collides with a
    // declared symbol) is still a valid import, so precision is not required.
    const foreign = new Map<string, Set<string>>();
    for (const identifier of body.replaceAll(commentPattern, ' ').matchAll(identifierPattern)) {
      const name = identifier[0];
      if (ownNames.has(name)) {
        continue;
      }
      const foreignShard = owner.get(name);
      if (foreignShard === undefined) {
        continue;
      }
      const names = foreign.get(foreignShard);
      if (names === undefined) {
        foreign.set(foreignShard, new Set([name]));
      } else {
        names.add(name);
      }
    }

    // A name can carry two declarations (an enum's `declare const` and its
    // sibling type alias); one export entry covers both meanings. Declarations
    // that already carry an `export` modifier need no generated entry.
    const selfExported = new Set(members.filter((member) => member.selfExported).map((member) => member.name));
    const exportedNames = [...ownNames].filter((name) => !selfExported.has(name));
    const values = exportedNames.filter((name) => valueExports.has(name));
    const types = exportedNames.filter((name) => !valueExports.has(name));

    bundled[`${packageName}/${shard}`] = [
      `// Bundled type declarations for ${packageName} package ${shard}.`,
      '// Auto-generated by extract-opencascade-types.ts - do not edit manually.',
      '',
      ...[...foreign.keys()].sort().map(
        (foreignShard) =>
          `import {\n${[...(foreign.get(foreignShard) ?? [])]
            .sort()
            .map((name) => `  ${name},`)
            .join('\n')}\n} from '../${foreignShard}/index.js';`,
      ),
      '',
      body,
      '',
      ...(values.length > 0 ? [`export {\n${values.map((name) => `  ${name},`).join('\n')}\n};`] : []),
      ...(types.length > 0 ? [`export type {\n${types.map((name) => `  ${name},`).join('\n')}\n};`] : []),
      '',
    ].join('\n');
  }

  const instanceShard = owner.get('OpenCascadeInstance');
  if (instanceShard === undefined) {
    throw new Error('libcascade declarations no longer expose OpenCascadeInstance');
  }

  bundled[packageName] = [
    `// Bundled type declarations for ${packageName}.`,
    '// Auto-generated by extract-opencascade-types.ts - do not edit manually.',
    '',
    header,
    '',
    ...rootStatements,
    '',
    ...[...shards.keys()].sort().map((shard) => `export * from './${shard}/index.js';`),
    '',
    `import { OpenCascadeInstance } from './${instanceShard}/index.js';`,
    '',
    'declare const oc: OpenCascadeInstance;',
    'export default oc;',
    '',
  ].join('\n');

  return bundled;
}

/**
 * Split shard specifiers into the eager authoring core and the cold tail (R14).
 *
 * @param bundledTypes - Declaration map keyed by module specifier.
 * @returns Shard names by tier, each sorted.
 */
export function buildShardTiers(bundledTypes: Record<string, string>): { eager: string[]; cold: string[] } {
  const eager: string[] = [];
  const cold: string[] = [];
  for (const specifier of Object.keys(bundledTypes)) {
    if (!specifier.startsWith(`${packageName}/`)) {
      continue;
    }
    const shard = specifier.slice(packageName.length + 1);
    (eagerShards.has(shard) ? eager : cold).push(shard);
  }
  return { eager: eager.sort(), cold: cold.sort() };
}

// =============================================================================
// Output
// =============================================================================

/**
 * Write the bundled declaration map, its shard tier manifest and the exact
 * filesystem projection Monaco mounts.
 *
 * @param options - Generated output root and optional declaration map.
 */
export function writeBundledTypes({
  outputDirectory,
  bundledTypes = buildBundledTypes(),
}: {
  outputDirectory: string;
  bundledTypes?: Record<string, string>;
}): void {
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(join(outputDirectory, 'opencascade.bundled.json'), JSON.stringify(bundledTypes));
  writeFileSync(
    join(outputDirectory, 'opencascade.shards.json'),
    `${JSON.stringify(buildShardTiers(bundledTypes), undefined, 2)}\n`,
  );

  const modulesDirectory = join(outputDirectory, 'modules');
  rmSync(modulesDirectory, { recursive: true, force: true });
  for (const [modulePath, content] of Object.entries(bundledTypes)) {
    const targetDirectory = join(modulesDirectory, modulePath);
    mkdirSync(targetDirectory, { recursive: true });
    writeFileSync(join(targetDirectory, 'index.d.ts'), content);
  }
}

// =============================================================================
// Main
// =============================================================================

function main(): void {
  try {
    console.log('Extracting libcascade type declarations...\n');

    const outputDirectory = join(import.meta.dirname, 'generated/opencascade');
    console.log(`Source: ${opencascadeDtsPath}`);
    console.log(`Output directory: ${outputDirectory}`);

    const bundledTypes = buildBundledTypes();
    writeBundledTypes({ outputDirectory, bundledTypes });

    const { eager, cold } = buildShardTiers(bundledTypes);
    const bytesOf = (shard: string): number => (bundledTypes[`${packageName}/${shard}`] ?? '').length;
    const sum = (shardNames: readonly string[]): number =>
      shardNames.reduce((total, shard) => total + bytesOf(shard), 0);
    const rootBytes = (bundledTypes[packageName] ?? '').length;

    console.log(`\nBundled type declarations written to ${outputDirectory}`);
    console.log(`  root ${packageName}: ${(rootBytes / 1024).toFixed(1)} KB`);
    console.log(`  shards: ${eager.length + cold.length} (${eager.length} eager, ${cold.length} cold)`);
    console.log(`  eager tier incl. root: ${((rootBytes + sum(eager)) / 1024).toFixed(1)} KB`);
    console.log(`  cold tier: ${(sum(cold) / 1024 / 1024).toFixed(2)} MB`);
    console.log('\nlibcascade type extraction completed successfully!');
  } catch (error) {
    console.error('Error during libcascade type extraction:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
