import type { ExportResult, ExportRoute, RuntimeContentInput } from '@taucad/runtime';
import type { FileExtension } from '@taucad/types';
import { formatConfigurations } from '@taucad/types/constants';
import type { AppRuntimeClient, AppRuntimeExportFormat } from '#types/runtime-client.alias.js';

export type FormatEntry = {
  format: AppRuntimeExportFormat;
  fidelity: ExportRoute['fidelity'];
  direct: boolean;
};

export type AppRuntimeExportRoute = NonNullable<ReturnType<AppRuntimeClient['bestRouteFor']>>;

/**
 * Narrow a dynamic file extension and runtime-reported kernel id through the
 * typed capabilities manifest before calling the strongly typed client API.
 */
export function bestRouteForActiveKernel(
  client: AppRuntimeClient,
  format: FileExtension,
  activeKernelId?: string,
): AppRuntimeExportRoute | undefined {
  const candidate = client.capabilities?.routes.find(
    (route) => route.targetFormat === format && (!activeKernelId || route.kernelId === activeKernelId),
  );
  return candidate ? client.bestRouteFor(candidate.targetFormat, { kernelId: candidate.kernelId }) : undefined;
}

/**
 * Export options produced by runtime JSON Schema forms are runtime-validated
 * against the selected route. This is the single app boundary that converts
 * that dynamic record back into the client's statically projected API.
 */
export type RuntimeValidatedExportInput = {
  readonly content?: RuntimeContentInput;
  readonly exportOptions?: Record<string, unknown>;
};

export async function exportWithRuntimeValidatedInput(
  client: AppRuntimeClient,
  route: AppRuntimeExportRoute,
  input: RuntimeValidatedExportInput = {},
): Promise<ExportResult> {
  const dynamicClient = client as unknown as {
    export(format: AppRuntimeExportFormat, options?: RuntimeValidatedExportInput): Promise<ExportResult>;
  };
  return input.content !== undefined || input.exportOptions !== undefined
    ? dynamicClient.export(route.targetFormat, input)
    : dynamicClient.export(route.targetFormat);
}

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

  const targetFormats = new Set<AppRuntimeExportFormat>();
  for (const route of manifest.routes) {
    targetFormats.add(route.targetFormat);
  }

  const formats: FormatEntry[] = [];
  for (const format of targetFormats) {
    const route = bestRouteForActiveKernel(client, format, activeKernelId);
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
