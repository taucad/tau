/**
 * Reject source code in one Nx project that reads a file in another project's
 * root, or in the workspace root outside any project, without a graph edge.
 *
 * Nx hashes a task from its own project's inputs and from the projects its
 * graph edges reach. A file read through `fs`, a `createRequire`/`require`
 * call or a relative import that leaves the reader's project root is in
 * neither, so a change to it neither invalidates the reader's cache nor marks
 * the reader affected. Package-name imports (`@taucad/x`) are graph edges and
 * pass.
 *
 * Resolution is static and best-effort, without data flow: a string literal, a
 * template or `+` of resolvable parts, `__dirname`, `__filename`,
 * `import.meta.{dirname,filename,url}`, `process.cwd()` (taken as the reading
 * project's root, the directory Nx and Vitest run its tasks in), `new URL(…)`,
 * `fileURLToPath`, `pathToFileURL`, `path.{join,resolve,dirname}` and a `const`
 * declared once in the file whose initializer resolves. Anything else is
 * ignored. A file belongs to the deepest project root above it; tracked files
 * outside every project root are not scanned, since no project task owns them.
 *
 * Known reads live in `cross-root-reads.allowlist.json`, one entry per reading
 * file and target (either may be a glob) with a reason. An unlisted read and an
 * entry that matches no read both fail.
 *
 * An allowlist entry records why a read stays cross-root; it does not make Nx
 * select the reader. So every read, listed or not, must also be covered: by a
 * graph edge from the reader to the owner of what it reads, or by a
 * `{workspaceRoot}` fileset in the inputs of the target that runs it (Nx 22
 * marks a project touched when a changed file matches such a fileset in any of
 * its targets). `checkCoverage` states the rule and its exemptions, and the
 * failure names the input or implicit dependency to add.
 *
 * Usage: pnpm nx run scripts:validate-cross-root-reads
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { posix, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createProjectGraphAsync } from '@nx/devkit';
import type { ProjectGraph } from '@nx/devkit';
import ts from 'typescript';

import { browserTests, workspaceTests } from '#test-sets.js';

/** A workspace project: its Nx name and its workspace-relative root. */
export type ProjectRoot = {
  readonly name: string;
  readonly root: string;
};

/** A scanned source file: its workspace-relative path and its text. */
export type SourceFile = {
  readonly path: string;
  readonly text: string;
};

/** One read that leaves the reading file's project root. */
export type CrossRootRead = {
  /** Workspace-relative path of the reading file. */
  readonly file: string;
  readonly line: number;
  /** `import`, `export`, `import()`, `import type`, `require`, `require.resolve` or `fs.<function>`. */
  readonly kind: string;
  /** Workspace-relative resolved path; starts with `../` when it leaves the workspace. */
  readonly target: string;
  readonly project: ProjectRoot;
};

/** A known cross-root read and why it stays. */
export type AllowlistEntry = {
  /** Workspace-relative reading file, or a glob of them. */
  readonly file: string;
  /** Workspace-relative resolved target, or a glob of them. */
  readonly target: string;
  readonly reason: string;
  /**
   * Why no CI task needs selecting for this read: the reading file is an operator script that no Nx
   * target names. Accepted only for runtime reads by a non-test file; see `checkCoverage`.
   */
  readonly unscheduled?: string;
};

/** The result of checking reads against the allowlist. */
export type AllowlistCheck = {
  readonly unlisted: readonly CrossRootRead[];
  readonly stale: readonly AllowlistEntry[];
};

const sourceExtensions = ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs'] as const;

/** Path segments whose files are build output or generated, never scanned. */
const skippedSegments = new Set(['node_modules', 'dist', 'generated']);

/** Functions that read a path from the file system, by module. */
const fsReadFunctions = new Set([
  'access',
  'accessSync',
  'copyFile',
  'copyFileSync',
  'cp',
  'cpSync',
  'createReadStream',
  'exists',
  'existsSync',
  'glob',
  'globSync',
  'lstat',
  'lstatSync',
  'opendir',
  'opendirSync',
  'readFile',
  'readFileSync',
  'readdir',
  'readdirSync',
  'readlink',
  'readlinkSync',
  'realpath',
  'realpathSync',
  'stat',
  'statSync',
]);

const fsModules = new Set(['fs', 'node:fs', 'fs/promises', 'node:fs/promises']);
const pathModules = new Set(['path', 'node:path', 'path/posix', 'node:path/posix']);
const urlModules = new Set(['url', 'node:url']);
const moduleModules = new Set(['module', 'node:module']);

/**
 * A deep placeholder for the workspace root, so a path that climbs above the
 * workspace stays distinguishable from an absolute literal such as `/etc/x`.
 */
const virtualRoot = '/__cross_root_0/__1/__2/__3/__4/__5/__6/__7/__8/__9/workspace';
const virtualEscapePrefix = '/__cross_root_0/';

/** A statically known value: a string (a path when absolute), or a `file:` URL. */
type StaticValue =
  | { readonly type: 'string'; readonly value: string }
  | { readonly type: 'url'; readonly path: string };

/** What an imported or required binding refers to: a module namespace or one of its exports. */
type Binding = { readonly module: string; readonly name?: string };

/** Is `path` the directory `root` or inside it? */
const isWithin = (path: string, root: string): boolean => path === root || path.startsWith(`${root}/`);

/**
 * The deepest project whose root contains a workspace-relative path.
 *
 * @param path - A workspace-relative path.
 * @param projects - Projects sorted deepest root first.
 * @returns The owning project, if any.
 */
const ownerOf = (path: string, projects: readonly ProjectRoot[]): ProjectRoot | undefined =>
  projects.find(({ root }) => isWithin(path, root));

const sortDeepestFirst = (projects: readonly ProjectRoot[]): ProjectRoot[] =>
  projects
    .map(({ name, root }) => ({ name, root: posix.normalize(root).replace(/\/$/u, '') }))
    .filter(({ root }) => root !== '.' && root !== '')
    .toSorted((left, right) => right.root.length - left.root.length);

/** Does a tracked path name a source file this validator scans? */
const isScannedPath = (path: string): boolean =>
  sourceExtensions.some((extension) => path.endsWith(extension)) &&
  !path.split('/').some((segment) => skippedSegments.has(segment));

const stringLiteralText = (node: ts.Node): string | undefined =>
  ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : undefined;

/**
 * A path leaves the reading file's directory only through a `..` segment or a
 * `dirname` call, so a file with neither cannot hold a cross-root read and is
 * not parsed. (`...` spreads do not match.)
 */
