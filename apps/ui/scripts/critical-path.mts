/**
 * The critical path's shared vocabulary (progressive loading programme, PL0): the route classes whose interactive
 * tier is guarded, and the heavy modules no interactive tier may load.
 *
 * One list feeds three guards, fastest first:
 *
 * - G1, `tau-lint/no-static-heavy-import`: its `modules` option in `.oxlintrc.json` is {@link heavySpecifiers}
 *   (held equal by `app/lib/critical-graph.node.test.ts`).
 * - G2, `app/lib/critical-graph.node.test.ts`: walks each class's {@link CriticalRouteClass.roots} through the app
 *   and the workspace packages and reports every heavy specifier reached statically.
 * - G3, `scripts/check-critical-budget.mts`: measures each class's interactive closure in the client build (brotli
 *   bytes, requests, largest chunk) against `critical-budget.json`, and reports every chunk of it holding a heavy
 *   module id ({@link HeavyModule.moduleIds}).
 *
 * The route classes and their roots come from the route-class registry (primitive P1, PL3).
 */
// oxlint-disable-next-line no-restricted-imports -- Native Node scripts read the registry without bundler aliases.
import { routeClasses } from '../app/lib/route-classes.ts';

/** A module family that belongs to the deferred tier (T2) and never to a route's interactive tier (T1). */
export type HeavyModule = {
  /** The family's name, as the known-violation lists key it. */
  readonly name: string;
  /**
   * Import specifiers of the family. `x` is the exact specifier; `x/*` is every subpath of `x`. A package listed
   * without `x/*` is heavy through its root entry only.
   */
  readonly specifiers: readonly string[];
  /**
   * Substrings of a workspace-relative module id that place the module in the family, for the build-output check.
   * Empty when the family is heavy through one entry of a package whose other entries are light, which only the
   * source guards can tell apart.
   */
  readonly moduleIds: readonly string[];
  /** Whether a chunk holding the family is a kernel asset, which no document may preload. */
  readonly kernel: boolean;
};

const kernelPackages = [
  'assimp',
  'brep',
  'build123d',
  'esbuild',
  'jscad',
  'manifold',
  'opencascade',
  'openrscad',
  'picogk',
  'picovoxel',
  'replicad',
  'rolldown',
  'smlib',
  'smlibpy',
  'tscircuit',
  'zoo',
] as const;

/** The heavy list of the progressive loading architecture's Enforcement section (G1). */
export const heavyModules: readonly HeavyModule[] = [
  {
    name: 'ai',
    specifiers: ['ai', 'ai/*', '@ai-sdk/*'],
    moduleIds: ['node_modules/ai/', 'node_modules/@ai-sdk/'],
    kernel: false,
  },
  { name: 'three', specifiers: ['three', 'three/*'], moduleIds: ['node_modules/three/'], kernel: false },
  { name: 'react-three', specifiers: ['@react-three/*'], moduleIds: ['node_modules/@react-three/'], kernel: false },
  { name: 'runtime', specifiers: ['@taucad/runtime'], moduleIds: [], kernel: false },
  {
    name: 'kernels',
    specifiers: kernelPackages.flatMap((name) => [`@taucad/${name}`, `@taucad/${name}/*`]),
    moduleIds: [
      ...kernelPackages.map((name) => `packages/plugins/${name}/src/`),
      'node_modules/@taulabs/replicad-opencascadejs/',
      'node_modules/@taucad/kcl-wasm-lib/',
      'node_modules/@classcad/smlibwasm/',
      'node_modules/manifold-3d/',
      'node_modules/esbuild-wasm/',
      'node_modules/picovoxel/',
    ],
    kernel: true,
  },
  { name: 'editor', specifiers: ['@codemirror/*'], moduleIds: ['node_modules/@codemirror/'], kernel: false },
  {
    name: 'posthog',
    specifiers: ['posthog-js', 'posthog-js/*'],
    moduleIds: ['node_modules/posthog-js/'],
    kernel: false,
  },
  { name: 'sentry', specifiers: ['@sentry/react'], moduleIds: ['node_modules/@sentry/react/'], kernel: false },
];

/** Every heavy specifier pattern, in list order: the `modules` option of `tau-lint/no-static-heavy-import`. */
export const heavySpecifiers: readonly string[] = heavyModules.flatMap((module) => module.specifiers);

/**
 * The heavy family a bare import specifier belongs to.
 *
 * @param specifier - A bare specifier, without a query.
 * @returns The family's name, or undefined for a light specifier.
 */
export const heavyFamilyOfSpecifier = (specifier: string): string | undefined =>
  heavyModules.find((module) =>
    module.specifiers.some((pattern) =>
      pattern.endsWith('/*') ? specifier.startsWith(pattern.slice(0, -1)) : specifier === pattern,
    ),
  )?.name;

/**
 * The heavy family a module id of the build belongs to.
 *
 * @param moduleId - A workspace-relative module id.
 * @returns The family, or undefined for a light module.
 */
export const heavyFamilyOfModuleId = (moduleId: string): HeavyModule | undefined =>
  heavyModules.find((module) => module.moduleIds.some((fragment) => moduleId.includes(fragment)));

/** A route class whose interactive tier the guards measure. */
export type CriticalRouteClass = {
  /** Key in `critical-budget.json`. */
  readonly id: string;
  /** Name in test titles and reports. */
  readonly label: string;
  /**
   * The modules the class evaluates on every open, app-relative: the shell's entry and root, the route module, and
   * the dynamic chunks the route requests on every open (an on-demand chunk requested at mount is still paid on
   * every open, so it belongs to the interactive tier).
   */
  readonly roots: readonly string[];
};

/**
 * The guarded route classes: every class of the route-class registry (primitive P1, `app/lib/route-classes.ts`) that
 * names its interactive roots, today Home and the project route.
 */
export const criticalRouteClasses: readonly CriticalRouteClass[] = routeClasses.flatMap((routeClass) =>
  routeClass.interactive === undefined
    ? []
    : [{ id: routeClass.id, label: routeClass.label, roots: routeClass.interactive }],
);
