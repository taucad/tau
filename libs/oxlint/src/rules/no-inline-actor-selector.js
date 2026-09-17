/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 * @typedef {import('estree').CallExpression} CallExpression
 * @typedef {import('estree').Node} Node
 */

/**
 * Selector hooks whose arguments must keep a stable identity across renders.
 * `useSyncExternalStoreWithSelector` keys its memo on the selector (and, for
 * curried hooks, on the default value), so a literal allocated in the render
 * body makes the selector re-run on every render of the subscribing component
 * instead of only on emissions.
 */
const SELECTOR_HOOKS = new Set(['useCadSelector']);

/** Argument shapes that allocate a new value on every render. */
const UNSTABLE_VALUE_TYPES = new Set([
  'ObjectExpression',
  'ArrayExpression',
  'NewExpression',
  'ArrowFunctionExpression',
  'FunctionExpression',
]);

/**
 * True for a function literal written inline at the call site.
 *
 * @param {Node | undefined} node - Argument node.
 * @returns {boolean} Whether the argument is an inline function literal.
 */
const isFunctionLiteral = (node) => node?.type === 'ArrowFunctionExpression' || node?.type === 'FunctionExpression';

/** @type {RuleModule} */
export const noInlineActorSelectorRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require a stable selector identity for curried XState selector hooks. Inline selector ' +
        'functions and freshly allocated default values defeat the `useSyncExternalStore` selector ' +
        'memo, so every subscription re-runs its selector on every render of the subscribing ' +
        'component. Hoist the selector to module scope (or memoize a parameterised one with ' +
        '`useCallback`) and use a module-level constant for an object or array default.',
    },
    messages: {
      inlineSelector:
        'Inline selector passed to {{hook}}: it re-runs on every render of this component. Hoist it ' +
        'to a module-level selector, or wrap a parameterised one in `useCallback`.',
      unstableDefault:
        'Default value passed to {{hook}} is allocated on every render, which invalidates the ' +
        'selector memo. Hoist it to a module-level constant.',
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type !== 'Identifier' || !SELECTOR_HOOKS.has(node.callee.name)) {
          return;
        }

        const hook = node.callee.name;
        const [selector, defaultValue] = node.arguments;

        if (isFunctionLiteral(selector)) {
          context.report({ node: selector, messageId: 'inlineSelector', data: { hook } });
        }

        if (defaultValue && UNSTABLE_VALUE_TYPES.has(defaultValue.type)) {
          context.report({ node: defaultValue, messageId: 'unstableDefault', data: { hook } });
        }
      },
    };
  },
};