const mayClimb = /\.\.(?:[/'"`]|$)|dirname/mu;

/** The state of one file's scan. */
type Scan = {
  readonly file: SourceFile;
  readonly project: ProjectRoot;
  readonly projects: readonly ProjectRoot[];
  readonly sourceFile: ts.SourceFile;
  readonly fileAbsolute: string;
  readonly projectAbsolute: string;
  readonly bindings: Map<string, Binding>;
  /** `createRequire` results by name, with the base argument each was created from. */
  readonly requireBases: Map<string, ts.Expression | undefined>;
  readonly evaluating: Set<ts.Node>;
  readonly reads: CrossRootRead[];
};

/** The module `require('<module>')` names, for `const fs = require('node:fs')`. */
const requiredModule = (expression: ts.Expression): string | undefined =>
  ts.isCallExpression(expression) &&
  ts.isIdentifier(expression.expression) &&
  expression.expression.text === 'require' &&
  expression.arguments[0]
    ? stringLiteralText(expression.arguments[0])
    : undefined;

/** A namespace's member: `fs.promises` and `path.posix` are namespaces of their own. */
const memberOf = (object: Binding, property: string): Binding | undefined => {
  if (object.name === undefined) {
    if (property === 'promises' && fsModules.has(object.module)) {
      return { module: 'fs/promises' };
    }
    if (property === 'posix' && pathModules.has(object.module)) {
      return { module: 'path' };
    }
    return { module: object.module, name: property };
  }
  if (object.name === 'promises' && fsModules.has(object.module)) {
    return { module: 'fs/promises', name: property };
  }
  if (object.name === 'posix' && pathModules.has(object.module)) {
    return { module: 'path', name: property };
  }
  return undefined;
};

/** The module and export a callee refers to, through imports and namespaces. */
const resolveCallee = (scan: Scan, expression: ts.Expression): Binding | undefined => {
  if (ts.isIdentifier(expression)) {
    return scan.bindings.get(expression.text);
  }
  if (ts.isPropertyAccessExpression(expression)) {
    const object = resolveCallee(scan, expression.expression);
    return object ? memberOf(object, expression.name.text) : undefined;
  }
  return undefined;
};

const collectImport = (scan: Scan, node: ts.ImportDeclaration): void => {
  if (!ts.isStringLiteral(node.moduleSpecifier) || !node.importClause) {
    return;
  }
  const module = node.moduleSpecifier.text;
  const { name, namedBindings } = node.importClause;
  if (name) {
    scan.bindings.set(name.text, { module });
  }
  if (namedBindings && ts.isNamespaceImport(namedBindings)) {
    scan.bindings.set(namedBindings.name.text, { module });
  } else if (namedBindings) {
    for (const element of namedBindings.elements) {
      scan.bindings.set(element.name.text, { module, name: (element.propertyName ?? element.name).text });
    }
  }
};

const collectVariable = (scan: Scan, declaration: ts.VariableDeclaration): void => {
  const { initializer } = declaration;
  if (!initializer) {
    return;
  }
  const required = requiredModule(initializer);
  if (ts.isObjectBindingPattern(declaration.name) && required) {
    for (const element of declaration.name.elements) {
      if (ts.isIdentifier(element.name)) {
        const property =
          element.propertyName && ts.isIdentifier(element.propertyName) ? element.propertyName : element.name;
        scan.bindings.set(element.name.text, { module: required, name: property.text });
      }
    }
    return;
  }
  if (!ts.isIdentifier(declaration.name)) {
    return;
  }
  if (required) {
    scan.bindings.set(declaration.name.text, { module: required });
  }
  const callee = ts.isCallExpression(initializer) ? resolveCallee(scan, initializer.expression) : undefined;
  if (ts.isCallExpression(initializer) && callee?.name === 'createRequire' && moduleModules.has(callee.module)) {
    scan.requireBases.set(declaration.name.text, initializer.arguments[0]);
  }
};

/** Records the file's import and `require` bindings, scope-insensitively. */
const collectBindings = (scan: Scan, node: ts.Node): void => {
  if (ts.isImportDeclaration(node)) {
    collectImport(scan, node);
  } else if (ts.isVariableDeclaration(node)) {
    collectVariable(scan, node);
  }
  ts.forEachChild(node, (child) => {
    collectBindings(scan, child);
  });
};

const evaluateIdentifier = (scan: Scan, identifier: ts.Identifier): StaticValue | undefined => {
  if (identifier.text === '__dirname') {
    return { type: 'string', value: posix.dirname(scan.fileAbsolute) };
  }
  if (identifier.text === '__filename') {
    return { type: 'string', value: scan.fileAbsolute };
  }
  const initializer = constantInitializer(scan.sourceFile, identifier);
  if (!initializer || scan.evaluating.has(initializer)) {
    return undefined;
  }
  scan.evaluating.add(initializer);
  try {
    return evaluate(scan, initializer);
  } finally {
    scan.evaluating.delete(initializer);
  }
};

const evaluateTemplate = (scan: Scan, node: ts.TemplateExpression): StaticValue | undefined => {
  let value = node.head.text;
  for (const span of node.templateSpans) {
    const part = evaluateString(scan, span.expression);
    if (part === undefined) {
      return undefined;
    }
    value += part + span.literal.text;
  }
  return { type: 'string', value };
};

const evaluateProperty = (scan: Scan, node: ts.PropertyAccessExpression): StaticValue | undefined => {
  const property = node.name.text;
  if (ts.isMetaProperty(node.expression) && node.expression.keywordToken === ts.SyntaxKind.ImportKeyword) {
    switch (property) {
      case 'url': {
        return { type: 'url', path: scan.fileAbsolute };
      }
      case 'dirname': {
        return { type: 'string', value: posix.dirname(scan.fileAbsolute) };
      }
      case 'filename': {
        return { type: 'string', value: scan.fileAbsolute };
      }
      default: {
        return undefined;
      }
    }
  }
  const url = property === 'pathname' || property === 'href' ? evaluate(scan, node.expression) : undefined;
  if (url?.type !== 'url') {
    return undefined;
  }
  return property === 'pathname' ? { type: 'string', value: url.path } : url;
};

const evaluateNewUrl = (scan: Scan, node: ts.NewExpression): StaticValue | undefined => {
  if (!ts.isIdentifier(node.expression) || node.expression.text !== 'URL') {
    return undefined;
  }
  const [specifierNode, baseNode] = node.arguments ?? [];
  const specifier = specifierNode ? evaluateString(scan, specifierNode) : undefined;
  const base = baseNode ? evaluate(scan, baseNode) : undefined;
  if (specifier === undefined || base?.type !== 'url') {
    return undefined;
  }
  if (specifier.startsWith('/')) {
    return { type: 'url', path: specifier };
  }
  // URL resolution drops the base's last segment unless the base ends in a slash.
  const baseDirectory = base.path.endsWith('/') ? base.path : posix.dirname(base.path);
  const resolved = posix.resolve(baseDirectory, specifier);
  const keepsSlash = specifier === '' ? base.path.endsWith('/') : /(?:^|\/)\.{0,2}$/u.test(specifier);
  return { type: 'url', path: keepsSlash ? `${resolved}/` : resolved };
};

const evaluateUrlCall = (scan: Scan, name: string, node: ts.CallExpression): StaticValue | undefined => {
  const [argument] = node.arguments;
  const value = argument ? evaluate(scan, argument) : undefined;
  if (name === 'fileURLToPath' && value) {
    return value.type === 'url' ? { type: 'string', value: value.path } : value;
  }
  if (name === 'pathToFileURL' && value?.type === 'string' && value.value.startsWith('/')) {
    return { type: 'url', path: value.value };
  }
  return undefined;
};

const evaluatePathCall = (scan: Scan, name: string, node: ts.CallExpression): StaticValue | undefined => {
  const parts: string[] = [];
  for (const argument of node.arguments) {
    const part = evaluateString(scan, argument);
    if (part === undefined) {
      return undefined;
    }
    parts.push(part);
  }
  switch (name) {
    case 'join':
    case 'normalize': {
      return { type: 'string', value: posix.join(...parts) };
    }
    case 'resolve': {
      return { type: 'string', value: posix.resolve(scan.projectAbsolute, ...parts) };
    }
    case 'dirname': {
      return parts[0] === undefined ? undefined : { type: 'string', value: posix.dirname(parts[0]) };
    }
    default: {
      return undefined;
    }
  }
};

const evaluateCall = (scan: Scan, node: ts.CallExpression): StaticValue | undefined => {
  const { expression } = node;
  if (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === 'process' &&
    expression.name.text === 'cwd'
  ) {
    return { type: 'string', value: scan.projectAbsolute };
  }
  const binding = resolveCallee(scan, expression);
  if (!binding?.name) {
    return undefined;
  }
  if (urlModules.has(binding.module)) {
    return evaluateUrlCall(scan, binding.name, node);
  }
  return pathModules.has(binding.module) ? evaluatePathCall(scan, binding.name, node) : undefined;
};

/** Statically evaluates an expression to a string (a path when absolute) or a `file:` URL. */
const evaluate = (scan: Scan, node: ts.Expression): StaticValue | undefined => {
  const literal = stringLiteralText(node);
  if (literal !== undefined) {
    return { type: 'string', value: literal };
  }
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) {
    return evaluate(scan, node.expression);
  }
  if (ts.isBinaryExpression(node)) {
    const left = node.operatorToken.kind === ts.SyntaxKind.PlusToken ? evaluateString(scan, node.left) : undefined;
    const right = left === undefined ? undefined : evaluateString(scan, node.right);
    return right === undefined ? undefined : { type: 'string', value: `${left ?? ''}${right}` };
  }
  if (ts.isIdentifier(node)) {
    return evaluateIdentifier(scan, node);
  }
  if (ts.isTemplateExpression(node)) {
    return evaluateTemplate(scan, node);
  }
  if (ts.isPropertyAccessExpression(node)) {
    return evaluateProperty(scan, node);
  }
  if (ts.isNewExpression(node)) {
    return evaluateNewUrl(scan, node);
  }
  return ts.isCallExpression(node) ? evaluateCall(scan, node) : undefined;
};

const evaluateString = (scan: Scan, node: ts.Expression): string | undefined => {
  const value = evaluate(scan, node);
  return value?.type === 'url' ? pathToFileURL(value.path).href : value?.value;
};

/** A virtual absolute path as a workspace-relative one, or undefined when it is not under the workspace. */
const workspaceRelative = (absolute: string): string | undefined => {
  if (isWithin(absolute, virtualRoot)) {
    return posix.relative(virtualRoot, absolute) || '.';
  }
  // Climbed above the workspace; an absolute literal such as `/tmp/x` is not the workspace's.
  return absolute.startsWith(virtualEscapePrefix) ? posix.relative(virtualRoot, absolute) : undefined;
};

type ReadSite = {
  readonly node: ts.Node;
  readonly kind: string;
  /** A path or `file:` URL; a relative path resolves from `base`. */
  readonly target: string;
  readonly base: string;
};

/** Records a read when its target leaves the file's project. */
const record = (scan: Scan, site: ReadSite): void => {
  let { target } = site;
  if (target.startsWith('file:')) {
    try {
      target = fileURLToPath(target);
    } catch {
      return;
    }
  }
  const resolved = workspaceRelative(posix.resolve(site.base, target));
  if (resolved === undefined || ownerOf(resolved, scan.projects) === scan.project) {
    return;
  }
  const { line } = scan.sourceFile.getLineAndCharacterOfPosition(site.node.getStart(scan.sourceFile));
  scan.reads.push({ file: scan.file.path, line: line + 1, kind: site.kind, target: resolved, project: scan.project });
};

const isRelativeSpecifier = (specifier: string): boolean =>
  specifier.startsWith('./') || specifier.startsWith('../') || specifier === '.' || specifier === '..';

/** Records a module specifier when it is relative; package names are graph edges. */
const recordSpecifier = (scan: Scan, site: Omit<ReadSite, 'base'> & { readonly base?: string }): void => {
  if (isRelativeSpecifier(site.target)) {
    record(scan, { ...site, base: site.base ?? posix.dirname(scan.fileAbsolute) });
  }
};

const visitRequire = (scan: Scan, node: ts.CallExpression, requireName: string): void => {
  const kind = ts.isIdentifier(node.expression) ? 'require' : 'require.resolve';
  const specifier = node.arguments[0] ? stringLiteralText(node.arguments[0]) : undefined;
  if (specifier === undefined) {
    return;
  }
  if (!scan.requireBases.has(requireName)) {
    // The CommonJS `require`, relative to this file.
    recordSpecifier(scan, { node, kind, target: specifier });
    return;
  }
  const baseNode = scan.requireBases.get(requireName);
  const base = baseNode ? evaluate(scan, baseNode) : undefined;
  const basePath = base?.type === 'url' ? base.path : base?.value;
  if (basePath?.startsWith('/')) {
    const directory = basePath.endsWith('/') ? basePath : posix.dirname(basePath);
    recordSpecifier(scan, { node, kind, target: specifier, base: directory });
  }
};

/** The name of the require function a call goes through: `require(…)`, `req(…)` or `require.resolve(…)`. */
const requireCallName = (scan: Scan, expression: ts.Expression): string | undefined => {
  let name: string | undefined;
  if (ts.isIdentifier(expression)) {
    name = expression.text;
  } else if (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.name.text === 'resolve'
  ) {
    name = expression.expression.text;
  }
  return name !== undefined && (name === 'require' || scan.requireBases.has(name)) ? name : undefined;
};

const visitCall = (scan: Scan, node: ts.CallExpression): void => {
  const [argument] = node.arguments;
  if (!argument) {
    return;
  }
  const { expression } = node;
  if (expression.kind === ts.SyntaxKind.ImportKeyword) {
    const specifier = evaluateString(scan, argument);
    if (specifier !== undefined) {
      recordSpecifier(scan, { node, kind: 'import()', target: specifier });
    }
    return;
  }
  const requireName = requireCallName(scan, expression);
  if (requireName !== undefined) {
    visitRequire(scan, node, requireName);
    return;
  }
  const binding = resolveCallee(scan, expression);
  if (binding?.name && fsModules.has(binding.module) && fsReadFunctions.has(binding.name)) {
    const path = evaluateString(scan, argument);
    if (path !== undefined) {
      record(scan, { node, kind: `fs.${binding.name}`, target: path, base: scan.projectAbsolute });
    }
  }
};

/** The static module specifier a declaration or type names, with its read kind. */
const staticSpecifier = (node: ts.Node): { readonly kind: string; readonly specifier?: string } | undefined => {
  if (ts.isImportDeclaration(node)) {
    const kind = node.importClause?.phaseModifier === ts.SyntaxKind.TypeKeyword ? 'import type' : 'import';
    return { kind, specifier: stringLiteralText(node.moduleSpecifier) };
  }
  if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
    return { kind: node.isTypeOnly ? 'export type' : 'export', specifier: stringLiteralText(node.moduleSpecifier) };
  }
  if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
    return { kind: 'require', specifier: stringLiteralText(node.moduleReference.expression) };
  }
  if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
    return { kind: 'import type', specifier: stringLiteralText(node.argument.literal) };
  }
  return undefined;
};

