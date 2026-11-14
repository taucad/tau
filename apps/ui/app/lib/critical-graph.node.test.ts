// @vitest-environment node
/*
 * The critical module graph per route (app-entry loading blueprint GM5, first slice; LB4c).
 *
 * Each route class names modules its entry must not reach through a static import, so they load on
 * demand instead of before the route's first action. Each row is a red edge, not a snapshot of today's
 * graph: a snapshot passes on the commit that takes it, an edge row fails on the import it forbids.
 *
 * - The compiled skill bodies (D4) are read only when a resolver call or a system skill row needs them,
 *   so the catalog, the RPC handlers and the transcript's skill rows reach them through
 *   `lib/lazy-skill-resolver.ts`.
 *
 * The walk follows the app's own specifiers (`#…` through the package imports map, and relative paths),
 * and each build variant beside a module (`.cloud`, `.self-host`, `.desktop`). A bare package specifier is
 * a leaf named `npm:<specifier>`: workspace packages are not walked, and none of them imports the skill
 * resources. Declaration-level `import type` and `export type` erase, and `import()` is the lazy edge, so
 * neither is followed. The production build is the authority on chunks; this is the CI-runnable gate.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Modules every route's document evaluates before the route module itself. */
const shellRoots = ['entry.client.tsx', 'root.tsx'] as const;

/**
 * The route classes: each one's open graph and the modules it must reach only through a dynamic import.
 *
 * A route's open graph is its static closure plus the dynamic chunks it requests on every open: for the
 * project route, its deferred editor (`project-live-sessions`) and the viewport's chat interface, which
 * holds the transcript and the composer; for Home, the rich composer (`new-project-chat-composer`, which
 * `useNewProjectComposer` requests at mount). A module those chunks reach statically is fetched and
 * evaluated on every open, whether or not it renders.
 */
const routeClasses = [
  {
    name: 'project route',
    roots: [
      ...shellRoots,
      'routes/w.$workspace.$project/route.tsx',
      'routes/w.$workspace.$project/project-live-sessions.tsx',
      'routes/w.$workspace.$project/chat-interface-desktop.tsx',
      'routes/w.$workspace.$project/chat-interface-mobile.tsx',
    ],
    lazyOnly: ['lib/system-skills-catalog', 'npm:@taucad/skills/resources'],
  },
  {
    name: 'Home',
    roots: [...shellRoots, 'routes/_index/route.tsx', 'components/chat/new-project-chat-composer.tsx'],
    lazyOnly: ['lib/system-skills-catalog', 'npm:@taucad/skills/resources'],
  },
] as const;

const extensions = ['.ts', '.tsx', '.js', '.jsx'];
const variants = ['', '.cloud', '.self-host', '.desktop'];
const packagePrefix = 'npm:';

const toPosix = (path: string): string => path.split(sep).join('/');

/** Every file a specifier may resolve to across builds, or the package leaf for a bare specifier. */
function resolveSpecifier(specifier: string, importer: string): string[] {
  const [path = ''] = specifier.split('?', 1);
  let base: string;
  if (path.startsWith('#')) {
    base = join(appRoot, path.slice(1));
  } else if (path.startsWith('.')) {
    base = resolve(dirname(importer), path);
  } else {
    return [`${packagePrefix}${path}`];
  }
  base = base.replace(/\.(?:[cm]?js|jsx)$/u, '');
  const candidates = [
    ...variants.flatMap((variant) => extensions.map((extension) => `${base}${variant}${extension}`)),
    ...extensions.map((extension) => join(base, `index${extension}`)),
  ];
  return candidates.filter((candidate) => existsSync(candidate));
}

/** `import { type X } from '…'` keeps a side-effect import under `verbatimModuleSyntax`; only `import type` erases. */
function isTypeOnlyImport(statement: ts.ImportDeclaration): boolean {
  return statement.importClause?.phaseModifier === ts.SyntaxKind.TypeKeyword;
}

const specifiersOf = new Map<string, string[]>();

/** The specifiers a module loads statically: value imports and re-exports. Each file is parsed once per run. */
function staticSpecifiers(file: string): string[] {
  const cached = specifiersOf.get(file);
  if (cached !== undefined) {
    return cached;
  }
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.ESNext,
    false,
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
  specifiersOf.set(file, specifiers);
  return specifiers;
}

/** The static graph from app-relative roots: each reached node and the file that first imported it. */
function staticGraph(fromRoots: readonly string[]): Map<string, string | undefined> {
  const importerOf = new Map<string, string | undefined>();
  const queue = fromRoots.map((root) => join(appRoot, root));
  for (const file of queue) {
    importerOf.set(file, undefined);
  }
  // The iterator reads the queue's length each step, so it walks what the loop appends.
  for (const file of queue) {
    if (file.startsWith(packagePrefix)) {
      continue;
    }
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

const nameOf = (node: string): string => (node.startsWith(packagePrefix) ? node : toPosix(relative(appRoot, node)));

/** The import chain from a root to each lazy-only module the graph reaches. */
function staticEdges(graph: Map<string, string | undefined>, lazyOnly: readonly string[]): string[] {
  const found: string[] = [];
  for (const module of lazyOnly) {
    const reached = [...graph.keys()].find((node) => {
      const name = nameOf(node);
      return module.startsWith(packagePrefix) ? name === module : name.startsWith(`${module}.`);
    });
    if (reached === undefined) {
      continue;
    }
    const chain: string[] = [];
    for (let node: string | undefined = reached; node !== undefined; node = graph.get(node)) {
      chain.unshift(nameOf(node));
    }
    found.push(`${module} is reached statically: ${chain.join(' -> ')}`);
  }
  return found;
}

describe('critical module graph', () => {
  const graphs = new Map<string, Map<string, string | undefined>>();
  const graphOf = (name: string): Map<string, string | undefined> => {
    const graph = graphs.get(name);
    if (graph === undefined) {
      throw new Error(`No graph walked for ${name}`);
    }
    return graph;
  };

  // One walk per route class, shared by the cases below: parsing the app is the cost, not the checks.
  beforeAll(() => {
    for (const { name, roots } of routeClasses) {
      graphs.set(name, staticGraph(roots));
    }
  });

  it.each(routeClasses)("should keep the $name's static graph off its on-demand modules", ({ name, lazyOnly }) => {
    const problems = staticEdges(graphOf(name), lazyOnly);
    expect(problems, problems.join('\n')).toEqual([]);
  });

  it.each(routeClasses)("should walk the $name's composer", ({ name }) => {
    const reached = new Set([...graphOf(name).keys()].map((node) => nameOf(node)));
    expect(reached).toContain('components/chat/chat-textarea-desktop.tsx');
    expect(reached).toContain('hooks/use-skills-catalog.ts');
  });

  it('should walk the transcript into its tool parts', () => {
    const reached = new Set([...graphOf('project route').keys()].map((node) => nameOf(node)));
    expect(reached).toContain('routes/w.$workspace.$project/chat-message.tsx');
    expect(reached).toContain('routes/w.$workspace.$project/chat-message-tool-shell.tsx');
  });

  it('should find a static edge to an on-demand module when one exists', () => {
    expect(staticEdges(staticGraph(['lib/skill-resolver.ts']), ['npm:@taucad/skills/resources'])).toEqual([
      'npm:@taucad/skills/resources is reached statically: lib/skill-resolver.ts -> lib/system-skills-catalog.ts -> npm:@taucad/skills/resources',
    ]);
  });
});
