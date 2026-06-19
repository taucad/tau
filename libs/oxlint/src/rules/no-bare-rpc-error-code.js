/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 * @typedef {import('estree').Node} Node
 * @typedef {import('estree').ObjectExpression} ObjectExpression
 * @typedef {import('estree').Property} Property
 */

import path from 'node:path';

const DEFAULT_ALLOWLIST = [
  'libs/chat/src/schemas/**',
  'libs/chat/src/constants/**',
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.spec.ts',
  '**/*.spec.tsx',
  '**/*.test-d.ts',
  '**/__tests__/**',
  'repos/**',
  'node_modules/**',
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

  if (pattern === '**/*.spec.ts') {
    return relativePathPosix.endsWith('.spec.ts');
  }

  if (pattern === '**/*.spec.tsx') {
    return relativePathPosix.endsWith('.spec.tsx');
  }

  if (pattern === '**/*.test-d.ts') {
    return relativePathPosix.endsWith('.test-d.ts');
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
 * @param {Property} property
 * @returns {string | undefined}
 */
function getPropertyName(property) {
  if (property.computed) {
    return undefined;
  }

  if (property.key.type === 'Identifier') {
    const { name } = property.key;
    return typeof name === 'string' ? name : undefined;
  }

  if (property.key.type === 'Literal' && typeof property.key.value === 'string') {
    const { value } = property.key;
    return typeof value === 'string' ? value : undefined;
  }

  return undefined;
}

/**
 * @param {Node} node
 * @returns {node is Property}
 */
function isProperty(node) {
  return node.type === 'Property';
}

/**
 * @param {Property} property
 * @returns {boolean}
 */
function isSuccessFalseProperty(property) {
  return getPropertyName(property) === 'success' && property.value.type === 'Literal' && property.value.value === false;
}

/**
 * @param {Property} property
 * @returns {boolean}
 */
function isBareErrorCodeProperty(property) {
  return (
    getPropertyName(property) === 'errorCode' &&
    property.value.type === 'Literal' &&
    typeof property.value.value === 'string'
  );
}

/**
 * @param {ObjectExpression} node
 * @returns {Property | undefined}
 */
function getBareRpcErrorCodeProperty(node) {
  const properties = node.properties.filter((property) => isProperty(property));
  if (!properties.some((property) => isSuccessFalseProperty(property))) {
    return undefined;
  }

  return properties.find((property) => isBareErrorCodeProperty(property));
}

/** @type {RuleModule} */
export const noBareRpcErrorCodeRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow bare string literals for RPC client error-code payloads.',
    },
    messages: {
      bareRpcErrorCode:
        'RPC client error payloads must use named error-code constants such as rpcClientErrorCode.* instead of bare string literals.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          allowlist: {
            type: 'array',
            items: { type: 'string' },
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
    const relativePathPosix = path.relative(context.cwd, context.filename).split(path.sep).join('/');

    if (isAllowlisted(relativePathPosix, patterns)) {
      return {};
    }

    return {
      ObjectExpression(node) {
        const errorCodeProperty = getBareRpcErrorCodeProperty(node);
        if (!errorCodeProperty) {
          return;
        }

        context.report({ node: errorCodeProperty.value, messageId: 'bareRpcErrorCode' });
      },
    };
  },
};