const visit = (scan: Scan, node: ts.Node): void => {
  const found = staticSpecifier(node);
  if (found?.specifier !== undefined) {
    recordSpecifier(scan, { node, kind: found.kind, target: found.specifier });
  } else if (ts.isCallExpression(node)) {
    visitCall(scan, node);
  }
  ts.forEachChild(node, (child) => {
    visit(scan, child);
  });
};

/** Scans one file: its import and require bindings, then every read. */
const scanFile = (file: SourceFile, project: ProjectRoot, projects: readonly ProjectRoot[]): CrossRootRead[] => {
  const sourceFile = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true, scriptKindOf(file.path));
  const scan: Scan = {
    file,
    project,
    projects,
    sourceFile,
    fileAbsolute: posix.join(virtualRoot, file.path),
    projectAbsolute: posix.join(virtualRoot, project.root),
    bindings: new Map(),
    requireBases: new Map(),
    evaluating: new Set(),
    reads: [],
  };
  collectBindings(scan, sourceFile);
  visit(scan, sourceFile);
  return scan.reads;
};

/** Does a binding name (an identifier or a destructuring pattern) declare `name`? */
const bindsName = (binding: ts.BindingName, name: string): boolean =>
  ts.isIdentifier(binding)
    ? binding.text === name
    : binding.elements.some((element) => !ts.isOmittedExpression(element) && bindsName(element.name, name));

