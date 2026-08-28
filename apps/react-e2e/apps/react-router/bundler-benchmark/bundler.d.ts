/* oxlint-disable typescript/consistent-type-imports -- ambient alias needs the selected factory's exact type */

declare module '#benchmark-bundler' {
  const createBundler: typeof import('@taucad/esbuild').esbuild;
  export { createBundler };
}
