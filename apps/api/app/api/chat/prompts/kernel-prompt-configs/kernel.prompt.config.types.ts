/**
 * File layout modes for different CAD kernels:
 * - 'full-nesting': Can import any file from subdirectories (OpenSCAD, Replicad, JSCAD)
 * - 'assembly-only': Subdirectory imports must reference main.kcl entry points (Zoo/KCL)
 */
export type FileLayoutMode = 'full-nesting' | 'assembly-only';

/**
 * A minimal multi-file canonical example for a kernel. Demonstrates the
 * idiomatic library-import idiom (`use <…>` for OpenSCAD, ESM relative
 * imports for TS-based kernels, flat KCL `import … from "…"` for the
 * `assembly-only` layout) so the agent never has to guess between
 * `include` / `use`, deep-relative TypeScript imports, etc.
 *
 * Authoring rule: keep this DEMO-MINIMAL — one entry file plus one
 * library file is sufficient. Each file must carry the import statement
 * the agent should mirror; complex parametric models belong in
 * {@link KernelConfig.canonicalExample} instead.
 */
export type MultiFileExample = {
  /** Entry-point filename relative to the example root (e.g. `'main.scad'`). Must appear in {@link MultiFileExample.files}. */
  mainFile: string;
  /** Idiomatic library file(s) plus the entry point. Order is rendering order in the system prompt. */
  files: ReadonlyArray<{ path: string; content: string }>;
};

/**
 * Configuration for a CAD kernel's system prompt.
 * Optimized per context-engineering.mdc: minimal fields, canonical example demonstrates behavior.
 */
export type KernelConfig = {
  /** File extension for this kernel (e.g., '.scad', '.ts', '.kcl', '.js') */
  fileExtension: string;

  /** Human-readable name for the kernel (e.g., 'OpenSCAD', 'Replicad') */
  languageName: string;

  /** Code output requirements - format constraints only, no examples (example demonstrates) */
  codeStandards: string;

  /** Common error patterns - terse, one-line descriptions */
  commonErrorPatterns: string;

  /** How this kernel handles file organization */
  fileLayoutMode: FileLayoutMode;

  /** Comprehensive canonical example demonstrating the full API surface */
  canonicalExample: string;

  /**
   * Per-kernel topology & geometric-fidelity hints. Sourced into a
   * `<topology_hints>` static section that sits next to `<code_standards>`
   * and maps the global `<geometry_fidelity>` principle to this kernel's
   * actual primitive vocabulary (analytical curve names on B-rep kernels;
   * segment-count heuristics on mesh kernels). Keep ≤ 8 lines per kernel.
   *
   * See {@link docs/research/code-cad-topology-best-practices.md} F1/F2 for
   * the B-rep-vs-mesh divide this field exists to resolve.
   */
  topologyHints: string;

  /**
   * Single-line snippet demonstrating the minimal top-level construct that
   * makes a file render standalone (e.g. a default `main` export, an OpenSCAD
   * top-level invocation, a KCL `extrude` pipeline). Consumed by the
   * `test_model` tool description, its `FILE_NOT_FOUND`/`NO_TOP_LEVEL_GEOMETRY`
   * error messages, and the `<test_requirements>` system-prompt block.
   *
   * Snippets must carry the kernel's return-type vocabulary inline (e.g.
   * `: Shape3D`, `: Manifold`) so the agent receives the type contract from
   * the example alone, without a parallel prose noun phrase.
   */
  topLevelExportExample: string;

  /**
   * Optional multi-shape companion example. Used by kernels whose `main()` may
   * return an array of named/coloured parts (e.g. Replicad's `ShapeConfig[]`)
   * to teach the LLM that touching parts cluster into a single
   * `connectedComponents` group at the default tolerance, while per-geometry-unit
   * `watertight` remains the canonical "did the boolean fuse weld" guardrail.
   *
   * Wired into a `<multi_shape_pattern>` section in the system prompt only when
   * the field is non-empty; kernels without a multi-shape return type leave it
   * undefined and the section is omitted entirely.
   */
  multiShapeExample?: string;

  /**
   * Minimal multi-file canonical example demonstrating the kernel's idiomatic
   * library-import idiom (entry file + one library file). Wired into a
   * `<multi_file_pattern>` section in the system prompt so the agent mirrors
   * the correct import token instead of guessing between
   * `include <…>` / `use <…>` (OpenSCAD), `'./lib/x.js'` / `'./lib/x'` (TS),
   * or flat-vs-nested KCL layouts.
   *
   * Slot is optional in the type for safety, but every shipped kernel is
   * expected to populate it (see {@link kernel.prompt.config.test.ts}).
   */
  multiFileExample?: MultiFileExample;
};
