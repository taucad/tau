import { useCallback, useState } from 'react';
import type { ActorRefFrom } from 'xstate';
import type { FileExtension } from '@taucad/types';
import { toast } from '#components/ui/sonner.js';
import type { cadMachine } from '#machines/cad.machine.js';
import { bestRouteForActiveKernel, exportWithRuntimeValidatedInput } from '#utils/export-formats.utils.js';
import { downloadExportArtifactSet } from '#utils/export-artifact-set.utils.js';

export type UseExportToDiskResult = {
  /**
   * Trigger an export of the given format on the supplied actor and download
   * the resulting blob to disk. Resolves once the toast/download have fired.
   * Failures are surfaced via toast; the promise still resolves.
   */
  readonly exportToDisk: (cadActor: ActorRefFrom<typeof cadMachine>, format: FileExtension) => Promise<void>;
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
    async (cadActor: ActorRefFrom<typeof cadMachine>, format: FileExtension): Promise<void> => {
      const { kernelClient, activeKernelId } = cadActor.getSnapshot().context;

      if (!kernelClient || !activeKernelId) {
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
        const options = route.exportOptions.defaults;
        const result = await exportWithRuntimeValidatedInput(kernelClient, route, { exportOptions: options });

        if (!result.success) {
          const message = result.issues[0]?.message ?? 'Export failed';
          toast.error(message);
          return;
        }

        await downloadExportArtifactSet(result.data, {
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
