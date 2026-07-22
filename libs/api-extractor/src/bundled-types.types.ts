/** One package-shaped declaration bundle for the shared `/node_modules` mount. */
export type BundledTypesPackage = Readonly<{
  content: string;
  files?: Readonly<Record<string, string>>;
  packageJson?: Readonly<Record<string, unknown>>;
}>;

/** Map of root package name to its declaration bundle. */
export type BundledTypesPackageMap = Readonly<Record<string, BundledTypesPackage>>;
