/**
 * Scope-aware name resolution over the KCL AST.
 *
 * The KCL language server answers neither references nor document highlights, so the editor resolves
 * every identifier to the declaration it names here: occurrence highlights, Find References, scoped
 * go-to-definition, signature help and parameter inlay hints all read this one index.
 */

export type KclBindingKind = 'variable' | 'function' | 'parameter' | 'import' | 'module' | 'tag' | 'type';

export type KclParameter = Readonly<{
  name: string;
  labeled: boolean;
  optional: boolean;
  type: string | undefined;
}>;

export type KclBinding = {
  readonly name: string;
  readonly kind: KclBindingKind;
  readonly from: number;
  readonly to: number;
  /** Declared directly in the program body rather than inside a function or block. */
  readonly topLevel: boolean;
  readonly exported: boolean;
  /** Imports: the file the name comes from and the name it has there. */
  readonly importPath?: string;
  readonly importedName?: string;
  /** Functions: their parameters, so call labels resolve to them. */
  parameters?: ReadonlyMap<string, KclBinding>;
  readonly signature?: readonly KclParameter[];
  /** Parameters and variables: the annotated type name, when written. */
  readonly typeName?: string;
  /** The whole declaration, for outlines and breadcrumbs. */
  readonly extent: Readonly<{ from: number; to: number }>;
  /** The function the declaration sits in, if any. */
  readonly container: KclBinding | undefined;
};

export type KclOccurrence = Readonly<{
  name: string;
  from: number;
  to: number;
  declaration: boolean;
  /** Undefined for names no declaration in the file binds, such as the standard library. */
  binding: KclBinding | undefined;
  /** The `name` of `import name as alias`, which names a declaration in the imported file. */
  importedFrom?: string;
}>;

export type KclCall = Readonly<{
  from: number;
  to: number;
  /** End of the callee name; arguments start after it. */
  calleeTo: number;
  callee: KclOccurrence;
  unlabeled: Readonly<{ from: number; to: number }> | undefined;
  arguments: ReadonlyArray<Readonly<{ label: string; from: number; to: number }>>;
}>;

export type KclIndex = Readonly<{
  occurrences: readonly KclOccurrence[];
  calls: readonly KclCall[];
  /** Files imported with `import * from`, whose exports resolve unqualified names. */
  globImports: readonly string[];
}>;

type AstNode = Readonly<Record<string, unknown>> & Readonly<{ type?: string; start?: number; end?: number }>;

type Scope = Readonly<{
  parent: Scope | undefined;
  bindings: Map<string, KclBinding>;
  container?: KclBinding;
}>;

type PendingReference = {
  name: string;
  from: number;
  to: number;
  scope: Scope;
};
type PendingLabel = Readonly<{
  name: string;
  from: number;
  to: number;
  call: PendingReference;
}>;

const skippedKeys = new Set(['digest', 'nonCodeMeta', 'outerAttrs', 'innerAttrs', 'preComments', 'shebang']);

function isNode(value: unknown): value is AstNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function identifier(value: unknown): Readonly<{ name: string; from: number; to: number }> | undefined {
  if (!isNode(value) || typeof value['name'] !== 'string' || value.start === undefined || value.end === undefined) {
    return undefined;
  }
  return { name: value['name'], from: value.start, to: value.end };
}

/** The display name of an annotated type: `Sketch`, `number`, `[Point2d]`. */
export function kclTypeName(type: unknown): string | undefined {
  if (!isNode(type)) {
    return undefined;
  }
  switch (type.type) {
    case 'Primitive': {
      const primitive = type['p_type'];
      return primitive === 'Number'
        ? 'number'
        : primitive === 'String'
          ? 'string'
          : primitive === 'TagDecl'
            ? 'tag'
            : primitive === 'Function'
              ? 'fn'
              : typeof primitive === 'string'
                ? primitive.toLowerCase()
                : undefined;
    }
    case 'Named': {
      return isNode(type['name']) ? identifier(type['name']['name'])?.name : undefined;
    }
    case 'Array': {
      return kclTypeName(type['ty']);
    }
    default: {
      return undefined;
    }
  }
}

