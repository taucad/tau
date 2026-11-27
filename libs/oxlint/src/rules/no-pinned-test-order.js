/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 */

/** The Vitest functions that take a test options object. */
const TEST_FUNCTIONS = new Set(['describe', 'suite', 'it', 'test']);

/**
 * Whether a callee is a Vitest test function or a modifier chain on one: `describe`, `describe.only`,
 * `describe.runIf(condition)`, `it.each(table)` and `test.each` as a tagged template.
 *
 * @param {any} callee - The callee of a call expression.
 * @returns {boolean} True when the chain is rooted at a test function.
 */
const isTestFunction = (callee) => {
  let node = callee;
  for (;;) {
    switch (node.type) {
      case 'Identifier': {
        return TEST_FUNCTIONS.has(node.name);
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
        return false;
      }
    }
  }
};

/**
 * The name of a property written as an identifier or a string, never a computed one.
 *
 * @param {any} property - A member of an object expression.
 * @returns {string | undefined} The name.
 */
const propertyName = (property) => {
  if (property.type !== 'Property' || property.computed) {
    return undefined;
  }
  if (property.key.type === 'Identifier') {
    return property.key.name;
  }
  if (property.key.type === 'Literal' && typeof property.key.value === 'string') {
    return property.key.value;
  }
  return undefined;
};

/**
 * The `shuffle: false` property of an options object, when it has one.
 *
 * @param {any} node - A candidate options object.
 * @returns {any} The property, or undefined.
 */
const findPin = (node) => {
  if (node?.type !== 'ObjectExpression') {
    return undefined;
  }
  return node.properties.find(
    (/** @type {any} */ property) =>
      propertyName(property) === 'shuffle' && property.value.type === 'Literal' && property.value.value === false,
  );
};

/**
 * The range that removes one property from its object, with the comma that separated it.
 *
 * @param {any} object - The object expression.
 * @param {any} property - The property to remove.
 * @returns {[number, number]} The range to remove.
 */
const propertyRemovalRange = (object, property) => {
  /** @type {{ properties: any[] }} */
  const { properties } = object;
  const index = properties.indexOf(property);
  const next = properties[index + 1];
  if (next) {
    return [property.range[0], next.range[0]];
  }
  const previous = properties[index - 1];
  return [previous ? previous.range[1] : property.range[0], property.range[1]];
};

/** @type {RuleModule} */
export const noPinnedTestOrderRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'A suite passes in any test order. `shuffle: false` hides an order dependence instead of fixing the shared fixture that causes it.',
    },
    /*
     * No autofix: deleting the pin from a suite that really depends on its order turns it red under burn-in's
     * shuffled run, and the repair (a fixture per test, or state reset between tests) needs a person. The removal
     * is offered as a suggestion for the suite that is already order-independent.
     */
    hasSuggestions: true,
    messages: {
      pinnedSuite:
        'Test order must not be pinned: `shuffle: false` hides an order dependence from the shuffled burn-in run. Give each test its own fixture or reset the shared state between tests, then remove the option (testing policy § 16.6, docs/policy/testing-policy.md).',
      pinnedConfig:
        'Test order must not be pinned: `sequence.shuffle: false` pins every suite this config runs. Fix the order dependence at the fixture and remove the option (testing policy § 16.6, docs/policy/testing-policy.md).',
      remove: 'Remove `shuffle: false`. Only correct once the suite passes with `--sequence.shuffle`.',
    },
    schema: [],
  },
  create(context) {
    return {
      /** @param {any} node */
      CallExpression(node) {
        if (!isTestFunction(node.callee)) {
          return;
        }
        /* The options object is the second argument (before the function) or the third (after it). */
        for (const index of [1, 2]) {
          const options = node.arguments[index];
          const pin = findPin(options);
          if (pin) {
            /* An options object left empty goes with its comma, so `describe(name, fn)` remains. */
            const range =
              options.properties.length === 1
                ? [node.arguments[index - 1].range[1], options.range[1]]
                : propertyRemovalRange(options, pin);
            context.report({
              node: pin,
              messageId: 'pinnedSuite',
              suggest: [
                { messageId: 'remove', fix: (fixer) => fixer.removeRange(/** @type {[number, number]} */ (range)) },
              ],
            });
          }
        }
      },
      /** @param {any} node */
      Property(node) {
        if (propertyName(node) !== 'sequence') {
          return;
        }
        const pin = findPin(node.value);
        if (pin) {
          const range = propertyRemovalRange(node.value, pin);
          context.report({
            node: pin,
            messageId: 'pinnedConfig',
            suggest: [{ messageId: 'remove', fix: (fixer) => fixer.removeRange(range) }],
          });
        }
      },
    };
  },
};
