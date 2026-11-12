/**
 * Shared counter behind every `react-event-layer.policy.node.test.ts`.
 *
 * React effects should not send events, subscribe or run timers, and components
 * should not read actor snapshots imperatively; that work belongs to actors
 * (scoped to the whole UI so no capability regresses while it waits for its own
 * move). Until each capability moves, a per-file ceiling holds
 * today's sites and may only go down. One thin test per Nx project calls
 * {@link checkReactEventLayerCeiling}, so Nx reruns the check whenever that
 * project's own files change.
 *
 * A site is either:
 * - one effect (`useEffect`, `useLayoutEffect`, `useInsertionEffect`) whose
 *   callback lexically calls `.send(`, `.subscribe(`, `.on(` (or a bare `send(` or
 *   `subscribe(`), `setTimeout(`,
 *   `setInterval(` or `requestAnimationFrame(`, counted once however many
 *   such calls it holds; or
 * - one `getSnapshot()` call inside a React component or hook (a function named
 *   `useFoo` or `Foo`, or one passed to `memo` or `forwardRef`) that is not inside a
 *   module-level `select*` helper (`function selectFoo` or `const selectFoo = (...) =>`).
 *   A read in actor logic, an adapter, a store factory or a callback-actor host is
 *   outside React and is not a site. A module-level helper is never inside a component, so
 *   a read moved into one of any name stops counting: that a handler's reader is a narrow
 *   `select*` function is a review convention, not something this counter checks.
 *
 * Tests, type tests, declarations and test-support modules are not counted.
 *
 * Calls reached only through a function declared outside the effect are not
 * seen: the counter is lexical, like the source scanners it is modelled on.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/** One counted site in a source file. Lines and columns are 1-based.
 *
 * @public
 */
export type ReactEventLayerSite = {
  readonly kind: 'effect' | 'getSnapshot';
  readonly line: number;
  readonly column: number;
  /** For an effect, the distinct calls that made it count, such as `.send` or `setTimeout`. */
  readonly calls: readonly string[];
};

/** Workspace-relative POSIX path to its ceiling: the most sites the file may hold.
 *
 * @public
 */
export type ReactEventLayerCeiling = Readonly<Record<string, number>>;

const effectHooks = new Set(['useEffect', 'useInsertionEffect', 'useLayoutEffect']);
const eventMethods = new Set(['on', 'send', 'subscribe']);
const bareEventFunctions = new Set(['send', 'subscribe']);
const timerFunctions = new Set(['requestAnimationFrame', 'setInterval', 'setTimeout']);
const selectHelperPattern = /^select[A-Z]/;
const sourcePattern = /\.(?:ts|tsx)$/;
/**
 * Tests, type tests, declarations and test-support modules (`*.test-utils`, `*-test.utils`, `*.test-harness`, `*.test-helpers`).
 * Fixtures are counted: some, such as `printer-manifest.fixture.ts`, are imported by production code.
 */
const excludedPattern =
  /(?:\.(?:test|spec)(?:-d)?\.(?:ts|tsx)|[.-]test[.-](?:utils|harness|helpers)\.(?:ts|tsx)|\.d\.ts)$/;

/** The name of a module-level function: `function name` or `const name = () =>` at the top of the file. */
function moduleLevelFunctionName(node: ts.Node): string | undefined {
  if (ts.isFunctionDeclaration(node) && ts.isSourceFile(node.parent)) {
    return node.name?.text;
  }
  if (!ts.isArrowFunction(node) && !ts.isFunctionExpression(node)) {
    return undefined;
  }
  const declaration = node.parent;
  if (
    ts.isVariableDeclaration(declaration) &&
    declaration.initializer === node &&
    ts.isIdentifier(declaration.name) &&
    ts.isVariableStatement(declaration.parent.parent) &&
    ts.isSourceFile(declaration.parent.parent.parent)
  ) {
    return declaration.name.text;
  }
  return undefined;
}

/** Components are PascalCase and hooks are `useFoo`. */
const reactFunctionNamePattern = /^(?:use[\dA-Z]|[A-Z])/;
const componentWrappers = new Set(['forwardRef', 'memo']);

