// @vitest-environment node
/*
 * The scroll contract gate (page composition policy Rule 1; desktop resilient startup blueprint D4.3, T-A1.2).
 *
 * A page is a `document` by default: it grows and the shell scrolls it. A route that owns its scroll areas declares
 * `handle.scroll = 'contained'`, and only the reviewed routes below may. A fill layout (`PageContent layout='fill'`,
 * or an `h-full` page root) outside that list leaves the rest of the page below the window with nothing to scroll it,
 * which is how the Files page clipped its workspace list. This file reads every route module the flat-routes table can
 * serve, the way the other `*.policy.node.test.ts` gates read source, and fails on:
 *
 * - a handle key that `Handle` (`types/matches.types.ts`) does not declare, so a retired flag cannot come back;
 * - a `contained` route that is not reviewed, or a reviewed route that is no longer `contained`;
 * - `PageContent layout='fill'` or an `h-full` page root on a route that is not reviewed `contained`.
 *
 * Adding a route to `reviewedContainedRoutes` is a reviewed change to the policy rule, not a way to quiet the gate.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import ts from 'typescript';
import { afterAll, describe, expect, it } from 'vitest';

/** The reviewed `contained` list (policy Rule 1): the workbench and its preview, by route id. */
const reviewedContainedRoutes: readonly string[] = ['w.$workspace.$project', 'w.$workspace.$project_.preview'];

type RouteModule = {
  /** The flat-routes id: the directory name, or the file name without its extension. */
  readonly id: string;
  /** The route module flatRoutes loads. */
  readonly file: string;
  /** The route's directory, when the route is a folder; every source in it renders for that route. */
  readonly directory: string | undefined;
};

type ScrollPolicyInput = {
  /** The app root: holds `routes/` and `types/matches.types.ts`. */
  readonly appRoot: string;
  readonly reviewedContained: readonly string[];
};

const isSource = (name: string): boolean =>
  /\.tsx?$/u.test(name) && !/\.(?:test|spec)\.tsx?$/u.test(name) && !name.endsWith('.d.ts');

/** Every module flatRoutes turns into a route: `<id>/route.tsx` folders and flat `<id>.tsx` files (`routes.ts`). */
function listRouteModules(routesRoot: string): RouteModule[] {
  const modules: RouteModule[] = [];
  for (const entry of readdirSync(routesRoot, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const directory = join(routesRoot, entry.name);
      const file = ['route.tsx', 'route.ts'].map((name) => join(directory, name)).find((path) => existsSync(path));
      if (file) {
        modules.push({ id: entry.name, file, directory });
      }
    } else if (isSource(entry.name)) {
      modules.push({
        id: entry.name.replace(/\.tsx?$/u, ''),
        file: join(routesRoot, entry.name),
        directory: undefined,
      });
    }
  }
  return modules.sort((left, right) => left.id.localeCompare(right.id));
}

function listSources(directory: string): string[] {
  const sources: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      sources.push(...listSources(path));
    } else if (isSource(entry)) {
      sources.push(path);
    }
  }
  return sources;
}

const sourceFiles = new Map<string, ts.SourceFile>();
function parse(file: string): ts.SourceFile {
  let source = sourceFiles.get(file);
  if (!source) {
    source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    sourceFiles.set(file, source);
  }
  return source;
}

/** Resolves `#…` (the app alias, `package.json` imports) and relative specifiers to a source file, else undefined. */
function resolveSpecifier(appRoot: string, fromFile: string, specifier: string): string | undefined {
  let base: string;
  if (specifier.startsWith('#')) {
    base = join(appRoot, specifier.slice(1));
  } else if (specifier.startsWith('.')) {
    base = join(dirname(fromFile), specifier);
  } else {
    return undefined;
  }
  const stem = base.replace(/\.js$/u, '');
  return [`${stem}.ts`, `${stem}.tsx`, base].find((path) => existsSync(path) && statSync(path).isFile());
}

const unwrapExpression = (expression: ts.Expression): ts.Expression => {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression;
  }
  return current;
};

const where = (appRoot: string, node: ts.Node): string => {
  const source = node.getSourceFile();
  const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
  return `${relative(appRoot, source.fileName)}:${String(line + 1)}:${String(character + 1)}`;
};

type HandleKey = { readonly value: ts.Expression | undefined; readonly node: ts.Node };
type ReadHandle = { readonly keys: Map<string, HandleKey>; readonly problems: string[] };

type Binding =
  | { readonly object: ts.ObjectLiteralExpression }
  | { readonly file: string; readonly name: string }
  | undefined;

