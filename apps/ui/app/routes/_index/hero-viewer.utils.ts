import type { FileExtension } from '@taucad/types';

export type ExportFormatOption<Format extends FileExtension = FileExtension> = {
  format: Format;
  label: string;
};

/**
 * Derive a deduplicated list of export format options from a manifest.
 *
 * Intentionally kernel-agnostic: the hero viewer renders a single hardcoded file
 * with a known kernel, so first-occurrence deduplication on `targetFormat` is
 * sufficient (unlike ChatConverter which filters by activeKernelId).
 */
export function deriveExportFormatOptions<
  const Capabilities extends { routes: ReadonlyArray<{ targetFormat: FileExtension }> },
>(
  capabilities: Capabilities | undefined,
): Array<ExportFormatOption<Capabilities['routes'][number]['targetFormat'] & FileExtension>> {
  if (!capabilities) {
    return [];
  }
  const seen = new Set<FileExtension>();
  const options: Array<ExportFormatOption<Capabilities['routes'][number]['targetFormat'] & FileExtension>> = [];
  for (const route of capabilities.routes) {
    if (seen.has(route.targetFormat)) {
      continue;
    }
    seen.add(route.targetFormat);
    options.push({ format: route.targetFormat, label: route.targetFormat.toUpperCase() });
  }
  return options;
}