class IndexBuilder {
  public readonly occurrences: KclOccurrence[] = [];
  public readonly calls: Array<Omit<KclCall, 'callee'> & { callee: PendingReference }> = [];
  public readonly globImports: string[] = [];
  readonly #references: PendingReference[] = [];
  readonly #labels: PendingLabel[] = [];
  readonly #root: Scope = { parent: undefined, bindings: new Map() };

  public build(program: unknown): KclIndex {
    if (isNode(program) && Array.isArray(program['body'])) {
      for (const item of program['body']) {
        this.#visit(item, this.#root);
      }
    }
    const resolved = new Map<PendingReference, KclOccurrence>();
    for (const reference of this.#references) {
      const occurrence: KclOccurrence = {
        name: reference.name,
        from: reference.from,
        to: reference.to,
        declaration: false,
        binding: lookup(reference.scope, reference.name),
      };
      resolved.set(reference, occurrence);
      this.occurrences.push(occurrence);
    }
    for (const label of this.#labels) {
      const parameter = resolved.get(label.call)?.binding?.parameters?.get(label.name);
      if (parameter) {
        this.occurrences.push({
          name: label.name,
          from: label.from,
          to: label.to,
          declaration: false,
          binding: parameter,
        });
      }
    }
    this.occurrences.sort((left, right) => left.from - right.from);
    const calls = this.calls.map((call): KclCall => {
      const callee = resolved.get(call.callee);
      return {
        ...call,
        callee: callee ?? {
          name: call.callee.name,
          from: call.callee.from,
          to: call.callee.to,
          declaration: false,
          binding: undefined,
        },
      };
    });
    return {
      occurrences: this.occurrences,
      calls,
      globImports: this.globImports,
    };
  }

