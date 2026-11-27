/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 */

/** The Vitest functions that take a test options object. */
const TEST_FUNCTIONS = new Set(['describe', 'suite', 'it', 'test']);

/** The Vitest and Vite functions whose arguments are configuration. */
const CONFIG_FUNCTIONS = new Set(['defineConfig', 'defineProject', 'defineWorkspace', 'mergeConfig']);

/** A Vitest or Vite config or workspace file, with any infix: `vitest.config.ts`, `vitest.staging.config.ts`. */
const CONFIG_FILE = /(?:^|[/\\])vite(?:st)?(?:\.[\w-]+)*\.(?:config|workspace)\.[cm]?[jt]sx?$/;

/** Wrappers that leave the wrapped expression where it was. */
const TRANSPARENT = new Set([
  'ArrayExpression',
  'ParenthesizedExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
]);

const FUNCTIONS = new Set(['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration']);

/**
 * The definition an identifier resolves to in this file, or undefined for an unbound global.
 *
 * @param {any} context - The rule context.
 * @param {any} identifier - The identifier to resolve.
 * @returns {any} The scope definition, or undefined.
 */
const resolveDefinition = (context, identifier) => {
  for (let scope = context.sourceCode.getScope(identifier); scope; scope = scope.upper) {
    const variable = scope.variables.find((/** @type {any} */ candidate) => candidate.name === identifier.name);
    if (variable && variable.defs.length > 0) {
      return variable.defs[0];
    }
  }
  return undefined;
};

/**
 * Whether a definition is an import from `vitest`.
 *
 * @param {any} definition - A scope definition.
 * @returns {boolean} True for a binding imported from `vitest`.
 */
const isVitestImport = (definition) =>
  definition?.type === 'ImportBinding' && definition.parent?.source?.value === 'vitest';

/**
 * Whether an identifier is a Vitest test function: imported from `vitest` under any local name, an unbound
 * global with a test function's name (`globals: true`), or a constant derived from one (`test.extend`). A name
 * this file declares or imports from elsewhere is not one.
 *
 * @param {any} context - The rule context.
 * @param {any} identifier - The identifier at the root of a callee chain.
 * @param {Set<any>} seen - The definitions already followed.
 * @returns {boolean} True when the identifier is a Vitest test function.
 */
const isTestBinding = (context, identifier, seen) => {
  const definition = resolveDefinition(context, identifier);
  if (!definition) {
    return TEST_FUNCTIONS.has(identifier.name);
  }
  if (isVitestImport(definition)) {
    const { imported } = definition.node;
    return definition.node.type === 'ImportSpecifier' && TEST_FUNCTIONS.has(imported.name ?? imported.value);
  }
  if (definition.type === 'Variable' && definition.node.id.type === 'Identifier' && definition.node.init) {
    if (seen.has(definition)) {
      return false;
    }
    seen.add(definition);
    return isTestFunction(context, definition.node.init, seen);
  }
  return false;
};

/**
 * Whether a callee is a Vitest test function or a modifier chain on one: `describe`, `describe.only`,
 * `describe.runIf(condition)`, `it.each(table)`, `test.each` as a tagged template and `vitest.describe` on a
 * namespace import.
 *
 * @param {any} context - The rule context.
 * @param {any} callee - The callee of a call expression.
 * @param {Set<any>} [seen] - The definitions already followed.
 * @returns {boolean} True when the chain is rooted at a test function.
 */
function isTestFunction(context, callee, seen = new Set()) {
  let node = callee;
  for (;;) {
    switch (node.type) {
      case 'Identifier': {
        return isTestBinding(context, node, seen);
      }
      case 'MemberExpression': {
        const namespace = node.object.type === 'Identifier' && resolveDefinition(context, node.object);
        if (isVitestImport(namespace) && namespace.node.type === 'ImportNamespaceSpecifier') {
          return !node.computed && TEST_FUNCTIONS.has(node.property.name);
        }
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
      case 'AwaitExpression':
      case 'TSAsExpression':
      case 'TSNonNullExpression': {
        node = node.type === 'AwaitExpression' ? node.argument : node.expression;
        break;
      }
      default: {
        return false;
      }
    }
  }
}

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
 * Whether a property is `name: false`, with the literal.
 *
 * @param {any} property - A member of an object expression.
 * @param {string} name - The property name.
 * @returns {boolean} True for the literal `false` under that name.
 */
const isFalse = (property, name) =>
  propertyName(property) === name && property.value.type === 'Literal' && property.value.value === false;

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
  return node.properties.find((/** @type {any} */ property) => isFalse(property, 'shuffle'));
};

/**
 * The range that removes one property from its object and leaves valid syntax: with the comma that follows it,
 * with the comma that precedes it when it is last, or with everything between the braces when it is alone.
 *
 * @param {any} object - The object expression.
 * @param {any} property - The property to remove.
 * @returns {[number, number]} The range to remove.
 */
const propertyRemovalRange = (object, property) => {
  /** @type {{ properties: any[] }} */
  const { properties } = object;
  if (properties.length === 1) {
    return [object.range[0] + 1, object.range[1] - 1];
  }
  const index = properties.indexOf(property);
  const next = properties[index + 1];
  if (next) {
    return [property.range[0], next.range[0]];
  }
  return [properties[index - 1].range[1], property.range[1]];
};

/**
 * The order pin of a config `sequence` object: `shuffle: false`, or `tests: false` in the object form
 * `shuffle: { files, tests }`. `files: false` alone pins file order only, which no test in a file depends on.
 *
 * @param {any} sequence - The value of a `sequence` property.
 * @returns {{ node: any, option: string, range: [number, number] } | undefined} The pin and the range that removes it.
 */
