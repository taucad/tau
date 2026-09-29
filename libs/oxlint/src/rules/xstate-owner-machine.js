import { calleeName, keyName, propertyNamed } from './xstate-contract.js';

/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 * @typedef {import('eslint').Rule.ReportDescriptor} ReportDescriptor
 */

const impureNames = new Set(['randomUUID', 'randomUuid', 'generatePrefixedId']);
/** Keys whose value is itself a transition, or an array of them. */
const transitionKeys = new Set(['always', 'onDone', 'onError', 'onTimeout']);
/** Keys whose value maps events or delays to transitions. */
const transitionMapKeys = new Set(['on', 'after']);

const messages = {
  inlineEffect:
    'Enqueue a named effect (`enq(actions.name, …)` or `enq(namedFn, …)`), never an inline function (MC-R8).',
  impure: 'Owner machines read no clock, randomness or fresh ids; take them from input or an effect (MC-R6).',
  snapshotRead: "Read another actor's snapshot only inside a `select*` projection (MC-R6, MC-R20).",
  rootOnError: 'Declare a root `onError` that enters a modelled state (MC-R12).',
  version: 'Declare a `version` on every owner machine (MC-R21).',
  fromSafeAsync: 'Use `createAsyncLogic` with `signal`; `fromSafeAsync` is retired in the substrate (MC-R10).',
  portableImport:
    'A portable machine imports values only from `xstate` and its package `#` modules; import types with `import type` (MC-R2).',
  spawnByKey:
    'Spawn by logic value (`enq.spawn(actors.key, …)`), not by string key, so the owner stays walkable (MC-R17).',
  transitionMeta: 'Write each transition as a static config with `meta` naming the spec action it refines (MC-R27).',
};

/**
 * True for an arrow or function expression.
 *
 * @param {any} node - A node.
 * @returns {boolean} Whether the node is a function literal.
 */
const isFunction = (node) => node?.type === 'ArrowFunctionExpression' || node?.type === 'FunctionExpression';

/**
 * The name a function is known by: its own id, or the variable or property it is assigned to.
 *
 * @param {any} functionNode - A function node.
 * @returns {string | undefined} The function's name.
 */
const functionName = (functionNode) => {
  const { id, parent } = functionNode;
  if (id) {
    return id.name;
  }

  if (parent?.type === 'VariableDeclarator' && parent.id.type === 'Identifier') {
    return parent.id.name;
  }

  return parent?.type === 'Property' ? keyName(parent) : undefined;
};

/**
 * True when a node sits in the first argument of a `createMachine(…)` call, outside any function body in it.
 *
 * @param {any} node - A node.
 * @returns {boolean} Whether the node is part of a machine config.
 */
const inMachineConfig = (node) => {
  for (let child = node, { parent } = node; parent && !isFunction(parent); child = parent, { parent } = parent) {
    if (
      parent.type === 'CallExpression' &&
      calleeName(parent.callee) === 'createMachine' &&
      parent.arguments[0] === child
    ) {
      return true;
    }
  }

  return false;
};

/**
 * True for `Date.now()`, `performance.now()`, `Math.random()`, any `crypto.*` call, or a fresh-id helper.
 *
 * @param {any} callee - A call's callee.
 * @returns {boolean} Whether the call is impure.
 */
const isImpureCall = (callee) => {
  const name = calleeName(callee);
  if (callee.type !== 'MemberExpression') {
    return impureNames.has(name);
  }

  const objectName = callee.object.type === 'Identifier' ? callee.object.name : calleeName(callee.object);
  return (
    impureNames.has(name) ||
    objectName === 'crypto' ||
    (name === 'now' && (objectName === 'Date' || objectName === 'performance')) ||
    (objectName === 'Math' && name === 'random')
  );
};

/**
 * True when a node sits inside a function whose name starts with `select`.
 *
 * @param {any} node - A node.
 * @returns {boolean} Whether the node is inside a `select*` projection.
 */
const inSelector = (node) => {
  for (let scope = node.parent; scope; scope = scope.parent) {
    if (
      (scope.type === 'FunctionDeclaration' || isFunction(scope)) &&
      (functionName(scope) ?? '').startsWith('select')
    ) {
      return true;
    }
  }

  return false;
};

/**
 * True when `name(…)` enqueues: it is `enq`, or the second parameter of a function in the machine config.
 *
 * @param {any} node - The call.
 * @param {string} name - The called identifier.
 * @returns {boolean} Whether the call enqueues an effect.
 */
const isEnqueue = (node, name) => {
  if (name === 'enq') {
    return true;
  }

  for (let scope = node.parent; scope; scope = scope.parent) {
    if (isFunction(scope) && scope.params[1]?.type === 'Identifier' && scope.params[1].name === name) {
      return inMachineConfig(scope);
    }
  }

  return false;
};

