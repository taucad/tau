/* oxlint-disable no-bitwise -- The TypeScript compiler API models type, symbol and object state as bit flags. */

/**
 * Self-contained editor declarations for tscircuit TSX.
 *
 * `@tscircuit/core` and `@tscircuit/props` ship ~20 MB of declarations, most of
 * them Zod schema types, so they cannot be mounted into the browser's
 * TypeScript service as they are. This front-end asks the checker for the type
 * each JSX intrinsic element (`<board>`, `<resistor>`, …) resolves to and prints
 * it structurally: every Zod-derived props type becomes a plain object type,
 * named types are emitted once and referenced by name, and only React's own
 * types stay references into the mounted `react` declarations.
 *
 * The output is three package-shaped bundles: `@tscircuit/props` (every printed
 * props type), `@tscircuit/core` (its value exports plus the JSX
 * `IntrinsicElements` augmentation) and `tscircuit` (a re-export of the core).
 * React's declarations and a slim `csstype` complete the JSX surface.
 *
 * @module
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';

import type { BundledTypesPackageMap } from '#bundled-types.types.js';

/** Inputs of {@link buildTscircuitTypes}. @internal */
export type TscircuitDeclarationsConfig = Readonly<{
  /** Absolute `@tscircuit/core/dist/index.d.ts`. */
  coreDeclarations: string;
  /** Absolute `@types/react` package directory. */
  reactTypesDirectory: string;
  /** Installed `@tscircuit/core` version, recorded in its manifest. */
  coreVersion: string;
  /** Installed `@tscircuit/props` version, recorded in its manifest. */
  propsVersion: string;
}>;

/** A string-literal union longer than this (KiCad footprint paths) is printed as an open string. */
const maxLiteralUnionMembers = 400;

/** An anonymous shape printed longer than this is hoisted into a shared alias. */
const hoistThreshold = 240;

const pascalCase = (name: string): string =>
  name
    .split(/[^\dA-Za-z]+/u)
    .filter((part) => part !== '')
    .map((part) => `${part[0]!.toUpperCase()}${part.slice(1)}`)
    .join('') || 'Shape';

/** The React declarations the JSX runtime needs; the rest of `@types/react` is not authoring surface. */
const reactFiles = ['index.d.ts', 'global.d.ts', 'jsx-runtime.d.ts', 'jsx-dev-runtime.d.ts'] as const;

/**
 * `@types/react` imports `csstype` only for `CSSProperties`. tscircuit elements take no
 * CSS, so an open property bag stands in for csstype's ~1 MB of declarations.
 */
const csstypeDeclarations = [
  '// Slim stand-in for csstype: React reads only `Properties`, and tscircuit elements take no CSS.',
  'export interface Properties<TLength = (string & {}) | 0, TTime = string & {}> {',
  '  [property: string]: unknown;',
  '}',
  '',
].join('\n');

const identifierPattern = /^[$A-Z_a-z][\w$]*$/u;

const propertyKey = (name: string): string => (identifierPattern.test(name) ? name : JSON.stringify(name));

const isFromReact = (declaration: ts.Declaration): boolean =>
  /\/@types\/react\/[^/]+\.d\.ts$/u.test(declaration.getSourceFile().fileName.replaceAll('\\', '/'));

const isFromStandardLibrary = (declaration: ts.Declaration, program: ts.Program): boolean =>
  program.isSourceFileDefaultLibrary(declaration.getSourceFile());

/** One JSDoc block, or nothing when the symbol is undocumented. */
const documentationComment = (symbol: ts.Symbol, checker: ts.TypeChecker, indent: string): string => {
  const text = ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim();
  const tags = symbol
    .getJsDocTags(checker)
    .filter((tag) => tag.name === 'deprecated' || tag.name === 'default' || tag.name === 'example')
    .map((tag) => `@${tag.name}${tag.text === undefined ? '' : ` ${ts.displayPartsToString(tag.text)}`}`);
  const lines = [...(text === '' ? [] : text.split('\n')), ...tags].map((line) =>
    line.replaceAll('*/', String.raw`*\/`),
  );
  if (lines.length === 0) {
    return '';
  }
  return `${indent}/**\n${lines.map((line) => `${indent} * ${line}`.trimEnd()).join('\n')}\n${indent} */\n`;
};