  #declare(
    scope: Scope,
    binding: Omit<KclBinding, 'topLevel' | 'container' | 'extent'> & Partial<Pick<KclBinding, 'extent'>>,
  ): KclBinding {
    const declared: KclBinding = {
      ...binding,
      extent: binding.extent ?? { from: binding.from, to: binding.to },
      topLevel: scope === this.#root,
      container: scope.container,
    };
    scope.bindings.set(declared.name, declared);
    this.occurrences.push({
      name: declared.name,
      from: declared.from,
      to: declared.to,
      declaration: true,
      binding: declared,
    });
    return declared;
  }

  #reference(scope: Scope, name: Readonly<{ name: string; from: number; to: number }>): PendingReference {
    const reference = { ...name, scope };
    this.#references.push(reference);
    return reference;
  }

  #visit(value: unknown, scope: Scope): void {
    if (Array.isArray(value)) {
      for (const item of value) {
        this.#visit(item, scope);
      }
      return;
    }
    if (!isNode(value)) {
      return;
    }
    switch (value.type) {
      case 'Program': {
        this.#visit(value['body'], {
          parent: scope,
          bindings: new Map(),
          container: scope.container,
        });
        return;
      }
      case 'VariableDeclaration': {
        this.#visitDeclaration(value, scope);
        return;
      }
      case 'FunctionExpression': {
        this.#visitFunction(value, scope, scope.container);
        return;
      }
      case 'ImportStatement': {
        this.#visitImport(value, scope);
        return;
      }
      case 'TypeDeclaration': {
        const name = identifier(value['name']);
        if (name) {
          this.#declare(scope, {
            ...name,
            kind: 'type',
            exported: value['visibility'] === 'export',
            extent: extentOf(value),
          });
        }
        this.#visit(value['definition'], scope);
        return;
      }
      case 'Name': {
        const path = Array.isArray(value['path']) ? value['path'] : [];
        // `module::item` names its module; the item itself lives in another file.
        const name = identifier(path.length > 0 ? path[0] : value['name']);
        if (name) {
          this.#reference(scope, name);
        }
        return;
      }
      case 'MemberExpression': {
        this.#visit(value['object'], scope);
        if (value['computed'] === true) {
          this.#visit(value['property'], scope);
        }
        return;
      }
      case 'TagDeclarator': {
        if (typeof value['value'] === 'string' && value.start !== undefined && value.end !== undefined) {
          // The `$` sigil is not part of the tag's name.
          this.#declare(scope, {
            name: value['value'],
            kind: 'tag',
            from: value.end - value['value'].length,
            to: value.end,
            exported: false,
          });
        }
        return;
      }
      case 'CallExpressionKw': {
        this.#visitCall(value, scope);
        return;
      }
      default: {
        for (const [key, child] of Object.entries(value)) {
          if (!skippedKeys.has(key)) {
            this.#visit(child, scope);
          }
        }
      }
    }
  }

  #visitDeclaration(value: AstNode, scope: Scope): void {
    const declarator = value['declaration'];
    if (!isNode(declarator)) {
      return;
    }
    const name = identifier(declarator['id']);
    const { init } = declarator;
    const exported = value['visibility'] === 'export';
    const extent = extentOf(value);
    if (!name) {
      this.#visit(init, scope);
      return;
    }
    if (isNode(init) && init.type === 'FunctionExpression') {
      const parameters = Array.isArray(init['params']) ? init['params'] : [];
      const binding = this.#declare(scope, {
        ...name,
        kind: 'function',
        exported,
        extent,
        signature: parameters.flatMap((parameter: unknown): KclParameter[] => {
          const id = isNode(parameter) ? identifier(parameter['identifier']) : undefined;
          return isNode(parameter) && id
            ? [
                {
                  name: id.name,
                  labeled: parameter['labeled'] !== false,
                  optional: parameter['optional'] === true || isNode(parameter['default_value']),
                  type: kclTypeName(parameter['param_type']),
                },
              ]
            : [];
        }),
      });
      binding.parameters = this.#visitFunction(init, scope, binding);
      return;
    }
    const typeName = isNode(init) && init.type === 'AscribedExpression' ? kclTypeName(init['ty']) : undefined;
    this.#declare(scope, {
      ...name,
      kind: 'variable',
      exported,
      typeName,
      extent,
    });
    this.#visit(init, scope);
  }

  #visitFunction(value: AstNode, scope: Scope, container: KclBinding | undefined): ReadonlyMap<string, KclBinding> {
    const inner: Scope = { parent: scope, bindings: new Map(), container };
    const parameters = new Map<string, KclBinding>();
    for (const parameter of Array.isArray(value['params']) ? value['params'] : []) {
      const name = isNode(parameter) ? identifier(parameter['identifier']) : undefined;
      if (!isNode(parameter) || !name) {
        continue;
      }
      parameters.set(
        name.name,
        this.#declare(inner, {
          ...name,
          kind: 'parameter',
          exported: false,
          typeName: kclTypeName(parameter['param_type']),
        }),
      );
      this.#visit(parameter['param_type'], scope);
      this.#visit(parameter['default_value'], inner);
    }
    this.#visit(value['return_type'], scope);
    this.#visit(value['body'], inner);
    return parameters;
  }

  #visitImport(value: AstNode, scope: Scope): void {
    const path = isNode(value['path']) ? value['path'] : undefined;
    const importPath = typeof path?.['filename'] === 'string' ? path['filename'] : undefined;
    const selector = isNode(value['selector']) ? value['selector'] : undefined;
    const exported = value['visibility'] === 'export';
    if (selector?.type === 'List' && Array.isArray(selector['items'])) {
      for (const item of selector['items']) {
        const name = isNode(item) ? identifier(item['name']) : undefined;
        if (!isNode(item) || !name) {
          continue;
        }
        const alias = identifier(item['alias']);
        this.#declare(scope, {
          ...(alias ?? name),
          kind: 'import',
          exported,
          importPath,
          importedName: name.name,
        });
        if (alias) {
          this.occurrences.push({
            ...name,
            declaration: false,
            binding: undefined,
            importedFrom: importPath,
          });
        }
      }
      return;
    }
    if (selector?.type === 'Glob') {
      if (importPath) {
        this.globImports.push(importPath);
      }
      return;
    }
    const alias = identifier(selector?.['alias']);
    if (alias) {
      this.#declare(scope, { ...alias, kind: 'module', exported, importPath });
    }
  }

  #visitCall(value: AstNode, scope: Scope): void {
    const callee = isNode(value['callee']) ? value['callee'] : undefined;
    const calleePath = Array.isArray(callee?.['path']) ? callee['path'] : [];
    const calleeName = identifier(callee?.['name']);
    this.#visit(callee, scope);
    const reference = calleePath.length === 0 && calleeName ? this.#references.at(-1) : undefined;
    const unlabeled = isNode(value['unlabeled']) ? value['unlabeled'] : undefined;
    this.#visit(unlabeled, scope);
    const labeled: Array<Readonly<{ label: string; from: number; to: number }>> = [];
    for (const argument of Array.isArray(value['arguments']) ? value['arguments'] : []) {
      if (!isNode(argument)) {
        continue;
      }
      const label = identifier(argument['label']);
      const expression = isNode(argument['arg']) ? argument['arg'] : undefined;
      if (label) {
        labeled.push({
          label: label.name,
          from: label.from,
          to: expression?.end ?? label.to,
        });
        if (reference) {
          this.#labels.push({ ...label, call: reference });
        }
      }
      this.#visit(expression, scope);
    }
    if (reference && value.start !== undefined && value.end !== undefined) {
      this.calls.push({
        from: value.start,
        to: value.end,
        calleeTo: reference.to,
        callee: reference,
        unlabeled:
          unlabeled?.start !== undefined && unlabeled.end !== undefined
            ? { from: unlabeled.start, to: unlabeled.end }
            : undefined,
        arguments: labeled,
      });
    }
  }
}

