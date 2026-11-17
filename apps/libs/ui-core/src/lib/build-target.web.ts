/**
 * The web build's answer to "is this the Electron desktop bundle?".
 *
 * `@taucad/ui-core/lib/build-target` resolves here under every condition set
 * except `tau-desktop`, which only `apps/ui/desktop/vite.config.ts` adds (via
 * `uiBuildTarget` in `apps/ui/vite.config.ts`, which also sets the app's
 * `import.meta.env.TAU_TARGET` define, so the app and its libraries cannot
 * disagree). TypeScript resolves the `default` condition, so this file is
 * also the declaration both variants must match.
 *
 * A literal constant rather than a runtime decision (ruling C1): the desktop
 * preload installs asynchronously, so deciding at runtime could durably pin a
 * desktop Home to browser storage. The bundler inlines it, so every desktop
 * branch folds out of the web bundle. Tests choose a variant with
 * `vi.mock('@taucad/ui-core/lib/build-target', …)`.
 */
export const isDesktopTarget = false as boolean;
