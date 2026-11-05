/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 * @typedef {import('eslint').Rule.RuleContext} RuleContext
 * @typedef {import('estree').Node} Node
 * @typedef {import('estree').AwaitExpression} AwaitExpression
 */

/**
 * Filesystem mutation conveniences: each call is a changeset of one entry, with
 * its own lock set, change event and cross-tab notice. A provider's own
 * primitives, called on `provider`, are not conveniences and stay allowed in
 * the provider layer, where the rule is not enabled.
 */
const MUTATION_METHODS = new Set([
  'writeFile',
  'appendFile',
  'unlink',
  'rmdir',
  'mkdir',
  'rename',
  'move',
  'copyFile',
  'setFileMode',
  'writeFileResolved',
  'appendFileResolved',
  'moveResolved',
  'mkdirResolved',
  'unlinkResolved',
  'rmdirResolved',
]);

const LOOP_TYPES = new Set(['ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement', 'DoWhileStatement']);

const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

/**
 * The mutation method an awaited expression calls, if any.
 *
 * @param {Node} argument
 * @returns {string | undefined}
 */
const mutationMethodOf = (argument) => {
  if (argument.type !== 'CallExpression') {
    return undefined;
  }
  const { callee } = argument;
  if (callee.type !== 'MemberExpression' || callee.computed || callee.property.type !== 'Identifier') {
    return undefined;
  }
  return MUTATION_METHODS.has(callee.property.name) ? callee.property.name : undefined;
};

/**
 * Whether `node` runs once per iteration of an enclosing loop in the same function.
 *
 * A `for` loop's init, and the iterable of a `for…of`/`for…in`, run once, so an
 * await there is not per iteration.
 *
 * @param {Node} node
 * @param {RuleContext} context
 * @returns {boolean}
 */
const isInsideLoop = (node, context) => {
  const ancestors = context.sourceCode.getAncestors(node);
  let child = node;
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const ancestor = ancestors[index];
    if (FUNCTION_TYPES.has(ancestor.type)) {
      return false;
    }
    if (LOOP_TYPES.has(ancestor.type)) {
      const once =
        (ancestor.type === 'ForStatement' && ancestor.init === child) ||
        ((ancestor.type === 'ForOfStatement' || ancestor.type === 'ForInStatement') && ancestor.right === child);
      if (!once) {
        return true;
      }
    }
    child = ancestor;
  }
  return false;
};

/** @type {RuleModule} */
export const noAwaitedMutationInLoopRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow awaiting a filesystem mutation convenience (writeFile, unlink, rename, mkdir, …) inside a loop. ' +
        'Each awaited call is its own changeset — its own lock set, change event and cross-tab notice — and ' +
        'awaiting it serialises them, so a loop of N becomes N of each (D22). Collect the entries and send one ' +
        'changeset with `apply({ entries })` (split larger work with `splitChangeset`), or start the calls ' +
        'together so the pipeline coalesces them.',
    },
    messages: {
      awaitedMutationInLoop:
        'Awaiting `{{method}}` in a loop sends one changeset per iteration. Collect the entries and `apply` ' +
        'them as one changeset (split with `splitChangeset`), or start the calls together so they coalesce.',
    },
    schema: [],
  },
  create(context) {
    return {
      /** @param {AwaitExpression} node */
      AwaitExpression(node) {
        const method = mutationMethodOf(node.argument);
        if (method === undefined || !isInsideLoop(node, context)) {
          return;
        }
        context.report({ node, messageId: 'awaitedMutationInLoop', data: { method } });
      },
    };
  },
};
