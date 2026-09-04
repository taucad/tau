import type { ClientEnvironment } from '#environment.config.js';

/**
 * Builds the inline `<script>` body that publishes the allowlisted client
 * environment as `window.ENV`.
 *
 * The build-time values are the *fallback*, not the authority: a host that
 * already injected `window.ENV` before app-module evaluation (the Electron
 * preload, per `environment.config.ts`) wins every key it supplies. Plain
 * assignment would clobber it, because this script runs after the preload.
 *
 * Idempotent by construction — re-running it can only re-apply the same
 * build-time defaults underneath whatever the host already set.
 *
 * The serialised payload is `<`-escaped so no environment value can break out
 * of the surrounding `<script>` element.
 */
export const buildClientEnvScript = (environment: Partial<ClientEnvironment>): string =>
  // `<` is escaped so a value containing `</script>` cannot close the tag this
  // string is inlined into. `\u003c` is the same character to a JSON parser.
  `window.ENV = { ...${JSON.stringify(environment).replaceAll('<', String.raw`\u003c`)}, ...(window.ENV ?? {}) }`;