/** The declaration of `name` among a scope's own statements, if it has one. */
const declarationIn = (
  sourceFile: ts.SourceFile,
  statements: readonly ts.Statement[],
  name: string,
): { readonly initializer: ts.Expression | undefined } | undefined => {
  for (const statement of statements) {
    if (ts.isVariableStatement(statement)) {
      const isConst = statement.declarationList.getFirstToken(sourceFile)?.kind === ts.SyntaxKind.ConstKeyword;
      for (const declaration of statement.declarationList.declarations) {
        if (bindsName(declaration.name, name)) {
          const simple = isConst && ts.isIdentifier(declaration.name);
          return { initializer: simple ? declaration.initializer : undefined };
        }
      }
    } else if (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) &&
      statement.name?.text === name
    ) {
      return { initializer: undefined };
    } else if (ts.isImportDeclaration(statement) && statement.importClause) {
      const { name: defaultName, namedBindings } = statement.importClause;
      const imported =
        defaultName?.text === name ||
        (namedBindings &&
          (ts.isNamespaceImport(namedBindings)
            ? namedBindings.name.text === name
            : namedBindings.elements.some((element) => element.name.text === name)));
      if (imported) {
        return { initializer: undefined };
      }
    }
  }
  return undefined;
};

/**
 * The initializer of the `const` an identifier refers to, found through the
 * enclosing scopes. A parameter, loop variable, `let`, destructured or other
 * declaration in between shadows it and makes the value unknown.
 */
const constantInitializer = (sourceFile: ts.SourceFile, identifier: ts.Identifier): ts.Expression | undefined => {
  const name = identifier.text;
  // The source file is the outermost scope; its `parent` is unset.
  for (let scope: ts.Node = identifier.parent; ; scope = scope.parent) {
    if (ts.isSourceFile(scope) || ts.isBlock(scope) || ts.isModuleBlock(scope) || ts.isCaseOrDefaultClause(scope)) {
      const declaration = declarationIn(sourceFile, scope.statements, name);
      if (declaration !== undefined) {
        return declaration.initializer;
      }
      if (ts.isSourceFile(scope)) {
        return undefined;
      }
    } else if (ts.isFunctionLike(scope) && scope.parameters.some((parameter) => bindsName(parameter.name, name))) {
      return undefined;
    } else if (
      (ts.isForStatement(scope) || ts.isForOfStatement(scope) || ts.isForInStatement(scope)) &&
      scope.initializer &&
      ts.isVariableDeclarationList(scope.initializer) &&
      scope.initializer.declarations.some((declaration) => bindsName(declaration.name, name))
    ) {
      return undefined;
    } else if (
      ts.isCatchClause(scope) &&
      scope.variableDeclaration &&
      bindsName(scope.variableDeclaration.name, name)
    ) {
      return undefined;
    }
  }
};

const scriptKindOf = (path: string): ts.ScriptKind => {
  if (path.endsWith('.tsx')) {
    return ts.ScriptKind.TSX;
  }
  if (path.endsWith('.ts') || path.endsWith('.mts') || path.endsWith('.cts')) {
    return ts.ScriptKind.TS;
  }
  return ts.ScriptKind.JSX;
};

/**
 * Finds every read in `files` that leaves the reading file's project root.
 *
 * @param files - Workspace-relative source files with their text.
 * @param projects - Every project's name and workspace-relative root.
 * @returns The reads, in file and line order.
 */
export const findCrossRootReads = (files: readonly SourceFile[], projects: readonly ProjectRoot[]): CrossRootRead[] => {
  const sorted = sortDeepestFirst(projects);
  return files
    .filter((file) => isScannedPath(file.path) && mayClimb.test(file.text))
    .flatMap((file) => {
      const project = ownerOf(file.path, sorted);
      return project ? scanFile(file, project, sorted) : [];
    })
    .toSorted((left, right) => left.file.localeCompare(right.file) || left.line - right.line);
};

/**
 * Compiles an allowlist glob: `**` spans any number of path segments (none
 * included, so `dir/**` also matches `dir`), `*` and `?` stay within one
 * segment, and `{a,b}` is an alternative. Unlike `path.matchesGlob`, wildcards
 * match dot segments such as `.pnpm` or `.git`.
 */