/** A module-level `const name = { … }`, or undefined when `statement` does not declare `name` that way. */
function localObject(statement: ts.Statement, name: string): Binding | false {
  if (!ts.isVariableStatement(statement)) {
    return false;
  }
  const declaration = statement.declarationList.declarations.find(
    (candidate) => ts.isIdentifier(candidate.name) && candidate.name.text === name,
  );
  if (!declaration?.initializer) {
    return false;
  }
  const initializer = unwrapExpression(declaration.initializer);
  return ts.isObjectLiteralExpression(initializer) ? { object: initializer } : undefined;
}

/** Where an `import { name }` or `export { name } from` statement takes `name` from, if it names it. */
function linkedBinding(
  { appRoot, file, name }: { readonly appRoot: string; readonly file: string; readonly name: string },
  statement: ts.Statement,
): Binding | false {
  let elements: ReadonlyArray<ts.ImportSpecifier | ts.ExportSpecifier> = [];
  let specifier: ts.Expression | undefined;
  if (ts.isImportDeclaration(statement)) {
    const bindings = statement.importClause?.namedBindings;
    elements = bindings && ts.isNamedImports(bindings) ? bindings.elements : [];
    specifier = statement.moduleSpecifier;
  } else if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
    elements = statement.exportClause.elements;
    specifier = statement.moduleSpecifier;
  }
  const element = elements.find((candidate) => candidate.name.text === name);
  const target =
    element && specifier && ts.isStringLiteral(specifier) ? resolveSpecifier(appRoot, file, specifier.text) : undefined;
  return element && target ? { file: target, name: (element.propertyName ?? element.name).text } : false;
}

/** Finds what `name` is bound to at module level in `file`: a local object literal, or an import to follow. */
function findBinding(appRoot: string, file: string, name: string): Binding {
  for (const statement of parse(file).statements) {
    const local = localObject(statement, name);
    const binding = local === false ? linkedBinding({ appRoot, file, name }, statement) : local;
    if (binding !== false) {
      return binding;
    }
  }
  return undefined;
}

type ObjectQuery = { readonly appRoot: string; readonly file: string; readonly name: string; readonly depth: number };

const propertyKey = (property: ts.ObjectLiteralElementLike): string | undefined => {
  const { name } = property;
  return name && (ts.isIdentifier(name) || ts.isStringLiteral(name)) ? name.text : undefined;
};

/** Reads the keys of the object bound to `name` in `file`, following spreads and imports. Undefined when unbound. */
function readObject(query: ObjectQuery): ReadHandle | undefined {
  const { appRoot, file, name, depth } = query;
  const binding = findBinding(appRoot, file, name);
  if (!binding) {
    return undefined;
  }
  if ('file' in binding) {
    return depth > 8
      ? { keys: new Map(), problems: [`${file}: ${name} re-exports too deeply`] }
      : readObject({ appRoot, file: binding.file, name: binding.name, depth: depth + 1 });
  }
  const keys = new Map<string, HandleKey>();
  const problems: string[] = [];
  for (const property of binding.object.properties) {
    if (ts.isSpreadAssignment(property)) {
      const spread = unwrapExpression(property.expression);
      const read = ts.isIdentifier(spread)
        ? readObject({ appRoot, file, name: spread.text, depth: depth + 1 })
        : undefined;
      for (const [key, value] of read?.keys ?? []) {
        keys.set(key, value);
      }
      problems.push(
        ...(read?.problems ?? [
          `${where(appRoot, property)}: the handle spreads a value this gate cannot read; spread a module-level object literal`,
        ]),
      );
      continue;
    }
    const key = propertyKey(property);
    if (key === undefined) {
      problems.push(`${where(appRoot, property)}: the handle has a computed key this gate cannot read`);
      continue;
    }
    keys.set(key, { value: ts.isPropertyAssignment(property) ? property.initializer : undefined, node: property });
  }
  return { keys, problems };
}

/** The keys `Handle` declares in `types/matches.types.ts`. */
function readHandleTypeKeys(appRoot: string): Map<string, ts.TypeNode | undefined> {
  const source = parse(join(appRoot, 'types/matches.types.ts'));
  for (const statement of source.statements) {
    if (
      ts.isTypeAliasDeclaration(statement) &&
      statement.name.text === 'Handle' &&
      ts.isTypeLiteralNode(statement.type)
    ) {
      return new Map(
        statement.type.members
          .filter((member): member is ts.PropertySignature => ts.isPropertySignature(member))
          .map((member) => [member.name.getText(source), member.type]),
      );
    }
  }
  throw new Error('types/matches.types.ts declares no `Handle` object type');
}

