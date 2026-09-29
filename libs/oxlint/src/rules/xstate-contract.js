import path from 'node:path';

/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 * @typedef {import('eslint').Rule.RuleContext} RuleContext
 * @typedef {import('estree').Node} Node
 */

/** Modules of `xstate` that stay in spikes, tests and tooling (MC-R22). @public */
export const gatedModules = ['xstate/durable', 'xstate/validation', 'xstate/fsm', 'xstate/scxml'];

/** Exports of `xstate` that stay in spikes, tests and tooling (MC-R22). `ActorSystemRuntime` is a type. @public */
export const gatedExports = [
  'createFSM',
  'executeEffects',
  'getEffectDescriptor',
  'machineVersions',
  'createMachineFromConfig',
  'runStep',
  'deliverEvent',
  'stopActor',
  'terminateActor',
  'ActorSystemRuntime',
];

/** Named imports that reach the actor registry (MC-R13). @public */
export const registryImports = ['createSystem'];

/** Deprecated snapshot helpers; use `transition` and `initialTransition`. @public */
export const deprecatedSnapshotImports = ['getNextSnapshot', 'getInitialSnapshot'];

/** The call that must never read the machine's own state through `self`. @public */
export const checkStateInCallee = 'checkStateIn';

/** The workspace root that file classes are relative to; `context.cwd` is the linted project's root under Nx. @public */
export const workspaceRoot = process.env.NX_WORKSPACE_ROOT ?? path.resolve(import.meta.dirname, '..', '..', '..', '..');

const registryKeys = new Set(['registryKey', 'systemId']);
const harnessModule = '@taucad/xstate-testing';

/**
 * Classifies a file by its path relative to the workspace root.
 *
 * @param {RuleContext} context - Rule context.
 * @returns {'spike' | 'test' | 'product'} The file class.
 */
export const fileClass = (context) => {
  const relative = `/${path.relative(workspaceRoot, path.resolve(context.filename)).split(path.sep).join('/')}`;

  if (relative.includes('/__spikes__/')) {
    return 'spike';
  }

  if (
    /\.(?:test|spec|test-d)\./u.test(relative) ||
    /\/(?:test|__tests__|specs|scripts)\//u.test(relative) ||
    relative.startsWith('/tools/') ||
    relative.startsWith('/libs/xstate-testing/')
  ) {
    return 'test';
  }

  return 'product';
};

/**
 * The static name of a property key, or `undefined` for a computed key.
 *
 * @param {any} property - A `Property` node.
 * @returns {string | undefined} The key name.
 */
export const keyName = (property) => {
  if (property.computed) {
    return undefined;
  }

  if (property.key.type === 'Identifier') {
    return property.key.name;
  }

  return property.key.type === 'Literal' ? String(property.key.value) : undefined;
};

/**
 * The name a callee is called by: `name(…)` or `object.name(…)`.
 *
 * @param {any} callee - A call's callee.
 * @returns {string | undefined} The called name.
 */
export const calleeName = (callee) => {
  if (callee.type === 'Identifier') {
    return callee.name;
  }

  return callee.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier'
    ? callee.property.name
    : undefined;
};

/**
 * True for `system` or `….system`.
 *
 * @param {any} node - An expression.
 * @returns {boolean} Whether the expression names an actor system.
 */
const isSystem = (node) =>
  (node.type === 'Identifier' && node.name === 'system') ||
  (node.type === 'MemberExpression' &&
    !node.computed &&
    node.property.type === 'Identifier' &&
    node.property.name === 'system');

const isFunction = (node) => node?.type === 'ArrowFunctionExpression' || node?.type === 'FunctionExpression';

/**
 * The property of an object literal with a static key, if any.
 *
 * @param {any} objectExpression - An `ObjectExpression`.
 * @param {string} name - The key.
 * @returns {any} The `Property`, or `undefined`.
 */
export const propertyNamed = (objectExpression, name) =>
  objectExpression.properties.find((property) => property.type === 'Property' && keyName(property) === name);

/**
 * True for a provided action whose function name equals its key: an arrow, an anonymous function
 * expression, a method or a same-name shorthand (MC-R8).
 *
 * @param {any} property - A property of a provided `actions` object.
 * @returns {boolean} Whether the action is keyed.
 */
const isKeyedAction = (property) => {
  if (property.type !== 'Property') {
    return false;
  }

  if (property.method === true || property.shorthand === true || property.value.type === 'ArrowFunctionExpression') {
    return true;
  }

  return property.value.type === 'FunctionExpression' && !property.value.id;
};

/**
 * The static value of a string or template target, or `undefined` for any other expression.
 *
 * @param {any} node - An argument.
 * @param {RuleContext} context - Rule context, for a template's source text.
 * @returns {string | undefined} The comparable target.
 */
const staticTarget = (node, context) => {
  if (node?.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }

  if (node?.type === 'TemplateLiteral') {
    return node.expressions.length === 0 ? node.quasis[0].value.cooked : context.sourceCode.getText(node);
  }

  return undefined;
};