/** Prints checker types as self-contained declaration text. */
class StructuralPrinter {
  public readonly declarations: string[] = [];
  private readonly names = new Map<ts.Type, string>();
  private readonly usedNames = new Set<string>();
  private readonly hoisted = new Map<string, string>();
  private readonly flatText = new Map<ts.Type, string>();
  private readonly computing = new Set<ts.Type>();
  // oxlint-disable typescript/parameter-properties -- erasableSyntaxOnly rejects constructor parameter properties.
  private readonly checker: ts.TypeChecker;
  private readonly program: ts.Program;
  // oxlint-enable typescript/parameter-properties

  public constructor(program: ts.Program) {
    this.program = program;
    this.checker = program.getTypeChecker();
  }

  /**
   * Name a type and emit its declaration once.
   *
   * @param type - The type to name.
   * @param preferred - The name to use when it is free.
   * @returns The emitted alias name.
   */
  public named(type: ts.Type, preferred: string): string {
    const existing = this.names.get(type);
    if (existing !== undefined) {
      return existing;
    }
    const name = this.freeName(preferred);
    this.names.set(type, name);
    const docs = type.aliasSymbol === undefined ? '' : documentationComment(type.aliasSymbol, this.checker, '');
    this.declarations.push(`${docs}export type ${name} = ${this.expand(type, 0)};`);
    return name;
  }

  /**
   * Print a type at a nesting depth, hoisting large anonymous shapes into named aliases.
   *
   * Zod-derived props repeat the same shapes (`cadModel`, `pcbSx`, circuit JSON elements) in
   * every element, each a distinct checker type, so shapes are shared by their printed text.
   *
   * @param type - The type to print.
   * @param depth - Indentation depth of the position the text lands in.
   * @param hint - Name stem for a hoisted alias, usually the property that holds the type.
   * @returns Declaration text for the type.
   */
  public print(type: ts.Type, depth: number, hint = 'Shape'): string {
    const reference = this.reference(type, depth);
    if (reference !== undefined) {
      return reference;
    }
    let flat = this.flatText.get(type);
    if (flat === undefined) {
      if (this.computing.has(type)) {
        // A recursive anonymous shape (`z.lazy`) is not authoring surface.
        return 'any';
      }
      this.computing.add(type);
      try {
        flat = this.expand(type, 0);
      } finally {
        this.computing.delete(type);
      }
      this.flatText.set(type, flat);
    }
    if (flat.length < hoistThreshold) {
      return depth === 0 ? flat : flat.replaceAll('\n', `\n${'  '.repeat(depth)}`);
    }
    let name = this.hoisted.get(flat);
    if (name === undefined) {
      name = this.freeName(hint);
      this.hoisted.set(flat, name);
      this.declarations.push(`export type ${name} = ${flat};`);
    }
    return name;
  }

  private freeName(preferred: string): string {
    let name = preferred;
    for (let suffix = 2; this.usedNames.has(name); suffix += 1) {
      name = `${preferred}${String(suffix)}`;
    }
    this.usedNames.add(name);
    return name;
  }

  /** The name of a type that has one; React and standard-library types keep their own. */
  private reference(type: ts.Type, depth: number): string | undefined {
    const existing = this.names.get(type);
    if (existing !== undefined) {
      return existing;
    }
    const symbol = type.aliasSymbol ?? type.getSymbol();
    const declaration = symbol?.declarations?.[0];
    if (symbol === undefined || declaration === undefined) {
      return undefined;
    }
    if (isFromReact(declaration)) {
      // An anonymous React shape (a `JSXElementConstructor` member) has no name to reference.
      return symbol.name.startsWith('__') ? 'any' : this.qualified('React.', type, depth);
    }
    if (
      isFromStandardLibrary(declaration, this.program) &&
      (type.flags & ts.TypeFlags.Object) !== 0 &&
      (symbol.flags & (ts.SymbolFlags.Interface | ts.SymbolFlags.Class | ts.SymbolFlags.TypeAlias)) !== 0
    ) {
      return this.qualified('', type, depth);
    }
    if (symbol.name.startsWith('__') || symbol.name === 'default') {
      return undefined;
    }
    if (type.aliasSymbol === undefined && (symbol.flags & (ts.SymbolFlags.Interface | ts.SymbolFlags.Class)) === 0) {
      return undefined;
    }
    if (this.typeArguments(type).length > 0 || this.isLiteralish(type)) {
      return undefined;
    }
    return this.named(type, symbol.name.replaceAll(/\W/gu, '_'));
  }