/** The string literals a `className` (or any attribute) value can produce: literals, `cn(…)` arguments, templates. */
function attributeStrings(initializer: ts.JsxAttributeValue | undefined): string[] {
  if (!initializer) {
    return [];
  }
  const strings: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      strings.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(initializer);
  return strings;
}

const attribute = (element: ts.JsxOpeningLikeElement, name: string): ts.JsxAttribute | undefined =>
  element.attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && ts.isIdentifier(property.name) && property.name.text === name,
  );

/** True when the element's class list sets `h-full` at any breakpoint (`h-full`, `md:h-full`, `!h-full`). */
const hasFullHeight = (element: ts.JsxOpeningLikeElement): boolean =>
  attributeStrings(attribute(element, 'className')?.initializer)
    .flatMap((value) => value.split(/\s+/u))
    .some((token) => token.split(':').at(-1)?.replace(/^!/u, '') === 'h-full');

const tagName = (element: ts.JsxOpeningLikeElement): string => element.tagName.getText();

const hasModifier = (node: ts.Node, kind: ts.SyntaxKind): boolean =>
  ts.canHaveModifiers(node) && (ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) ?? false);

const isFunctionValue = (node: ts.Node | undefined): node is ts.ArrowFunction | ts.FunctionExpression =>
  node !== undefined && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));

/** The module-level function or function-valued `const` called `name`. */
function functionNamed(source: ts.SourceFile, name: string): ts.FunctionLikeDeclaration | undefined {
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) {
      return statement;
    }
    const declaration = ts.isVariableStatement(statement)
      ? statement.declarationList.declarations.find(
          (candidate) => ts.isIdentifier(candidate.name) && candidate.name.text === name,
        )
      : undefined;
    const initializer = declaration?.initializer ? unwrapExpression(declaration.initializer) : undefined;
    if (isFunctionValue(initializer)) {
      return initializer;
    }
  }
  return undefined;
}

/** The function the route module exports as its default component, if it is declared in that module. */
function defaultComponent(source: ts.SourceFile): ts.FunctionLikeDeclaration | undefined {
  const declared = source.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) &&
      hasModifier(statement, ts.SyntaxKind.ExportKeyword) &&
      hasModifier(statement, ts.SyntaxKind.DefaultKeyword),
  );
  if (declared) {
    return declared;
  }
  const assignment = source.statements.find(
    (statement): statement is ts.ExportAssignment => ts.isExportAssignment(statement) && !statement.isExportEquals,
  );
  const expression = assignment ? unwrapExpression(assignment.expression) : undefined;
  if (isFunctionValue(expression)) {
    return expression;
  }
  return expression && ts.isIdentifier(expression) ? functionNamed(source, expression.text) : undefined;
}

