/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 * @typedef {{ modules?: string[], deferredLeaves?: string[], known?: string[] }} Options
 */

/**
 * A heavy module (the AI SDK, three.js, a kernel, the editor, telemetry) belongs to a route's deferred tier: a
 * static import puts it, and everything it imports, on the critical path of every route whose graph reaches the
 * importer. This rule reports a value import or re-export of a listed specifier, so the direct edge is caught in
 * the editor (progressive loading architecture, guard G1). `import type` and `export type` erase and `import()` is
 * the tier boundary, so neither is reported, nor is a `?url`, `?raw` or `?worker` import. `import { type X } from '…'` is reported: under `verbatimModuleSyntax`
 * it still loads the module.
 *
 * Tests, workers (`*.worker.*`, a bundle of their own) and server modules (`*.server.*`) are not reported.
 *
 * Options, all workspace-relative:
 * - `modules`: the heavy specifiers. `x` is the exact specifier, `x/*` every subpath of `x`.
 * - `deferredLeaves`: files (or directories, ending in `/`) that only a dynamic import reaches, which may import a
 *   heavy module statically. The critical-graph test holds every entry off each route class's static graph.
 * - `known`: files on a route class's static graph that import a heavy module today, each one owned by the work
 *   package that removes it. The list only shrinks.
 */

const assetQueries = new Set(['url', 'raw', 'worker', 'sharedworker']);

/**
 * @param {string} specifier
 * @param {string} pattern
 * @returns {boolean}
 */
const matchesPattern = (specifier, pattern) =>
  pattern.endsWith('/*') ? specifier.startsWith(pattern.slice(0, -1)) : specifier === pattern;

/**
 * @param {string} filename
 * @param {string[]} paths
 * @returns {boolean}
 */
const isListed = (filename, paths) => {
  const normalized = filename.replaceAll('\\', '/');
  return paths.some((path) =>
    path.endsWith('/')
      ? normalized.startsWith(path) || normalized.includes(`/${path}`)
      : normalized === path || normalized.endsWith(`/${path}`),
  );
};

/** Tests, workers and server modules are never part of a document's interactive tier. */
const outOfTier =
  /\.(?:test|spec|test-d)\.[cm]?[jt]sx?$|\.worker\.[cm]?[jt]sx?$|\.server\.[cm]?[jt]sx?$|(?:^|\/)testing\//u;

/** @type {RuleModule} */
export const noStaticHeavyImportRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Load heavy modules (AI SDK, three.js, kernels, editor, telemetry) only through a dynamic import.',
    },
    messages: {
      staticHeavy:
        "'{{source}}' is a heavy module: load it with import() behind a tier boundary, or, when only a dynamic import reaches this file, list it in the rule's deferredLeaves.",
    },
    schema: [
      {
        type: 'object',
        properties: {
          modules: { type: 'array', items: { type: 'string' } },
          deferredLeaves: { type: 'array', items: { type: 'string' } },
          known: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    /** @type {Options} */
    const options = context.options[0] ?? {};
    const modules = options.modules ?? [];
    if (
      modules.length === 0 ||
      outOfTier.test(context.filename.replaceAll('\\', '/')) ||
      isListed(context.filename, options.deferredLeaves ?? []) ||
      isListed(context.filename, options.known ?? [])
    ) {
      return {};
    }
    /**
     * @param {import('estree').Node & { source?: { value?: unknown } | null }} node
     * @param {string | undefined} kind
     */
    const check = (node, kind) => {
      const source = node.source?.value;
      if (kind === 'type' || typeof source !== 'string') {
        return;
      }
      const [specifier = '', query] = source.split('?', 2);
      // A URL, raw-text or worker-constructor import evaluates none of the module.
      if (query !== undefined && assetQueries.has(query)) {
        return;
      }
      if (modules.some((pattern) => matchesPattern(specifier, pattern))) {
        context.report({ node, messageId: 'staticHeavy', data: { source } });
      }
    };
    return {
      ImportDeclaration(node) {
        check(node, /** @type {{ importKind?: string }} */ (node).importKind);
      },
      ExportNamedDeclaration(node) {
        check(node, /** @type {{ exportKind?: string }} */ (node).exportKind);
      },
      ExportAllDeclaration(node) {
        check(node, /** @type {{ exportKind?: string }} */ (node).exportKind);
      },
    };
  },
};
