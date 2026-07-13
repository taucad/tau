/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 * @typedef {import('estree').CallExpression} CallExpression
 * @typedef {import('estree').MemberExpression} MemberExpression
 */

import path from 'node:path';

/**
 * Locations permitted to touch the `indexedDB` global. Patterns are posix path
 * suffixes (exact file) or directory globs (`<dir>/**` matches anywhere in the
 * path), so they work regardless of the lint cwd.
 */
const DEFAULT_ALLOWLIST = [
  // Object-store provider — browser-local, non-project state (storage-policy Rule 0).
  'apps/ui/app/db/indexeddb-storage.ts',
  // Per-device workspace handle/config schema (tau-fs-handles).
  'apps/ui/app/filesystem/handle-store.ts',
  // Filesystem backend providers.
  'packages/filesystem/src/backend/**',
  // Tests set up and tear down fake-indexeddb.
  '**/*.test.ts',
  '**/*.test.tsx',
];

/** Globals whose `.indexedDB` member access is a direct factory reference. */
const GLOBAL_RECEIVERS = new Set(['globalThis', 'window', 'self']);

/**
 * @param {string} pathPosix
 * @param {string} pattern
 * @returns {boolean}
 */
function matchesAllowlistPattern(pathPosix, pattern) {
  if (pattern === '**/*.test.ts') {
    return pathPosix.endsWith('.test.ts');
  }

  if (pattern === '**/*.test.tsx') {
    return pathPosix.endsWith('.test.tsx');
  }

  if (pattern.endsWith('/**')) {
    const base = pattern.slice(0, -3);
    return pathPosix.includes(`${base}/`);
  }

  return pathPosix.endsWith(pattern);
}

/**
 * @param {string} pathPosix
 * @param {readonly string[]} patterns
 * @returns {boolean}
 */
function isAllowlisted(pathPosix, patterns) {
  return patterns.some((candidate) => matchesAllowlistPattern(pathPosix, candidate));
}

/**
 * @param {CallExpression} node
 * @returns {boolean}
 */
function isIndexeddbFactoryCall(node) {
  const { callee } = node;
  if (callee.type !== 'MemberExpression') {
    return false;
  }

  return callee.object.type === 'Identifier' && callee.object.name === 'indexedDB';
}

/**
 * @param {MemberExpression} node
 * @returns {boolean}
 */
function isGlobalIndexeddbMember(node) {
  if (node.property.type !== 'Identifier' || node.property.name !== 'indexedDB') {
    return false;
  }

  return node.object.type === 'Identifier' && GLOBAL_RECEIVERS.has(node.object.name);
}

/** @type {RuleModule} */
export const noDirectIndexeddbRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow direct indexedDB global access outside allowlisted storage-provider modules (storage-policy Rule 0).',
    },
    messages: {
      noDirectIndexeddb:
        'Direct `indexedDB` access is restricted to allowlisted storage providers. Project-scoped or agent-relevant data belongs in the project filesystem; browser-local state goes through the object-store provider. See `docs/policy/storage-policy.md` Rule 0 for the store-selection table.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          allowlist: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Additional posix path suffixes (exact file) or `<dir>/**` globs permitted to touch the indexedDB global.',
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
    const pathPosix = context.filename.split(path.sep).join('/');

    if (isAllowlisted(pathPosix, patterns)) {
      return {};
    }

    return {
      CallExpression(node) {
        if (isIndexeddbFactoryCall(node)) {
          context.report({ node, messageId: 'noDirectIndexeddb' });
        }
      },
      MemberExpression(node) {
        if (isGlobalIndexeddbMember(node)) {
          context.report({ node, messageId: 'noDirectIndexeddb' });
        }
      },
    };
  },
};
