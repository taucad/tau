/**
 * Validates that markdown links in MDX files point to existing pages.
 * Checks both relative links (e.g., `../api/client`) and absolute links
 * (e.g., `/docs/runtime/api/client`) by resolving them to filesystem paths
 * and verifying the target `.mdx` or `index.mdx` file exists.
 *
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 * @typedef {import('eslint').Rule.RuleContext} RuleContext
 */

import fs from 'node:fs';
import path from 'node:path';

// oxlint-disable-next-line unicorn-js/better-regex -- escaped bracket in named group requires this form
const MARKDOWN_LINK_REGEX = /\[(?<text>[^\]]*)\]\((?<url>[^)]+)\)/g;
const EXTERNAL_REGEX = /^(?:https?:|mailto:|tel:|ftp:|#)/i;
const CONTENT_DOCS_SEGMENT = `content${path.sep}docs`;
const DOCS_PREFIX_REGEX = /^\/docs(?:\/|$)/;

/**
 * Mirrors `resourceRouteExtensions` in `apps/libs/editor-ui/src/components/markdown/markdown-hyperlink.tsx`.
 * Duplicated rather than imported because `libs/oxlint` must not depend on `apps/ui`.
 * Keep in sync if the canonical list changes.
 *
 * URLs ending in these extensions are react-router resource routes (loader-only,
 * no default Component). `.mdx` resolves to the underlying MDX page on disk;
 * `.txt` and `.webmanifest` are generated at request time by route loaders and
 * have no filesystem-validatable target.
 */
const RESOURCE_ROUTE_EXTENSIONS = new Set(['.txt', '.mdx', '.webmanifest']);
const RUNTIME_GENERATED_RESOURCE_EXTENSIONS = new Set(['.txt', '.webmanifest']);

/**
 * @param {string} filePath
 * @returns {string | undefined}
 */
const findContentDocsRoot = (filePath) => {
  const index = filePath.indexOf(CONTENT_DOCS_SEGMENT);
  if (index === -1) {
    return undefined;
  }
  return filePath.slice(0, index + CONTENT_DOCS_SEGMENT.length);
};

/**
 * @param {string} pathname
 * @returns {string}
 */
const lastSegmentExtension = (pathname) => {
  const lastSlash = pathname.lastIndexOf('/');
  const lastSegment = lastSlash === -1 ? pathname : pathname.slice(lastSlash + 1);
  const dot = lastSegment.lastIndexOf('.');
  if (dot <= 0) {
    return '';
  }
  return lastSegment.slice(dot).toLowerCase();
};

/**
 * @param {string} resolved  Resolved path without extension
 * @returns {boolean}
 */
const targetExists = (resolved) => fs.existsSync(`${resolved}.mdx`) || fs.existsSync(path.join(resolved, 'index.mdx'));

/**
 * @typedef {{ context: RuleContext; href: string; rawUrl: string; urlStart: number; urlEnd: number }} LinkValidationOptions
 */

/**
 * @param {LinkValidationOptions & { fileDirectory: string }} options
 */
const validateRelativeLink = ({ context, href, rawUrl, fileDirectory, urlStart, urlEnd }) => {
  const resolved = path.resolve(fileDirectory, href);

  if (!targetExists(resolved)) {
    context.report({
      loc: {
        start: context.sourceCode.getLocFromIndex(urlStart),
        end: context.sourceCode.getLocFromIndex(urlEnd),
      },
      messageId: 'deadLink',
      data: { url: rawUrl, resolvedPath: `${resolved}.mdx` },
    });
  }
};

/**
 * @param {LinkValidationOptions} options
 */
const validateAbsoluteLink = ({ context, href, rawUrl, urlStart, urlEnd }) => {
  if (!DOCS_PREFIX_REGEX.test(href)) {
    return;
  }

  const contentRoot = findContentDocsRoot(context.filename);
  if (!contentRoot) {
    return;
  }

  const withoutBase = href.replace(/^\/docs\/?/, '');
  if (!withoutBase) {
    return;
  }

  const resolved = path.join(contentRoot, ...withoutBase.split('/'));

  if (!targetExists(resolved)) {
    context.report({
      loc: {
        start: context.sourceCode.getLocFromIndex(urlStart),
        end: context.sourceCode.getLocFromIndex(urlEnd),
      },
      messageId: 'deadLink',
      data: { url: rawUrl, resolvedPath: `${resolved}.mdx` },
    });
  }
};

/** @type {RuleModule} */
export const validateMdxLinksRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Validates that markdown links in MDX files resolve to existing pages',
    },
    messages: {
      deadLink: 'Dead link: "{{url}}" does not resolve to an existing page (tried {{resolvedPath}})',
    },
  },
  create(context) {
    return {
      Program() {
        const source = context.sourceCode.text;
        const fileDirectory = path.dirname(context.filename);

        for (const match of source.matchAll(MARKDOWN_LINK_REGEX)) {
          const rawUrl = match.groups?.url ?? '';
          if (EXTERNAL_REGEX.test(rawUrl)) {
            continue;
          }

          const hrefWithoutAnchor = rawUrl.split('#')[0];
          if (!hrefWithoutAnchor) {
            continue;
          }

          const extension = lastSegmentExtension(hrefWithoutAnchor);
          if (extension && !RESOURCE_ROUTE_EXTENSIONS.has(extension)) {
            // Unknown non-MDX extension; not something this rule can validate.
            continue;
          }
          if (RUNTIME_GENERATED_RESOURCE_EXTENSIONS.has(extension)) {
            // Loader-only resource routes (e.g. /llms.txt, /site.webmanifest)
            // have no filesystem target.
            continue;
          }

          // Strip a trailing `.mdx` so URLs that target the per-page raw markdown
          // resource route (e.g. /docs/runtime/getting-started/installation.mdx)
          // resolve against the underlying MDX page.
          const href = extension === '.mdx' ? hrefWithoutAnchor.slice(0, -extension.length) : hrefWithoutAnchor;

          if (!href) {
            continue;
          }

          const matchIndex = match.index ?? 0;
          const urlStart = matchIndex + match[0].lastIndexOf(`(${rawUrl}`) + 1;
          const urlEnd = urlStart + rawUrl.length;

          /** @type {LinkValidationOptions} */
          const options = { context, href, rawUrl, urlStart, urlEnd };

          if (href.startsWith('/')) {
            validateAbsoluteLink(options);
          } else {
            validateRelativeLink({ ...options, fileDirectory });
          }
        }
      },
    };
  },
};
