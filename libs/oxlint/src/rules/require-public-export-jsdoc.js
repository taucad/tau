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
 * @typedef {{ publicFiles: Map<string, Set<string>>; resolveContext: ResolveContext }} TraversalContext
 */

import fs from 'node:fs';
import path from 'node:path';

const PUBLIC_TAG_REGEX = /@public(?:\s|$|\*)/;

// ─── package.json resolution ────────────────────────────────────────────────

const ALL_EXPORTS = '*';
const ALL_TYPES = 'type:*';
const TYPE_ONLY_PREFIX = 'type:';

/** @param {string} name */
const asTypeOnly = (name) => {
  if (name === ALL_EXPORTS || name === ALL_TYPES) {
    return ALL_TYPES;
  }
  return name.startsWith(TYPE_ONLY_PREFIX) ? name : `${TYPE_ONLY_PREFIX}${name}`;
};

/** @type {Map<string, Map<string, Set<string>>>} */
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
    const resolved = target.slice(0, -1) + remainder;
    const absolute = path.resolve(packageDirectory, resolved);
    if (fs.existsSync(absolute)) {
      return absolute;
    }
    if (resolved.endsWith('.js')) {
      const typescriptSource = path.resolve(packageDirectory, `${resolved.slice(0, -3)}.ts`);
      if (fs.existsSync(typescriptSource)) {
        return typescriptSource;
      }
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
  const full = path.resolve(directory, specifier);
  if (fs.existsSync(full)) {
    return full;
  }
  if (specifier.endsWith('.js')) {
    const typescriptSource = path.resolve(directory, `${specifier.slice(0, -3)}.ts`);
    if (fs.existsSync(typescriptSource)) {
      return typescriptSource;
    }
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

const RE_EXPORT_REGEX =
  /export\s+(?<typeOnly>type\s+)?(?:(?<star>\*)(?:\s+as\s+(?<namespace>[\w$]+))?|{(?<names>[^}]*)})\s+from\s+["'](?<specifier>[^"']+)["']/g;

/**
 * @param {string} source
 * @param {boolean} statementTypeOnly
 * @returns {Array<{ imported: string; exported: string; typeOnly: boolean }>}
 */
function namedReExports(source, statementTypeOnly) {
  return source.split(',').flatMap((part) => {
    const trimmed = part.trim();
    const typeOnly = statementTypeOnly || trimmed.startsWith('type ');
    const declaration = trimmed.replace(/^type\s+/, '');
    if (!declaration) {
      return [];
    }
    const [imported, exported = imported] = declaration.split(/\s+as\s+/);
    return imported ? [{ imported, exported, typeOnly }] : [];
  });
}

/**
 * Recursively follow `export * from` / `export { } from` statements to
 * build the full set of files reachable from a barrel entry point.
 *
 * @param {string} filePath
 * @param {Set<string>} requestedNames
 * @param {TraversalContext} traversalContext
 */
function followReExports(filePath, requestedNames, traversalContext) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const { publicFiles, resolveContext } = traversalContext;
  const currentNames = publicFiles.get(filePath) ?? new Set();
  const newNames = new Set();
  if (requestedNames.has(ALL_EXPORTS)) {
    if (!currentNames.has(ALL_EXPORTS)) {
      currentNames.clear();
      currentNames.add(ALL_EXPORTS);
      newNames.add(ALL_EXPORTS);
    }
  } else if (!currentNames.has(ALL_EXPORTS)) {
    for (const name of requestedNames) {
      if (name.startsWith(TYPE_ONLY_PREFIX) && currentNames.has(ALL_TYPES)) {
        continue;
      }
      if (!currentNames.has(name)) {
        currentNames.add(name);
        newNames.add(name);
      }
    }
  }
  if (newNames.size === 0) {
    return;
  }
  publicFiles.set(filePath, currentNames);

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

    if (!resolved) {
      continue;
    }

    /** @type {Set<string>} */
    let targetNames;
    if (match.groups?.star) {
      const typeOnly = Boolean(match.groups.typeOnly);
      const { namespace } = match.groups;
      if (namespace) {
        const valueReachable = newNames.has(ALL_EXPORTS) || newNames.has(namespace);
        const typeReachable = newNames.has(ALL_TYPES) || newNames.has(asTypeOnly(namespace));
        targetNames = valueReachable
          ? new Set([typeOnly ? ALL_TYPES : ALL_EXPORTS])
          : new Set(typeReachable ? [ALL_TYPES] : []);
      } else {
        targetNames = new Set([...newNames].map((name) => (typeOnly ? asTypeOnly(name) : name)));
      }
    } else {
      const exports = namedReExports(match.groups?.names ?? '', Boolean(match.groups?.typeOnly));
      targetNames = new Set(
        exports
          .filter(
            ({ exported }) =>
              newNames.has(ALL_EXPORTS) ||
              newNames.has(ALL_TYPES) ||
              newNames.has(exported) ||
              newNames.has(asTypeOnly(exported)),
          )
          .map(({ imported, exported, typeOnly }) => {
            const valueReachable = newNames.has(ALL_EXPORTS) || newNames.has(exported);
            return typeOnly || !valueReachable ? asTypeOnly(imported) : imported;
          }),
      );
    }
    if (targetNames.size > 0) {
      followReExports(resolved, targetNames, traversalContext);
    }
  }
}