function extentOf(node: AstNode): Readonly<{ from: number; to: number }> | undefined {
  return node.start === undefined || node.end === undefined ? undefined : { from: node.start, to: node.end };
}

function lookup(scope: Scope | undefined, name: string): KclBinding | undefined {
  for (let current = scope; current; current = current.parent) {
    const binding = current.bindings.get(name);
    if (binding) {
      return binding;
    }
  }
  return undefined;
}

/** Resolve every name in a parsed KCL program to the declaration it refers to. */
export function indexKclProgram(program: unknown): KclIndex {
  return new IndexBuilder().build(program);
}

/** The name under the cursor; an offset at either edge of the name counts. */
export function kclOccurrenceAt(index: KclIndex, offset: number): KclOccurrence | undefined {
  return index.occurrences.find((occurrence) => occurrence.from <= offset && offset <= occurrence.to);
}

/** Every occurrence of the same declaration, or of the same free name such as a standard library function. */
export function kclRelatedOccurrences(index: KclIndex, target: KclOccurrence): KclOccurrence[] {
  if (target.importedFrom) {
    return [target];
  }
  return index.occurrences.filter((occurrence) =>
    target.binding
      ? occurrence.binding === target.binding
      : !occurrence.binding && !occurrence.importedFrom && occurrence.name === target.name,
  );
}

/** A declaration visible to other files: an exported top-level name. */
export function kclExportedBinding(index: KclIndex, name: string): KclBinding | undefined {
  return index.occurrences.find(
    (occurrence) =>
      occurrence.declaration &&
      occurrence.binding?.topLevel === true &&
      occurrence.binding.exported &&
      occurrence.binding.kind !== 'import' &&
      occurrence.name === name,
  )?.binding;
}

export type KclOutlineSymbol = Readonly<{
  binding: KclBinding;
  children: readonly KclOutlineSymbol[];
}>;

/** Functions, variables and types as an outline, nested in the function that declares them. */
export function kclOutline(index: KclIndex): KclOutlineSymbol[] {
  const children = new Map<KclBinding | undefined, KclBinding[]>();
  for (const occurrence of index.occurrences) {
    const { binding } = occurrence;
    if (
      occurrence.declaration &&
      binding &&
      (binding.kind === 'function' || binding.kind === 'variable' || binding.kind === 'type')
    ) {
      const siblings = children.get(binding.container) ?? [];
      siblings.push(binding);
      children.set(binding.container, siblings);
    }
  }
  const build = (container: KclBinding | undefined): KclOutlineSymbol[] =>
    (children.get(container) ?? []).map((binding) => ({
      binding,
      children: build(binding),
    }));
  return build(undefined);
}

/** The innermost call whose argument list contains the offset. */
export function kclCallAt(index: KclIndex, offset: number): KclCall | undefined {
  let found: KclCall | undefined;
  for (const call of index.calls) {
    if (call.calleeTo < offset && offset < call.to && (!found || call.from >= found.from)) {
      found = call;
    }
  }
  return found;
}
