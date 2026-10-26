// oxlint-disable-next-line @typescript-eslint/consistent-type-definitions -- Extending Vite's global interface.
interface ImportMetaEnv {
  /** Explicit staging build opt-in; absent from desktop and self-host builds. */
  readonly TAU_OBSERVABILITY_HARNESS?: 'enabled' | 'disabled';
}