  /** A React or standard-library type by its own name, `React.`-qualified for React's. */
  private qualified(prefix: string, type: ts.Type, depth: number): string {
    const symbol = (type.aliasSymbol ?? type.getSymbol())!;
    const parts: string[] = [];
    // `Symbol.parent` is internal; it is how a namespace member (`React.JSX.Element`) finds its scope.
    type WithParent = { parent?: ts.Symbol };
    let { parent } = symbol as WithParent;
    while (parent !== undefined) {
      if (parent.flags & (ts.SymbolFlags.Namespace | ts.SymbolFlags.NamespaceModule) && !parent.name.startsWith('"')) {
        parts.unshift(parent.name);
      }
      ({ parent } = parent as WithParent);
    }
    const scope = parts.filter((part) => part !== 'React' && part !== 'global').join('.');
    const name = `${prefix}${scope === '' ? '' : `${scope}.`}${symbol.name}`;
    const typeArguments = this.typeArguments(type);
    return typeArguments.length === 0
      ? name
      : `${name}<${typeArguments.map((argument) => this.print(argument, depth + 1)).join(', ')}>`;
  }

  private typeArguments(type: ts.Type): readonly ts.Type[] {
    if (type.aliasSymbol !== undefined) {
      return type.aliasTypeArguments ?? [];
    }
    if (
      (type.flags & ts.TypeFlags.Object) !== 0 &&
      ((type as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference) !== 0
    ) {
      return this.checker.getTypeArguments(type as ts.TypeReference);
    }
    return [];
  }

  private isLiteralish(type: ts.Type): boolean {
    return (
      (type.flags & (ts.TypeFlags.Literal | ts.TypeFlags.BooleanLiteral | ts.TypeFlags.EnumLiteral)) !== 0 ||
      (type.isUnion() && type.types.every((member) => this.isLiteralish(member)) && type.types.length < 4)
    );
  }

  private expand(type: ts.Type, depth: number): string {
    const { checker } = this;
    const { flags } = type;
    if (flags & ts.TypeFlags.Any || flags & ts.TypeFlags.TypeParameter || flags & ts.TypeFlags.Index) {
      return 'any';
    }
    if (flags & ts.TypeFlags.Unknown) {
      return 'unknown';
    }
    if (flags & ts.TypeFlags.Never) {
      return 'never';
    }
    if (flags & (ts.TypeFlags.StringLiteral | ts.TypeFlags.NumberLiteral | ts.TypeFlags.BigIntLiteral)) {
      return checker.typeToString(type);
    }
    if (flags & ts.TypeFlags.BooleanLiteral) {
      return checker.typeToString(type);
    }
    if (flags & ts.TypeFlags.EnumLiteral && !type.isUnion()) {
      const { value } = type as ts.LiteralType;
      if (typeof value === 'object') {
        return `${value.negative ? '-' : ''}${value.base10Value}n`;
      }
      return typeof value === 'string' ? JSON.stringify(value) : String(value);
    }
    if (flags & ts.TypeFlags.TemplateLiteral || flags & ts.TypeFlags.StringMapping) {
      return checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation);
    }
    if (
      flags &
      (ts.TypeFlags.String |
        ts.TypeFlags.Number |
        ts.TypeFlags.Boolean |
        ts.TypeFlags.BigInt |
        ts.TypeFlags.ESSymbol |
        ts.TypeFlags.Void |
        ts.TypeFlags.Undefined |
        ts.TypeFlags.Null |
        ts.TypeFlags.NonPrimitive)
    ) {
      return checker.typeToString(type);
    }
    if (flags & ts.TypeFlags.UniqueESSymbol) {
      return 'symbol';
    }
    if (type.isUnion()) {
      return this.union(type, depth);
    }
    if (type.isIntersection()) {
      return type.types.map((member) => this.wrap(this.print(member, depth + 1))).join(' & ');
    }
    if (flags & ts.TypeFlags.Object) {
      return this.object(type as ts.ObjectType, depth);
    }
    return 'any';
  }