export const globToRegExp = (glob: string): RegExp => {
  let source = '';
  let depth = 0;
  for (let index = 0; index < glob.length; index += 1) {
    const globstar = globstarAt(glob, index);
    if (globstar) {
      source += globstar.source;
      index += globstar.length - 1;
      continue;
    }
    const character = glob[index] ?? '';
    switch (character) {
      case '*': {
        source += '[^/]*';
        break;
      }
      case '?': {
        source += '[^/]';
        break;
      }
      case '{': {
        source += '(?:';
        depth += 1;
        break;
      }
      case '}':
      case ',': {
        if (depth > 0) {
          source += character === '}' ? ')' : '|';
          depth -= character === '}' ? 1 : 0;
        } else {
          source += character;
        }
        break;
      }
      default: {
        source += character.replaceAll(/[$()+.[\\\]^|]/gu, String.raw`\$&`);
      }
    }
  }
  return new RegExp(`^${source}$`, 'u');
};

/** The `**` form starting at `index`, as its regular expression source and its length in the glob. */
const globstarAt = (glob: string, index: number): { readonly source: string; readonly length: number } | undefined => {
  if (glob.startsWith('/**', index) && (index + 3 === glob.length || glob[index + 3] === '/')) {
    return { source: '(?:/.*)?', length: 3 };
  }
  const previous = glob[index - 1];
  if (glob.startsWith('**/', index) && (index === 0 || previous === '/' || previous === '{' || previous === ',')) {
    return { source: '(?:.*/)?', length: 3 };
  }
  return glob.startsWith('**', index) ? { source: '.*', length: 2 } : undefined;
};

const globCache = new Map<string, RegExp>();

const matches = (path: string, pattern: string): boolean => {
  let expression = globCache.get(pattern);
  if (!expression) {
    expression = globToRegExp(pattern);
    globCache.set(pattern, expression);
  }
  return expression.test(path);
};

const entryMatches = (entry: AllowlistEntry, read: CrossRootRead): boolean =>
  matches(read.file, entry.file) && matches(read.target, entry.target);

/**
 * Splits reads into those no allowlist entry covers, and finds entries that cover no read.
 *
 * @param reads - The cross-root reads found.
 * @param allowlist - The checked-in allowlist.
 * @returns The unlisted reads and the stale entries.
 */
export const checkAllowlist = (
  reads: readonly CrossRootRead[],
  allowlist: readonly AllowlistEntry[],
): AllowlistCheck => ({
  unlisted: reads.filter((read) => !allowlist.some((entry) => entryMatches(entry, read))),
  stale: allowlist.filter((entry) => !reads.some((read) => entryMatches(entry, read))),
});

/** The parts of an Nx target this check reads. */
export type TargetConfig = {
  readonly inputs?: readonly unknown[];
  readonly dependsOn?: readonly unknown[];
  readonly options?: unknown;
};

/** A project with the targets and named inputs Nx resolved for it. */
export type GraphProject = ProjectRoot & {
  readonly targets: Readonly<Record<string, TargetConfig>>;
  readonly namedInputs?: Readonly<Record<string, readonly unknown[]>>;
};

/** What the coverage check needs from the workspace. */
export type CoverageContext = {
  readonly projects: readonly GraphProject[];
  /** Each project's direct graph dependencies, by project name. */
  readonly dependencies: Readonly<Record<string, readonly string[]>>;
  /** `nx.json`'s `namedInputs`. */
  readonly namedInputs: Readonly<Record<string, readonly unknown[]>>;
  /** Workspace-relative paths of the files git tracks. */
  readonly tracked: readonly string[];
  /**
   * The targets that run a test file, by its workspace-relative path, for a project that partitions
   * its suites into test sets; such a file is run by these targets alone.
   */
  readonly testRunners?: Readonly<Record<string, readonly string[]>>;
  /**
   * The uncached targets CI runs on every landing, as `project:target`. Nx neither skips nor caches
   * them, so a read they run is never stale; another target that runs the same file still needs
   * coverage.
   */
  readonly everyLanding?: readonly string[];
};

/** A cross-root read that neither a graph edge nor a declared input covers. */
export type UncoveredRead = {
  readonly read: CrossRootRead;
  /** The files the read depends on that select nothing: tracked files, directory entries or the untracked target. */
  readonly files: readonly string[];
  /** The targets taken to run the reading file. */
  readonly runningTargets: readonly string[];
  /** What to add, as one instruction. */
  readonly fix: string;
};

/** The read kinds that compile or load a module, rather than read a file's bytes. */
const moduleKinds = new Set([
  'import',
  'import type',
  'export',
  'export type',
  'import()',
  'require',
  'require.resolve',
]);

/** Read kinds that resolve a path without reading what is there. */
const pathOnlyKinds = new Set(['fs.realpath', 'fs.realpathSync']);

/** Is a path an installed dependency, a local checkout or environment file, or outside the workspace? */
const isNotWorkspaceSource = (path: string): boolean =>
  path.startsWith('../') ||
  path.startsWith('repos/') ||
  path.split('/').includes('node_modules') ||
  posix.basename(path).startsWith('.env');

/** Does the file run as, or for, a test: a test file, a file in a test-support directory or in an e2e project? */
const isTestFile = (path: string, projectRoot: string): boolean =>
  /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(path) ||
  /(?:^|\/)(?:test|tests|testing|e2e|__tests__|support)\//u.test(path.slice(projectRoot.length)) ||
  projectRoot.endsWith('-e2e');

/**
 * The `{workspaceRoot}` filesets a target's inputs list, following named inputs. These are the
 * patterns Nx 22's `getImplicitlyTouchedProjects` matches a changed file against; a negated pattern,
 * a `^` input and a `{projectRoot}` fileset select nothing outside the project.
 */
const workspaceFilesets = (
  inputs: readonly unknown[] | undefined,
  named: Readonly<Record<string, readonly unknown[]>>,
  seen: ReadonlySet<string> = new Set(),
): string[] =>
  (inputs ?? []).flatMap((input): string[] => {
    const fileset =
      typeof input === 'string'
        ? input
        : typeof input === 'object' && input !== null && 'fileset' in input && typeof input.fileset === 'string'
          ? input.fileset
          : undefined;
    if (fileset === undefined) {
      return [];
    }
    if (fileset.startsWith('{workspaceRoot}/')) {
      return [fileset.slice('{workspaceRoot}/'.length)];
    }
    const namedInput = named[fileset];
    return namedInput && !seen.has(fileset) ? workspaceFilesets(namedInput, named, new Set([...seen, fileset])) : [];
  });

/** Does a target's options name a path, workspace- or project-relative? */
const targetMentions = (target: TargetConfig, path: string, projectRoot: string): boolean => {
  const text = JSON.stringify(target.options ?? {});
  const relative = posix.relative(projectRoot, path);
  return text.includes(path) || (!relative.startsWith('../') && relative !== '' && text.includes(relative));
};

/** Does a target build `owner` first: a `dependsOn` naming it, an `nx run <owner>:…` command or a `dependentTasksOutputFiles` input? */
const buildsFirst = (target: TargetConfig, owner: string): boolean =>
  (target.dependsOn ?? []).some((entry) => {
    if (typeof entry === 'string') {
      return entry.startsWith(`${owner}:`);
    }
    const { projects } = (typeof entry === 'object' && entry !== null ? entry : {}) as { projects?: unknown };
    return projects === owner || (Array.isArray(projects) && projects.includes(owner));
  }) ||
  JSON.stringify(target.options ?? {}).includes(`nx run ${owner}:`) ||
  (target.inputs ?? []).some(
    (input) => typeof input === 'object' && input !== null && 'dependentTasksOutputFiles' in input,
  );

