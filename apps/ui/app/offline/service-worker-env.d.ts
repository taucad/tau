/**
 * Service worker build seam (progressive loading PL7), declared beside its only consumer
 * (`pwa-registration.ts`).
 *
 * Same pattern as `TAU_TARGET` in `apps/ui/vite-environment.d.ts`: Vite
 * substitutes `import.meta.env.X` textually, so the value must be read with
 * dotted access and therefore needs a declared property.
 */
// oxlint-disable-next-line @typescript-eslint/consistent-type-definitions -- Extending Vite's global interface
interface ImportMetaEnv {
  /**
   * Only in the web build (`apps/ui/vite.config.ts`): `'enabled'`, or `'retired'` when it ships the kill switch
   * (`TAU_SERVICE_WORKER_KILL_SWITCH=true`, `apps/ui/build-environment.ts`).
   */
  readonly TAU_SERVICE_WORKER?: 'enabled' | 'retired';
}
