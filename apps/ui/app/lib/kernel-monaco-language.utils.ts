/**
 * Kernel ↔ Monaco language mapping utilities used by the LSP prefetch hook in
 * `MonacoModelServiceProvider`. Maps a runtime kernel id (the value emitted by
 * `cadMachine.activeKernelChanged`) to the set of Monaco language ids whose
 * contributions should be warmed up.
 *
 * Derived from the live runtime capabilities manifest so configured and
 * dynamically updated kernel registrations stay authoritative.
 */

import type { MonacoLanguage } from '#lib/monaco.constants.js';
import { extensionToMonacoLanguage } from '#lib/monaco.constants.js';
import type { AppCapabilitiesManifest } from '#types/runtime-client.alias.js';

/**
 * Resolve the Monaco language ids associated with a kernel id. Returns an
 * empty array when the kernel id is unknown or none of its extensions map to
 * a Monaco language.
 */
export function getMonacoLanguageIdsForKernel(
  kernelId: string,
  capabilities: AppCapabilitiesManifest | undefined,
): MonacoLanguage[] {
  const plugin = capabilities?.registrations.find((candidate) => candidate.id === kernelId);
  if (plugin?.kind !== 'kernel') {
    return [];
  }

  const monacoIds = new Set<MonacoLanguage>();
  for (const extension of plugin.extensions) {
    const id = extensionToMonacoLanguage[extension];
    if (id) {
      monacoIds.add(id);
    }
  }
  return [...monacoIds];
}
