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
 * Usage: pnpm nx run scripts:validate-cross-root-reads
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { posix, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createProjectGraphAsync } from '@nx/devkit';
import ts from 'typescript';

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
    const { file, target, reason } = record;
    if (typeof file !== 'string' || typeof target !== 'string' || typeof reason !== 'string' || reason.trim() === '') {
      throw new TypeError(`Allowlist entry ${String(index)} needs a string file, target and non-empty reason.`);
    }
    return { file, target, reason };
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

const main = async (): Promise<void> => {
  const workspaceRoot = resolve(import.meta.dirname, '../..');
  const graph = await createProjectGraphAsync();
  const projects = Object.entries(graph.nodes).map(([name, node]) => ({ name, root: node.data.root }));
  const files = loadSourceFiles(workspaceRoot, trackedPaths(workspaceRoot));
  const reads = findCrossRootReads(files, projects);
  const check = checkAllowlist(reads, loadAllowlist(workspaceRoot));

  if (check.unlisted.length > 0 || check.stale.length > 0) {
    console.error(formatAllowlistCheck(check, allowlistRelativePath).join('\n'));
    process.exit(1);
  }

  console.log(
    `✓ ${String(files.length)} files in ${String(projects.length)} projects: ${String(reads.length)} cross-root reads, all allowlisted`,
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
