/**
 * `import.meta.env` as this suite reads it: the bundler's string variables. The section-view bridge's product types
 * reach viewer modules that read `import.meta.env.MODE`, and the suite's own specs narrow `env` the same way, so the
 * suite declares it once here instead of taking Vite's client types, whose `any` index would leak into every read.
 */
// oxlint-disable-next-line typescript/consistent-type-definitions -- `ImportMeta` is augmented through interface merging.
interface ImportMeta {
  readonly env: Readonly<Record<string, string | undefined>> & { readonly MODE: string };
}
