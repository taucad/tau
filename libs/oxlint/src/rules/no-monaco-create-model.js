/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 * @typedef {import('eslint').Rule.RuleContext} RuleContext
 * @typedef {import('estree').CallExpression} CallExpression
 * @typedef {import('estree').MemberExpression} MemberExpression
 */

import path from 'node:path';

/**
 * Default locations permitted to call `monaco.editor.createModel` (paths relative
 * to ESLint `cwd`, forward slashes).
 */
const DEFAULT_ALLOWLIST = [
  // Workspace-root-relative (e.g. eslint from repo root)
  'apps/ui/app/lib/monaco-workspace-fs/**',
  'apps/ui/app/lib/monaco-model-service.ts',
  'apps/ui/app/lib/monaco-language-registry.ts',
  'apps/ui/app/lib/testing/**',
  // Paths when ESLint cwd is the apps/ui package (`nx lint ui`).
  'app/lib/monaco-workspace-fs/**',
  'app/lib/monaco-model-service.ts',
  'app/lib/monaco-language-registry.ts',
  'app/lib/testing/**',
  '**/*.test.ts',
  '**/*.test.tsx',
];

/**
 * @param {string} relativePathPosix
 * @param {string} pattern
 * @returns {boolean}
 */
function matchesAllowlistPattern(relativePathPosix, pattern) {
  if (pattern === '**/*.test.ts') {
    return relativePathPosix.endsWith('.test.ts');
  }

  if (pattern === '**/*.test.tsx') {
    return relativePathPosix.endsWith('.test.tsx');
  }

  if (pattern.endsWith('/**')) {
    const base = pattern.slice(0, -3);
    const directoryWithSlash = `${base}/`;
    return relativePathPosix === base || relativePathPosix.startsWith(directoryWithSlash);
  }

  return relativePathPosix === pattern;
}

/**
 * @param {string} relativePathPosix
 * @param {readonly string[]} patterns
 * @returns {boolean}
 */
function isAllowlisted(relativePathPosix, patterns) {
  return patterns.some((candidate) => matchesAllowlistPattern(relativePathPosix, candidate));
}

/**
 * @param {MemberExpression} node
 * @returns {boolean}
 */
function isEditorCreateModelCallee(node) {
  if (node.type !== 'MemberExpression') {
    return false;
  }

  if (node.property.type !== 'Identifier' || node.property.name !== 'createModel') {
    return false;
  }

  const receiver = node.object;
  if (receiver.type !== 'MemberExpression') {
    return false;
  }

  if (receiver.property.type !== 'Identifier' || receiver.property.name !== 'editor') {
    return false;
  }

  return true;
}

/**
 * @param {CallExpression} node
 * @returns {boolean}
 */
function isEditorCreateModelCall(node) {
  if (node.type !== 'CallExpression') {
    return false;
  }

  return isEditorCreateModelCallee(node.callee);
}

/** @type {RuleModule} */
export const noMonacoCreateModelRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow direct `monaco.editor.createModel` in language contributions; materialise via `MonacoWorkspaceFs` instead.',
    },
    messages: {
      noDirectCreateModel:
        'Do not call `monaco.editor.createModel` here — return a `Location` / open a URI and let `MonacoWorkspaceFs` materialise the model.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          allowlist: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Additional relative path glob patterns (relative to ESLint cwd) permitted to call `createModel`.',
          },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context) {
    const [options = {}] = context.options;
    const extra = Array.isArray(options.allowlist) ? options.allowlist : [];
    const patterns = [...DEFAULT_ALLOWLIST, ...extra];

    return {
      CallExpression(node) {
        if (!isEditorCreateModelCall(node)) {
          return;
        }

        const { cwd, filename } = context;
        const relativePathPosix = path.relative(cwd, filename).split(path.sep).join('/');
        if (isAllowlisted(relativePathPosix, patterns)) {
          return;
        }

        context.report({ node, messageId: 'noDirectCreateModel' });
      },
    };
  },
};
