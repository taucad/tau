// @vitest-environment node
/*
 * The critical module graph per route (app-entry loading blueprint GM5, first slice; LB4c), and guard G2 of the
 * progressive loading architecture.
 *
 * Each route class names modules its entry must not reach through a static import, so they load on demand instead
 * of before the route's first action. Each row is a red edge, not a snapshot of today's graph: a snapshot passes on
 * the commit that takes it, an edge row fails on the import it forbids.
 *
 * - The compiled skill bodies (D4) are read only when a resolver call or a system skill row needs them,
 *   so the catalog, the RPC handlers and the transcript's skill rows reach them through
 *   `lib/lazy-skill-resolver.ts`.
 * - The RPC handler stack (LB4d) runs only when a tool call runs: `hooks/rpc-handlers` and the handlers
 *   behind `@taucad/chat/rpc`, whose `install_packages` handler brings `@taucad/bundler-core`'s package
 *   resolver and `semver`. The Packages panel's Install action and the debug probes import it on demand.
 * - The viewer tier (PL5) loads when its pane mounts: the viewport's `chat-viewer` (three.js, the viewer package
 *   and the runtime client), the code viewer (CodeMirror), the printer viewer (react-three), the canonical part
 *   visuals of the part thumbnails (three.js) and the print preparation (the agent-tool registry and its RPC stack).
 * - The heavy list (`scripts/critical-path.mts`: the AI SDK, three.js, the runtime's root entry, kernels, the
 *   editor, telemetry) belongs to the deferred tier. Each class reaches some of it today; {@link knownHeavyReach}
 *   names each family with the work package that removes it. A family reached and not listed fails, and so does a
 *   listed family no longer reached, so the list only shrinks.
 *
 * The walk follows the app's own specifiers (`#…` through the package imports map, and relative paths), and each
 * build variant beside an app module (`.cloud`, `.self-host`, `.desktop`). A bare specifier is a node named
 * `npm:<specifier>`. When it names a workspace package, the walk goes on into the file its `exports` map resolves
 * to for the browser build, and from there through that package's own `#…` imports and relative paths; a heavy
 * specifier stops the walk, since reaching it is already the finding. Declaration-level `import type` and
 * `export type` erase, `import()` is the lazy edge, and a `?url`, `?raw` or `?worker` import evaluates nothing, so
 * none of them is followed. The production build is the authority on chunks (`scripts/check-critical-budget.mts`,
 * G3); this is the fast, source-level gate that prints the import chain.
 */

import { existsSync, globSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';
import { criticalRouteClasses, heavyFamilyOfSpecifier, heavySpecifiers } from '#scripts/critical-path.mts';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = resolve(appRoot, '../../..');

/** Modules no route class may reach statically; each one names its owning removal in the header. */
const onDemandModules = [
  'lib/system-skills-catalog',
  'npm:@taucad/skills/resources',
  'hooks/rpc-handlers',
  'npm:@taucad/chat/rpc',
  'routes/w.$workspace.$project/chat-viewer',
  'routes/w.$workspace.$project/chat-editor-code-viewer',
  'components/printer/printer-viewer',
  'services/part-thumbnail-visual',
  'routes/w.$workspace.$project/chat-print-prepare',
] as const;

/**
 * The heavy families each route class reaches statically today, with the work package that takes each one off the
 * class's interactive tier (Brain `research/progressive-loading-architecture.md`, Recommendations). The list only
 * shrinks: remove a row when its family is no longer reached.
 */
const knownHeavyReach: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  project: {},
  home: {},
};

/**
 * On-demand modules a class still reaches statically, found when the walk began following workspace packages.
 * Same rule as {@link knownHeavyReach}: the list only shrinks.
 */
const knownOnDemandReach: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  project: {},
  home: {},
};

const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs'];
/* Every file a specifier can resolve to under any ceiling or host, the adaptive facade included (adaptive app deployment mode W2). */
const variants = ['', '.cloud', '.self-host', '.adaptive', '.desktop'];
const packagePrefix = 'npm:';
const assetQueries = new Set(['url', 'raw', 'worker', 'sharedworker']);
/** The export conditions Vite's client build resolves with, besides the default. */
const conditions = new Set(['browser', 'import', 'module', 'production', 'default']);

const toPosix = (path: string): string => path.split(sep).join('/');

type PackageManifest = {
  readonly name?: string;
  readonly exports?: unknown;
  readonly imports?: Readonly<Record<string, unknown>>;
};

const readManifest = (directory: string): PackageManifest =>
  JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as PackageManifest;