/** The expressions a component returns, not counting functions nested inside it. */
function returnedExpressions(component: ts.FunctionLikeDeclaration): ts.Node[] {
  const { body } = component;
  if (!body) {
    return [];
  }
  if (!ts.isBlock(body)) {
    return [body];
  }
  const returned: ts.Node[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionLike(node)) {
      return;
    }
    if (ts.isReturnStatement(node) && node.expression) {
      returned.push(node.expression);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  return returned;
}

/** The outermost JSX elements a component can return: through parentheses, conditionals, `&&` and fragments. */
function pageRoots(component: ts.FunctionLikeDeclaration): ts.JsxOpeningLikeElement[] {
  const roots: ts.JsxOpeningLikeElement[] = [];
  const collect = (node: ts.Node | undefined): void => {
    if (node === undefined) {
      return;
    }
    if (ts.isParenthesizedExpression(node) || ts.isJsxExpression(node)) {
      collect(node.expression);
    } else if (ts.isConditionalExpression(node)) {
      collect(node.whenTrue);
      collect(node.whenFalse);
    } else if (ts.isBinaryExpression(node)) {
      collect(node.right);
      collect(node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ? undefined : node.left);
    } else if (ts.isJsxFragment(node)) {
      for (const child of node.children) {
        collect(child);
      }
    } else if (ts.isJsxElement(node)) {
      roots.push(node.openingElement);
    } else if (ts.isJsxSelfClosingElement(node)) {
      roots.push(node);
    }
  };
  for (const expression of returnedExpressions(component)) {
    collect(expression);
  }
  return roots;
}

/** Every `PageContent` in `file`: the page root by definition, wherever the route renders it from. */
function pageContents(file: string): ts.JsxOpeningLikeElement[] {
  const found: ts.JsxOpeningLikeElement[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && tagName(node) === 'PageContent') {
      found.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(parse(file));
  return found;
}

type ScrollPolicyReport = {
  /** Route ids whose handle declares `scroll: 'contained'`. */
  readonly contained: readonly string[];
  readonly violations: readonly string[];
};

type HandleReading = { readonly contained: boolean; readonly violations: string[] };

/** Checks one route's handle keys against `Handle` and reads its scroll mode. */
function readRouteHandle(
  appRoot: string,
  route: RouteModule,
  handleTypeKeys: ReadonlyMap<string, unknown>,
): HandleReading {
  const handle = readObject({ appRoot, file: route.file, name: 'handle', depth: 0 });
  const violations = (handle?.problems ?? []).map((problem) => `${route.id}: ${problem}`);
  let contained = false;
  for (const [key, { node, value }] of handle?.keys ?? []) {
    if (!handleTypeKeys.has(key)) {
      violations.push(`${route.id}: ${where(appRoot, node)}: handle key \`${key}\` is not declared on Handle`);
    }
    if (key !== 'scroll') {
      continue;
    }
    const mode = value ? unwrapExpression(value) : undefined;
    if (mode && ts.isStringLiteral(mode) && ['document', 'contained'].includes(mode.text)) {
      contained = mode.text === 'contained';
    } else {
      violations.push(`${route.id}: ${where(appRoot, node)}: \`scroll\` must be the literal 'document' or 'contained'`);
    }
  }
  return { contained, violations };
}

/** A fill layout or an `h-full` page root anywhere the route renders its page from. */
function fillLayoutViolations(appRoot: string, route: RouteModule): string[] {
  const violations: string[] = [];
  const sources = route.directory ? listSources(route.directory) : [route.file];
  for (const element of sources.flatMap((file) => pageContents(file))) {
    if (attributeStrings(attribute(element, 'layout')?.initializer).includes('fill')) {
      violations.push(
        `${route.id}: ${where(appRoot, element)}: PageContent layout='fill' on a document route (not reviewed contained)`,
      );
    }
    if (hasFullHeight(element)) {
      violations.push(`${route.id}: ${where(appRoot, element)}: PageContent with h-full on a document route`);
    }
  }
  const component = defaultComponent(parse(route.file));
  for (const root of component ? pageRoots(component) : []) {
    if (hasFullHeight(root)) {
      violations.push(
        `${route.id}: ${where(appRoot, root)}: page root <${tagName(root)}> uses h-full on a document route`,
      );
    }
  }
  return violations;
}

/** Reads every route under `appRoot/routes` against the scroll contract. */
function checkScrollPolicy({ appRoot, reviewedContained }: ScrollPolicyInput): ScrollPolicyReport {
  const handleTypeKeys = readHandleTypeKeys(appRoot);
  const violations: string[] = [];
  const contained: string[] = [];

  for (const route of listRouteModules(join(appRoot, 'routes'))) {
    const handle = readRouteHandle(appRoot, route, handleTypeKeys);
    violations.push(...handle.violations);
    const isReviewed = reviewedContained.includes(route.id);
    if (handle.contained) {
      contained.push(route.id);
      if (!isReviewed) {
        violations.push(`${route.id}: declares scroll: 'contained' but is not on the reviewed contained list`);
      }
    }
    if (!(handle.contained && isReviewed)) {
      violations.push(...fillLayoutViolations(appRoot, route));
    }
  }

  for (const reviewed of reviewedContained) {
    if (!contained.includes(reviewed)) {
      violations.push(
        `${reviewed}: on the reviewed contained list but its handle does not declare scroll: 'contained'`,
      );
    }
  }
  return { contained, violations };
}

describe('route scroll contract', () => {
  const appRoot = import.meta.dirname;

  it('should declare Handle.scroll as the document default or the contained opt-out', () => {
    const scroll = readHandleTypeKeys(appRoot).get('scroll');
    expect(scroll?.getText().replaceAll(/\s+/gu, ' ')).toBe(`'document' | 'contained'`);
  });

  it('should find the route modules the flat-routes table serves', () => {
    const ids = listRouteModules(join(appRoot, 'routes')).map((route) => route.id);
    expect(ids).toEqual(
      expect.arrayContaining(['_index', 'files', 'projects_.new', 'auth.$', ...reviewedContainedRoutes]),
    );
  });

  it('should keep every route a document page unless it is reviewed contained', () => {
    const report = checkScrollPolicy({ appRoot, reviewedContained: reviewedContainedRoutes });
    expect(report.violations, report.violations.join('\n')).toEqual([]);
    expect(report.contained).toEqual([...reviewedContainedRoutes].sort((left, right) => left.localeCompare(right)));
  });

  describe('against a non-compliant fixture app', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'tau-route-scroll-'));
    const write = (path: string, content: string): void => {
      mkdirSync(dirname(join(fixtureRoot, path)), { recursive: true });
      writeFileSync(join(fixtureRoot, path), content);
    };
    write(
      'types/matches.types.ts',
      `export type Handle = {\n  title?: string;\n  scroll?: 'document' | 'contained';\n};\n`,
    );
    write(
      'routes/workbench/route.tsx',
      `export const handle = { scroll: 'contained' };\nexport default function Workbench() {\n  return <PageContent layout='fill' className='h-full' />;\n}\n`,
    );
    // A new route with a fill layout and no reviewed `contained` entry.
    write(
      'routes/new-fill/route.tsx',
      `export const handle = { title: 'New' };\nexport default function NewFill() {\n  return <PageContent layout='fill'>x</PageContent>;\n}\n`,
    );
    // The same route's layout, when a sibling component renders the PageContent.
    write(
      'routes/new-fill/layout.tsx',
      `export const Layout = () => <PageContent className={cn('flex', 'md:h-full')} />;\n`,
    );
    write(
      'routes/new-root/route.tsx',
      `export default function NewRoot() {\n  return (\n    <>\n      <div className='flex h-full flex-col'>x</div>\n    </>\n  );\n}\n`,
    );
    write(
      'routes/new-contained/route.tsx',
      `export const handle = { scroll: 'contained' };\nexport default function NewContained() {\n  return <div className='h-full' />;\n}\n`,
    );
    write('routes/shared-handle.ts', `export const sharedHandle = { retiredFlag: true };\n`);
    write(
      'routes/retired-flag/route.tsx',
      `import { sharedHandle } from '../shared-handle.js';\nexport const handle = { ...sharedHandle };\nexport default function Retired() {\n  return <PageContent className='space-y-6' />;\n}\n`,
    );
    write(
      'routes/document/route.tsx',
      `export const handle = { title: 'Fine' };\nexport default function Document() {\n  return <PageContent className='flex min-h-full flex-col'>x</PageContent>;\n}\n`,
    );

    afterAll(() => {
      rmSync(fixtureRoot, { recursive: true, force: true });
    });

    const reviewedFixture = ['workbench'];
    const report = checkScrollPolicy({ appRoot: fixtureRoot, reviewedContained: reviewedFixture });
    const violationsOf = (id: string): string[] =>
      report.violations.filter((violation) => violation.startsWith(`${id}:`));

    it('should fail a route added with a fill layout and no reviewed contained entry', () => {
      expect(violationsOf('new-fill')).toEqual([
        expect.stringContaining('routes/new-fill/layout.tsx:1:29: PageContent with h-full'),
        expect.stringContaining("routes/new-fill/route.tsx:3:10: PageContent layout='fill'"),
      ]);
    });

    it('should pass the same route once it is a reviewed contained route', () => {
      write(
        'routes/new-fill-reviewed/route.tsx',
        `export const handle = { scroll: 'contained' };\nexport default function R() {\n  return <PageContent layout='fill' />;\n}\n`,
      );
      const reviewed = checkScrollPolicy({
        appRoot: fixtureRoot,
        reviewedContained: [...reviewedFixture, 'new-fill-reviewed'],
      });
      expect(reviewed.violations.filter((violation) => violation.startsWith('new-fill-reviewed:'))).toEqual([]);
      rmSync(join(fixtureRoot, 'routes/new-fill-reviewed'), { recursive: true });
    });

    it('should fail an h-full page root, through a fragment', () => {
      expect(violationsOf('new-root')).toEqual([expect.stringContaining('page root <div> uses h-full')]);
    });

    it('should fail a contained route that is not reviewed', () => {
      expect(violationsOf('new-contained')).toEqual([
        expect.stringContaining('not on the reviewed contained list'),
        expect.stringContaining('page root <div> uses h-full'),
      ]);
    });

    it('should fail a handle key Handle does not declare, through a spread import', () => {
      expect(violationsOf('retired-flag')).toEqual([
        expect.stringContaining('handle key `retiredFlag` is not declared'),
      ]);
    });

    it('should pass the reviewed workbench and a document page', () => {
      expect(violationsOf('workbench')).toEqual([]);
      expect(violationsOf('document')).toEqual([]);
      expect(report.contained).toEqual(['new-contained', 'workbench']);
    });

    it('should fail a reviewed entry whose route is no longer contained', () => {
      const stale = checkScrollPolicy({ appRoot: fixtureRoot, reviewedContained: [...reviewedFixture, 'document'] });
      expect(stale.violations).toContain(
        "document: on the reviewed contained list but its handle does not declare scroll: 'contained'",
      );
    });
  });
});
