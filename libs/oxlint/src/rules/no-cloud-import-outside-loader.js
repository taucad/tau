/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 */

/**
 * The one module allowed to name a Tau Cloud chunk's `import()` (adaptive app deployment mode charter I8): every
 * lazy Cloud surface loads through it and mounts through the one surface helper, which owns the error boundary, the
 * local Suspense boundary and the import deadline.
 */
const LOADER_FILE = 'apps/ui/app/cloud/cloud-entries.ts';

/** A specifier that names Cloud code: a `#cloud/` boundary, or a `.cloud` or `.lazy` file under `app/cloud`. */
const CLOUD_SPECIFIER = /^#cloud\/|(?:^|\/)cloud\/[^/]+\.(?:cloud|lazy)(?:\.js)?$/u;

/** A static specifier naming a `.cloud` implementation file. */
const CLOUD_FILE = /\.cloud(?:\.js)?$/u;

/**
 * Files that may import a `.cloud` implementation statically: the pinned `cloud` files themselves, the Cloud chunk,
 * and the purge, which is Core in every build that has one (I5).
 */
const STATIC_CLOUD_ALLOWED = [
  /\.cloud\.tsx?$/u,
  /\.lazy\.tsx?$/u,
  /apps\/ui\/app\/cloud\/financial-purge\.adaptive\.ts$/u,
];

/**
 * @param {string} filename
 * @returns {string}
 */
const posix = (filename) => filename.replaceAll('\\', '/');

/**
 * @param {string} path
 * @returns {boolean}
 */
const isTest = (path) => /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(path);

/** @type {RuleModule} */
export const noCloudImportOutsideLoaderRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Allow a Tau Cloud dynamic import() and React lazy() of Cloud code only through the one Cloud loader (adaptive app deployment mode I8).',
    },
    messages: {
      cloudImport:
        'Load Tau Cloud code through the one loader (`apps/ui/app/cloud/cloud-entries.ts`) and mount it with `CloudSurface`: it owns the error boundary, the local Suspense boundary and the import deadline (I8).',
      cloudStatic:
        'A `.cloud` implementation is imported only by the Cloud chunk (`*.lazy.tsx`): a facade reads the port and never swaps its hook (BA13).',
      cloudLazy:
        '`lazy()` of Tau Cloud code renders from an unsettled import; mount it with `CloudSurface` from the loader instead (I8).',
    },
    schema: [],
  },

  create(context) {
    const path = posix(context.filename);
    if (!path.includes('apps/ui/app/') || isTest(path) || path.endsWith(LOADER_FILE)) {
      return {};
    }
    const inCloudFolder = path.includes('apps/ui/app/cloud/');
    const mayImportCloud = STATIC_CLOUD_ALLOWED.some((pattern) => pattern.test(path));
    /** @param {{ source?: { type: string, value?: unknown } | null }} node */
    const checkStatic = (node) => {
      const { source } = node;
      if (
        !mayImportCloud &&
        source?.type === 'Literal' &&
        typeof source.value === 'string' &&
        CLOUD_FILE.test(source.value)
      ) {
        context.report({ node, messageId: 'cloudStatic' });
      }
    };
    return {
      ImportDeclaration: checkStatic,
      ExportNamedDeclaration: checkStatic,
      ExportAllDeclaration: checkStatic,
      ImportExpression(node) {
        const { source } = node;
        if (source.type === 'Literal' && typeof source.value === 'string' && CLOUD_SPECIFIER.test(source.value)) {
          context.report({ node, messageId: 'cloudImport' });
        }
      },
      CallExpression(node) {
        const { callee } = node;
        const isLazy =
          (callee.type === 'Identifier' && callee.name === 'lazy') ||
          (callee.type === 'MemberExpression' &&
            callee.property.type === 'Identifier' &&
            callee.property.name === 'lazy' &&
            callee.object.type === 'Identifier' &&
            callee.object.name === 'React');
        if (isLazy && inCloudFolder) {
          context.report({ node, messageId: 'cloudLazy' });
        }
      },
    };
  },
};