/**
 * Build (and cache) the set of absolute file paths that are publicly
 * reachable from the nearest package.json `exports`.
 *
 * @param {string} filename - Absolute path of the file being linted
 * @returns {Map<string, Set<string>>}
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
    return new Map();
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
  /** @type {Map<string, Set<string>>} */
  const publicFiles = new Map();
  const traversalContext = { publicFiles, resolveContext };

  for (const relativePath of directFiles) {
    const absolutePath = path.resolve(packageDirectory, relativePath);
    followReExports(absolutePath, new Set([ALL_EXPORTS]), traversalContext);
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
    const publicNames = getPublicFiles(filePath).get(filePath);

    if (!publicNames) {
      return {};
    }

    /** @type {import('estree').Comment[]} */
    const jsdocComments = [];

    /** @type {Map<string, Array<{ exported: string; typeOnly: boolean }>>} */
    const localExports = new Map();

    /**
     * @param {import('estree').Node} node
     * @param {string} name
     * @param {boolean} [typeDeclaration]
     */
    function checkPublicTag(node, name, typeDeclaration = false) {
      const typeReachable = typeDeclaration && (publicNames.has(ALL_TYPES) || publicNames.has(asTypeOnly(name)));
      if (!publicNames.has(ALL_EXPORTS) && !publicNames.has(name) && !typeReachable) {
        return;
      }
      const jsdoc = findJsdocBefore(node, context.sourceCode, jsdocComments);
      if (!jsdoc || !PUBLIC_TAG_REGEX.test(jsdoc.value)) {
        context.report({
          node,
          messageId: 'missingPublicTag',
          data: { name },
        });
      }
    }

    /**
     * @param {import('estree').Node} node
     * @param {string} localName
     * @param {boolean} [typeDeclaration]
     */
    function checkLocalExportTag(node, localName, typeDeclaration = false) {
      for (const localExport of localExports.get(localName) ?? []) {
        const { exported, typeOnly } = localExport;
        const typeReachable =
          (typeDeclaration || typeOnly) && (publicNames.has(ALL_TYPES) || publicNames.has(asTypeOnly(exported)));
        if (!publicNames.has(ALL_EXPORTS) && !publicNames.has(exported) && !typeReachable) {
          continue;
        }
        const jsdoc = findJsdocBefore(node, context.sourceCode, jsdocComments);
        if (!jsdoc || !PUBLIC_TAG_REGEX.test(jsdoc.value)) {
          context.report({ node, messageId: 'missingPublicTag', data: { name: localName } });
        }
        return;
      }
    }

    return {
      Program(node) {
        for (const comment of context.sourceCode.getAllComments()) {
          if (comment.type === 'Block' && comment.value.startsWith('*')) {
            jsdocComments.push(comment);
          }
        }

        for (const statement of node.body) {
          if (
            statement.type !== 'ExportNamedDeclaration' ||
            statement.source !== null ||
            statement.declaration !== null
          ) {
            continue;
          }
          for (const specifier of statement.specifiers) {
            if (specifier.type !== 'ExportSpecifier' || specifier.local.type !== 'Identifier') {
              continue;
            }
            const exported =
              specifier.exported.type === 'Identifier' ? specifier.exported.name : String(specifier.exported.value);
            const exports = localExports.get(specifier.local.name) ?? [];
            exports.push({
              exported,
              typeOnly: statement.exportKind === 'type' || specifier.exportKind === 'type',
            });
            localExports.set(specifier.local.name, exports);
          }
        }
      },

      FunctionDeclaration(node) {
        if (node.parent.type === 'Program' && node.id) {
          checkLocalExportTag(node, node.id.name);
        }
      },

      ClassDeclaration(node) {
        if (node.parent.type === 'Program' && node.id) {
          checkLocalExportTag(node, node.id.name, true);
        }
      },

      VariableDeclaration(node) {
        if (node.parent.type !== 'Program') {
          return;
        }
        for (const declarator of node.declarations) {
          if (declarator.id.type === 'Identifier') {
            checkLocalExportTag(node, declarator.id.name);
          }
        }
      },

      TSTypeAliasDeclaration(node) {
        if (node.parent.type === 'Program') {
          checkLocalExportTag(node, node.id.name, true);
        }
      },

      TSInterfaceDeclaration(node) {
        if (node.parent.type === 'Program') {
          checkLocalExportTag(node, node.id.name, true);
        }
      },

      TSEnumDeclaration(node) {
        if (node.parent.type === 'Program' && node.id) {
          checkLocalExportTag(node, node.id.name, true);
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
              checkPublicTag(node, declaration.id.name, true);
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
            checkPublicTag(node, declaration.id.name, true);
            break;
          }
          case 'TSInterfaceDeclaration': {
            checkPublicTag(node, declaration.id.name, true);
            break;
          }
          case 'TSEnumDeclaration': {
            if (declaration.id) {
              checkPublicTag(node, declaration.id.name, true);
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
