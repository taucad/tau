import type { ExportRoute } from '@taucad/runtime';
import type { FileExtension } from '@taucad/types';
import { formatConfigurations } from '@taucad/types/constants';
import type { AppRuntimeClient } from '#types/runtime-client.alias.js';

export type FormatEntry = {
  format: ExportRoute['targetFormat'];
  fidelity: ExportRoute['fidelity'];
  direct: boolean;
};

/**
 * Derive the list of available export formats for a given kernel from the
 * runtime client's capabilities manifest.
 *
 * Each format is reduced to the "best" route (BREP > mesh, direct > transcoded)
 * via `bestRouteFor`. Formats whose best route is on a different kernel are
 * excluded so the list reflects only routes the active kernel can serve.
 */
export function deriveAvailableFormats(
  client: AppRuntimeClient | undefined,
  activeKernelId: string | undefined,
): FormatEntry[] {
  const manifest = client?.capabilities;
  if (!client || !manifest || !activeKernelId) {
    return [];
  }

  const targetFormats = new Set<FileExtension>();
  for (const route of manifest.routes) {
    targetFormats.add(route.targetFormat);
  }

  const formats: FormatEntry[] = [];
  for (const format of targetFormats) {
    const route = client.bestRouteFor(format, activeKernelId);
    if (!route || route.kernelId !== activeKernelId) {
      continue;
    }
    formats.push({
      format: route.targetFormat,
      fidelity: route.fidelity,
      direct: route.transcoderId === undefined,
    });
  }

  return formats.sort((a, b) => a.format.localeCompare(b.format));
}

/**
 * Lookup a format's display configuration (name + description) from
 * the constants table. Returns `undefined` for unknown extensions.
 */
export function getFormatInfo(format: FileExtension): { name: string; description: string } | undefined {
  if (format in formatConfigurations) {
    return formatConfigurations[format];
  }
  return undefined;
}