/** Every project a project reaches through the graph. */
const reachable = (
  start: string,
  dependencies: Readonly<Record<string, readonly string[]>>,
  cache: Map<string, ReadonlySet<string>>,
): ReadonlySet<string> => {
  const cached = cache.get(start);
  if (cached) {
    return cached;
  }
  const seen = new Set<string>();
  const pending = [start];
  for (let current = pending.pop(); current !== undefined; current = pending.pop()) {
    for (const next of dependencies[current] ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        pending.push(next);
      }
    }
  }
  cache.set(start, seen);
  return seen;
};

/** What a read depends on, in tracked files. */
type ReadFiles =
  | { readonly type: 'file'; readonly path: string }
  /** A directory listing: one tracked file stands for each entry, its manifest when it has one. */
  | { readonly type: 'directory'; readonly path: string; readonly entries: readonly string[] }
  | { readonly type: 'untracked'; readonly path: string };

/** The tracked file a module specifier loads: TypeScript resolves `x.js` to `x.ts`, and an extensionless one to `x.ts` or `x/index.ts`. */
const moduleCandidates = (target: string): string[] => {
  const swapped = /\.(?:[cm]?js|jsx)$/u.test(target)
    ? ['.ts', '.tsx', '.mts', '.cts'].map((extension) => target.replace(/\.(?:[cm]?js|jsx)$/u, extension))
    : [];
  const extensionless = ['.ts', '.tsx', '.js', '.mjs'].flatMap((extension) => [
    `${target}${extension}`,
    `${target}/index${extension}`,
  ]);
  return [target, ...swapped, ...extensionless];
};

const filesOfRead = (
  read: CrossRootRead,
  tracked: ReadonlySet<string>,
  sortedTracked: readonly string[],
): ReadFiles => {
  const candidates = moduleKinds.has(read.kind) ? moduleCandidates(read.target) : [read.target];
  const file = candidates.find((candidate) => tracked.has(candidate));
  if (file !== undefined) {
    return { type: 'file', path: file };
  }
  const prefix = `${read.target}/`;
  const directories = new Map<string, string>();
  const files: string[] = [];
  for (const path of sortedTracked) {
    if (!path.startsWith(prefix)) {
      continue;
    }
    const rest = path.slice(prefix.length);
    const slash = rest.indexOf('/');
    if (slash === -1) {
      files.push(path);
      continue;
    }
    const entry = rest.slice(0, slash);
    const current = directories.get(entry);
    if (current === undefined || (path === `${prefix}${entry}/package.json` && current !== path)) {
      directories.set(entry, path);
    }
  }
  // A listing that holds directories is read for them (projects, examples); a file beside them is noise.
  const entries = directories.size > 0 ? [...directories.values()] : files;
  return entries.length > 0
    ? { type: 'directory', path: read.target, entries }
    : { type: 'untracked', path: read.target };
};

