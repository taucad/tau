/**
 * Shared counter behind every `react-event-layer.policy.node.test.ts`.
 *
 * Charter invariant I10 says React effects never send, subscribe or time; that
 * work belongs to actors. Until each capability moves, a per-file ceiling holds
 * today's sites and may only go down. One thin test per Nx project calls
 * {@link checkReactEventLayerCeiling}, so Nx reruns the check whenever that
 * project's own files change.
 *
 * A site is either:
 * - one effect (`useEffect`, `useLayoutEffect`, `useInsertionEffect`) whose
 *   callback lexically calls `.send(`, `.subscribe(`, `.on(`, `setTimeout(`,
 *   `setInterval(` or `requestAnimationFrame(`, counted once however many
 *   such calls it holds; or
 * - one `getSnapshot()` call that is not inside a `select*` helper.
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
const timerFunctions = new Set(['requestAnimationFrame', 'setInterval', 'setTimeout']);
const selectHelperPrefix = 'select';
const sourcePattern = /\.(?:ts|tsx)$/;
/** Tests, type tests, declarations and test-support modules (`*.test-utils`, `*.test-harness`, `*.fixture(s)`). */
const excludedPattern =
  /(?:\.(?:test|spec)(?:-d)?\.(?:ts|tsx)|\.(?:test-utils|test-harness|test-helpers|fixtures?)\.(?:ts|tsx)|\.d\.ts)$/;

/** Names a function-like node is known by: its own name or the binding it initializes. */
function functionNames(node: ts.Node): string[] {
  const names: string[] = [];
  if (
    (ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isGetAccessorDeclaration(node)) &&
    node.name !== undefined &&
    (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))
  ) {
    names.push(node.name.text);
  }
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    const { parent } = node;
    if (
      (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent)) &&
      parent.initializer === node &&
      (ts.isIdentifier(parent.name) || ts.isStringLiteral(parent.name))
    ) {
      names.push(parent.name.text);
    }
  }
  return names;
}

function isInsideSelectHelper(node: ts.Node): boolean {
  for (let current = node.parent; !ts.isSourceFile(current); current = current.parent) {
    if (ts.isFunctionLike(current) && functionNames(current).some((name) => name.startsWith(selectHelperPrefix))) {
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

/** The function an identifier names in this file: a declaration, a function binding or a `useCallback` binding. */
function localFunction(sourceFile: ts.SourceFile, name: string): ts.Node | undefined {
  let found: ts.Node | undefined;
  const visit = (node: ts.Node): void => {
    if (found !== undefined) {
      return;
    }
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      found = node;
      return;
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer !== undefined &&
      (ts.isArrowFunction(node.initializer) ||
        ts.isFunctionExpression(node.initializer) ||
        callbackHookArgument(node.initializer) !== undefined)
    ) {
      found = callbackHookArgument(node.initializer) ?? node.initializer;
      return;
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);
  return found;
}

/** The name an effect-relevant call is reported under, or undefined when it is not one. */
function eventLayerCall(node: ts.CallExpression): string | undefined {
  const callee = ts.isNonNullExpression(node.expression) ? node.expression.expression : node.expression;
  if (ts.isIdentifier(callee)) {
    return timerFunctions.has(callee.text) ? callee.text : undefined;
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
          callback !== undefined && ts.isIdentifier(callback)
            ? (localFunction(sourceFile, callback.text) ?? callback)
            : callback;
        const calls = body === undefined ? [] : eventLayerCalls(body);
        if (calls.length > 0) {
          sites.push({ kind: 'effect', ...position(node), calls });
        }
      } else if (isGetSnapshotCall(node) && !isInsideSelectHelper(node)) {
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
 * @param manifestName - Manifest path shown in messages.
 * @returns One message per file over its ceiling, naming each site.
 * @public
 */
export function reactEventLayerViolations(
  measured: ReadonlyMap<string, readonly ReactEventLayerSite[]>,
  ceiling: ReactEventLayerCeiling,
  manifestName: string,
): string[] {
  const violations: string[] = [];
  for (const [path, sites] of measured) {
    const listed = Object.hasOwn(ceiling, path);
    const allowed = listed ? (ceiling[path] ?? 0) : 0;
    if (sites.length <= allowed) {
      continue;
    }
    const hint = listed
      ? `exceeds its ceiling of ${allowed} in ${manifestName}`
      : `has no line in ${manifestName}, so its ceiling is 0 (a moved file carries its old line, charter D21)`;
    violations.push(
      [
        `${path}: ${sites.length} React event-layer site(s) ${hint}. Move the work into an actor (charter I10).`,
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
      problems.push(`${key}: lines must be sorted by path and unique`);
    }
  }
  return problems;
}

/** Options for {@link checkReactEventLayerCeiling}.
 *
 * @public
 */
export type ReactEventLayerCheck = {
  /** URL of the project's `react-event-layer.ceiling.json`. */
  readonly manifest: URL;
  /** URLs of the directories this project's ceiling covers. */
  readonly directories: readonly URL[];
};

/**
 * Measures a project's directories against its committed ceiling manifest.
 *
 * @param check - The manifest and the directories it covers.
 * @returns Every manifest problem and ceiling violation; empty when the project passes.
 * @public
 */
export function checkReactEventLayerCeiling(check: ReactEventLayerCheck): string[] {
  const manifestPath = fileURLToPath(check.manifest);
  const directories = check.directories.map((directory) => fileURLToPath(directory).replace(/[/\\]$/, ''));
  const workspaceRoot = findWorkspaceRoot(dirname(manifestPath));
  const manifestName = toPosix(relative(workspaceRoot, manifestPath));
  const ceiling = JSON.parse(readFileSync(manifestPath, 'utf8')) as ReactEventLayerCeiling;
  const prefixes = directories.map((directory) => toPosix(relative(workspaceRoot, directory)));
  return [
    ...reactEventLayerManifestProblems(ceiling, prefixes),
    ...reactEventLayerViolations(measureReactEventLayer(directories, workspaceRoot), ceiling, manifestName),
  ];
}