/** Every workspace package by name. */
const workspacePackages = new Map(
  globSync(
    ['apps/*', 'apps/libs/*', 'libs/*', 'packages/*', 'packages/plugins/*', 'packages/core/*'].map(
      (pattern) => `${pattern}/package.json`,
    ),
    { cwd: workspaceRoot },
  ).flatMap((manifestPath) => {
    const directory = join(workspaceRoot, dirname(manifestPath));
    const { name } = readManifest(directory);
    return name === undefined ? [] : [[name, directory] as const];
  }),
);

/** The target a conditional `exports` or `imports` value selects for the browser build. */
function selectTarget(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => selectTarget(entry)).find((entry) => entry !== undefined);
  }
  if (value !== null && typeof value === 'object') {
    for (const [condition, nested] of Object.entries(value)) {
      if (conditions.has(condition)) {
        const target = selectTarget(nested);
        if (target !== undefined) {
          return target;
        }
      }
    }
  }
  return undefined;
}

/** Resolves a key against a Node subpath map (`exports` or `imports`), exact keys before `*` patterns. */
function matchSubpath(map: Readonly<Record<string, unknown>>, key: string): string | undefined {
  if (key in map) {
    return selectTarget(map[key]);
  }
  const patterns = Object.keys(map)
    .filter((pattern) => pattern.includes('*'))
    .toSorted((left, right) => right.indexOf('*') - left.indexOf('*'));
  for (const pattern of patterns) {
    const star = pattern.indexOf('*');
    const prefix = pattern.slice(0, star);
    const suffix = pattern.slice(star + 1);
    if (key.startsWith(prefix) && key.endsWith(suffix) && key.length >= prefix.length + suffix.length) {
      const target = selectTarget(map[pattern]);
      return target?.replaceAll('*', key.slice(prefix.length, key.length - suffix.length));
    }
  }
  return undefined;
}

/** The source files a module path may be, trying each extension (and the app's build variants). */
function candidatesOf(base: string, withVariants: boolean): string[] {
  if (/\.(?:tsx?|mts)$/u.test(base)) {
    return existsSync(base) ? [base] : [];
  }
  const stem = base.replace(/\.(?:[cm]?js|jsx)$/u, '');
  const candidates = [
    ...(withVariants ? variants : ['']).flatMap((variant) =>
      extensions.map((extension) => `${stem}${variant}${extension}`),
    ),
    ...extensions.map((extension) => join(stem, `index${extension}`)),
  ];
  return candidates.filter((candidate) => existsSync(candidate));
}

const packageRootOf = new Map<string, string | undefined>();

/** The nearest directory above a file with a `package.json`. */
function packageRoot(file: string): string | undefined {
  const directory = dirname(file);
  if (packageRootOf.has(directory)) {
    return packageRootOf.get(directory);
  }
  let root: string | undefined;
  for (let current = directory; current.startsWith(workspaceRoot); current = dirname(current)) {
    if (existsSync(join(current, 'package.json'))) {
      root = current;
      break;
    }
  }
  packageRootOf.set(directory, root);
  return root;
}

const isAppFile = (file: string): boolean => file.startsWith(`${appRoot}${sep}`);

/** A `#…` specifier of a workspace package, through that package's `imports` map. */
function resolvePackageImport(specifier: string, importer: string): string[] {
  const root = packageRoot(importer);
  const imports = root === undefined ? undefined : readManifest(root).imports;
  const target = imports === undefined ? undefined : matchSubpath(imports, specifier);
  if (root === undefined || target === undefined) {
    return [];
  }
  return target.startsWith('.') ? candidatesOf(join(root, target), false) : [`${packagePrefix}${target}`];
}

/** Every node a specifier may resolve to across builds: source files, or the package leaf for a bare specifier. */
function resolveSpecifier(specifier: string, importer: string): string[] {
  const [path = '', query] = specifier.split('?', 2);
  if (query !== undefined && assetQueries.has(query)) {
    return [];
  }
  if (path.startsWith('#')) {
    return isAppFile(importer)
      ? candidatesOf(join(appRoot, path.slice(1)), true)
      : resolvePackageImport(path, importer);
  }
  if (path.startsWith('.')) {
    return candidatesOf(resolve(dirname(importer), path), isAppFile(importer));
  }
  return [`${packagePrefix}${path}`];
}

/** The file a workspace package's bare specifier resolves to, or nothing for an npm package or a heavy one. */
function resolveWorkspaceSpecifier(specifier: string): string[] {
  if (heavyFamilyOfSpecifier(specifier) !== undefined) {
    return [];
  }
  const parts = specifier.split('/');
  const name = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? '');
  const directory = workspacePackages.get(name);
  if (directory === undefined) {
    return [];
  }
  const exportsField = readManifest(directory).exports;
  const subpath = `.${specifier.slice(name.length)}`;
  const target =
    typeof exportsField === 'string' || Array.isArray(exportsField)
      ? subpath === '.'
        ? selectTarget(exportsField)
        : undefined
      : exportsField !== null && typeof exportsField === 'object'
        ? matchSubpath(exportsField as Record<string, unknown>, subpath)
        : undefined;
  return target === undefined ? [] : candidatesOf(join(directory, target), false);
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

