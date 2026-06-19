import type { FormatEntry } from '#routes/projects_.$id/export-formats.utils.js';

export type ExportFormatGroup = {
  readonly name: string;
  readonly items: FormatEntry[];
};

const exportFormatFidelityGroups = [
  { fidelity: 'brep', name: 'BREP' },
  { fidelity: 'mesh', name: 'Mesh' },
] as const satisfies ReadonlyArray<{ fidelity: FormatEntry['fidelity']; name: string }>;

/** Group export formats by fidelity in user-facing priority order. */
export function groupExportFormatsByFidelity(formats: readonly FormatEntry[]): ExportFormatGroup[] {
  return exportFormatFidelityGroups.flatMap((group) => {
    const items = formats.filter((entry) => entry.fidelity === group.fidelity);
    return items.length > 0 ? [{ name: group.name, items }] : [];
  });
}
