/**
 * Internal locator used by the runtime worker protocol after a public entry
 * path has been canonicalized and split.
 *
 * @internal
 */
export type RuntimeFileLocator = {
  readonly path: string;
  readonly filename: string;
};
