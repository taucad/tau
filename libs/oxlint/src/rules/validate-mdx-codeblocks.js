/**
 * Type-checks fenced `typescript` code blocks in MDX files via tsgolint.
 * Blocks with `@ts-nocheck` in the fence meta string are skipped.
 * Diagnostics flow through ESLint's reporting pipeline so they appear in the IDE.
 *
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 * @typedef {import('eslint').Rule.RuleContext} RuleContext
 * @typedef {import('../tsgolint-utils.js').CodeblockEntry} CodeblockEntry
 */

import path from 'node:path';
import ts from 'typescript';
import { privateRuntimeDocumentPackages } from '../private-runtime-packages.js';
import { resolveTsgolintBinary, runTsgolint } from '../tsgolint-utils.js';

// oxlint-disable-next-line unicorn-js/better-regex -- multiline flag + named groups require this form
const MDX_CODEBLOCK_REGEX = /^```typescript(?<meta>[^\n]*)?\n(?<code>[\s\S]*?)^```$/gm;

/**
 * @param {string} code
 * @returns {Array<{ name: string; start: number; end: number }>}
 */
const moduleSpecifiers = (code) => {
  const sourceFile = ts.createSourceFile('__mdx_codeblock.ts', code, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  /** @type {Array<{ name: string; start: number; end: number }>} */
  const specifiers = [];

  /** @param {import('typescript').Expression | undefined} expression */
  const addStringLiteral = (expression) => {
    if (!expression || !ts.isStringLiteralLike(expression)) {
      return;
    }
    specifiers.push({
      name: expression.text,
      start: expression.getStart(sourceFile) + 1,
      end: expression.getEnd() - 1,
    });
  };

  /** @param {import('typescript').Node} node */
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      addStringLiteral(node.moduleSpecifier);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      addStringLiteral(node.arguments[0]);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      addStringLiteral(node.argument.literal);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return specifiers;
};

/** @param {string} specifier */
const privateRuntimePackage = (specifier) =>
  privateRuntimeDocumentPackages.find(
    (packageName) => specifier === packageName || specifier.startsWith(`${packageName}/`),
  );

/** @type {RuleModule} */
export const validateMdxCodeblocksRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Type-checks fenced TypeScript code blocks in MDX files via tsgolint (tsgo)',
    },
    messages: {
      privatePackageImport:
        'Runtime documentation must import {{packageName}} through a public @taucad/runtime subpath.',
      typecheckError: '{{errorMessage}}',
    },
  },
  create(context) {
    return {
      Program() {
        const source = context.sourceCode.text;
        const runtimeDocumentation = context.filename.replaceAll('\\', '/').includes('/content/docs/runtime/');
        /** @type {CodeblockEntry[]} */
        const blocks = [];
        let blockIndex = 0;

        for (const match of source.matchAll(MDX_CODEBLOCK_REGEX)) {
          const meta = match.groups?.meta?.trim() ?? '';
          const code = match.groups?.code ?? '';

          const fenceLineLength = match[0].indexOf('\n') + 1;
          const codeStartIndex = (match.index ?? 0) + fenceLineLength;

          if (runtimeDocumentation) {
            for (const specifier of moduleSpecifiers(code)) {
              const packageName = privateRuntimePackage(specifier.name);
              if (!packageName) {
                continue;
              }
              context.report({
                loc: {
                  start: context.sourceCode.getLocFromIndex(codeStartIndex + specifier.start),
                  end: context.sourceCode.getLocFromIndex(codeStartIndex + specifier.end),
                },
                messageId: 'privatePackageImport',
                data: { packageName },
              });
            }
          }

          if (meta.includes('@ts-nocheck') || !code.trim()) {
            continue;
          }

          const basename = path.basename(context.filename, path.extname(context.filename));
          const directory = path.dirname(context.filename);
          const virtualPath = path.join(directory, `__mdx_${basename}_${blockIndex}.ts`);
          blockIndex++;

          blocks.push({
            virtualPath,
            strippedCode: code,
            codeStartIndex,
            mapToRaw: (offset) => offset,
          });
        }

        const binary = resolveTsgolintBinary();
        if (!binary || blocks.length === 0) {
          return;
        }

        const diagnostics = runTsgolint(binary, blocks);
        /** @type {Map<string, CodeblockEntry>} */
        const blockMap = new Map(blocks.map((block) => [block.virtualPath, block]));

        for (const diagnostic of diagnostics) {
          if (diagnostic.kind !== 1 || !diagnostic.file_path) {
            continue;
          }

          const block = blockMap.get(diagnostic.file_path);
          if (!block) {
            continue;
          }

          const startPos = diagnostic.range?.pos ?? 0;
          const endPos = diagnostic.range?.end ?? startPos;

          context.report({
            loc: {
              start: context.sourceCode.getLocFromIndex(block.codeStartIndex + startPos),
              end: context.sourceCode.getLocFromIndex(block.codeStartIndex + endPos),
            },
            messageId: 'typecheckError',
            data: {
              errorMessage: `${diagnostic.message.id}: ${diagnostic.message.description}`,
            },
          });
        }
      },
    };
  },
};
