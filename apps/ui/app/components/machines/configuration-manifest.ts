import { compileExportConfigurationManifest as compileProviderConfigurationManifest } from '@taucad/workbench-panes/export/export-source';
import type { ExportSchema } from '@taucad/workbench-panes/export/export-source';
import type { ParameterManifest } from '@taucad/parameters';

/**
 * Compile a provider configuration's checked manifest and record path. The app's seam over the shared Export pane's
 * compiler, so machine and print code (and their tests) keep one module to depend on.
 *
 * @param provider - The route's provider.
 * @param configuration - The configuration name, such as `export/stl/options`.
 * @param resolved - The schema and defaults.
 * @returns The record path and manifest.
 */
export async function compileExportConfigurationManifest(
  provider: string,
  configuration: string,
  resolved: ExportSchema,
): Promise<Readonly<{ entryPath: string; manifest: ParameterManifest }>> {
  return compileProviderConfigurationManifest(provider, configuration, resolved);
}
