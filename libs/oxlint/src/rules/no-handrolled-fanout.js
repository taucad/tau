/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 * @typedef {import('eslint').Rule.RuleContext} RuleContext
 * @typedef {import('estree').PropertyDefinition} PropertyDefinition
 * @typedef {import('@typescript-eslint/types').TSESTree.VariableDeclarator} VariableDeclarator
 */

import path from 'node:path';

import { AST_NODE_TYPES } from '@typescript-eslint/types';

/**
 * Default locations permitted to declare hand-rolled pub/sub fan-out registries.
 */
const DEFAULT_ALLOWLIST = [
  'libs/events/**',
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
 * @returns {boolean}
 */
function isHandrolledFanoutElementType(typeNode) {
  if (!typeNode) {
    return false;
  }

  if (typeNode.type === AST_NODE_TYPES.TSFunctionType) {
    return true;
  }

  if (typeNode.type === AST_NODE_TYPES.TSTypeReference && typeNode.typeName.type === AST_NODE_TYPES.Identifier) {
    return /(?:Callback|Handler|Listener)$/.test(typeNode.typeName.name);
  }

  if (typeNode.type === AST_NODE_TYPES.TSTypeLiteral) {
    return typeNode.members.some((member) => {
      if (member.type !== AST_NODE_TYPES.TSPropertySignature && member.type !== AST_NODE_TYPES.TSMethodSignature) {
        return false;
      }
      const keyName =
        member.key.type === AST_NODE_TYPES.Identifier
          ? member.key.name
          : member.key.type === AST_NODE_TYPES.Literal && typeof member.key.value === 'string'
            ? member.key.value
            : undefined;
      if (keyName !== 'handler' && keyName !== 'callback' && keyName !== 'listener') {
        return false;
      }
      if (member.type === AST_NODE_TYPES.TSMethodSignature) {
        return true;
      }
      const inner = member.typeAnnotation?.typeAnnotation;
      return inner?.type === AST_NODE_TYPES.TSFunctionType;
    });
  }

  return false;
}

/**
 * @param {import('@typescript-eslint/types').TSESTree.TypeNode | undefined | null} typeNode
 * @param {boolean} [allowBareArray]
 * @returns {boolean}
 */
function isHandrolledFanoutContainerType(typeNode, allowBareArray = false) {
  if (!typeNode) {
    return false;
  }

  if (typeNode.type === AST_NODE_TYPES.TSTypeReference && typeNode.typeName.type === AST_NODE_TYPES.Identifier) {
    const containerName = typeNode.typeName.name;
    const parameters = typeNode.typeParameters?.params ?? typeNode.typeArguments?.params ?? [];
    if (containerName === 'Map' || containerName === 'ReadonlyMap') {
      return isHandrolledFanoutContainerType(parameters[1], true);
    }
    if (containerName === 'Set' || containerName === 'ReadonlySet') {
      return isHandrolledFanoutElementType(parameters[0]) || isHandrolledFanoutContainerType(parameters[0], true);
    }
    if (containerName === 'Array' || containerName === 'ReadonlyArray') {
      const [element] = parameters;
      const namedSubscription =
        element?.type === AST_NODE_TYPES.TSTypeLiteral && isHandrolledFanoutElementType(element);
      return (
        namedSubscription ||
        (allowBareArray && isHandrolledFanoutElementType(element)) ||
        isHandrolledFanoutContainerType(element, true)
      );
    }
    return false;
  }

  return false;
}

/**
 * @param {PropertyDefinition | VariableDeclarator} node
 * @returns {boolean}
 */
function declaresHandrolledFanout(node) {
  const declarationName =
    node.type === AST_NODE_TYPES.PropertyDefinition
      ? node.key.type === AST_NODE_TYPES.Identifier
        ? node.key.name
        : undefined
      : node.id.type === AST_NODE_TYPES.Identifier
        ? node.id.name
        : undefined;
  const allowBareArray =
    declarationName !== undefined && /(?:callback|handler|listener|subscriber)s?$/i.test(declarationName);
  const fromAnnotation =
    node.type === AST_NODE_TYPES.PropertyDefinition
      ? node.typeAnnotation?.typeAnnotation
      : node.id.type === AST_NODE_TYPES.Identifier
        ? node.id.typeAnnotation?.typeAnnotation
        : undefined;
  if (isHandrolledFanoutContainerType(fromAnnotation, allowBareArray)) {
    return true;
  }

  const init = node.type === AST_NODE_TYPES.PropertyDefinition ? node.value : node.init;
  if (init?.type === AST_NODE_TYPES.NewExpression && init.callee.type === AST_NODE_TYPES.Identifier) {
    const parameters = init.typeArguments?.params ?? init.typeParameters?.params ?? [];
    const containerType = {
      type: AST_NODE_TYPES.TSTypeReference,
      typeName: init.callee,
      typeArguments: { params: parameters },
    };
    return isHandrolledFanoutContainerType(
      /** @type {import('@typescript-eslint/types').TSESTree.TSTypeReference} */ (containerType),
      allowBareArray,
    );
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
     * @param {PropertyDefinition | VariableDeclarator} node
     */
    function reportIfHandrolled(node) {
      const { cwd, filename } = context;
      const relativePathPosix = path.relative(cwd, filename).split(path.sep).join('/');
      if (isAllowlisted(relativePathPosix, patterns)) {
        return;
      }

      if (!declaresHandrolledFanout(node)) {
        return;
      }

      context.report({ node, messageId: 'noHandrolledFanout' });
    }

    return {
      PropertyDefinition: reportIfHandrolled,
      VariableDeclarator: reportIfHandrolled,
    };
  },
};
