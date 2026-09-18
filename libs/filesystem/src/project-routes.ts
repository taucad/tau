/**
 * The product's virtual route grammar, and the only speller of it inside the
 * filesystem authority (charter D10).
 *
 * `/projects/<id>`, `/checkouts/<id>`, `/previews/<instance>` and
 * `/node_modules` are product shape, not router mechanism: filesystem Core
 * Principle 11 calls virtual routes projections, so the generic router must not
 * know the product's URL grammar. Everything that needs to build or classify
 * one of those routes calls in here, and the import-boundary suite's
 * `route-literals` rule fails any other module that spells one.
 *
 * @module
 */

/**
 * What one virtual path names.
 *
 * `other` covers every path the product grammar does not claim — the workspace
 * root's own children, a test's `/scratch` mount, and `/projects` with no id.
 *
 * @public
 */
export type RouteKind = 'root' | 'project' | 'checkout' | 'preview' | 'node_modules' | 'other';

/**
 * One classified virtual path.
 *
 * @public
 */
export type ParsedRoute = {
  readonly kind: RouteKind;
  /** Route identity: project id, checkout id or preview instance. Absent for every other kind. */
  readonly id?: string;
  /** Path below the route head, `''` when the path is the route itself. */
  readonly rest: string;
};

/** First segment to the kind of the id-carrying routes. */
const idRouteKinds: Readonly<Record<string, RouteKind | undefined>> = Object.freeze({
  projects: 'project',
  checkouts: 'checkout',
  previews: 'preview',
});

/** The boot-owned read-only mount that hosts the bundled `.d.ts` payloads. @public */
export const nodeModulesRoute = '/node_modules';

/**
 * The logical route of one project.
 *
 * @param projectId - Logical project identity.
 * @returns Absolute virtual route prefix.
 * @public
 */
export const projectRoute = (projectId: string): string => `/projects/${projectId}`;

/**
 * The logical route of one linked checkout.
 *
 * @param checkoutId - Logical checkout identity.
 * @returns Absolute virtual route prefix.
 * @public
 */
export const checkoutRoute = (checkoutId: string): string => `/checkouts/${checkoutId}`;

/**
 * Classify one canonical absolute virtual path.
 *
 * A path deeper than its route head keeps that head's kind and id, so
 * `/projects/<id>/src/main.ts` is the same project route its prefix is.
 *
 * @param canonicalPath - Absolute virtual path, already canonicalized.
 * @returns The route this path belongs to.
 * @public
 */
export const parseRoute = (canonicalPath: string): ParsedRoute => {
  const segments = canonicalPath.split('/').filter(Boolean);
  const [head, id] = segments;
  if (head === undefined) {
    return { kind: 'root', rest: '' };
  }
  if (head === 'node_modules') {
    return { kind: 'node_modules', rest: segments.slice(1).join('/') };
  }
  const kind = idRouteKinds[head];
  return kind === undefined || id === undefined
    ? { kind: 'other', rest: '' }
    : { kind, id, rest: segments.slice(2).join('/') };
};