const findConfigPin = (sequence) => {
  const pin = findPin(sequence);
  if (pin) {
    return { node: pin, option: 'sequence.shuffle: false', range: propertyRemovalRange(sequence, pin) };
  }
  if (sequence.type !== 'ObjectExpression') {
    return undefined;
  }
  const shuffle = sequence.properties.find(
    (/** @type {any} */ property) => propertyName(property) === 'shuffle' && property.value.type === 'ObjectExpression',
  );
  const tests = shuffle?.value.properties.find((/** @type {any} */ property) => isFalse(property, 'tests'));
  if (!tests) {
    return undefined;
  }
  /* A `shuffle` object left empty goes whole. */
  const range =
    shuffle.value.properties.length === 1
      ? propertyRemovalRange(sequence, shuffle)
      : propertyRemovalRange(shuffle.value, tests);
  return { node: tests, option: 'sequence.shuffle.tests: false', range };
};

/**
 * Whether a callee is a config function, bare or on a namespace: `defineConfig`, `vitest.defineConfig`.
 *
 * @param {any} callee - The callee of a call expression.
 * @returns {boolean} True for a config function.
 */
const isConfigFunction = (callee) => {
  if (callee.type === 'Identifier') {
    return CONFIG_FUNCTIONS.has(callee.name);
  }
  return callee.type === 'MemberExpression' && !callee.computed && CONFIG_FUNCTIONS.has(callee.property.name);
};

/**
 * Whether a config object reaches a config function: as an argument, as what a function argument returns, or as
 * a `projects` entry of a config that does.
 *
 * @param {any} config - The object that holds a `test` key.
 * @returns {boolean} True when the object is Vitest configuration.
 */
const isPassedToConfigFunction = (config) => {
  let node = config;
  for (;;) {
    const { parent } = node;
    if (!parent) {
      return false;
    }
    if (TRANSPARENT.has(parent.type)) {
      node = parent;
    } else if (parent.type === 'CallExpression') {
      return parent.arguments.includes(node) && isConfigFunction(parent.callee);
    } else if (parent.type === 'ArrowFunctionExpression' && parent.body === node) {
      node = parent;
    } else if (parent.type === 'ReturnStatement') {
      node = parent;
      while (node && !FUNCTIONS.has(node.type)) {
        node = node.parent;
      }
      if (!node) {
        return false;
      }
    } else if (parent.type === 'Property' && parent.value === node && propertyName(parent) === 'projects') {
      /* `projects` sits under `test`; step from the list to the config that owns it. */
      const owner = parent.parent;
      const key = owner.parent;
      node = key?.type === 'Property' && key.value === owner && propertyName(key) === 'test' ? key.parent : owner;
    } else {
      return false;
    }
  }
};

/**
 * Whether a `sequence` property is Vitest configuration: under a `test` key, in a config file or in an object
 * that reaches a config function. An unrelated `{ sequence: { shuffle: false } }` is not.
 *
 * @param {any} sequence - The `sequence` property.
 * @param {string} filename - The file being linted.
 * @returns {boolean} True when the property configures Vitest.
 */
const isVitestSequence = (sequence, filename) => {
  const options = sequence.parent;
  const test = options.parent;
  if (test?.type !== 'Property' || test.value !== options || propertyName(test) !== 'test') {
    return false;
  }
  return CONFIG_FILE.test(filename) || isPassedToConfigFunction(test.parent);
};

/** @type {RuleModule} */
export const noPinnedTestOrderRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'A suite passes in any test order. `shuffle: false` in test or suite options, and `sequence.shuffle: false` or `sequence.shuffle.tests: false` in Vitest config, hide an order dependence instead of fixing the shared fixture that causes it.',
    },
    /*
     * No autofix: deleting the pin from a suite that really depends on its order turns it red under burn-in's
     * shuffled run, and the repair (a fixture per test, or state reset between tests) needs a person. The removal
     * is offered as a suggestion for the suite that is already order-independent.
     */
    hasSuggestions: true,
    messages: {
      pinnedSuite:
        'Test order must not be pinned: `shuffle: false` hides an order dependence from the shuffled burn-in run. Give each test its own fixture or reset the shared state between tests, then remove the option (testing policy § 16.7, docs/policy/testing-policy.md).',
      pinnedConfig:
        'Test order must not be pinned: `{{option}}` pins every suite this config runs. Fix the order dependence at the fixture and remove the option (testing policy § 16.7, docs/policy/testing-policy.md).',
      remove: 'Remove the pin. Only correct once the suite passes with `--sequence.shuffle`.',
    },
    schema: [],
  },
  create(context) {
    return {
      /** @param {any} node */
      CallExpression(node) {
        /* The options object is the second argument (before the function) or the third (after it). */
        for (const index of [1, 2]) {
          const options = node.arguments[index];
          const pin = findPin(options);
          /* The pin is looked for first: it is rare, and resolving the callee walks the scope chain. */
          if (pin && isTestFunction(context, node.callee)) {
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
        const pin = findConfigPin(node.value);
        if (pin && isVitestSequence(node, context.filename)) {
          context.report({
            node: pin.node,
            messageId: 'pinnedConfig',
            data: { option: pin.option },
            suggest: [{ messageId: 'remove', fix: (fixer) => fixer.removeRange(pin.range) }],
          });
        }
      },
    };
  },
};
