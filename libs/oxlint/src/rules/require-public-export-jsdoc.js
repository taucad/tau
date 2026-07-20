/**
 * Requires `@public` JSDoc tag on symbols exported from files reachable
 * through package.json `exports`. Barrel re-exports (`export * from`,
 * `export { } from`) are followed recursively to locate the original
 * declaration files. Symbols in those files must carry `@public` in their
 * leading JSDoc so that `validate-jsdoc-codeblocks` can discriminate
 * between public (compile-checked) and internal examples.
 *
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 * @typedef {{ importsMap: Record<string, string>; packageDirectory: string }} ResolveContext
 */

import fs from 'node:fs';
import path from 'node:path';

const PUBLIC_TAG_REGEX = /@public(?:\s|$|\*)/;

// ─── package.json resolution ────────────────────────────────────────────────

/** @type {Map<string, Set<string>>} */
const publicFilesCache = new Map();

/**
 * Extract all source file paths from a package.json `exports` map,
 * deduplicating across condition branches.
 *
 * @param {unknown} exports
 * @returns {Set<string>}
 */
function flattenExports(exports) {
  /** @type {Set<string>} */
  const files = new Set();

  /** @param {unknown} value */
  function walk(value) {
    if (typeof value === 'string') {
      files.add(value);
      return;
    }
    if (typeof value !== 'object' || value === null) {
      return;
    }
    for (const [key, nested] of Object.entries(value)) {
      if (key === 'types') {
        continue;
      }
      walk(nested);
    }
  }

  walk(exports);
  return files;
}

/**
 * @param {Record<string, string>} importsMap
 * @param {string} specifier
 * @param {string} packageDirectory
 * @returns {string | undefined}
 */
function resolveHashImport(importsMap, specifier, packageDirectory) {
  for (const [pattern, target] of Object.entries(importsMap)) {
    if (!pattern.endsWith('*') || typeof target !== 'string' || !target.endsWith('*')) {
      continue;
    }
    const prefix = pattern.slice(0, -1);
    if (!specifier.startsWith(prefix)) {
      continue;
    }
    const remainder = specifier.slice(prefix.length);
    let resolved = target.slice(0, -1) + remainder;
    if (resolved.endsWith('.js')) {
      resolved = `${resolved.slice(0, -3)}.ts`;
    }
    const absolute = path.resolve(packageDirectory, resolved);
    if (fs.existsSync(absolute)) {
      return absolute;
    }
  }
  return undefined;
}

/**
 * @param {string} fromFile
 * @param {string} specifier
 * @returns {string | undefined}
 */
function resolveRelative(fromFile, specifier) {
  const directory = path.dirname(fromFile);
  let target = specifier;
  if (target.endsWith('.js')) {
    target = `${target.slice(0, -3)}.ts`;
  }
  const full = path.resolve(directory, target);
  if (fs.existsSync(full)) {
    return full;
  }
  const withExtension = `${full}.ts`;
  if (fs.existsSync(withExtension)) {
    return withExtension;
  }
  const asIndex = path.join(full, 'index.ts');
  if (fs.existsSync(asIndex)) {
    return asIndex;
  }
  return undefined;
}

// oxlint-disable-next-line unicorn-js/better-regex -- named capture group clarity
const RE_EXPORT_REGEX = /export\s+(?:type\s+)?(?:\*|\{[^}]*\})\s+from\s+['"](?<specifier>[^'"]+)['"]/g;

/**
 * Recursively follow `export * from` / `export { } from` statements to
 * build the full set of files reachable from a barrel entry point.
 *
 * @param {string} filePath
 * @param {Set<string>} publicFiles
 * @param {ResolveContext} resolveContext
 */
function followReExports(filePath, publicFiles, resolveContext) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const { importsMap, packageDirectory } = resolveContext;

  for (const match of content.matchAll(RE_EXPORT_REGEX)) {
    const specifier = match.groups?.specifier;
    if (!specifier) {
      continue;
    }

    /** @type {string | undefined} */
    let resolved;
    if (specifier.startsWith('#')) {
      resolved = resolveHashImport(importsMap, specifier, packageDirectory);
    } else if (specifier.startsWith('.')) {
      resolved = resolveRelative(filePath, specifier);
    }

    if (resolved && !publicFiles.has(resolved)) {
      publicFiles.add(resolved);
      followReExports(resolved, publicFiles, resolveContext);
    }
  }
}

/**
 * Build (and cache) the set of absolute file paths that are publicly
 * reachable from the nearest package.json `exports`.
 *
 * @param {string} filename - Absolute path of the file being linted
 * @returns {Set<string>}
 */
