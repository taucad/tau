/**
 * Cmd+Click instrumentation helper.
 *
 * Centralised `console.debug` shim for tracing the Monaco TS Cmd+Click /
 * go-to-definition chain end-to-end. Sprinkled at every layer boundary the
 * `cmd-click-and-node-modules-mount.md` investigation needs evidence for:
 *
 * - {@link MaterializingLibFiles.fetchLibFilesIfNecessary} — which URIs the
 *   `DefinitionAdapter` asked to materialise.
 * - {@link MaterializingLibFiles.getOrCreateModel} — whether each entry resolved
 *   to a model or returned `null` (the "silent drop" hypothesis).
 * - {@link MonacoWorkspaceFs.openTextDocument} — whether `editor.createModel`
 *   was actually called.
 * - {@link WorkspaceFileSystemProvider.readPathAsText} — what
 *   {@link FileContentService.resolve} returned (`text`/`orphaned`/...) and
 *   whether the extraLibs fallback hit.
 * - {@link registerMonacoNavigation.openCodeEditor} — whether Monaco's editor
 *   service ever asked to open the resolved URI.
 *
 * Filter pattern in DevTools: `[cmd-click]`. Opt in from the console with
 * `globalThis.__tauCmdClickDebug = true` (default is off so routine editing stays
 * quiet).
 */

type CmdClickGlobal = {
  __tauCmdClickDebug?: boolean;
};

const cmdClickPrefix = '[cmd-click]';

function isEnabled(): boolean {
  return (globalThis as unknown as CmdClickGlobal).__tauCmdClickDebug === true;
}

/** Emit a `console.debug` line tagged `[cmd-click] <site>`, gated by the global flag. */
export function debugCmdClick(site: string, payload?: Record<string, unknown>): void {
  if (!isEnabled()) {
    return;
  }
  // oxlint-disable-next-line no-console -- temporary cmd-click investigation diagnostic
  console.debug(cmdClickPrefix, site, payload ?? {});
}
