declare const __runtimeFileSystemBrand: unique symbol;

/**
 * Opaque consumer-facing filesystem handle.
 *
 * Reaching into the value to inspect the underlying handle is a type error:
 * the brand is unexported, so consumer code cannot construct a matching value.
 *
 * @public
 */
export type RuntimeFileSystem = {
  /** @internal */
  readonly [__runtimeFileSystemBrand]: true;
};
