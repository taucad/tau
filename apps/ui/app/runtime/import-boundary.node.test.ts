// @vitest-environment node
/*
 * The runtime's import boundary (app state orchestration charter D5; plan § 4 A1a, R2-F16).
 *
 * The project runtime, the revision lifecycle and the host connector are lazy session children, loaded by dynamic
 * import. So neither entry nor the root route may reach them, or the project and editor machines, through a static
 * import: the welcome and root chunks are budgeted (`scripts/check-ssr-bundle-budget.mts`) and must not carry the
 * editor. The first three modules do not exist yet; their paths are named now so the lanes that add them (A6) land
 * behind this test.
 *
 * The walk follows the app's own specifiers (`#…` through the package imports map, and relative paths). For every
 * build-selected module it follows each variant beside it (`.cloud`, `.self-host`, `.desktop`), so the check holds
 * for every build. Type-only imports and exports erase, and `import()` is the lazy edge, so neither is followed.
 * Workspace packages never import `apps/ui/app`, so they are not walked.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The roots of the graph: both entries and the root route. */
const roots = ['entry.client.tsx', 'entry.server.tsx', 'root.tsx'] as const;

/** Modules only a session's dynamic import may load (D5), and the two machines they compose. */
const lazyOnly = [
  'runtime/project-runtime',
  'runtime/session-revisions',
  'runtime/host-connector',
  'machines/project.machine',
  'machines/editor.machine',
] as const;

const extensions = ['.ts', '.tsx', '.js', '.jsx'];
const variants = ['', '.cloud', '.self-host', '.desktop'];

const toPosix = (path: string): string => path.split(sep).join('/');

/** Every file a specifier may resolve to across builds; empty for a package specifier. */
function resolveSpecifier(specifier: string, importer: string): string[] {
  const [path = ''] = specifier.split('?', 1);
  let base: string;
  if (path.startsWith('#')) {
    base = join(appRoot, path.slice(1));
  } else if (path.startsWith('.')) {
    base = resolve(dirname(importer), path);
  } else {
    return [];
  }
  base = base.replace(/\.(?:[cm]?js|jsx)$/u, '');
  const candidates = [
    ...variants.flatMap((variant) => extensions.map((extension) => `${base}${variant}${extension}`)),
    ...extensions.map((extension) => join(base, `index${extension}`)),
  ];
  return candidates.filter((candidate) => existsSync(candidate));
}

function isTypeOnlyImport(statement: ts.ImportDeclaration): boolean {
  const clause = statement.importClause;
  if (clause === undefined) {
    return false;
  }
  if (clause.isTypeOnly) {
    return true;
  }
  const bindings = clause.namedBindings;
  return (
    clause.name === undefined &&
    bindings !== undefined &&
    ts.isNamedImports(bindings) &&
    bindings.elements.length > 0 &&
    bindings.elements.every((element) => element.isTypeOnly)
  );
}

/** The specifiers a module loads statically: value imports and re-exports. */
function staticSpecifiers(file: string): string[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.ESNext,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const specifiers: string[] = [];
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      if (!isTypeOnlyImport(statement)) {
        specifiers.push(statement.moduleSpecifier.text);
      }
    } else if (
      ts.isExportDeclaration(statement) &&
      !statement.isTypeOnly &&
      statement.moduleSpecifier !== undefined &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      specifiers.push(statement.moduleSpecifier.text);
    }
  }
  return specifiers;
}

/** The static module graph from the given app-relative roots: each reached file and the file that first imported it. */
function staticGraph(fromRoots: readonly string[]): Map<string, string | undefined> {
  const importerOf = new Map<string, string | undefined>();
  const queue = fromRoots.map((root) => join(appRoot, root));
  for (const file of queue) {
    importerOf.set(file, undefined);
  }
  for (let index = 0; index < queue.length; index += 1) {
    const file = queue[index] ?? '';
    for (const specifier of staticSpecifiers(file)) {
      for (const target of resolveSpecifier(specifier, file)) {
        if (!importerOf.has(target)) {
          importerOf.set(target, file);
          queue.push(target);
        }
      }
    }
  }
  return importerOf;
}

/** The import chain from a root to each lazy-only module the graph reaches. */
function lazyOnlyEdges(graph: Map<string, string | undefined>): string[] {
  const found: string[] = [];
  for (const module of lazyOnly) {
    const reached = [...graph.keys()].find((file) => toPosix(relative(appRoot, file)).startsWith(`${module}.`));
    if (reached === undefined) {
      continue;
    }
    const chain: string[] = [];
    for (let file: string | undefined = reached; file !== undefined; file = graph.get(file)) {
      chain.unshift(toPosix(relative(appRoot, file)));
    }
    found.push(`${module} is reached statically: ${chain.join(' -> ')}`);
  }
  return found;
}

describe('runtime import boundary', () => {
  it('should keep the entries and the root route off the lazy session children (D5)', () => {
    const problems = lazyOnlyEdges(staticGraph(roots));
    expect(problems, problems.join('\n')).toEqual([]);
  });

  it('should walk the runtime the entries compose', () => {
    const reached = new Set([...staticGraph(roots).keys()].map((file) => toPosix(relative(appRoot, file))));
    expect(reached).toContain('runtime/app-runtime.ts');
    expect(reached).toContain('runtime/app-runtime-provider.tsx');
    expect(reached).toContain('hooks/use-sessions.tsx');
    expect(reached).toContain('cloud/root-billing.cloud.tsx');
  });

  it('should find a static edge to a lazy-only module when one exists', () => {
    expect(lazyOnlyEdges(staticGraph(['hooks/use-project.tsx']))).toEqual([
      'machines/project.machine is reached statically: hooks/use-project.tsx -> machines/project.machine.ts',
      'machines/editor.machine is reached statically: hooks/use-project.tsx -> machines/editor.machine.ts',
    ]);
  });
});