/**
 * True for a transition value that is a function, a target string, or an object without `meta` (MC-R27).
 *
 * @param {any} node - One transition value.
 * @returns {boolean} Whether the transition lacks meta.
 */
const lacksMeta = (node) => {
  if (isFunction(node) || node?.type === 'TemplateLiteral') {
    return true;
  }

  if (node?.type === 'Literal') {
    return typeof node.value === 'string';
  }

  return node?.type === 'ObjectExpression' && !propertyNamed(node, 'meta');
};

/**
 * The type-only test for an import: `import type`, or only inline `type` specifiers.
 *
 * @param {any} node - An `ImportDeclaration`.
 * @returns {boolean} Whether the import brings in no value.
 */
const isTypeOnlyImport = (node) =>
  node.importKind === 'type' ||
  (node.specifiers.length > 0 &&
    node.specifiers.every((specifier) => specifier.type === 'ImportSpecifier' && specifier.importKind === 'type'));

/** @type {RuleModule} */
export const xstateOwnerMachineRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Hold owner machine files to the agent substrate contract: named effects, pure transitions, a root onError, a ' +
        'version and portable imports. Enabled by override on owner globs; `pending` lists message ids not yet enforced.',
    },
    messages,
    schema: [
      {
        type: 'object',
        properties: {
          portable: { type: 'boolean' },
          spec: { type: 'boolean' },
          pending: { type: 'array', items: { enum: Object.keys(messages) }, uniqueItems: true },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    if (context.filename.split('\\').join('/').includes('/__spikes__/')) {
      return {};
    }

    const { portable = false, spec = false, pending = [] } = context.options[0] ?? {};
    /** @param {ReportDescriptor & { messageId: string }} descriptor - What to report. */
    const report = (descriptor) => {
      if (!pending.includes(descriptor.messageId)) {
        context.report(descriptor);
      }
    };

    /** @param {any} node - A value under a transition key, or an array of them. */
    const checkTransition = (node) => {
      for (const transition of node?.type === 'ArrayExpression' ? node.elements : [node]) {
        if (lacksMeta(transition)) {
          report({ node: transition, messageId: 'transitionMeta' });
        }
      }
    };

    /** @param {any} config - A `createMachine` config object. */
    const checkRootKeys = (config) => {
      if (!propertyNamed(config, 'onError')) {
        report({ node: config, messageId: 'rootOnError' });
      }

      if (!propertyNamed(config, 'version')) {
        report({ node: config, messageId: 'version' });
      }
    };

    return {
      ImportDeclaration(node) {
        for (const specifier of node.specifiers) {
          if (
            specifier.type === 'ImportSpecifier' &&
            (specifier.imported.name ?? specifier.imported.value) === 'fromSafeAsync'
          ) {
            report({ node: specifier, messageId: 'fromSafeAsync' });
          }
        }

        const source = String(node.source.value);
        if (portable && !isTypeOnlyImport(node) && source !== 'xstate' && !source.startsWith('#')) {
          report({ node, messageId: 'portableImport' });
        }
      },
      NewExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'Date' && node.arguments.length === 0) {
          report({ node, messageId: 'impure' });
        }
      },
      CallExpression(node) {
        const { callee } = node;
        const name = calleeName(callee);
        const [first] = node.arguments;

        if (isImpureCall(callee)) {
          report({ node, messageId: 'impure' });
        }

        if (name === 'getSnapshot' && callee.type === 'MemberExpression' && !inSelector(node)) {
          report({ node, messageId: 'snapshotRead' });
        }

        if (name === 'createMachine' && first?.type === 'ObjectExpression') {
          checkRootKeys(first);
        }

        if (
          name === 'spawn' &&
          callee.type === 'MemberExpression' &&
          (first?.type === 'Literal' || first?.type === 'TemplateLiteral')
        ) {
          report({ node: first, messageId: 'spawnByKey' });
        }

        if (isFunction(first) && callee.type === 'Identifier' && isEnqueue(node, callee.name)) {
          report({ node: first, messageId: 'inlineEffect' });
        }
      },
      Property(node) {
        if (!spec || !inMachineConfig(node)) {
          return;
        }

        const key = keyName(node);
        if (transitionKeys.has(key)) {
          checkTransition(node.value);
        } else if (transitionMapKeys.has(key) && node.value.type === 'ObjectExpression') {
          for (const entry of node.value.properties) {
            checkTransition(entry.type === 'Property' ? entry.value : undefined);
          }
        }
      },
    };
  },
};