  private union(type: ts.UnionType, depth: number, skip?: (member: ts.Type) => boolean): string {
    const members = skip === undefined ? type.types : type.types.filter((member) => !skip(member));
    const literals = members.filter((member) => member.flags & ts.TypeFlags.StringLiteral);
    if (literals.length > maxLiteralUnionMembers) {
      const rest = members.filter((member) => !(member.flags & ts.TypeFlags.StringLiteral));
      return ['(string & {})', ...rest.map((member) => this.wrap(this.print(member, depth + 1)))].join(' | ');
    }
    const printed: string[] = [];
    let sawTrue = false;
    let sawFalse = false;
    for (const member of members) {
      if (member.flags & ts.TypeFlags.BooleanLiteral) {
        const text = this.checker.typeToString(member);
        sawTrue ||= text === 'true';
        sawFalse ||= text === 'false';
        continue;
      }
      printed.push(this.wrap(this.print(member, depth + 1)));
    }
    if (sawTrue && sawFalse) {
      printed.push('boolean');
    } else if (sawTrue) {
      printed.push('true');
    } else if (sawFalse) {
      printed.push('false');
    }
    return [...new Set(printed)].join(' | ');
  }

  /** Parenthesize function types so they survive as union and intersection members. */
  private wrap(text: string): string {
    return text.startsWith('(') && text.includes('=>') ? `(${text})` : text;
  }

  private object(type: ts.ObjectType, depth: number): string {
    const { checker } = this;
    if (checker.isArrayType(type)) {
      const [element] = checker.getTypeArguments(type as ts.TypeReference);
      return `Array<${element === undefined ? 'any' : this.print(element, depth + 1)}>`;
    }
    if (checker.isTupleType(type)) {
      const target = (type as ts.TypeReference).target as ts.TupleType;
      const elements = checker.getTypeArguments(type as ts.TypeReference).map((element, index) => {
        const elementFlags = target.elementFlags[index] ?? ts.ElementFlags.Required;
        const text = this.print(element, depth + 1);
        if (elementFlags & ts.ElementFlags.Rest || elementFlags & ts.ElementFlags.Variadic) {
          return `...Array<${text}>`;
        }
        return elementFlags & ts.ElementFlags.Optional ? `${this.wrap(text)}?` : text;
      });
      return `${target.readonly ? 'readonly ' : ''}[${elements.join(', ')}]`;
    }
    const properties = checker.getPropertiesOfType(type);
    const calls = checker.getSignaturesOfType(type, ts.SignatureKind.Call);
    const constructs = checker.getSignaturesOfType(type, ts.SignatureKind.Construct);
    const indexes = checker.getIndexInfosOfType(type);
    if (properties.length === 0 && indexes.length === 0 && constructs.length === 0 && calls.length === 1) {
      return this.signature(calls[0]!, depth, ' => ');
    }
    const indent = '  '.repeat(depth + 1);
    const members: string[] = [
      ...calls.map((signature) => `${indent}${this.signature(signature, depth, ': ')};`),
      ...constructs.map((signature) => `${indent}new ${this.signature(signature, depth, ': ')};`),
      ...indexes.map(
        (index) =>
          `${indent}${index.isReadonly ? 'readonly ' : ''}[key: ${this.print(index.keyType, depth + 1)}]: ${this.print(index.type, depth + 1)};`,
      ),
      ...properties.flatMap((property) => this.property(property, depth, indent)),
    ];
    return members.length === 0 ? '{}' : `{\n${members.join('\n')}\n${'  '.repeat(depth)}}`;
  }

  private property(property: ts.Symbol, depth: number, indent: string): string[] {
    if (property.name.startsWith('__@') || property.name.startsWith('#')) {
      return [];
    }
    const { checker } = this;
    const optional = (property.flags & ts.SymbolFlags.Optional) !== 0;
    const type = checker.getTypeOfSymbol(property);
    // An optional prop already admits `undefined`; printing it again only adds noise to hovers.
    const text =
      optional && type.isUnion() && this.names.get(type) === undefined && type.aliasSymbol === undefined
        ? this.union(type, depth + 1, (member) => (member.flags & ts.TypeFlags.Undefined) !== 0)
        : this.print(type, depth + 1, pascalCase(property.name));
    const readonly = property.declarations?.some(
      (declaration) => ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Readonly,
    );
    return [
      `${documentationComment(property, checker, indent)}${indent}${readonly ? 'readonly ' : ''}${propertyKey(property.name)}${optional ? '?' : ''}: ${text || 'undefined'};`,
    ];
  }