/** The name a function is known by: its own, or the variable or property it initializes. */
function functionName(node: ts.Node): string | undefined {
  if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) && node.name !== undefined) {
    return node.name.text;
  }
  if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
    return node.name.text;
  }
  const { parent } = node;
  if (
    (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
    (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent)) &&
    parent.initializer === node &&
    ts.isIdentifier(parent.name)
  ) {
    return parent.name.text;
  }
  return undefined;
}

/** A function passed to `memo(...)`, `forwardRef(...)` or their `React.` forms. */
function isWrappedComponent(node: ts.Node): boolean {
  const { parent } = node;
  if (!ts.isCallExpression(parent) || !parent.arguments.includes(node as ts.Expression)) {
    return false;
  }
  const callee = parent.expression;
  const name = ts.isIdentifier(callee)
    ? callee.text
    : ts.isPropertyAccessExpression(callee)
      ? callee.name.text
      : undefined;
  return name !== undefined && componentWrappers.has(name);
}

/** Whether `node` lies, at any depth, inside a React component or hook. */
function isInsideReactFunction(node: ts.Node): boolean {
  for (let current = node.parent; !ts.isSourceFile(current); current = current.parent) {
    if (!ts.isFunctionLike(current)) {
      continue;
    }
    const name = functionName(current);
    if ((name !== undefined && reactFunctionNamePattern.test(name)) || isWrappedComponent(current)) {
      return true;
    }
  }
  return false;
}

function isInsideSelectHelper(node: ts.Node): boolean {
  for (let current = node.parent; !ts.isSourceFile(current); current = current.parent) {
    const name = moduleLevelFunctionName(current);
    if (name !== undefined && selectHelperPattern.test(name)) {
      return true;
    }
  }
  return false;
}

/** Local names bound to React's effect hooks by `import { useEffect as x } from 'react'`. */
function reactEffectAliases(sourceFile: ts.SourceFile): Set<string> {
  const aliases = new Set<string>(effectHooks);
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== 'react'
    ) {
      continue;
    }
    const bindings = statement.importClause?.namedBindings;
    if (bindings === undefined || !ts.isNamedImports(bindings)) {
      continue;
    }
    for (const element of bindings.elements) {
      const imported = (element.propertyName ?? element.name).text;
      if (effectHooks.has(imported)) {
        aliases.add(element.name.text);
      }
    }
  }
  return aliases;
}

function isEffectCall(node: ts.CallExpression, aliases: ReadonlySet<string>): boolean {
  const callee = node.expression;
  if (ts.isIdentifier(callee)) {
    return aliases.has(callee.text);
  }
  return ts.isPropertyAccessExpression(callee) && effectHooks.has(callee.name.text);
}

/** The first argument of a `useCallback(fn, deps)` call, bare or as `React.useCallback`. */
function callbackHookArgument(node: ts.Expression): ts.Expression | undefined {
  if (!ts.isCallExpression(node)) {
    return undefined;
  }
  const callee = node.expression;
  const name = ts.isIdentifier(callee)
    ? callee.text
    : ts.isPropertyAccessExpression(callee)
      ? callee.name.text
      : undefined;
  return name === 'useCallback' ? node.arguments[0] : undefined;
}

/** The function a statement binds to `name`: a declaration, a function binding or a `useCallback` binding. */
function boundFunction(statement: ts.Statement, name: string): ts.Node | undefined {
  if (ts.isFunctionDeclaration(statement)) {
    return statement.name?.text === name ? statement : undefined;
  }
  if (!ts.isVariableStatement(statement)) {
    return undefined;
  }
  for (const declaration of statement.declarationList.declarations) {
    const { initializer } = declaration;
    if (!ts.isIdentifier(declaration.name) || declaration.name.text !== name || initializer === undefined) {
      continue;
    }
    if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
      return initializer;
    }
    return callbackHookArgument(initializer);
  }
  return undefined;
}

/** Resolves `identifier` through the blocks enclosing it, innermost first. */
function localFunction(identifier: ts.Identifier): ts.Node | undefined {
  for (let scope: ts.Node = identifier.parent; ; scope = scope.parent) {
    if (ts.isBlock(scope) || ts.isSourceFile(scope)) {
      for (const statement of scope.statements) {
        const found = boundFunction(statement, identifier.text);
        if (found !== undefined) {
          return found;
        }
      }
    }
    if (ts.isSourceFile(scope)) {
      return undefined;
    }
  }
}

