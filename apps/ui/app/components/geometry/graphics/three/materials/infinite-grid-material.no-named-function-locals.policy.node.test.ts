// @vitest-environment node
/*
 * Guards `docs/policy/graphics-backend-policy.md` §3: named `.toVar('…')` inside reusable `Fn(...)`
 * bodies (non–immediately-invoked) collide when TSL inlines multiple call sites.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

function listNodeTsUnderApp(appRoot: string): string[] {
  const accumulated: string[] = [];

  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      if (entry === 'node_modules') {
        continue;
      }

      const full = join(directory, entry);
      const stats = statSync(full);
      if (stats.isDirectory()) {
        walk(full);
      } else if (entry.endsWith('.node.ts')) {
        accumulated.push(full);
      }
    }
  };

  walk(appRoot);
  return accumulated;
}

type ViolationDetail = `${string}:${number}:${number}`;

function violationLine(sourcePath: string, position: ts.LineAndCharacter): ViolationDetail {
  return `${sourcePath}:${position.line + 1}:${position.character + 1}`;
}

function isFunctionCallImmediatelyInvoked(functionCallExpression: ts.CallExpression): boolean {
  return (
    ts.isCallExpression(functionCallExpression.parent) &&
    functionCallExpression.parent.expression === functionCallExpression
  );
}

function scanForNamedToVariableInSubtree(root: ts.Node, sourceFile: ts.SourceFile): ViolationDetail[] {
  const found: ViolationDetail[] = [];

  const pushIfNamedToVariableLiteral = (node: ts.CallExpression): void => {
    if (!ts.isPropertyAccessExpression(node.expression)) {
      return;
    }

    if (node.expression.name.text !== 'toVar') {
      return;
    }

    const [firstArgument] = node.arguments;
    if (firstArgument === undefined || !ts.isStringLiteralLike(firstArgument)) {
      return;
    }

    const start = sourceFile.getLineAndCharacterOfPosition(firstArgument.getStart(sourceFile));
    found.push(violationLine(sourceFile.fileName, start));
  };

  const visit = (inner: ts.Node): void => {
    if (ts.isCallExpression(inner)) {
      pushIfNamedToVariableLiteral(inner);
    }

    ts.forEachChild(inner, visit);
  };

  visit(root);
  return found;
}

function violationsInSource(sourceText: string, sourcePath: string): ViolationDetail[] {
  const sourceFile = ts.createSourceFile(sourcePath, sourceText, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  const result: ViolationDetail[] = [];

  const walk = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;

      const isFunctionFabrication =
        (ts.isIdentifier(callee) && callee.text === 'Fn') ||
        (ts.isPropertyAccessExpression(callee) && callee.name.text === 'Fn');

      if (isFunctionFabrication && !isFunctionCallImmediatelyInvoked(node)) {
        for (const argument of node.arguments) {
          if (ts.isArrowFunction(argument) || ts.isFunctionExpression(argument)) {
            result.push(...scanForNamedToVariableInSubtree(argument.body, sourceFile));
          }
        }
      }
    }

    ts.forEachChild(node, walk);
  };

  walk(sourceFile);
  return result;
}

describe('TSL Fn bodies must not carry named `.toVar` literals (policy §3)', () => {
  it('reports no literals under apps/ui/app/**/*.node.ts except where Fn is invoked once', () => {
    const suiteDirectory = fileURLToPath(new URL('.', import.meta.url));
    const appRoot = join(suiteDirectory, '../../../..');

    const files = listNodeTsUnderApp(appRoot);

    const aggregate: ViolationDetail[] = [];
    for (const absolutePath of files) {
      const text = readFileSync(absolutePath, 'utf8');
      aggregate.push(...violationsInSource(text, absolutePath));
    }

    expect(aggregate, aggregate.join('; ')).toEqual([]);
  });
});
