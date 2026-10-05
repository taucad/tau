import { useCallback, useState } from 'react';
import type { ActorRefFrom } from 'xstate';
import type { FileExtension } from '@taucad/types';
import { isRecord } from '@taucad/utils/schema';
import { toast } from '#components/ui/sonner.js';
import { selectCadDisplay } from '#machines/cad.machine.js';
import type { cadMachine } from '#machines/cad.machine.js';
import { bestRouteForActiveKernel, exportDocumentWithValidatedInput } from '#utils/export-formats.utils.js';
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
      const snapshot = cadActor.getSnapshot();
      const {
        kernelClient,
        activeKernelId,
        publishedAssembly,
        publishedAssemblyRoot,
        latestRenderingOutcome,
        document,
      } = snapshot.context;
      const display = selectCadDisplay(snapshot);
      const assemblyDisplay = display && 'admitted' in display ? display : undefined;
      if (
        !kernelClient ||
        (!document && !assemblyDisplay) ||
        (!activeKernelId && !publishedAssembly) ||
        latestRenderingOutcome !== 'success'
      ) {
        toast.error('Export failed');
        return;
      }

      setIsExporting(true);
      try {
        const route = bestRouteForActiveKernel(kernelClient, format, publishedAssembly ?? activeKernelId);
        if (!route || (!publishedAssembly && route.kernelId !== activeKernelId)) {
          toast.error(`Export failed: ${format.toUpperCase()} is not available for this model`);
          return;
        }
        const exportFormat = route.targetFormat;
        // The runtime types route defaults as `any`; narrow them at the app boundary.
        const options: Record<string, unknown> = isRecord(route.exportOptions.defaults)
          ? route.exportOptions.defaults
          : {};
        const result = assemblyDisplay
          ? await assemblyDisplay.document.exportPublished({
              publishedAssembly: { root: assemblyDisplay.root },
              format,
              exportOptions: options,
            })
          : document
            ? await exportDocumentWithValidatedInput(document, route, { options })
            : undefined;
        if (!result) {
          throw new Error('The selected CAD document is unavailable');
        }
        if (
          selectCadDisplay(cadActor.getSnapshot()) !== display ||
          cadActor.getSnapshot().context.document !== document ||
          cadActor.getSnapshot().context.publishedAssemblyRoot !== publishedAssemblyRoot ||
          cadActor.getSnapshot().context.rendering !== snapshot.context.rendering ||
          cadActor.getSnapshot().context.latestRenderingOutcome !== 'success'
        ) {
          throw new Error('The selected CAD display changed during export');
        }

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
