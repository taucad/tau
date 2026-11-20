/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 */

/**
 * The one owner of each realm's code loads (PL7 service worker staging defects blueprint, FP9 and FP10). A realm keeps a
 * failed module for its life, so a failed load is recovered by a new realm, which the owner hands it to; a load made
 * around the owner would keep the failure, or retry it in place, where nothing can recover it.
 *
 * - Page realm: `import()` through `load` (`#lib/code-loading.js`), lazy components through `lazy`
 *   (`#lib/lazy-component.js`), never React's, and module workers through `createModuleWorker` (`#lib/worker-factory.js`),
 *   which reports a script that failed to load.
 * - Worker realm (`app/workers/` and every `*.worker.*`): `import()` through `loadInWorker` (`#workers/worker-load.js`),
 *   which reports `WORKER_LOAD_FAILED` so the page starts a new worker.
 */
const PAGE_LOADER = { specifier: '#lib/code-loading.js', name: 'load' };
const WORKER_LOADER = { specifier: '#workers/worker-load.js', name: 'loadInWorker' };
const WORKER_FACTORY = { specifier: '#lib/worker-factory.js', name: 'createModuleWorker' };
const OWNER_FILES = [
  'apps/ui/app/lib/code-loading.ts',
  'apps/ui/app/lib/lazy-component.ts',
  'apps/ui/app/lib/worker-factory.ts',
  'apps/ui/app/workers/worker-load.ts',
];

/**
 * @param {string} filename
 * @returns {string}
 */
const posix = (filename) => filename.replaceAll('\\', '/');

/**
 * Files no realm owner governs: the owners themselves, tests, fixtures and test support, and server modules.
 *
 * @param {string} path
 * @returns {boolean}
 */
const isExempt = (path) =>
  OWNER_FILES.some((file) => path.endsWith(file)) ||
  /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(path) ||
  /\.fixture\.[cm]?[jt]sx?$/u.test(path) ||
  path.endsWith('.test-d.ts') ||
  path.includes('/testing/') ||
  /\.server\.[cm]?[jt]sx?$/u.test(path);

/**
 * @param {string} path
 * @returns {boolean}
 */
const isWorkerRealm = (path) => path.includes('apps/ui/app/workers/') || /\.worker\.[cm]?[jt]sx?$/u.test(path);

/**
 * Whether a node is the whole body of a no-argument arrow passed first to a call of one of `owners`.
 *
 * @param {any} node
 * @param {Set<string>} owners
 * @returns {boolean}
 */
const isOwnedBy = (node, owners) => {
  const arrow = node.parent;
  const call = arrow?.parent;
  return (
    arrow?.type === 'ArrowFunctionExpression' &&
    arrow.body === node &&
    arrow.params.length === 0 &&
    call?.type === 'CallExpression' &&
    call.arguments[0] === arrow &&
    call.callee.type === 'Identifier' &&
    owners.has(call.callee.name)
  );
};

/**
 * The expression an owner holds for an `import()`: `import(…).then((loaded) => ({ … }))` names the exports used, so
 * the bundler can still drop the rest (an import whose namespace escapes into `load` keeps every export); otherwise the
 * import itself.
 *
 * @param {any} node - The `ImportExpression`.
 * @returns {any} The `then()` call, or the import.
 */
const namedImportOf = (node) => {
  const then = node.parent;
  return then?.type === 'MemberExpression' &&
    then.object === node &&
    then.property.type === 'Identifier' &&
    then.property.name === 'then' &&
    then.parent?.type === 'CallExpression' &&
    then.parent.callee === then
    ? then.parent
    : node;
};

/** @type {RuleModule} */
export const noUnownedCodeLoadRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        "Route every page-realm import() through load(), lazy component through the owner's lazy() and module worker through createModuleWorker(), and every worker-realm import() through loadInWorker() (PL7 FP9, FP10).",
    },
    messages: {
      unownedImport:
        "Load code through the owner: `load(async () => import('…'))` from `#lib/code-loading.js` (with `{ optional: true }` for code the caller can do without; name the exports used with `import('…').then((loaded) => ({ X: loaded.X }))` so the bundler can drop the rest). A failed load stays failed for the life of the page; the owner hands it to the recovery, which reloads or offers the reload.",
      unownedWorkerImport:
        "Load code inside a worker through `loadInWorker(async () => import('…'))` from `#workers/worker-load.js` (name the exports used with `import('…').then((loaded) => ({ X: loaded.X }))`): it reports `WORKER_LOAD_FAILED`, and the page starts a new worker, since this one keeps the failure.",
      unownedWorker:
        "Create a module worker through `createModuleWorker(() => new Worker(new URL('…', import.meta.url), …), { name })` from `#lib/worker-factory.js`, which reports its script failing to load.",
      reactLazy:
        "Use `lazy` from `#lib/lazy-component.js`, the owner's, not React's: its factory loads through the owner, and optional code declares a `fallback` instead of failing its panel.",
    },
    schema: [],
  },

  create(context) {
    const path = posix(context.filename);
    if (!path.includes('apps/ui/app/') || isExempt(path)) {
      return {};
    }
    const inWorker = isWorkerRealm(path);
    const loader = inWorker ? WORKER_LOADER : PAGE_LOADER;
    /** Local names bound to this realm's loader. */
    const ownerLoads = new Set();
    /** Local names bound to the module-worker factory. */
    const workerFactories = new Set();
    /** Local names bound to React's default or namespace import. */
    const reactNamespaces = new Set();

    /**
     * @param {any} node
     * @param {{ specifier: string, name: string }} owner
     * @param {Set<string>} into
     */
    const collect = (node, owner, into) => {
      if (node.source.value !== owner.specifier) {
        return;
      }
      for (const specifier of node.specifiers) {
        if (
          specifier.type === 'ImportSpecifier' &&
          specifier.imported.type === 'Identifier' &&
          specifier.imported.name === owner.name
        ) {
          into.add(specifier.local.name);
        }
      }
    };

    return {
      ImportDeclaration(node) {
        collect(node, loader, ownerLoads);
        collect(node, WORKER_FACTORY, workerFactories);
        if (node.source.value !== 'react') {
          return;
        }
        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportSpecifier') {
            if (specifier.imported.type === 'Identifier' && specifier.imported.name === 'lazy') {
              context.report({ node: specifier, messageId: 'reactLazy' });
            }
          } else {
            reactNamespaces.add(specifier.local.name);
          }
        }
      },
      ImportExpression(node) {
        if (!isOwnedBy(namedImportOf(node), ownerLoads)) {
          context.report({ node, messageId: inWorker ? 'unownedWorkerImport' : 'unownedImport' });
        }
      },
      NewExpression(node) {
        const [script] = node.arguments;
        const isModuleWorker =
          !inWorker &&
          node.callee.type === 'Identifier' &&
          node.callee.name === 'Worker' &&
          script?.type === 'NewExpression' &&
          script.callee.type === 'Identifier' &&
          script.callee.name === 'URL';
        if (isModuleWorker && !isOwnedBy(node, workerFactories)) {
          context.report({ node, messageId: 'unownedWorker' });
        }
      },
      MemberExpression(node) {
        if (
          node.object.type === 'Identifier' &&
          reactNamespaces.has(node.object.name) &&
          node.property.type === 'Identifier' &&
          node.property.name === 'lazy'
        ) {
          context.report({ node, messageId: 'reactLazy' });
        }
      },
    };
  },
};