/** The name an effect-relevant call is reported under, or undefined when it is not one. */
function eventLayerCall(node: ts.CallExpression): string | undefined {
  const callee = ts.isNonNullExpression(node.expression) ? node.expression.expression : node.expression;
  if (ts.isIdentifier(callee)) {
    if (timerFunctions.has(callee.text)) {
      return callee.text;
    }
    // A destructured `send` or `subscribe` prop is still the actor or store call; a bare `on` is too generic.
    return bareEventFunctions.has(callee.text) ? callee.text : undefined;
  }
  if (!ts.isPropertyAccessExpression(callee)) {
    return undefined;
  }
  const name = callee.name.text;
  if (timerFunctions.has(name)) {
    return name;
  }
  return eventMethods.has(name) ? `.${name}` : undefined;
}

function eventLayerCalls(body: ts.Node): string[] {
  const calls = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const call = eventLayerCall(node);
      if (call !== undefined) {
        calls.add(call);
      }
    }
    node.forEachChild(visit);
  };
  visit(body);
  return [...calls].sort();
}

function isGetSnapshotCall(node: ts.CallExpression): boolean {
  const callee = ts.isNonNullExpression(node.expression) ? node.expression.expression : node.expression;
  if (ts.isIdentifier(callee)) {
    return callee.text === 'getSnapshot';
  }
  return ts.isPropertyAccessExpression(callee) && callee.name.text === 'getSnapshot';
}

/**
 * Counts the React event-layer sites in one module.
 *
 * @param fileName - Used only to choose TSX parsing for `.tsx` files.
 * @param sourceText - The module's source.
 * @returns The sites in source order.
 * @public
 */
export function countReactEventLayerSites(fileName: string, sourceText: string): ReactEventLayerSite[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.ESNext,
    true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const aliases = reactEffectAliases(sourceFile);
  const sites: ReactEventLayerSite[] = [];
  const position = (node: ts.Node): { line: number; column: number } => {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    return { line: line + 1, column: character + 1 };
  };
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      if (isEffectCall(node, aliases)) {
        const [callback] = node.arguments;
        const body =
          callback !== undefined && ts.isIdentifier(callback) ? (localFunction(callback) ?? callback) : callback;
        const calls = body === undefined ? [] : eventLayerCalls(body);
        if (calls.length > 0) {
          sites.push({ kind: 'effect', ...position(node), calls });
        }
      } else if (isGetSnapshotCall(node) && isInsideReactFunction(node) && !isInsideSelectHelper(node)) {
        sites.push({ kind: 'getSnapshot', ...position(node), calls: [] });
      }
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);
  return sites;
}

/** The directory holding `pnpm-workspace.yaml` above `start`. */
function findWorkspaceRoot(start: string): string {
  for (let directory = start; ; directory = dirname(directory)) {
    if (existsSync(join(directory, 'pnpm-workspace.yaml'))) {
      return directory;
    }
    if (dirname(directory) === directory) {
      throw new Error(`No pnpm-workspace.yaml above ${start}`);
    }
  }
}

function productionSourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') {
        files.push(...productionSourceFiles(path));
      }
    } else if (sourcePattern.test(entry.name) && !excludedPattern.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

function toPosix(path: string): string {
  return path.split(sep).join('/');
}

/**
 * Measures every production `.ts` and `.tsx` module under the given directories.
 * Test, spec, type-test and declaration files are skipped.
 *
 * @param directories - Absolute directories to scan.
 * @param workspaceRoot - Root the returned paths are relative to.
 * @returns Workspace-relative POSIX paths, sorted, mapped to their sites; files with no site are left out.
 * @public
 */
export function measureReactEventLayer(
  directories: readonly string[],
  workspaceRoot: string,
): Map<string, ReactEventLayerSite[]> {
  const measured = new Map<string, ReactEventLayerSite[]>();
  const files = directories.flatMap((directory) => productionSourceFiles(directory));
  for (const file of files.sort()) {
    const sites = countReactEventLayerSites(file, readFileSync(file, 'utf8'));
    if (sites.length > 0) {
      measured.set(toPosix(relative(workspaceRoot, file)), sites);
    }
  }
  return new Map([...measured].sort(([left], [right]) => (left < right ? -1 : 1)));
}

function isInScope(path: string, scope: readonly string[]): boolean {
  return scope.some((entry) => path === entry || path.startsWith(`${entry}/`));
}

function describeSite(site: ReactEventLayerSite): string {
  const where = `${site.line}:${site.column}`;
  return site.kind === 'effect' ? `${where} effect calls ${site.calls.join(', ')}` : `${where} getSnapshot()`;
}

/**
 * Lists every file whose measured count exceeds its ceiling. A file absent from
 * the ceiling has a ceiling of 0. A count below its ceiling passes, so a change
 * that removes sites never has to edit the manifest.
 *
 * @param measured - Output of {@link measureReactEventLayer}.
 * @param ceiling - The committed manifest.
 * @param manifest - Manifest path shown in messages, or that path with the workspace-relative POSIX paths held at
 *   zero, which messages name as such.
 * @returns One message per file over its ceiling, naming each site.
 * @public
 */
export function reactEventLayerViolations(
  measured: ReadonlyMap<string, readonly ReactEventLayerSite[]>,
  ceiling: ReactEventLayerCeiling,
  manifest: string | Readonly<{ name: string; zeroScope: readonly string[] }>,
): string[] {
  const { name: manifestName, zeroScope } = typeof manifest === 'string' ? { name: manifest, zeroScope: [] } : manifest;
  const violations: string[] = [];
  for (const [path, sites] of measured) {
    const listed = Object.hasOwn(ceiling, path);
    const allowed = listed ? (ceiling[path] ?? 0) : 0;
    if (sites.length <= allowed) {
      continue;
    }
    const hint = isInScope(path, zeroScope)
      ? listed
        ? `exceeds its named exception of ${allowed}`
        : 'is held at zero; only a named exception may keep a site'
      : listed
        ? `exceeds its ceiling of ${allowed} in ${manifestName}`
        : `has no line in ${manifestName}, so its ceiling is 0 (a moved file carries its old line to its new path)`;
    violations.push(
      [
        `${path}: ${sites.length} React event-layer site(s) ${hint}. Move the work into an actor.`,
        ...sites.map((site) => `  ${describeSite(site)}`),
      ].join('\n'),
    );
  }
  return violations;
}

/**
 * Checks the manifest's own shape: sorted keys, positive integer counts, and
 * paths inside the scanned directories.
 *
 * @param ceiling - The committed manifest.
 * @param prefixes - Workspace-relative POSIX directory prefixes the manifest may name.
 * @returns One message per malformed entry.
 * @public
 */
export function reactEventLayerManifestProblems(
  ceiling: ReactEventLayerCeiling,
  prefixes: readonly string[],
): string[] {
  const problems: string[] = [];
  const keys = Object.keys(ceiling);
  for (const [index, key] of keys.entries()) {
    const value = ceiling[key];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
      problems.push(`${key}: ceiling must be a positive integer; delete the line when it reaches 0`);
    }
    if (!prefixes.some((prefix) => key.startsWith(`${prefix}/`))) {
      problems.push(`${key}: outside this manifest's scope (${prefixes.join(', ')})`);
    }
    const previous = keys[index - 1];
    if (previous !== undefined && previous >= key) {
      problems.push(`${key}: lines must be sorted by path`);
    }
  }
  return problems;
}

/** Keys a manifest names more than once; `JSON.parse` keeps only the last, so read the raw text. */
function duplicateManifestKeys(manifestText: string): string[] {
  const seen = new Set<string>();
  const problems: string[] = [];
  for (const match of manifestText.matchAll(/"((?:[^"\\]|\\.)*)"\s*:/g)) {
    const key = match[1] ?? '';
    if (seen.has(key)) {
      problems.push(`${key}: listed more than once`);
    }
    seen.add(key);
  }
  return problems;
}

/**
 * A file inside a zero scope that may keep sites, with the reason it is a boundary rather than debt.
 *
 * @public
 */
export type ReactEventLayerException = Readonly<{
  /** The exact number of sites the file holds. */
  sites: number;
  /** Why these sites stay, naming the ruling or inventory row. */
  reason: string;
}>;

/**
 * Paths held at zero: no ceiling line may name them, and only a named exception may keep a site.
 *
 * @public
 */
export type ReactEventLayerZero = Readonly<{
  /** URLs of the files or directories held at zero. */
  scope: readonly URL[];
  /** Workspace-relative POSIX path to the one exception that file holds. */
  exceptions?: Readonly<Record<string, ReactEventLayerException>>;
}>;

