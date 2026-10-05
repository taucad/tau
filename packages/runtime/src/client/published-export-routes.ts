import type { FileExtension } from '@taucad/types';
import type { CapabilitiesManifest, ExportRoute } from '#types/runtime.types.js';
import type { PublishedAssembly, PublishedPartExact, PublishedPartOccurrence } from '#types/runtime-assembly.types.js';

/** Metadata-eligible published route; execution still validates its immutable closure and exact codec. @public */
export type PublishedExportRoute = ExportRoute & Readonly<{ exportId: string }>;

/**
 * Select a published route from already admitted metadata without reading assets or loading a producer.
 * @param input - The admitted publication, current declared capabilities and requested target.
 * @returns The first eligible declared route, or undefined when metadata cannot establish one.
 * @public
 */
export const selectPublishedExportRoute = ({
  publication,
  capabilities,
  format,
}: {
  readonly publication: PublishedAssembly;
  readonly capabilities: Pick<CapabilitiesManifest, 'routes'> | undefined;
  readonly format: FileExtension;
}): PublishedExportRoute | undefined => {
  const exact: PublishedPartExact[] = [];
  const visited = new Set<PublishedPartOccurrence>();
  let leaves = 0;
  const visit = (occurrences: readonly PublishedPartOccurrence[]): boolean =>
    occurrences.every((occurrence) => {
      if (visited.has(occurrence)) {
        return false;
      }
      visited.add(occurrence);
      if (occurrence.children) {
        return occurrence.children.length > 0 && visit(occurrence.children);
      }
      if (!Object.hasOwn(publication.parts, occurrence.part)) {
        return false;
      }
      const record = publication.parts[occurrence.part];
      if (!record || !Object.hasOwn(record.variants, occurrence.variant)) {
        return false;
      }
      const variant = record.variants[occurrence.variant];
      if (!variant?.glb) {
        return false;
      }
      leaves++;
      if (variant.exact) {
        exact.push(variant.exact);
      }
      return true;
    });
  if (!visit(publication.occurrences) || leaves === 0) {
    return undefined;
  }
  const first = exact.at(0);
  const homogeneous =
    exact.length === leaves &&
    first !== undefined &&
    exact.every((snapshot) =>
      (
        [
          'kernelId',
          'provider',
          'providerVersion',
          'codec',
          'codecVersion',
          'unit',
          'linearToleranceMm',
          'angularToleranceRad',
        ] as const
      ).every((field) => snapshot[field] === first[field]),
    );
  for (const route of capabilities?.routes ?? []) {
    if (route.targetFormat !== format) {
      continue;
    }
    if (
      route.fidelity === 'mesh' &&
      route.sourceFormat === 'glb' &&
      (format === 'glb' || route.transcoderId !== undefined)
    ) {
      return {
        ...route,
        exportId: 'glb',
        ...(format === 'glb' ? { exportOptions: { schema: {}, defaults: {} } } : {}),
      };
    }
    if (homogeneous && route.kernelId === first.kernelId && route.exportId) {
      return { ...route, exportId: route.exportId };
    }
  }
  return undefined;
};