function getPublicFiles(filename) {
  let directory = path.dirname(filename);
  /** @type {string | undefined} */
  let packageJsonPath;

  while (directory !== path.dirname(directory)) {
    const candidate = path.join(directory, 'package.json');
    if (fs.existsSync(candidate)) {
      try {
        const content = fs.readFileSync(candidate, 'utf8');
        /** @type {{ exports?: unknown; imports?: Record<string, string> }} */
        const parsed = JSON.parse(content);
        if (parsed.exports) {
          packageJsonPath = candidate;
          break;
        }
      } catch {
        // Skip malformed package.json
      }
    }
    directory = path.dirname(directory);
  }

  if (!packageJsonPath) {
    return new Set();
  }

  const cached = publicFilesCache.get(packageJsonPath);
  if (cached) {
    return cached;
  }

  const packageDirectory = path.dirname(packageJsonPath);
  const content = fs.readFileSync(packageJsonPath, 'utf8');
  /** @type {{ exports?: unknown; imports?: Record<string, string> }} */
  const packageJson = JSON.parse(content);

  /** @type {ResolveContext} */
  const resolveContext = {
    importsMap: packageJson.imports ?? {},
    packageDirectory,
  };

  const directFiles = flattenExports(packageJson.exports);
  /** @type {Set<string>} */
  const publicFiles = new Set();

  for (const relativePath of directFiles) {
    const absolutePath = path.resolve(packageDirectory, relativePath);
    publicFiles.add(absolutePath);
    followReExports(absolutePath, publicFiles, resolveContext);
  }

  publicFilesCache.set(packageJsonPath, publicFiles);
  return publicFiles;
}

// ─── Rule ───────────────────────────────────────────────────────────────────

/**
 * Find the JSDoc block comment immediately preceding a node.
 * Returns `undefined` if no JSDoc is adjacent (separated only by whitespace).
 *
 * @param {import('estree').Node} node
 * @param {import('eslint').Rule.RuleContext['sourceCode']} sourceCode
 * @param {import('estree').Comment[]} jsdocComments
 * @returns {import('estree').Comment | undefined}
 */
function findJsdocBefore(node, sourceCode, jsdocComments) {
  const nodeStart = /** @type {[number, number]} */ (node.range)[0];
  /** @type {import('estree').Comment | undefined} */
  let closest;

  for (const jsdoc of jsdocComments) {
    const jsdocEnd = /** @type {[number, number]} */ (jsdoc.range)[1];
    if (jsdocEnd >= nodeStart) {
      continue;
    }
    if (!closest || jsdocEnd > /** @type {[number, number]} */ (closest.range)[1]) {
      closest = jsdoc;
    }
  }

  if (!closest) {
    return undefined;
  }

  const closestEnd = /** @type {[number, number]} */ (closest.range)[1];
  const gap = sourceCode.getText().slice(closestEnd, nodeStart);
  const gapWithoutLineComments = gap.replaceAll(/\/\/[^\n]*/g, '');
  if (gapWithoutLineComments.trim().length > 0) {
    return undefined;
  }

  return closest;
}

/** @type {RuleModule} */
export const requirePublicExportJsdocRule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Requires @public JSDoc tag on symbols exported from package.json export entry paths',
    },
    messages: {
      missingPublicTag: 'Publicly exported symbol "{{name}}" must have a @public JSDoc tag',
    },
  },
  create(context) {
    const filePath = path.resolve(context.filename);
    const publicFiles = getPublicFiles(filePath);

    if (!publicFiles.has(filePath)) {
      return {};
    }

    /** @type {import('estree').Comment[]} */
    const jsdocComments = [];

    /**
     * @param {import('estree').Node} node
     * @param {string} name
     */
    function checkPublicTag(node, name) {
      const jsdoc = findJsdocBefore(node, context.sourceCode, jsdocComments);
      if (!jsdoc || !PUBLIC_TAG_REGEX.test(jsdoc.value)) {
        context.report({
          node,
          messageId: 'missingPublicTag',
          data: { name },
        });
      }
    }

    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          if (comment.type === 'Block' && comment.value.startsWith('*')) {
            jsdocComments.push(comment);
          }
        }
      },

      ExportNamedDeclaration(node) {
        if (node.source) {
          return;
        }

        const { declaration } = node;
        if (!declaration) {
          return;
        }

        switch (declaration.type) {
          case 'FunctionDeclaration': {
            if (declaration.id) {
              checkPublicTag(node, declaration.id.name);
            }
            break;
          }
          case 'ClassDeclaration': {
            if (declaration.id) {
              checkPublicTag(node, declaration.id.name);
            }
            break;
          }
          case 'VariableDeclaration': {
            for (const declarator of declaration.declarations) {
              if (declarator.id.type === 'Identifier') {
                checkPublicTag(node, declarator.id.name);
              }
            }
            break;
          }
          case 'TSTypeAliasDeclaration': {
            checkPublicTag(node, declaration.id.name);
            break;
          }
          case 'TSInterfaceDeclaration': {
            checkPublicTag(node, declaration.id.name);
            break;
          }
          case 'TSEnumDeclaration': {
            if (declaration.id) {
              checkPublicTag(node, declaration.id.name);
            }
            break;
          }
          default: {
            break;
          }
        }
      },

      ExportDefaultDeclaration(node) {
        checkPublicTag(node, 'default');
      },
    };
  },
};