/** The static graph from app-relative roots: each reached node and the node that first imported it. */
function staticGraph(fromRoots: readonly string[]): Map<string, string | undefined> {
  const importerOf = new Map<string, string | undefined>();
  const queue = fromRoots.map((root) => join(appRoot, root));
  for (const file of queue) {
    importerOf.set(file, undefined);
  }
  const reach = (target: string, from: string): void => {
    if (!importerOf.has(target)) {
      importerOf.set(target, from);
      queue.push(target);
    }
  };
  // The iterator reads the queue's length each step, so it walks what the loop appends.
  for (const node of queue) {
    if (node.startsWith(packagePrefix)) {
      for (const target of resolveWorkspaceSpecifier(node.slice(packagePrefix.length))) {
        reach(target, node);
      }
      continue;
    }
    for (const specifier of staticSpecifiers(node)) {
      for (const target of resolveSpecifier(specifier, node)) {
        reach(target, node);
      }
    }
  }
  return importerOf;
}

/** A node's name: app files relative to the app, other workspace files relative to the workspace, leaves as is. */
const nameOf = (node: string): string =>
  node.startsWith(packagePrefix)
    ? node
    : isAppFile(node)
      ? toPosix(relative(appRoot, node))
      : toPosix(relative(workspaceRoot, node));

/** The import chain from a root to a reached node. */
function chainTo(graph: Map<string, string | undefined>, reached: string): string {
  const chain: string[] = [];
  for (let node: string | undefined = reached; node !== undefined; node = graph.get(node)) {
    chain.unshift(nameOf(node));
  }
  return chain.join(' -> ');
}

/** The import chain from a root to each lazy-only module the graph reaches. */
function staticEdges(graph: Map<string, string | undefined>, lazyOnly: readonly string[]): string[] {
  const found: string[] = [];
  for (const module of lazyOnly) {
    const reached = [...graph.keys()].find((node) => {
      const name = nameOf(node);
      return module.startsWith(packagePrefix) ? name === module : name.startsWith(`${module}.`);
    });
    if (reached !== undefined) {
      found.push(`${module} is reached statically: ${chainTo(graph, reached)}`);
    }
  }
  return found;
}

/** Each heavy family the graph reaches, with the chain to its first specifier. */
function heavyReach(graph: Map<string, string | undefined>): Map<string, string> {
  const reached = new Map<string, string>();
  for (const node of graph.keys()) {
    if (!node.startsWith(packagePrefix)) {
      continue;
    }
    const family = heavyFamilyOfSpecifier(node.slice(packagePrefix.length));
    if (family !== undefined && !reached.has(family)) {
      reached.set(family, chainTo(graph, node));
    }
  }
  return reached;
}

type HeavyImportOptions = { modules: string[]; deferredLeaves: string[]; known: string[] };

/** The options of `tau-lint/no-static-heavy-import` (G1) in the workspace's `.oxlintrc.json`, a JSONC file. */
function heavyImportRuleOptions(): HeavyImportOptions {
  const path = join(workspaceRoot, '.oxlintrc.json');
  const parsed = ts.parseConfigFileTextToJson(path, readFileSync(path, 'utf8'));
  const config: unknown = parsed.config;
  if (parsed.error !== undefined) {
    throw new Error(`Could not parse ${path}`);
  }
  const overrides = (config as { overrides?: Array<{ rules?: Record<string, unknown> }> }).overrides ?? [];
  const settings = overrides.flatMap((override) => {
    const setting = override.rules?.['tau-lint/no-static-heavy-import'];
    return Array.isArray(setting) ? [setting[1] as Partial<HeavyImportOptions>] : [];
  });
  const [options] = settings;
  if (settings.length !== 1 || options === undefined) {
    throw new Error('Expected one .oxlintrc.json override configuring tau-lint/no-static-heavy-import');
  }
  return { modules: options.modules ?? [], deferredLeaves: options.deferredLeaves ?? [], known: options.known ?? [] };
}