/**
 * True when a function is a config-level value (an object property or array element) inside a
 * `setup(…)` or `createMachine(…)` call.
 *
 * @param {any} functionNode - A function node.
 * @returns {boolean} Whether the function is part of a machine definition.
 */
const isMachineFunction = (functionNode) => {
  if (functionNode.parent?.type !== 'Property' && functionNode.parent?.type !== 'ArrayExpression') {
    return false;
  }

  for (let node = functionNode.parent; node; node = node.parent) {
    if (node.type === 'CallExpression' && ['setup', 'createMachine'].includes(calleeName(node.callee))) {
      return true;
    }
  }

  return false;
};

/** @type {RuleModule} */
export const xstateContractRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid XState forms the agent substrate contract bans, and keep gated forms and the test harness out of product ' +
        'code. See docs/policy/xstate-policy.md, "Agent substrate contract".',
    },
    messages: {
      registry:
        'Do not use the actor registry (`registryKey`, `systemId`, `createSystem`); address peers through input refs (MC-R13).',
      systemLookup:
        'Do not look actors up with `system.get`/`system.getAll`; address peers through input refs (MC-R13).',
      parentAddress:
        'Do not address the parent (`parent`, `sendParent`); send to the `parentRef` from input (MC-R11, MC-R13).',
      stringTarget:
        'Send to a ref, or to an id this file declares on an `invoke` or `enq.spawn`; a string target resolves at runtime (MC-R13).',
      routeState: 'Route states are not part of the contract (MC-R13).',
      checkStateInSelf: 'Do not call `checkStateIn` on `self`; guard on the transition arguments (MC-R6).',
      deprecatedSnapshot: 'Use `transition`/`initialTransition` instead of `getNextSnapshot`/`getInitialSnapshot`.',
      internalEventsArray: 'Declare `internalEvents` as a schema map, not the deprecated array (MC-R15).',
      persistedSnapshot: 'Product code never persists or restores snapshots; rehydrate from the fold (MC-R19).',
      provideActions:
        'Provide custom actions once, at the root, as keyed arrows, methods or same-name shorthands, never from a `*.machine.ts` (MC-R8).',
      gatedModule: 'Gated XState modules stay in spikes, tests and tooling (MC-R22).',
      gatedExport: 'Gated XState exports stay in spikes, tests and tooling (MC-R22).',
      gatedMember: '`enq.step`, `system.runtime` and `embedChildren` stay in spikes, tests and tooling (MC-R22).',
      harnessImport: '`@taucad/xstate-testing` is a test harness; product code never imports it (MC-R23).',
    },
    schema: [],
  },
  create(context) {
    const kind = fileClass(context);
    if (kind === 'spike') {
      return {};
    }

    const product = kind === 'product';
    let importsXstate = false;
    /** @type {Set<string>} */
    const declaredIds = new Set();
    /** @type {Array<{ node: Node; target: string }>} */
    const stringTargets = [];

    /** @param {any} node - A module source. */
    const checkModule = (node) => {
      const source = node?.value;
      if (typeof source !== 'string') {
        return;
      }

      if (product && gatedModules.includes(source)) {
        context.report({ node, messageId: 'gatedModule' });
      }

      if (product && (source === harnessModule || source.startsWith(`${harnessModule}/`))) {
        context.report({ node, messageId: 'harnessImport' });
      }
    };

    /** @param {any} objectExpression - An object that declares an actor id. */
    const collectId = (objectExpression) => {
      for (const property of objectExpression?.type === 'ObjectExpression' ? objectExpression.properties : []) {
        if (property.type === 'Property' && keyName(property) === 'id') {
          const id = staticTarget(property.value, context);
          if (id !== undefined) {
            declaredIds.add(id);
          }
        }
      }
    };

    /** @param {any} node - A function node. */
    const checkParentParameter = (node) => {
      const [first] = node.params;
      if (!first || !importsXstate || !isMachineFunction(node)) {
        return;
      }

      if (first.type === 'ObjectPattern') {
        for (const property of first.properties) {
          if (property.type === 'Property' && keyName(property) === 'parent') {
            context.report({ node: property, messageId: 'parentAddress' });
          }
        }
      }
    };

    /** @param {any} node - A `.provide(…)` call. */
    const checkProvide = (node) => {
      const [options] = node.arguments;
      const actions = options?.type === 'ObjectExpression' ? propertyNamed(options, 'actions') : undefined;
      if (!actions) {
        return;
      }

      const provided = actions.value;
      const keyed =
        provided.type !== 'ObjectExpression' || provided.properties.every((property) => isKeyedAction(property));
      if (!keyed || context.filename.endsWith('.machine.ts')) {
        context.report({ node: actions, messageId: 'provideActions' });
      }
    };

    /**
     * @param {any} node - A call in a file that imports `xstate`.
     * @param {string | undefined} name - The called name.
     */
    const checkXstateCall = (node, name) => {
      const [first, second] = node.arguments;
      if (
        (name === 'get' || name === 'getAll') &&
        node.callee.type === 'MemberExpression' &&
        isSystem(node.callee.object)
      ) {
        context.report({ node, messageId: 'systemLookup' });
      } else if (
        name === checkStateInCallee &&
        node.arguments.some((argument) => /\bself\b/u.test(context.sourceCode.getText(argument)))
      ) {
        context.report({ node, messageId: 'checkStateInSelf' });
      } else if (name === 'sendTo') {
        const target = staticTarget(first, context);
        if (target !== undefined) {
          stringTargets.push({ node: first, target });
        }
      } else if (name === 'spawn') {
        collectId(second);
      }
    };

    /**
     * @param {any} node - A call in a product file that imports `xstate`.
     * @param {string | undefined} name - The called name.
     */
    const checkProductCall = (node, name) => {
      const { callee } = node;
      const [, second] = node.arguments;
      if (name === 'getPersistedSnapshot' || name === 'restoreSnapshot') {
        context.report({ node, messageId: 'persistedSnapshot' });
      } else if (name === 'createActor' && second?.type === 'ObjectExpression' && propertyNamed(second, 'snapshot')) {
        context.report({ node: propertyNamed(second, 'snapshot'), messageId: 'persistedSnapshot' });
      } else if (name === 'step' && callee.object?.type === 'Identifier' && callee.object.name === 'enq') {
        context.report({ node, messageId: 'gatedMember' });
      }
    };

    return {
      Program(node) {
        importsXstate = node.body.some(
          (statement) =>
            statement.type === 'ImportDeclaration' &&
            (statement.source.value === 'xstate' || String(statement.source.value).startsWith('xstate/')),
        );
      },
      ImportDeclaration(node) {
        checkModule(node.source);
        if (node.source.value !== 'xstate') {
          return;
        }

        for (const specifier of node.specifiers) {
          const name =
            specifier.type === 'ImportSpecifier' ? (specifier.imported.name ?? specifier.imported.value) : undefined;
          if (registryImports.includes(name)) {
            context.report({ node: specifier, messageId: 'registry' });
          } else if (name === 'sendParent') {
            context.report({ node: specifier, messageId: 'parentAddress' });
          } else if (deprecatedSnapshotImports.includes(name)) {
            context.report({ node: specifier, messageId: 'deprecatedSnapshot' });
          } else if (product && gatedExports.includes(name)) {
            context.report({ node: specifier, messageId: 'gatedExport' });
          }
        }
      },
      ExportAllDeclaration(node) {
        checkModule(node.source);
      },
      ExportNamedDeclaration(node) {
        checkModule(node.source);
      },
      ImportExpression(node) {
        checkModule(node.source);
      },
      ArrowFunctionExpression: checkParentParameter,
      FunctionExpression: checkParentParameter,
      Property(node) {
        if (!importsXstate) {
          return;
        }

        const key = keyName(node);
        if (registryKeys.has(key)) {
          context.report({ node, messageId: 'registry' });
        } else if (key === 'internalEvents' && node.value.type === 'ArrayExpression') {
          context.report({ node, messageId: 'internalEventsArray' });
        } else if (key === 'migrate' && product) {
          context.report({ node, messageId: 'persistedSnapshot' });
        } else if (key === 'embedChildren' && product) {
          context.report({ node, messageId: 'gatedMember' });
        } else if (key === 'route') {
          // A `route` key on a state node: Property(route) ← state object ← Property(name) ← states object ← Property(states).
          const statesProperty = node.parent?.parent?.parent?.parent;
          if (statesProperty?.type === 'Property' && keyName(statesProperty) === 'states') {
            context.report({ node, messageId: 'routeState' });
          }
        } else if (key === 'invoke') {
          for (const entry of node.value.type === 'ArrayExpression' ? node.value.elements : [node.value]) {
            collectId(entry);
          }
        }
      },
      Literal(node) {
        if (importsXstate && node.value === 'xstate.route') {
          context.report({ node, messageId: 'routeState' });
        }
      },
      MemberExpression(node) {
        if (!importsXstate || node.computed || node.property.type !== 'Identifier') {
          return;
        }

        if (product && node.property.name === 'runtime' && isSystem(node.object)) {
          context.report({ node, messageId: 'gatedMember' });
        }

        // `args.parent`, where `args` is the first parameter of a machine function.
        if (node.property.name === 'parent' && node.object.type === 'Identifier') {
          for (let scope = node.parent; scope; scope = scope.parent) {
            if (
              isFunction(scope) &&
              scope.params[0]?.type === 'Identifier' &&
              scope.params[0].name === node.object.name
            ) {
              if (isMachineFunction(scope)) {
                context.report({ node, messageId: 'parentAddress' });
              }
              break;
            }
          }
        }
      },
      CallExpression(node) {
        const name = calleeName(node.callee);
        if (product && name === 'provide') {
          checkProvide(node);
        }

        if (importsXstate) {
          checkXstateCall(node, name);
        }

        if (importsXstate && product) {
          checkProductCall(node, name);
        }
      },
      'Program:exit'() {
        for (const { node, target } of stringTargets) {
          if (!declaredIds.has(target)) {
            context.report({ node, messageId: 'stringTarget' });
          }
        }
      },
    };
  },
};
