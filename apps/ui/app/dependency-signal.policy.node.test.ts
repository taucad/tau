// @vitest-environment node
/*
 * Guards ruling P66: a dependency array is never a change signal.
 *
 * React Compiler infers dependencies from callback reads and silently drops
 * listed values the callback never reads. Tests run without that compiler, so
 * scan every production TypeScript module under this app instead.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const hookArguments: ReadonlyMap<string, readonly [number, number]> = new Map([
  ['useCallback', [0, 1]],
  ['useEffect', [0, 1]],
  ['useImperativeHandle', [1, 2]],
  ['useLayoutEffect', [0, 1]],
  ['useMemo', [0, 1]],
]);

const declarationKinds = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.BindingElement,
  ts.SyntaxKind.ClassDeclaration,
  ts.SyntaxKind.ClassExpression,
  ts.SyntaxKind.EnumDeclaration,
  ts.SyntaxKind.EnumMember,
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.FunctionExpression,
  ts.SyntaxKind.ImportClause,
  ts.SyntaxKind.ImportSpecifier,
  ts.SyntaxKind.InterfaceDeclaration,
  ts.SyntaxKind.NamespaceImport,
  ts.SyntaxKind.Parameter,
  ts.SyntaxKind.PropertyDeclaration,
  ts.SyntaxKind.TypeAliasDeclaration,
  ts.SyntaxKind.TypeParameter,
  ts.SyntaxKind.VariableDeclaration,
]);
const identifierPattern = /^[$A-Z_a-z][\w$]*$/;

function productionTypeScriptFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...productionTypeScriptFiles(path));
    } else if (/\.(?:ts|tsx)$/.test(entry.name) && !/\.(?:test|spec)(?:-d)?\.(?:ts|tsx)$/.test(entry.name)) {
      files.push(path);
    }
  }
  return files.sort();
}

function isRead(identifier: ts.Identifier): boolean {
  const { parent } = identifier;
  if (ts.isShorthandPropertyAssignment(parent)) {
    return true;
  }
  if (ts.isPropertyAccessExpression(parent) && parent.name === identifier) {
    return false;
  }
  if (
    (ts.isPropertyAssignment(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isGetAccessorDeclaration(parent) ||
      ts.isSetAccessorDeclaration(parent)) &&
    parent.name === identifier
  ) {
    return false;
  }
  return !(declarationKinds.has(parent.kind) && (parent as ts.NamedDeclaration).name === identifier);
}

function bindingContainsName(name: ts.BindingName, identifier: string): boolean {
  if (ts.isIdentifier(name)) {
    return name.text === identifier;
  }
  return name.elements.some((element) => ts.isBindingElement(element) && bindingContainsName(element.name, identifier));
}

function scopeDeclares(scope: ts.Node, identifier: string): boolean {
  if (ts.isFunctionLike(scope)) {
    if ((ts.isFunctionDeclaration(scope) || ts.isFunctionExpression(scope)) && scope.name?.text === identifier) {
      return true;
    }
    if (scope.parameters.some((parameter) => bindingContainsName(parameter.name, identifier))) {
      return true;
    }
  }
  if (ts.isCatchClause(scope) && scope.variableDeclaration !== undefined) {
    return bindingContainsName(scope.variableDeclaration.name, identifier);
  }
  if (ts.isForStatement(scope) && scope.initializer !== undefined && ts.isVariableDeclarationList(scope.initializer)) {
    return scope.initializer.declarations.some((declaration) => bindingContainsName(declaration.name, identifier));
  }
  if ((ts.isForInStatement(scope) || ts.isForOfStatement(scope)) && ts.isVariableDeclarationList(scope.initializer)) {
    return scope.initializer.declarations.some((declaration) => bindingContainsName(declaration.name, identifier));
  }
  if (!ts.isBlock(scope) && !ts.isSourceFile(scope)) {
    return false;
  }
  return scope.statements.some((statement) => {
    if (ts.isVariableStatement(statement)) {
      return statement.declarationList.declarations.some((declaration) =>
        bindingContainsName(declaration.name, identifier),
      );
    }
    return (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) &&
      statement.name?.text === identifier
    );
  });
}

function isLocallyBound(identifier: ts.Identifier, callback: ts.Node): boolean {
  let scope = identifier.parent;
  for (;;) {
    if (scopeDeclares(scope, identifier.text)) {
      return true;
    }
    if (scope === callback) {
      return false;
    }
    scope = scope.parent;
  }
}

function rootIdentifier(node: ts.Expression): ts.Identifier | undefined {
  if (ts.isIdentifier(node)) {
    return node;
  }
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    return rootIdentifier(node.expression);
  }
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isSatisfiesExpression(node)
  ) {
    return rootIdentifier(node.expression);
  }
  return undefined;
}

function normalizedExpression(node: ts.Expression): string | undefined {
  if (ts.isIdentifier(node)) {
    return node.text;
  }
  if (ts.isPropertyAccessExpression(node)) {
    const expression = normalizedExpression(node.expression);
    return expression === undefined ? undefined : `${expression}.${node.name.text}`;
  }
  if (ts.isElementAccessExpression(node)) {
    const expression = normalizedExpression(node.expression);
    const argument = node.argumentExpression;
    if (expression === undefined || (!ts.isStringLiteral(argument) && !ts.isNumericLiteral(argument))) {
      return undefined;
    }
    return ts.isStringLiteral(argument) && identifierPattern.test(argument.text)
      ? `${expression}.${argument.text}`
      : `${expression}[${JSON.stringify(argument.text)}]`;
  }
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isSatisfiesExpression(node)
  ) {
    return normalizedExpression(node.expression);
  }
  return undefined;
}

function expressionsRead(node: ts.Node): Set<string> {
  const read = new Set<string>();
  const collect = (child: ts.Node): void => {
    if (ts.isTypeNode(child)) {
      return;
    }
    if (ts.isIdentifier(child) && isRead(child) && !isLocallyBound(child, node)) {
      read.add(child.text);
    }
    if (ts.isPropertyAccessExpression(child) || ts.isElementAccessExpression(child)) {
      const expression = normalizedExpression(child);
      const root = rootIdentifier(child);
      if (expression !== undefined && root !== undefined && !isLocallyBound(root, node)) {
        read.add(expression);
      }
    }
    child.forEachChild(collect);
  };
  collect(node);
  return read;
}

type ReactImports = {
  readonly hooks: ReadonlyMap<string, string>;
  readonly namespaces: ReadonlySet<string>;
};

function reactImports(sourceFile: ts.SourceFile): ReactImports {
  const hooks = new Map<string, string>();
  const namespaces = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== 'react' ||
      statement.importClause === undefined
    ) {
      continue;
    }
    if (statement.importClause.name !== undefined) {
      namespaces.add(statement.importClause.name.text);
    }
    const bindings = statement.importClause.namedBindings;
    if (bindings === undefined) {
      continue;
    }
    if (ts.isNamespaceImport(bindings)) {
      namespaces.add(bindings.name.text);
      continue;
    }
    for (const element of bindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;
      if (hookArguments.has(importedName)) {
        hooks.set(element.name.text, importedName);
      }
    }
  }
  return { hooks, namespaces };
}

function hookName(expression: ts.LeftHandSideExpression, imports: ReactImports): string | undefined {
  if (ts.isIdentifier(expression)) {
    return imports.hooks.get(expression.text);
  }
  if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)) {
    return imports.namespaces.has(expression.expression.text) && hookArguments.has(expression.name.text)
      ? expression.name.text
      : undefined;
  }
  if (
    ts.isElementAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    imports.namespaces.has(expression.expression.text) &&
    ts.isStringLiteral(expression.argumentExpression) &&
    hookArguments.has(expression.argumentExpression.text)
  ) {
    return expression.argumentExpression.text;
  }
  return undefined;
}

function callbackInitializer(
  initializer: ts.Expression | undefined,
  imports: ReactImports,
): ts.FunctionLikeDeclaration | undefined {
  if (initializer === undefined || ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
    return initializer;
  }
  if (!ts.isCallExpression(initializer) || hookName(initializer.expression, imports) !== 'useCallback') {
    return undefined;
  }
  const [wrappedCallback] = initializer.arguments;
  return wrappedCallback !== undefined &&
    (ts.isArrowFunction(wrappedCallback) || ts.isFunctionExpression(wrappedCallback))
    ? wrappedCallback
    : undefined;
}

function callbackInStatements(
  statements: ts.NodeArray<ts.Statement>,
  identifier: string,
  imports: ReactImports,
): ts.FunctionLikeDeclaration | undefined {
  for (const statement of statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === identifier) {
      return statement;
    }
    if (!ts.isVariableStatement(statement)) {
      continue;
    }
    const declaration = statement.declarationList.declarations.find(
      ({ name }) => ts.isIdentifier(name) && name.text === identifier,
    );
    if (declaration !== undefined) {
      return callbackInitializer(declaration.initializer, imports);
    }
  }
  return undefined;
}

function callbackDeclaration(identifier: ts.Identifier, imports: ReactImports): ts.FunctionLikeDeclaration | undefined {
  let scope = identifier.parent;
  for (;;) {
    if (ts.isBlock(scope) || ts.isSourceFile(scope)) {
      const callback = callbackInStatements(scope.statements, identifier.text, imports);
      if (callback !== undefined || ts.isSourceFile(scope)) {
        return callback;
      }
    }
    scope = scope.parent;
  }
}

type AnalysisContext = Readonly<{ sourceFile: ts.SourceFile; appRoot: string; imports: ReactImports }>;

function unreadHookDependencies(node: ts.CallExpression, context: AnalysisContext): string[] {
  const violations: string[] = [];
  const { appRoot, imports, sourceFile } = context;
  const name = hookName(node.expression, imports);
  const indexes = name === undefined ? undefined : hookArguments.get(name);
  const callback = indexes === undefined ? undefined : node.arguments[indexes[0]];
  const dependencies = indexes === undefined ? undefined : node.arguments[indexes[1]];
  if (
    name === undefined ||
    callback === undefined ||
    dependencies === undefined ||
    !ts.isArrayLiteralExpression(dependencies)
  ) {
    return violations;
  }
  const callbackNode = ts.isIdentifier(callback) ? callbackDeclaration(callback, imports) : callback;
  const sourcePath = relative(appRoot, sourceFile.fileName);
  if (callbackNode === undefined) {
    const position = sourceFile.getLineAndCharacterOfPosition(callback.getStart(sourceFile));
    return [
      `app/${sourcePath}:${position.line + 1}:${position.character + 1} ${name} callback \`${callback.getText(sourceFile)}\` cannot be resolved`,
    ];
  }
  const read = expressionsRead(callbackNode);
  if (ts.isIdentifier(callback)) {
    read.add(callback.text);
  }
  for (const dependency of dependencies.elements) {
    const expression = ts.isSpreadElement(dependency) ? undefined : normalizedExpression(dependency);
    const position = sourceFile.getLineAndCharacterOfPosition(dependency.getStart(sourceFile));
    if (expression === undefined) {
      violations.push(
        `app/${sourcePath}:${position.line + 1}:${position.character + 1} ${name} dependency \`${dependency.getText(sourceFile)}\` cannot be analyzed`,
      );
      continue;
    }
    if (read.has(expression)) {
      continue;
    }
    violations.push(
      `app/${sourcePath}:${position.line + 1}:${position.character + 1} ${name} lists \`${dependency.getText(sourceFile)}\`, never read`,
    );
  }
  return violations;
}

function unreadDependencies(sourceFile: ts.SourceFile, appRoot: string): string[] {
  const violations: string[] = [];
  const imports = reactImports(sourceFile);
  const context = { appRoot, imports, sourceFile };
  const walk = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      violations.push(...unreadHookDependencies(node, context));
    }
    node.forEachChild(walk);
  };
  walk(sourceFile);
  return violations;
}

describe('P66: a dependency array is never a change signal', () => {
  it('recognizes only imported React hooks and rejects unsupported or mismatched expressions', () => {
    const sourceFile = ts.createSourceFile(
      '/fixture/dependencies.tsx',
      `
        import ReactDefault, { useCallback, useEffect as effect, useMemo as memo } from 'react';
        import * as ReactNamespace from 'react';

        const size = { width: 1, height: 2 };
        const dependencies = [size.width];
        const callback = useCallback(() => size.height, [size.height]);
        effect(callback, [callback]);
        memo(() => size.height, [size.width]);
        ReactDefault.useMemo(() => size.height, [...dependencies]);
        ReactNamespace['useMemo'](() => size.height, [getDependency()]);
        unrelated.useMemo(() => size.height, [size.width]);
        memo((size) => size.height, [size.height]);
      `,
      ts.ScriptTarget.ESNext,
      true,
      ts.ScriptKind.TSX,
    );

    expect(unreadDependencies(sourceFile, '/fixture')).toEqual([
      'app/dependencies.tsx:9:34 useMemo lists `size.width`, never read',
      'app/dependencies.tsx:10:50 useMemo dependency `...dependencies` cannot be analyzed',
      'app/dependencies.tsx:11:55 useMemo dependency `getDependency()` cannot be analyzed',
      'app/dependencies.tsx:13:38 useMemo lists `size.height`, never read',
    ]);
  });

  it('lists no dependency its callback does not read in apps/ui/app production modules', () => {
    const appRoot = fileURLToPath(new URL('.', import.meta.url));
    const violations = productionTypeScriptFiles(appRoot).flatMap((path) => {
      const sourceFile = ts.createSourceFile(
        path,
        readFileSync(path, 'utf8'),
        ts.ScriptTarget.ESNext,
        true,
        path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      return unreadDependencies(sourceFile, appRoot);
    });
    expect(violations, violations.join('\n')).toEqual([]);
  }, 60_000);
});
