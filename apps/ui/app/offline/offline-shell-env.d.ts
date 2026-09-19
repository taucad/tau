/**
 * Offline shell build seam (B5 R3), declared beside its only consumer.
 *
 * Same pattern as `TAU_TARGET` in `apps/ui/vite-environment.d.ts`: Vite
 * substitutes `import.meta.env.X` textually, so the value must be read with
 * dotted access and therefore needs a declared property.
 */
// oxlint-disable-next-line @typescript-eslint/consistent-type-definitions -- Extending Vite's global interface
interface ImportMetaEnv {
  /** `'enabled'` only in the web build (`apps/ui/vite.config.ts`). */
  readonly TAU_OFFLINE_SHELL?: 'enabled';
}