/** Does a fileset name a directory's entries by a wildcard, so that adding or removing one selects the reader? */
const watchesListing = (pattern: string, directory: string): boolean => {
  if (!pattern.startsWith(`${directory}/`)) {
    return false;
  }
  const [segment = ''] = pattern.slice(directory.length + 1).split('/');
  return /[*?{]/u.test(segment);
};

/** The fileset a directory listing needs: its entries' shared manifest, or its files' shared extension. */
const listingPattern = (directory: string, entries: readonly string[]): string => {
  const tails = new Set(
    entries.map((entry) =>
      entry
        .slice(directory.length + 1)
        .split('/')
        .slice(1)
        .join('/'),
    ),
  );
  if (tails.size === 1 && tails.has('package.json')) {
    return `${directory}/*/package.json`;
  }
  const extensions = new Set(entries.map((entry) => posix.extname(entry)));
  return tails.size === 1 && tails.has('') && extensions.size === 1
    ? `${directory}/*${[...extensions][0] ?? ''}`
    : `${directory}/**/*`;
};

/**
 * The targets that run a file: those its test set assigns it to, else those naming it, else the test
 * targets for a test file, else every target.
 */
const runningTargets = (
  read: CrossRootRead,
  reader: GraphProject,
  testRunners: Readonly<Record<string, readonly string[]>> = {},
): { readonly running: ReadonlyArray<readonly [string, TargetConfig]>; readonly named: boolean } => {
  const targets = Object.entries(reader.targets);
  const assigned = testRunners[read.file];
  if (assigned !== undefined) {
    return { running: targets.filter(([name]) => assigned.includes(name)), named: true };
  }
  const naming = targets.filter(([, target]) => targetMentions(target, read.file, reader.root));
  if (naming.length > 0) {
    return { running: naming, named: true };
  }
  if (isTestFile(read.file, reader.root)) {
    // Test configurations name globs and helpers rarely, so any test target may run a test file.
    const tests = targets.filter(([name]) => /^(?:test|e2e)(?::|$)/u.test(name));
    if (tests.length > 0) {
      return { running: tests, named: false };
    }
  }
  return { running: targets, named: false };
};

/** The one target to name in a fix: the type check for a module read, else the first running target, `test` first. */
const fixTarget = (
  read: CrossRootRead,
  running: ReadonlyArray<readonly [string, TargetConfig]>,
  named: boolean,
): string => {
  const names = running.map(([name]) => name);
  if (moduleKinds.has(read.kind) && names.includes('typecheck')) {
    return 'typecheck';
  }
  return !named && names.includes('test') ? 'test' : (names[0] ?? 'test');
};

/**
 * Finds the cross-root reads whose reader Nx would not select as affected, or re-hash, when what the
 * read depends on changes. A read is covered by any of:
 *
 * - a graph edge: the reading project depends, directly or not, on the project that owns the file;
 * - a declared input: a target that runs the reading file lists a `{workspaceRoot}` fileset matching
 *   it (Nx 22 selects a project when a changed file matches such a fileset in any of its targets);
 *   a directory listing needs a fileset that names its entries by a wildcard, or one per entry;
 * - for an untracked target (build output), a fileset matching its path, or a running target that
 *   builds its owner first (`dependsOn`, `nx run <owner>:…`, `dependentTasksOutputFiles`);
 * - for a target CI runs uncached on every landing (`everyLanding`), nothing: Nx never skips it;
 * - an allowlist entry's `unscheduled` reason, only for a runtime read by a file that no target of
 *   its project names and that is not a test file: an operator script no CI task runs.
 *
 * Exempt: `nx.json` (every project's hash includes it), the workspace root directory itself,
 * `realpath`, installed dependencies, local `.env` files, untracked files outside every project and
 * paths outside the workspace. The targets that run a file are those its test set assigns it to
 * (`testRunners`), else those whose options name it; for a test file, its `test*` and `e2e*` targets;
 * else every target.
 * A module read is also run by `typecheck`.
 *
 * @param reads - The cross-root reads found.
 * @param context - The project graph, `nx.json`'s named inputs and the tracked files.
 * @param allowlist - The allowlist, for its `unscheduled` entries.
 * @returns The reads that nothing covers, with the fix for each.
 */
export const checkCoverage = (
  reads: readonly CrossRootRead[],
  context: CoverageContext,
  allowlist: readonly AllowlistEntry[] = [],
): UncoveredRead[] => {
  const workspace: Workspace = {
    context,
    projects: new Map(context.projects.map((project) => [project.name, project])),
    sorted: sortDeepestFirst(context.projects),
    tracked: new Set(context.tracked),
    sortedTracked: context.tracked.toSorted(),
    closures: new Map(),
  };
  return reads.flatMap((read) => {
    const reader = workspace.projects.get(read.project.name);
    const exempt = read.target === 'nx.json' || read.target === '.' || pathOnlyKinds.has(read.kind);
    if (!reader || exempt || isNotWorkspaceSource(read.target)) {
      return [];
    }
    const uncovered = coverageOf(read, reader, workspace);
    return uncovered && !isUnscheduled(read, allowlist, workspace) ? [uncovered] : [];
  });
};

/** The coverage check's indexes over the workspace. */
type Workspace = {
  readonly context: CoverageContext;
  readonly projects: ReadonlyMap<string, GraphProject>;
  readonly sorted: readonly ProjectRoot[];
  readonly tracked: ReadonlySet<string>;
  readonly sortedTracked: readonly string[];
  readonly closures: Map<string, ReadonlySet<string>>;
};

/** Does an `unscheduled` allowlist entry excuse the read: a runtime read by a script no target names? */
const isUnscheduled = (read: CrossRootRead, allowlist: readonly AllowlistEntry[], workspace: Workspace): boolean => {
  const reader = workspace.projects.get(read.project.name);
  return (
    reader !== undefined &&
    !runningTargets(read, reader, workspace.context.testRunners).named &&
    !isTestFile(read.file, reader.root) &&
    !moduleKinds.has(read.kind) &&
    allowlist.some((entry) => entry.unscheduled !== undefined && entryMatches(entry, read))
  );
};

/** The read as uncovered, with its fix, or undefined when an edge or a declared input covers it. */
const coverageOf = (read: CrossRootRead, reader: GraphProject, workspace: Workspace): UncoveredRead | undefined => {
  const named = { ...workspace.context.namedInputs, ...reader.namedInputs };
  const { running: baseRunning, named: isNamed } = runningTargets(read, reader, workspace.context.testRunners);
  const typecheck = moduleKinds.has(read.kind)
    ? Object.entries(reader.targets).filter(
        ([name]) => name === 'typecheck' && !baseRunning.some(([other]) => other === name),
      )
    : [];
  const everyLanding = new Set(workspace.context.everyLanding);
  const unskipped = (name: string): boolean => everyLanding.has(`${reader.name}:${name}`);
  // A target CI runs uncached on every landing never runs stale; the others still need coverage.
  const running = [...baseRunning, ...typecheck].filter(([name]) => !unskipped(name));
  if (running.length === 0 && baseRunning.length > 0) {
    return undefined;
  }
  const runningNames = running.map(([name]) => name);
  const patterns = running.flatMap(([, target]) => workspaceFilesets(target.inputs, named));
  const deps = reachable(reader.name, workspace.context.dependencies, workspace.closures);
  const owned = (path: string): string | undefined => ownerOf(path, workspace.sorted)?.name;
  const declared = (path: string): boolean => patterns.some((pattern) => matches(path, pattern));
  const selects = (path: string): boolean => {
    const owner = owned(path);
    return (owner !== undefined && (owner === reader.name || deps.has(owner))) || declared(path);
  };
  const where = `${reader.name}:${fixTarget(read, running, isNamed)}`;
  const files = filesOfRead(read, workspace.tracked, workspace.sortedTracked);
  const uncovered = (open: readonly string[], fix: string): UncoveredRead | undefined =>
    open.length > 0 ? { read, files: open, runningTargets: runningNames, fix } : undefined;

  if (files.type === 'untracked') {
    const owner = owned(files.path);
    const built =
      owner === undefined ||
      deps.has(owner) ||
      declared(files.path) ||
      running.some(([, config]) => buildsFirst(config, owner));
    return built
      ? undefined
      : uncovered(
          [files.path],
          `add { "projects": ["${owner}"], "target": "<the target that writes ${files.path}>" } to the dependsOn of ${where}`,
        );
  }
  if (files.type === 'directory') {
    const listed = patterns.some((pattern) => watchesListing(pattern, files.path));
    return uncovered(
      listed ? [] : files.entries.filter((entry) => !selects(entry)),
      `add "{workspaceRoot}/${listingPattern(files.path, files.entries)}" (narrowed to the entries it reads) to the inputs of ${where}`,
    );
  }
  const owner = owned(files.path);
  const edge = owner === undefined ? '' : `, or add "${owner}" to the implicitDependencies of ${reader.name}`;
  return uncovered(
    selects(files.path) ? [] : [files.path],
    `add "{workspaceRoot}/${files.path}" to the inputs of ${where}${edge}`,
  );
};

/**
 * Formats the coverage failure: one line per uncovered read, then what to add.
 *
 * @param uncovered - The uncovered reads.
 * @returns The report lines.
 */
export const formatCoverage = (uncovered: readonly UncoveredRead[]): string[] => {
  const lines = uncovered.flatMap(({ read, files, runningTargets: running, fix }) => {
    const shown = files.slice(0, 3).join(', ') + (files.length > 3 ? ` (+${String(files.length - 3)} more)` : '');
    return [
      `${read.file}:${String(read.line)}: ${read.kind} reads ${read.target}, but a change to ${shown} does not select ${read.project.name} (run by ${running.join(', ')})`,
      `  fix: ${fix}`,
    ];
  });
  if (uncovered.length > 0) {
    lines.push(
      '',
      "Nx 22 selects a project as affected only through a graph edge or a {workspaceRoot} fileset in its targets' inputs,",
      'and caches a target by its inputs. Each read above has neither, so a change to the read file alone skips the reader.',
      'An allowlist entry records why a read stays cross-root; it does not select the reader.',
    );
  }
  return lines;
};

/**
 * Parses and checks the shape of the allowlist file's JSON.
 *
 * @param json - The file's text.
 * @returns Its entries.
 */
export const parseAllowlist = (json: string): AllowlistEntry[] => {
  const value: unknown = JSON.parse(json);
  if (!Array.isArray(value)) {
    throw new TypeError('The cross-root read allowlist must be a JSON array.');
  }
  return value.map((entry: unknown, index) => {
    const record = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<string, unknown>;
    const { file, target, reason, unscheduled } = record;
    if (typeof file !== 'string' || typeof target !== 'string' || typeof reason !== 'string' || reason.trim() === '') {
      throw new TypeError(`Allowlist entry ${String(index)} needs a string file, target and non-empty reason.`);
    }
    if (unscheduled === undefined) {
      return { file, target, reason };
    }
    if (typeof unscheduled !== 'string' || unscheduled.trim() === '') {
      throw new TypeError(`Allowlist entry ${String(index)} has an empty unscheduled reason.`);
    }
    return { file, target, reason, unscheduled };
  });
};

/**
 * Formats the failure report: one line per unlisted read and stale entry, then a hint.
 *
 * @param check - The allowlist check result.
 * @param allowlistPath - Workspace-relative path of the allowlist, for the hint.
 * @returns The report lines.
 */
export const formatAllowlistCheck = (check: AllowlistCheck, allowlistPath: string): string[] => {
  const lines = check.unlisted.map(
    ({ file, line, kind, target, project }) =>
      `${file}:${String(line)}: ${kind} reads ${target} outside project ${project.name} (${project.root})`,
  );
  if (check.unlisted.length > 0) {
    lines.push(
      '',
      'Each read above bypasses the Nx graph, so the reading task is neither re-run nor re-hashed when the target changes.',
      'Fix it by importing the target through its package with a declared dependency, by moving the file into the',
      `reading project, or, if the read must stay, by adding { "file", "target", "reason" } to ${allowlistPath}.`,
    );
  }
  for (const { file, target } of check.stale) {
    lines.push(
      `${allowlistPath}: stale entry { "file": "${file}", "target": "${target}" } matches no read; remove it.`,
    );
  }
  return lines;
};

const allowlistRelativePath = 'scripts/src/cross-root-reads.allowlist.json';

/**
 * Reads the given workspace-relative files' text from disk.
 *
 * @param workspaceRoot - Absolute workspace root.
 * @param paths - Workspace-relative paths.
 * @returns The files with their text.
 */
export const loadSourceFiles = (workspaceRoot: string, paths: readonly string[]): SourceFile[] =>
  paths
    .filter((path) => isScannedPath(path))
    .map((path) => ({ path, text: readFileSync(resolve(workspaceRoot, path), 'utf8') }));

/**
 * Loads the checked-in allowlist.
 *
 * @param workspaceRoot - Absolute workspace root.
 * @returns Its entries.
 */
export const loadAllowlist = (workspaceRoot: string): AllowlistEntry[] =>
  parseAllowlist(readFileSync(resolve(workspaceRoot, allowlistRelativePath), 'utf8'));

/**
 * Lists the files git tracks in the workspace.
 *
 * @param workspaceRoot - Absolute workspace root.
 * @returns Workspace-relative paths.
 */
export const trackedPaths = (workspaceRoot: string): string[] =>
  execFileSync('git', ['ls-files', '-z'], { cwd: workspaceRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0')
    .filter((path) => path !== '');

/**
 * The targets that run each suite of `scripts`, which `scripts/vitest.config.ts` partitions by
 * `TAU_SCRIPTS_TEST_SET`: `test:e2e` the browser set, `validate-workspace-tests` the workspace set.
 * Its other suites run under `test`, which the default rule already finds.
 */
export const scriptsTestRunners: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  [
    ...browserTests.map((path): [string, string[]] => [path, ['test:e2e']]),
    ...workspaceTests.map((path): [string, string[]] => [path, ['validate-workspace-tests']]),
  ].map(([path, targets]): [string, string[]] => [`scripts/${path}`, targets]),
);

/** The target CI's Validate workspace job runs on every landing (`.github/workflows/ci.yml`). */
const landingGate = { project: 'scripts', target: 'validate' } as const;

/**
 * The uncached targets the landing gate runs: its same-project `dependsOn` entries, by name or glob,
 * whose `cache` is `false`. A cached one can be skipped on a cache hit, so it needs coverage.
 *
 * @param graph - The Nx project graph.
 * @returns Each such target as `project:target`.
 */
export const everyLandingTargets = (graph: Pick<ProjectGraph, 'nodes'>): string[] => {
  const targets = graph.nodes[landingGate.project]?.data.targets ?? {};
  const patterns = (targets[landingGate.target]?.dependsOn ?? []).flatMap((entry): string[] => {
    if (typeof entry === 'string') {
      return entry.startsWith('^') || entry.includes(':') ? [] : [entry];
    }
    return entry.projects === undefined && entry.dependencies !== true && typeof entry.target === 'string'
      ? [entry.target]
      : [];
  });
  return Object.entries(targets)
    .filter(([name, config]) => config.cache === false && patterns.some((pattern) => matches(name, pattern)))
    .map(([name]) => `${landingGate.project}:${name}`);
};

/**
 * The coverage context from a project graph and `nx.json`.
 *
 * @param graph - The Nx project graph.
 * @param nxJson - `nx.json`'s text.
 * @param tracked - The tracked files.
 * @returns The context `checkCoverage` reads.
 */
export const coverageContext = (
  graph: Pick<ProjectGraph, 'nodes' | 'dependencies'>,
  nxJson: string,
  tracked: readonly string[],
): CoverageContext => {
  const { namedInputs = {} } = JSON.parse(nxJson) as { namedInputs?: Record<string, readonly unknown[]> };
  return {
    projects: Object.entries(graph.nodes).map(([name, node]) => ({
      name,
      root: node.data.root,
      targets: (node.data.targets ?? {}) as Readonly<Record<string, TargetConfig>>,
      namedInputs: node.data.namedInputs as Readonly<Record<string, readonly unknown[]>> | undefined,
    })),
    dependencies: Object.fromEntries(
      Object.entries(graph.dependencies).map(([name, edges]) => [name, edges.map(({ target }) => target)]),
    ),
    namedInputs,
    tracked,
    testRunners: scriptsTestRunners,
    everyLanding: everyLandingTargets(graph),
  };
};

const main = async (): Promise<void> => {
  const workspaceRoot = resolve(import.meta.dirname, '../..');
  const graph = await createProjectGraphAsync();
  const projects = Object.entries(graph.nodes).map(([name, node]) => ({ name, root: node.data.root }));
  const tracked = trackedPaths(workspaceRoot);
  const files = loadSourceFiles(workspaceRoot, tracked);
  const reads = findCrossRootReads(files, projects);
  const allowlist = loadAllowlist(workspaceRoot);
  const check = checkAllowlist(reads, allowlist);
  const uncovered = checkCoverage(
    reads,
    coverageContext(graph, readFileSync(resolve(workspaceRoot, 'nx.json'), 'utf8'), tracked),
    allowlist,
  );

  if (check.unlisted.length > 0 || check.stale.length > 0 || uncovered.length > 0) {
    console.error([...formatAllowlistCheck(check, allowlistRelativePath), ...formatCoverage(uncovered)].join('\n'));
    process.exit(1);
  }

  console.log(
    `✓ ${String(files.length)} files in ${String(projects.length)} projects: ${String(reads.length)} cross-root reads, all allowlisted, each selected by a graph edge or a declared input`,
  );
};

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(resolve(entryPath)).href) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