/** Options for {@link checkReactEventLayerCeiling}.
 *
 * @public
 */
export type ReactEventLayerCheck = {
  /** URL of the project's `react-event-layer.ceiling.json`. */
  readonly manifest: URL;
  /** URLs of the directories this project's ceiling covers. */
  readonly directories: readonly URL[];
  /** Files and directories held at zero, with their named exceptions. */
  readonly zero?: ReactEventLayerZero;
};

/**
 * Checks the zero scope: no ceiling line inside it, and each named exception inside it, with a reason, holding
 * exactly its stated sites. Sites over zero without an exception are reported by {@link reactEventLayerViolations}.
 *
 * @param measured - Output of {@link measureReactEventLayer}.
 * @param ceiling - The committed manifest.
 * @param zero - The workspace-relative POSIX paths held at zero and the named exceptions.
 * @returns One message per problem.
 * @public
 */
export function reactEventLayerZeroProblems(
  measured: ReadonlyMap<string, readonly ReactEventLayerSite[]>,
  ceiling: ReactEventLayerCeiling,
  zero: Readonly<{ scope: readonly string[]; exceptions: Readonly<Record<string, ReactEventLayerException>> }>,
): string[] {
  const { scope, exceptions } = zero;
  const problems: string[] = [];
  for (const key of Object.keys(ceiling)) {
    if (isInScope(key, scope)) {
      problems.push(`${key}: held at zero, so it takes no ceiling line; a boundary that stays is a named exception`);
    }
  }
  for (const [path, { sites, reason }] of Object.entries(exceptions)) {
    if (!Number.isInteger(sites) || sites < 1) {
      problems.push(`${path}: an exception's sites must be a positive integer; remove it at 0`);
    }
    if (!isInScope(path, scope)) {
      problems.push(`${path}: a named exception must be inside the zero scope`);
    }
    if (reason.trim() === '') {
      problems.push(`${path}: a named exception needs its reason`);
    }
    const count = measured.get(path)?.length ?? 0;
    if (count < sites) {
      problems.push(`${path}: holds ${count} site(s), below its exception of ${sites}; lower or remove the exception`);
    }
  }
  return problems;
}

/**
 * Measures a project's directories against its committed ceiling manifest.
 *
 * @param check - The manifest, the directories it covers and any zero scope.
 * @returns Every manifest problem and ceiling violation; empty when the project passes.
 * @public
 */
export function checkReactEventLayerCeiling(check: ReactEventLayerCheck): string[] {
  const manifestPath = fileURLToPath(check.manifest);
  const directories = check.directories.map((directory) => fileURLToPath(directory).replace(/[/\\]$/, ''));
  const workspaceRoot = findWorkspaceRoot(dirname(manifestPath));
  const manifestName = toPosix(relative(workspaceRoot, manifestPath));
  const manifestText = readFileSync(manifestPath, 'utf8');
  const ceiling = JSON.parse(manifestText) as ReactEventLayerCeiling;
  const prefixes = directories.map((directory) => toPosix(relative(workspaceRoot, directory)));
  const measured = measureReactEventLayer(directories, workspaceRoot);
  const scopePaths = (check.zero?.scope ?? []).map((entry) => fileURLToPath(entry).replace(/[/\\]$/, ''));
  const scope = scopePaths.map((path) => toPosix(relative(workspaceRoot, path)));
  const missingScope = scopePaths.flatMap((path) => {
    const name = toPosix(relative(workspaceRoot, path));
    if (!existsSync(path)) {
      return [`${name}: a zero-scope path that does not exist; move or remove it`];
    }
    return isInScope(name, prefixes) ? [] : [`${name}: a zero-scope path outside the measured directories`];
  });
  const exceptions = check.zero?.exceptions ?? {};
  const allowed: Record<string, number> = { ...ceiling };
  for (const [path, { sites }] of Object.entries(exceptions)) {
    allowed[path] = sites;
  }
  return [
    ...duplicateManifestKeys(manifestText),
    ...reactEventLayerManifestProblems(ceiling, prefixes),
    ...missingScope,
    ...reactEventLayerZeroProblems(measured, ceiling, { scope, exceptions }),
    ...reactEventLayerViolations(measured, allowed, { name: manifestName, zeroScope: scope }),
  ];
}
