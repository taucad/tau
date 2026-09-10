/**
 * The normalized, language-neutral API model every extractor produces.
 *
 * One shape holds TypeScript, Python, C#, OpenSCAD and KCL surfaces. Structured
 * fields drive the index, search and the coverage gate; {@link ApiSignature.text}
 * carries the verbatim source-language declaration, so rendering fidelity never
 * depends on this model describing every language's parameter exotica.
 *
 * `languageSpecific` is display-only. Nothing on a renderer's core path may
 * branch on it: the moment disclosure logic forks per language, the substrate
 * stops being one substrate.
 *
 * @module
 */

/** A language whose API surface this corpus can hold. @public */
export type ApiLanguage = 'typescript' | 'python' | 'csharp' | 'openscad' | 'kcl';

/** A reference to a type, rendered in its source language. @public */
export type ApiTypeRef = {
  /** Source-language rendering, e.g. `Align | tuple[Align, Align]`, `number(Angle)`. */
  readonly text: string;
  /** {@link ApiEntry.id} of a type declared in this corpus, when resolvable. */
  readonly ref?: string;
};

/** One parameter of one callable signature. @public */
export type ApiParameter = {
  readonly name: string;
  readonly type?: ApiTypeRef;
  readonly optional: boolean;
  /** Source text of the default, e.g. `(0, 0, 0)`, `Mode.ADD`, `1.0f`. Never a `repr()`. */
  readonly defaultValue?: string;
  readonly variadic?: boolean;
  readonly description?: string;
};

/**
 * One callable shape. A member with N overloads carries N signatures.
 *
 * Overloads are the field the previous model lacked: `extract-jscad-types`
 * joined overload text with newlines while `extract-replicad-api` emitted
 * duplicate entries, so the two extractors disagreed about the same concept.
 *
 * @public
 */
export type ApiSignature = {
  readonly parameters: readonly ApiParameter[];
  readonly returnType?: ApiTypeRef;
  /** Verbatim declaration in the source language. The display authority. */
  readonly text: string;
  readonly typeParameters?: readonly string[];
  readonly description?: string;
};

/** Prose attached to an entry. @public */
export type ApiDocs = {
  /** One line. What the index renders. */
  readonly summary?: string;
  readonly remarks?: string;
  readonly examples?: ReadonlyArray<{ readonly caption?: string; readonly code: string }>;
  readonly throws?: readonly string[];
  readonly seeAlso?: readonly string[];
};

/** Where an entry is declared upstream. @public */
export type ApiSource = {
  readonly file: string;
  readonly line?: number;
  readonly url?: string;
};

/** What kind of thing an entry is. @public */
export type ApiEntryKind =
  | 'module'
  | 'namespace'
  | 'class'
  | 'interface'
  | 'struct'
  | 'function'
  | 'method'
  | 'constructor'
  | 'property'
  | 'field'
  | 'type'
  | 'enum'
  | 'enumMember'
  | 'constant';

/**
 * Per-language detail with nowhere neutral to live.
 *
 * Display-only by construction. Renderers may show it; they may not route on it.
 *
 * @public
 */
export type ApiLanguageSpecific =
  | {
      readonly language: 'python';
      readonly parameterKinds?: Readonly<
        Record<string, 'positional-only' | 'positional-or-keyword' | 'keyword-only' | 'var-positional' | 'var-keyword'>
      >;
      readonly decorators?: readonly string[];
    }
  | {
      readonly language: 'csharp';
      readonly refKinds?: Readonly<Record<string, 'ref' | 'out' | 'in'>>;
      /** The XML `member name` string, e.g. `M:PicoGK.Voxels.voxSphere(System.Numerics.Vector3,System.Single)`. */
      readonly documentationId?: string;
    }
  | {
      readonly language: 'kcl';
      /** Bare unit per parameter, e.g. `angle` -> `Angle` from `number(Angle)`. */
      readonly unitTypes?: Readonly<Record<string, string>>;
      readonly experimental?: boolean;
    }
  | {
      readonly language: 'openscad';
      /** OpenSCAD splits modules (statement form) from functions (expression form). */
      readonly isModule?: boolean;
    }
  | { readonly language: 'typescript' };

/** One addressable API symbol. @public */
export type ApiEntry = {
  /** Stable, language-qualified id, e.g. `csharp:PicoGK.Voxels.voxSphere(Vector3,Single)`. */
  readonly id: string;
  readonly name: string;
  readonly kind: ApiEntryKind;
  /** Dotted container path, e.g. `build123d.objects_part`, `PicoGK.Voxels`, `std`. */
  readonly path?: string;
  /** Curated grouping. Becomes one T3 shard. */
  readonly category?: string;
  /** Callables only. Length greater than one means overloads. */
  readonly signatures?: readonly ApiSignature[];
  /** Non-callables: the declared type. */
  readonly type?: ApiTypeRef;
  readonly docs?: ApiDocs;
  /** `true`, or the replacement guidance. */
  readonly deprecated?: string | true;
  readonly visibility?: 'public' | 'protected';
  readonly static?: boolean;
  readonly source?: ApiSource;
  /** Class and namespace members. Members are addressable through their own ids. */
  readonly members?: readonly ApiEntry[];
  readonly languageSpecific?: ApiLanguageSpecific;
};

/** Provenance of one extraction run. @public */
export type ApiCorpusMetadata = {
  readonly language: ApiLanguage;
  /** The package or repository that owns the surface, e.g. `replicad`, `PicoGK`. */
  readonly packageName: string;
  readonly packageVersion: string;
  /** Toolchain identity, e.g. `TypeScript 5.9.3`, `CPython 3.13.15 inspect+ast`, `Roslyn 5.9.0`. */
  readonly extractor: string;
  /** ISO 8601. */
  readonly extractionDate: string;
  readonly totalEntries: number;
  readonly breakdown: Readonly<Record<string, number>>;
};

/** A complete extracted API surface. @public */
export type ApiCorpus = {
  readonly metadata: ApiCorpusMetadata;
  readonly entries: readonly ApiEntry[];
};