  private signature(signature: ts.Signature, depth: number, separator: ' => ' | ': '): string {
    const { checker } = this;
    const parameters = signature.getParameters().map((parameter, index) => {
      const parameterDeclaration = parameter.valueDeclaration;
      const isRest =
        parameterDeclaration !== undefined &&
        ts.isParameter(parameterDeclaration) &&
        parameterDeclaration.dotDotDotToken !== undefined;
      const isOptional =
        parameterDeclaration !== undefined &&
        ts.isParameter(parameterDeclaration) &&
        (parameterDeclaration.questionToken !== undefined || parameterDeclaration.initializer !== undefined);
      const name = identifierPattern.test(parameter.name) ? parameter.name : `arg${String(index)}`;
      const type = this.print(checker.getTypeOfSymbol(parameter), depth + 1);
      return `${isRest ? '...' : ''}${name}${isOptional && !isRest ? '?' : ''}: ${type}`;
    });
    const returnType = this.print(checker.getReturnTypeOfSignature(signature), depth + 1);
    return `(${parameters.join(', ')})${separator}${returnType}`;
  }
}

const findInterface = (file: ts.SourceFile, name: string): ts.InterfaceDeclaration => {
  const found = file.statements.find(
    (statement): statement is ts.InterfaceDeclaration =>
      ts.isInterfaceDeclaration(statement) && statement.name.text === name,
  );
  if (found === undefined) {
    throw new Error(`${file.fileName} no longer declares ${name}`);
  }
  return found;
};

/** Value exports authors call; every other core export is runtime machinery typed `any`. */
const typedHelpers = new Set(['useChip', 'useResistor', 'useCapacitor', 'useDiode', 'useLed']);

const coreModuleDeclarations = (program: ts.Program, core: ts.SourceFile, printer: StructuralPrinter): string => {
  const checker = program.getTypeChecker();
  const moduleSymbol = checker.getSymbolAtLocation(core);
  if (moduleSymbol === undefined) {
    throw new Error('@tscircuit/core declarations are not a module');
  }
  const lines: string[] = [];
  for (const exported of checker.getExportsOfModule(moduleSymbol).toSorted((a, b) => a.name.localeCompare(b.name))) {
    const resolved = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    const isValue = (resolved.flags & ts.SymbolFlags.Value) !== 0;
    const isType = (resolved.flags & ts.SymbolFlags.Type) !== 0;
    if (isValue) {
      const typed =
        typedHelpers.has(exported.name) && resolved.valueDeclaration !== undefined
          ? printer.print(checker.getTypeOfSymbolAtLocation(resolved, resolved.valueDeclaration), 0)
          : 'any';
      lines.push(`${documentationComment(resolved, checker, '')}export declare const ${exported.name}: ${typed};`);
    }
    if (isType && !(resolved.flags & ts.SymbolFlags.Class)) {
      lines.push(`export type ${exported.name} = any;`);
    } else if (resolved.flags & ts.SymbolFlags.Class) {
      lines.push(`export type ${exported.name} = any;`);
    }
  }
  return lines.join('\n');
};

/**
 * Build the tscircuit editor bundles.
 *
 * @param config - Installed declaration locations and versions.
 * @returns Package-shaped bundles for `react`, `csstype`, `@tscircuit/props`, `@tscircuit/core` and `tscircuit`.
 * @throws When `@tscircuit/core` no longer declares its `TscircuitElements` interface.
 * @internal
 */
