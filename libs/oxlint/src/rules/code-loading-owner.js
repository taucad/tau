/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 */

/**
 * One owner for loading code in the web app (PL7 staging defects blueprint FP9, D21). A realm keeps a module that
 * failed to load failed for its life, so a raw `import()` or `React.lazy` that fails leaves its caller to retry in
 * place, which cannot succeed. Every dynamic `import()` in the web app's browser code is therefore the body of a
 * thunk passed to `loadCode` or `lazyCode` (`@taucad/ui-core/lib/code-loading`, `lazy-code`), which hand a failure to
 * the realm's recovery once; React's `lazy` is called only by `lazyCode`; and every `new Worker(…)` is the body of a
 * thunk passed to `createModuleWorker` (`@taucad/ui-core/lib/module-worker`, FP10), which replaces a worker whose code
 * failed to load.
 */

/** The owner's entrypoints: an `import()` is allowed only in a function passed straight to one of them. */
const OWNER_CALLS = new Set(['loadCode', 'lazyCode']);

/** The module-worker factory (FP10): `new Worker(…)` is allowed only in a function passed straight to it. */
const WORKER_FACTORY_CALLS = new Set(['createModuleWorker']);

/** The owner's own modules, which call `lazy` and the importer they are given. */
const OWNER_FILES = [
  /apps\/libs\/ui-core\/src\/lib\/module-worker\.ts$/u,
  /apps\/libs\/ui-core\/src\/lib\/code-loading\.ts$/u,
  /apps\/libs\/ui-core\/src\/lib\/lazy-code\.ts$/u,
];

/**
 * Browser code of the web app: the app itself and the private application libraries it composes. The API server's
 * libraries (`api-*`) and the desktop main process's host run in Node.
 */
const IN_SCOPE = /(?:^|\/)apps\/(?:ui\/app|libs\/(?!api-|desktop-services-host\/)[^/]+\/src)\//u;

/**
 * Tests, fixtures, stories and server modules load code in Node or a test runner, outside any page. `app/offline` is
 * the service worker and its registration, owned by the worker's own fix packages (FP1–FP5): the worker realm has no
 * page to reload, and its registration's one import is retired with it; it is exempt until those land.
 */
const OUT_OF_SCOPE =
  /\.(?:test|spec|test-d|stories|fixture|server)\.[cm]?[jt]sx?$|\/test\/|\/__tests__\/|(?:^|\/)apps\/ui\/app\/offline\//u;

/**
 * @param {string} filename
 * @returns {string}
 */
const posix = (filename) => filename.replaceAll('\\', '/');

const FUNCTION_TYPES = new Set(['ArrowFunctionExpression', 'FunctionExpression']);

/**
 * Whether a node is a call of an owner entrypoint: `loadCode(…)`, `lazyCode(…)`, or `x.loadCode(…)`.
 *
 * @param {any} node
 * @returns {boolean}
 */
const isOwnerCall = (node, calls = OWNER_CALLS) => {
  if (node?.type !== 'CallExpression') {
    return false;
  }
  const { callee } = node;
  if (callee.type === 'Identifier') {
    return calls.has(callee.name);
  }
  return callee.type === 'MemberExpression' && callee.property.type === 'Identifier' && calls.has(callee.property.name);
};

/**
 * Whether an `import()` runs inside a function handed straight to the owner: its nearest enclosing function is an
 * argument of `loadCode(…)` or `lazyCode(…)`.
 *
 * @param {any} node
 * @returns {boolean}
 */
const isOwned = (node, calls = OWNER_CALLS) => {
  let current = node.parent;
  while (current !== undefined && current !== null && !FUNCTION_TYPES.has(current.type)) {
    if (current.type === 'FunctionDeclaration') {
      return false;
    }
    current = current.parent;
  }
  if (current === undefined || current === null) {
    return false;
  }
  const call = current.parent;
  return isOwnerCall(call, calls) && call.arguments.includes(current);
};

/** @type {RuleModule} */
export const codeLoadingOwnerRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Load code at run time only through the one owner (`loadCode`, `lazyCode`): a raw `import()` or `React.lazy` that fails is retried in a realm that keeps the failure (PL7 staging defects FP9).',
    },
    messages: {
      rawImport:
        'Load this module through `loadCode(async () => import(…))` (`@taucad/ui-core/lib/code-loading`), or `lazyCode` for a component: the owner hands a failed load to the page’s recovery once, since this realm can never load it again (FP9).',
      rawWorker:
        "Start a module worker through `createModuleWorker(() => new Worker(new URL(…), { type: 'module' }), { name })` (`@taucad/ui-core/lib/module-worker`): a worker whose code failed to load is replaced by a new one, never asked again (FP10).",
      rawLazy:
        'Use `lazyCode` (`@taucad/ui-core/lib/lazy-code`) instead of `lazy`: `React.lazy` keeps its rejection, and the owner hands the failure to the page’s recovery, or degrades optional code to its `fallback` (FP9).',
    },
    schema: [],
  },

  create(context) {
    const path = posix(context.filename);
    if (!IN_SCOPE.test(path) || OUT_OF_SCOPE.test(path) || OWNER_FILES.some((pattern) => pattern.test(path))) {
      return {};
    }
    /** Local names bound to React's `lazy` by `import { lazy } from 'react'`. */
    const lazyNames = new Set();
    /** Local names bound to React's namespace or default export. */
    const reactNames = new Set();
    return {
      ImportDeclaration(node) {
        if (node.source.value !== 'react') {
          return;
        }
        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportSpecifier') {
            const imported =
              specifier.imported.type === 'Identifier' ? specifier.imported.name : specifier.imported.value;
            if (imported === 'lazy') {
              lazyNames.add(specifier.local.name);
            }
          } else {
            reactNames.add(specifier.local.name);
          }
        }
      },
      ImportExpression(node) {
        if (!isOwned(node)) {
          context.report({ node, messageId: 'rawImport' });
        }
      },
      NewExpression(node) {
        const { callee } = node;
        const isWorker = callee.type === 'Identifier' && (callee.name === 'Worker' || callee.name === 'SharedWorker');
        if (isWorker && !isOwned(node, WORKER_FACTORY_CALLS)) {
          context.report({ node, messageId: 'rawWorker' });
        }
      },
      CallExpression(node) {
        const { callee } = node;
        const isLazy =
          (callee.type === 'Identifier' && lazyNames.has(callee.name)) ||
          (callee.type === 'MemberExpression' &&
            callee.object.type === 'Identifier' &&
            reactNames.has(callee.object.name) &&
            callee.property.type === 'Identifier' &&
            callee.property.name === 'lazy');
        if (isLazy) {
          context.report({ node, messageId: 'rawLazy' });
        }
      },
    };
  },
};
