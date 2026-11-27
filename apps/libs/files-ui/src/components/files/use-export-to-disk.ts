import { useCallback, useState } from 'react';
import type { AnyActorRef } from 'xstate';
import type { RuntimeClient, RuntimeDocument } from '@taucad/runtime';
import type { FileExtension } from '@taucad/types';
import { isRecord } from '@taucad/utils/schema';
import { toast } from '@taucad/ui/components/sonner';
import { bestRouteForActiveKernel, exportDocumentWithValidatedInput } from '#utils/export-formats.utils.js';
import { downloadExportArtifactSet } from '@taucad/ui-core/utils/export-artifact-set.utils';

/**
 * The CAD actor as export reads it: a geometry unit's runtime client, active kernel, open document and capabilities.
 * The app's CAD machine actor satisfies it; nothing here sends it an event.
 *
 * @public
 */
export type CadExportActor = Pick<AnyActorRef, 'subscribe'> & {
  getSnapshot: () => {
    readonly context: Readonly<{
      kernelClient?: RuntimeClient;
      activeKernelId?: string;
      document?: RuntimeDocument;
      capabilities?: RuntimeClient['capabilities'];
    }>;
  };
};

export type UseExportToDiskResult = {
  /**
   * Trigger an export of the given format on the supplied actor and download
   * the resulting blob to disk. Resolves once the toast/download have fired.
   * Failures are surfaced via toast; the promise still resolves.
   */
  readonly exportToDisk: (cadActor: CadExportActor, format: FileExtension) => Promise<void>;
  readonly isExporting: boolean;
};

/**
 * Encapsulates the single-click "export and download" pipeline shared by every
 * preview/exporter surface. Resolves the best route for the active kernel,
 * runs `kernelClient.export` with the route defaults, downloads the blob as
 * `${filenameBase}.${format}`, and surfaces success/failure via toast.
 *
 * The hook is project-context-free: callers pass the `cadActor` per call, so
 * a single hook instance can drive multiple geometry units (e.g. the chat
 * Quick-export submenu) without re-binding.
 */
export function useExportToDisk(filenameBase: string): UseExportToDiskResult {
  const [isExporting, setIsExporting] = useState(false);

  const exportToDisk = useCallback(
    async (cadActor: CadExportActor, format: FileExtension): Promise<void> => {
      const { kernelClient, activeKernelId, document } = cadActor.getSnapshot().context;

      if (!kernelClient || !activeKernelId || !document) {
        toast.error('Export failed');
        return;
      }

      setIsExporting(true);
      try {
        const route = bestRouteForActiveKernel(kernelClient, format, activeKernelId);
        if (!route || route.kernelId !== activeKernelId) {
          toast.error(`Export failed: ${format.toUpperCase()} is not available for this model`);
          return;
        }
        const exportFormat = route.targetFormat;
        // The runtime types route defaults as `any`; narrow them at the app boundary.
        const options: Record<string, unknown> = isRecord(route.exportOptions.defaults)
          ? route.exportOptions.defaults
          : {};
        const result = await exportDocumentWithValidatedInput(document, route, { options });

        if (!result.success) {
          const message = result.issues[0]?.message ?? 'Export failed';
          toast.error(message);
          return;
        }

        await downloadExportArtifactSet(result.files, {
          singleFileName: `${filenameBase}.${exportFormat}`,
          archiveName: `${filenameBase}-${exportFormat}.zip`,
        });
        toast.success(`Exported ${exportFormat.toUpperCase()}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Export failed';
        toast.error(message);
      } finally {
        setIsExporting(false);
      }
    },
    [filenameBase],
  );

  return { exportToDisk, isExporting };
}
