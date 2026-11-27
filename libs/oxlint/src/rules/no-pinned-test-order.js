/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 */

/** The Vitest functions that take an options object: `describe` and its alias `suite`, `it` and its alias `test`. */
const vitestApis = new Set(['describe', 'suite', 'it', 'test']);

/**
 * The identifier a call chain starts from: `describe` for `describe(…)`, `describe.runIf(x)(…)`, `describe.each(t)(…)`
 * and a tagged `` describe.each`…`(…) ``.
 *
 * @param {any} callee - The callee of a call.
 * @returns {string | undefined} The root identifier's name, when the chain starts from one.
 */
const rootName = (callee) => {
  let node = callee;
  while (node) {
    switch (node.type) {
      case 'Identifier': {
        return node.name;
      }
      case 'MemberExpression': {
        node = node.object;
        break;
      }
      case 'CallExpression': {
        node = node.callee;
        break;
      }
      case 'TaggedTemplateExpression': {
        node = node.tag;
        break;
      }
      default: {
        return undefined;
      }
    }
  }
  return undefined;
};

/**
 * Whether a property is a literal `shuffle: false`, written as an identifier or a string key.
 *
 * @param {any} property - A member of an object expression.
 * @returns {boolean} Whether the property pins the order.
 */
const pinsOrder = (property) => {
  if (property.type !== 'Property' || property.computed) {
    return false;
  }
  const { key, value } = property;
  const name = key.type === 'Identifier' ? key.name : key.value;
  return name === 'shuffle' && value.type === 'Literal' && value.value === false;
};

/**
 * Testing policy § 17: a suite never pins its order. Vitest reads a suite's own `shuffle` before
 * `--sequence.shuffle`, so `{ shuffle: false }` switches off the order check burn-in runs on a changed test file. No
 * fix is offered: removing the option exposes the dependence, and the repair is per-test state.
 *
 * @type {RuleModule}
 */
export const noPinnedTestOrderRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'A Vitest suite or test never pins its order with shuffle: false; an order dependence is fixed at the fixture.',
    },
    messages: {
      violation:
        '`shuffle: false` pins the order of `{{api}}` and hides a dependence between its tests from burn-in. Remove it and give each test its own mutable state (`beforeEach`, or a per-test copy of a template built once): docs/policy/testing-policy.md § 17.',
    },
    schema: [],
  },
  create(context) {
    return {
      /** @param {any} node */
      CallExpression(node) {
        const api = rootName(node.callee);
        if (api === undefined || !vitestApis.has(api)) {
          return;
        }
        // The first argument is the name, or the table of `each`/`for`; options follow it, before or after the body.
        for (const argument of node.arguments.slice(1)) {
          if (argument.type !== 'ObjectExpression') {
            continue;
          }
          for (const property of argument.properties) {
            if (pinsOrder(property)) {
              context.report({ node: property, messageId: 'violation', data: { api } });
            }
          }
        }
      },
    };
  },
};
