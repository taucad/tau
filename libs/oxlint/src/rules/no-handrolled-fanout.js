/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 * @typedef {import('eslint').Rule.RuleContext} RuleContext
 * @typedef {import('estree').PropertyDefinition} PropertyDefinition
 */

import path from 'node:path';

/**
 * Default locations permitted to declare hand-rolled pub/sub fan-out registries.
 */
const DEFAULT_ALLOWLIST = [
  'packages/events/**',
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
 * @param {import('@typescript-eslint/types').TSESTree.TypeNode | undefined | null} typeNode
 * @returns {import('@typescript-eslint/types').TSESTree.TypeNode | undefined | null}
 */
function unwrapType(typeNode) {
  if (!typeNode) {
    return typeNode;
  }
  if (typeNode.type === 'TSParenthesizedType') {
    return unwrapType(typeNode.typeAnnotation);
  }
  return typeNode;
}

/**
 * @param {import('@typescript-eslint/types').TSESTree.TypeNode | undefined | null} typeNode
 * @returns {boolean}
 */
function isHandrolledFanoutElementType(typeNode) {
  const unwrapped = unwrapType(typeNode);
  if (!unwrapped) {
    return false;
  }

  if (unwrapped.type === 'TSFunctionType') {
    return true;
  }

  if (unwrapped.type === 'TSTypeLiteral') {
    return unwrapped.members.some((member) => {
      if (member.type !== 'TSPropertySignature' && member.type !== 'TSMethodSignature') {
        return false;
      }
      const keyName =
        member.key.type === 'Identifier'
          ? member.key.name
          : member.key.type === 'Literal' && typeof member.key.value === 'string'
            ? member.key.value
            : undefined;
      if (keyName !== 'handler' && keyName !== 'callback' && keyName !== 'listener') {
        return false;
      }
      if (member.type === 'TSMethodSignature') {
        return true;
      }
      const inner = member.typeAnnotation?.typeAnnotation;
      return unwrapType(inner)?.type === 'TSFunctionType';
    });
  }

  return false;
}

/**
 * @param {import('@typescript-eslint/types').TSESTree.TypeNode | undefined | null} typeNode
 * @returns {boolean}
 */
function isHandrolledFanoutContainerType(typeNode) {
  const unwrapped = unwrapType(typeNode);
  if (!unwrapped) {
    return false;
  }

  if (unwrapped.type === 'TSTypeReference' && unwrapped.typeName.type === 'Identifier') {
    const containerName = unwrapped.typeName.name;
    if (
      containerName !== 'Set' &&
      containerName !== 'ReadonlySet' &&
      containerName !== 'Array' &&
      containerName !== 'ReadonlyArray'
    ) {
      return false;
    }
    const [elementType] = unwrapped.typeParameters?.params ?? unwrapped.typeArguments?.params ?? [];
    return isHandrolledFanoutElementType(elementType);
  }

  return false;
}

/**
 * @param {PropertyDefinition} node
 * @returns {boolean}
 */
function propertyDeclaresHandrolledFanout(node) {
  const fromAnnotation = node.typeAnnotation?.typeAnnotation;
  if (isHandrolledFanoutContainerType(fromAnnotation)) {
    return true;
  }

  const init = node.value;
  if (init?.type === 'NewExpression' && init.callee.type === 'Identifier') {
    const containerName = init.callee.name;
    if (containerName === 'Set' || containerName === 'ReadonlySet') {
      const [elementType] = init.typeArguments?.params ?? init.typeParameters?.params ?? [];
      return isHandrolledFanoutElementType(elementType);
    }
  }

  return false;
}

/** @type {RuleModule} */
export const noHandrolledFanoutRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow hand-rolled pub/sub fan-out registries; compose Topic<E> from @taucad/events instead.',
    },
    messages: {
      noHandrolledFanout:
        "Pub/sub fan-out must compose 'Topic<E>' from '@taucad/events'. See docs/policy/event-fanout-policy.md.",
    },
    schema: [
      {
        type: 'object',
        properties: {
          allowlist: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Additional relative path glob patterns (relative to ESLint cwd) permitted to declare fan-out registries.',
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

    /**
     * @param {PropertyDefinition} node
     */
    function reportIfHandrolled(node) {
      const { cwd, filename } = context;
      const relativePathPosix = path.relative(cwd, filename).split(path.sep).join('/');
      if (isAllowlisted(relativePathPosix, patterns)) {
        return;
      }

      const typeAnnotation = node.typeAnnotation?.typeAnnotation;
      if (!propertyDeclaresHandrolledFanout(node)) {
        return;
      }

      context.report({ node, messageId: 'noHandrolledFanout' });
    }

    return {
      PropertyDefinition: reportIfHandrolled,
    };
  },
};
