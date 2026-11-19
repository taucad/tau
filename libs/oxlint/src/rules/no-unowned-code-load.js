/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 */

/**
 * The one owner of page-realm code loads (PL7 service worker staging defects blueprint, FP9). A realm keeps a failed
 * module for its life, so a failed load is recovered by a new realm, which the owner hands it to; a load made around
 * the owner would keep the failure, or retry it in place, where nothing can recover it.
 */
const OWNER_SPECIFIER = '#lib/code-loading.js';
const OWNER_FILES = ['apps/ui/app/lib/code-loading.ts', 'apps/ui/app/lib/lazy-component.ts'];

/**
 * @param {string} filename
 * @returns {string}
 */
const posix = (filename) => filename.replaceAll('\\', '/');

/**
 * Files outside the page realm, or the owner itself: tests and test support, server modules, and worker realms (the
 * worker loader of FP10 owns those).
 *
 * @param {string} path
 * @returns {boolean}
 */
const isExempt = (path) =>
  OWNER_FILES.some((file) => path.endsWith(file)) ||
  /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(path) ||
  path.endsWith('.test-d.ts') ||
  path.includes('/testing/') ||
  /\.server\.[cm]?[jt]sx?$/u.test(path) ||
  path.includes('apps/ui/app/workers/') ||
  /\.worker\.[cm]?[jt]sx?$/u.test(path);

/** @type {RuleModule} */
export const noUnownedCodeLoadRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        "Route every page-realm import() through the code-load owner's load() and every lazy component through its lazy() (PL7 FP9).",
    },
    messages: {
      unownedImport:
        "Load code through the owner: `load(async () => import('…'))` from `#lib/code-loading.js` (with `{ optional: true }` for code the caller can do without). A failed load stays failed for the life of the page; the owner hands it to the recovery, which reloads or offers the reload.",
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
    /** Local names bound to the owner's `load`. */
    const ownerLoads = new Set();
    /** Local names bound to React's default or namespace import. */
    const reactNamespaces = new Set();

    return {
      ImportDeclaration(node) {
        const source = node.source.value;
        if (source === OWNER_SPECIFIER) {
          for (const specifier of node.specifiers) {
            if (
              specifier.type === 'ImportSpecifier' &&
              specifier.imported.type === 'Identifier' &&
              specifier.imported.name === 'load'
            ) {
              ownerLoads.add(specifier.local.name);
            }
          }
          return;
        }
        if (source !== 'react') {
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
        const arrow = node.parent;
        const call = arrow?.parent;
        const isOwned =
          arrow?.type === 'ArrowFunctionExpression' &&
          arrow.body === node &&
          arrow.params.length === 0 &&
          call?.type === 'CallExpression' &&
          call.arguments[0] === arrow &&
          call.callee.type === 'Identifier' &&
          ownerLoads.has(call.callee.name);
        if (!isOwned) {
          context.report({ node, messageId: 'unownedImport' });
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