export const buildTscircuitTypes = (config: TscircuitDeclarationsConfig): BundledTypesPackageMap => {
  const program = ts.createProgram([config.coreDeclarations], {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    noEmit: true,
    skipLibCheck: true,
    strict: true,
  });
  const checker = program.getTypeChecker();
  const core = program.getSourceFile(config.coreDeclarations);
  if (core === undefined) {
    throw new Error(`${config.coreDeclarations} is not in the program`);
  }
  const printer = new StructuralPrinter(program);
  const elements = findInterface(core, 'TscircuitElements');
  const tags = elements.members.flatMap((member) => {
    if (!ts.isPropertySignature(member) || member.type === undefined || !ts.isIdentifier(member.name)) {
      return [];
    }
    const type = checker.getTypeAtLocation(member.type);
    const preferred =
      ts.isTypeReferenceNode(member.type) && ts.isQualifiedName(member.type.typeName)
        ? member.type.typeName.right.text
        : `${member.name.text[0]!.toUpperCase()}${member.name.text.slice(1)}Props`;
    const name = type.flags & ts.TypeFlags.Any ? 'any' : printer.named(type, preferred);
    return [{ tag: member.name.text, name }];
  });
  const switchProps = tags.find(({ tag }) => tag === 'switch')?.name ?? 'any';

  const propsDeclarations = [
    '// Generated by `nx run api-extractor:extract-tscircuit` from @tscircuit/props; do not edit.',
    "import type * as React from 'react';",
    '',
    printer.declarations.join('\n\n'),
    '',
    '/** Every tscircuit JSX intrinsic element and its props. */',
    'export interface TscircuitElements {',
    ...tags.map(({ tag, name }) => `  ${propertyKey(tag)}: ${name};`),
    '}',
    '',
  ].join('\n');

  const helperPrinter = new StructuralPrinter(program);
  const coreValues = coreModuleDeclarations(program, core, helperPrinter);
  const coreDeclarations = [
    '// Generated by `nx run api-extractor:extract-tscircuit` from @tscircuit/core; do not edit.',
    "import type * as React from 'react';",
    "import type { TscircuitElements } from '@tscircuit/props';",
    '',
    helperPrinter.declarations.join('\n\n'),
    '',
    coreValues,
    '',
    "type TscircuitElementsWithoutReactConflicts = Omit<TscircuitElements, 'switch'>;",
    `type SwitchSvgAttributeProps = Partial<Omit<import('@tscircuit/props').${switchProps}, 'children' | 'type' | 'key'>>;`,
    '',
    "declare module 'react' {",
    '  interface SVGAttributes<T> extends SwitchSvgAttributeProps {}',
    '  namespace JSX {',
    '    interface IntrinsicElements extends TscircuitElementsWithoutReactConflicts {}',
    '  }',
    '}',
    '',
    "declare module 'react/jsx-runtime' {",
    '  namespace JSX {',
    '    interface IntrinsicElements extends TscircuitElementsWithoutReactConflicts {}',
    '  }',
    '}',
    '',
  ].join('\n');

  const reactManifest = JSON.parse(readFileSync(join(config.reactTypesDirectory, 'package.json'), 'utf8')) as {
    readonly version: string;
  };
  const reactSource = (file: string): string => readFileSync(join(config.reactTypesDirectory, file), 'utf8');
  const [, ...reactExtras] = reactFiles;

  return {
    react: {
      content: reactSource('index.d.ts'),
      files: Object.fromEntries(reactExtras.map((file) => [file, reactSource(file)])),
      packageJson: {
        name: 'react',
        version: reactManifest.version,
        types: './index.d.ts',
        exports: {
          '.': { types: './index.d.ts' },
          './jsx-runtime': { types: './jsx-runtime.d.ts' },
          './jsx-dev-runtime': { types: './jsx-dev-runtime.d.ts' },
        },
      },
    },
    csstype: {
      content: csstypeDeclarations,
      packageJson: { name: 'csstype', types: './index.d.ts' },
    },
    '@tscircuit/props': {
      content: propsDeclarations,
      packageJson: {
        name: '@tscircuit/props',
        version: config.propsVersion,
        types: './index.d.ts',
      },
    },
    '@tscircuit/core': {
      content: coreDeclarations,
      packageJson: {
        name: '@tscircuit/core',
        version: config.coreVersion,
        types: './index.d.ts',
      },
    },
    tscircuit: {
      content: "export * from '@tscircuit/core';\n",
      packageJson: {
        name: 'tscircuit',
        version: config.coreVersion,
        types: './index.d.ts',
      },
    },
  };
};