describe('critical module graph', () => {
  const graphs = new Map<string, Map<string, string | undefined>>();
  const graphOf = (id: string): Map<string, string | undefined> => {
    const graph = graphs.get(id);
    if (graph === undefined) {
      throw new Error(`No graph walked for ${id}`);
    }
    return graph;
  };
  const reachedFiles = (): Set<string> =>
    new Set(
      [...graphs.values()].flatMap((graph) =>
        [...graph.keys()]
          .filter((node) => !node.startsWith(packagePrefix))
          .map((node) => toPosix(relative(workspaceRoot, node))),
      ),
    );

  // One walk per route class, shared by the cases below: parsing the app is the cost, not the checks.
  beforeAll(() => {
    for (const { id, roots } of criticalRouteClasses) {
      graphs.set(id, staticGraph(roots));
    }
  });

  it.each(criticalRouteClasses)("should keep the $label's static graph off its on-demand modules", ({ id }) => {
    const known = knownOnDemandReach[id] ?? {};
    const problems = staticEdges(
      graphOf(id),
      onDemandModules.filter((module) => !(module in known)),
    );
    const gone = Object.keys(known).filter((module) => staticEdges(graphOf(id), [module]).length === 0);
    expect(
      { problems, gone },
      [...problems, ...gone.map((module) => `${module} is no longer reached: remove it from knownOnDemandReach`)].join(
        '\n',
      ),
    ).toEqual({ problems: [], gone: [] });
  });

  it.each(criticalRouteClasses)("should reach only the $label's known heavy families", ({ id }) => {
    const reached = heavyReach(graphOf(id));
    const known = knownHeavyReach[id] ?? {};
    const added = [...reached].filter(([family]) => !(family in known)).map(([family, chain]) => `${family}: ${chain}`);
    const gone = Object.keys(known).filter((family) => !reached.has(family));
    expect(
      { added, gone },
      [
        ...added.map((line) => `heavy module reached statically, load it behind import(): ${line}`),
        ...gone.map((family) => `${family} is no longer reached: remove it from knownHeavyReach`),
      ].join('\n'),
    ).toEqual({ added: [], gone: [] });
  });

  it.each(criticalRouteClasses)("should walk the $label's composer", ({ id }) => {
    const reached = new Set([...graphOf(id).keys()].map((node) => nameOf(node)));
    expect(reached).toContain('components/chat/chat-textarea-desktop.tsx');
    expect(reached).toContain('hooks/use-skills-catalog.ts');
  });

  it('should walk the transcript into its tool parts', () => {
    const reached = new Set([...graphOf('project').keys()].map((node) => nameOf(node)));
    expect(reached).toContain('routes/w.$workspace.$project/chat-message.tsx');
    expect(reached).toContain('routes/w.$workspace.$project/chat-message-tool-shell.tsx');
  });

  it('should find a static edge to an on-demand module when one exists', () => {
    expect(staticEdges(staticGraph(['lib/skill-resolver.ts']), ['npm:@taucad/skills/resources'])).toEqual([
      'npm:@taucad/skills/resources is reached statically: lib/skill-resolver.ts -> lib/system-skills-catalog.ts -> npm:@taucad/skills/resources',
    ]);
  });

  it('should walk into workspace packages through their exports and imports maps', () => {
    const reached = [...graphOf('home').keys()].map((node) => nameOf(node));
    expect(reached).toContain('apps/libs/ui-core/src/lib/early-error-buffer.ts');
    expect(reached.some((name) => name.startsWith('apps/libs/chat-ui/src/'))).toBe(true);
    expect(reached.some((name) => name.startsWith('packages/ui/src/'))).toBe(true);
  });

  it('should find a heavy module reached only through a workspace package', () => {
    expect(heavyReach(staticGraph(['services/headless-capture.ts'])).get('three')).toBe(
      'services/headless-capture.ts -> npm:@taucad/ui-core/services/headless-capture-presentation -> apps/libs/ui-core/src/services/headless-capture-presentation.ts -> npm:three',
    );
  });

  it('should hold the lint rule on the same heavy list (G1)', () => {
    expect(heavyImportRuleOptions().modules).toEqual(heavySpecifiers);
  });

  it("should keep every deferred leaf G1 admits off each class's static graph", () => {
    const reached = reachedFiles();
    const onGraph = heavyImportRuleOptions().deferredLeaves.flatMap((entry) =>
      [...reached]
        .filter((file) => (entry.endsWith('/') ? file.startsWith(entry) : file === entry))
        .map((file) => `${entry}: ${file} is reached statically; move it behind import() or list it as known`),
    );
    expect(onGraph, onGraph.join('\n')).toEqual([]);
  });

  it("should keep every known G1 violation on a class's static graph", () => {
    const reached = reachedFiles();
    const stale = heavyImportRuleOptions().known.filter((file) => !reached.has(file));
    expect(stale, `no longer on a critical graph; move to deferredLeaves or remove: ${stale.join(', ')}`).toEqual([]);
  });
});
