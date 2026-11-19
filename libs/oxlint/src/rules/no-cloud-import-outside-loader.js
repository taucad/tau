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
    return {
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
