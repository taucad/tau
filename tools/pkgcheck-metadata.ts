import ts from 'typescript';

type PackageMetadata = {
  exports?: unknown;
  files?: unknown;
  publishConfig?: { exports?: unknown };
};

const recordKeys = (value: unknown): string[] =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? Object.keys(value).sort() : [];

export const packageMetadataIssues = (
  packageJson: PackageMetadata,
  pathExists: (path: string) => boolean,
): string[] => {
  const developmentExports = recordKeys(packageJson.exports);
  const publishExports = new Set(recordKeys(packageJson.publishConfig?.exports));
  const developmentExportSet = new Set(developmentExports);
  const issues = developmentExports
    .filter((specifier) => !publishExports.has(specifier))
    .map((specifier) => `publishConfig.exports is missing development export: ${specifier}`);

  for (const specifier of [...publishExports].filter((value) => !developmentExportSet.has(value)).sort()) {
    issues.push(`development exports is missing published export: ${specifier}`);
  }

  if (Array.isArray(packageJson.files)) {
    for (const path of packageJson.files) {
      if (typeof path !== 'string' || pathExists(path)) {
        continue;
      }
      issues.push(`files entry does not exist: ${path}`);
    }
  }

  return issues;
};

export const bundleOwnershipIssues = (roots: Array<{ owner: string; bundled: string[] }>): string[] => {
  const owners = new Map<string, string>();
  const issues: string[] = [];

  for (const { owner, bundled } of roots) {
    for (const packageName of bundled) {
      const previousOwner = owners.get(packageName);
      if (previousOwner) {
        issues.push(`${packageName} is bundled by both ${previousOwner} and ${owner}`);
      } else {
        owners.set(packageName, owner);
      }
    }
  }

  return issues.sort();
};

export const bundledArtifactIssues = (
  dependencies: Readonly<Record<string, string>>,
  files: ReadonlyArray<{ readonly path: string; readonly source: string }>,
  bundledPackages: readonly string[],
): string[] => {
  const issues = new Set<string>();
  for (const name of bundledPackages) {
    if (name in dependencies) {
      issues.add(`package.json: bundled package remains a production dependency: ${name}`);
    }
  }
  const inspect = (path: string, specifier: string): void => {
    if (bundledPackages.some((name) => specifier === name || specifier.startsWith(`${name}/`))) {
      issues.add(`${path}: bundled package specifier remains: ${specifier}`);
    }
  };

  for (const file of files) {
    const source = ts.createSourceFile(file.path, file.source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
    const visit = (node: ts.Node): void => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        inspect(file.path, node.moduleSpecifier.text);
      } else if (
        ts.isImportTypeNode(node) &&
        ts.isLiteralTypeNode(node.argument) &&
        ts.isStringLiteral(node.argument.literal)
      ) {
        inspect(file.path, node.argument.literal.text);
      } else if (ts.isModuleDeclaration(node) && ts.isStringLiteral(node.name)) {
        inspect(file.path, node.name.text);
      } else if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
        node.arguments.length === 1 &&
        node.arguments[0] !== undefined &&
        ts.isStringLiteralLike(node.arguments[0])
      ) {
        inspect(file.path, node.arguments[0].text);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  return [...issues].sort();
};

export const strictConsumerCompilerOptions = (moduleResolution: 'bundler' | 'nodenext'): Record<string, unknown> => ({
  lib: ['ES2022', 'DOM', 'DOM.Iterable'],
  module: moduleResolution === 'bundler' ? 'ESNext' : 'NodeNext',
  moduleResolution,
  noEmit: true,
  skipLibCheck: false,
  strict: true,
  target: 'ES2022',
  types: ['node'],
});
