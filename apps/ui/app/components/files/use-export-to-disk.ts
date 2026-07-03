import { useCallback, useState } from 'react';
import type { ActorRefFrom } from 'xstate';
import type { FileExtension } from '@taucad/types';
import { asBuffer, downloadBlob } from '@taucad/utils/file';
import { toast } from '#components/ui/sonner.js';
import type { cadMachine } from '#machines/cad.machine.js';
import type { AppRuntimeExportFormat } from '#types/runtime-client.alias.js';

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
        const route = kernelClient.bestRouteFor(format, activeKernelId);
        if (!route || route.kernelId !== activeKernelId) {
          toast.error(`Export failed: ${format.toUpperCase()} is not available for this model`);
          return;
        }
        const exportFormat = route.targetFormat as AppRuntimeExportFormat;
        const options = route?.defaults ?? {};
        const result = await kernelClient.export(exportFormat, { exportOptions: options });

        if (!result.success) {
          const message = result.issues[0]?.message ?? 'Export failed';
          toast.error(message);
          return;
        }

        const blob = new Blob([asBuffer(result.data.bytes)]);
        downloadBlob(blob, `${filenameBase}.${exportFormat}`);
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
