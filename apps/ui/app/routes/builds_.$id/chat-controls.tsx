import { Clipboard, Download, GalleryThumbnails, ImageDown, Menu } from 'lucide-react';
import { useCallback, useEffect, useMemo } from 'react';
import type { JSX } from 'react';
import { useSelector } from '@xstate/react';
import { BoxDown } from '~/components/icons/box-down.js';
import { Button } from '~/components/ui/button.js';
import { useBuildSelector } from '~/hooks/use-build.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip.js';
import { toast } from '~/components/ui/sonner.js';
import { cn } from '~/utils/ui.js';
import { useGraphics } from '~/components/geometry/graphics/graphics-context.js';
import { cadActor } from '~/routes/builds_.$id/cad-actor.js';
import { ComboBoxResponsive } from '~/components/ui/combobox-responsive.js';
import { downloadBlob } from '~/utils/file.js';

type ViewerControlItem = {
  id: string;
  label: string;
  group: string;
  icon: JSX.Element;
  action: () => void;
  disabled?: boolean;
};

export function ChatControls(): JSX.Element {
  const shapes = useSelector(cadActor, (state) => state.context.shapes);
  const buildName = useBuildSelector((state) => state.build?.name) ?? 'file';
  const updateThumbnail = useBuildSelector((state) => state.updateThumbnail);
  const code = useSelector(cadActor, (state) => state.context.code);

  const { screenshot } = useGraphics();

  const getPngBlob = useCallback(async () => {
    const dataUrl = screenshot.capture({
      output: {
        format: 'image/png',
        quality: 0.92,
      },
    });
    const response = await fetch(dataUrl);
    return response.blob();
  }, [screenshot]);

  const handleExport = useCallback(
    async (filename: string, format: 'stl' | 'stl-binary' | 'step' | 'step-assembly') => {
      const fileExtension =
        format === 'stl' ? 'stl' : format === 'stl-binary' ? 'stl' : format === 'step' ? 'step' : 'step-assembly';
      const filenameWithExtension = `${filename}.${fileExtension}`;
      toast.promise(
        new Promise<Blob>((resolve, reject) => {
          cadActor.send({ type: 'exportGeometry', format });
          const subscription = cadActor.on('geometryExported', (event) => {
            subscription.unsubscribe();
            downloadBlob(event.blob, filenameWithExtension);
            resolve(event.blob);
          });
          // TODO: handle error case
        }),
        {
          loading: `Downloading ${filenameWithExtension}...`,
          success: `Downloaded ${filenameWithExtension}`,
          error(error) {
            let message = `Failed to download ${filenameWithExtension}`;
            if (error instanceof Error) {
              message = `${message}: ${error.message}`;
            }

            return message;
          },
        },
      );
    },
    [],
  );

  const handleDownloadCode = useCallback(async () => {
    toast.promise(
      async () => {
        downloadBlob(new Blob([code]), `${buildName}.ts`);
      },
      {
        loading: `Downloading ${buildName}.ts...`,
        success: `Downloaded ${buildName}.ts`,
        error: `Failed to download ${buildName}.ts`,
      },
    );
  }, [code, buildName]);

  const handleCopyCodeToClipboard = useCallback(async () => {
    toast.promise(
      async () => {
        await navigator.clipboard.writeText(code);
      },
      {
        loading: `Copying ${buildName}.ts to clipboard...`,
        success: `Copied ${buildName}.ts to clipboard`,
        error: `Failed to copy ${buildName}.ts to clipboard`,
      },
    );
  }, [code, buildName]);

  const handleDownloadPng = useCallback(
    async (filename: string) => {
      toast.promise(getPngBlob(), {
        loading: `Downloading ${filename}...`,
        success(blob) {
          downloadBlob(blob, filename);
          return `Downloaded ${filename}`;
        },
        error(error) {
          let message = `Failed to download ${filename}`;
          if (error instanceof Error) {
            message = `${message}: ${error.message}`;
          }

          return message;
        },
      });
    },
    [getPngBlob],
  );

  const updateThumbnailScreenshot = useCallback(() => {
    if (screenshot.isReady) {
      try {
        const dataUrl = screenshot.capture({
          output: {
            format: 'image/webp',
            quality: 0.92,
          },
          zoomLevel: 1.8,
        });

        updateThumbnail(dataUrl);
        console.log('Thumbnail updated successfully');
      } catch (error) {
        console.error('Error updating thumbnail:', error);
      }
    } else {
      console.log('Screenshot is not ready, skipping thumbnail update');
    }
  }, [screenshot, updateThumbnail]);

  const handleUpdateThumbnail = useCallback(() => {
    toast.promise(
      async () => {
        updateThumbnailScreenshot();
      },
      {
        loading: 'Updating thumbnail...',
        success: 'Thumbnail updated',
        error: 'Failed to update thumbnail',
      },
    );
  }, [updateThumbnailScreenshot]);

  // Subscribe to the cadActor to update the thumbnail when the shapes change
  useEffect(() => {
    const subscription = cadActor.on('geometryEvaluated', (event) => {
      if (event.shapes.length > 0) {
        console.log('updating thumbnail');
        // TODO: remove this timeout after refining the canvas state to provide a more accurate signal after painting completes
        const timeout = setTimeout(() => {
          updateThumbnailScreenshot();
          clearTimeout(timeout);
        }, 100);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [updateThumbnailScreenshot]);

  const handleCopyPngToClipboard = useCallback(async () => {
    toast.promise(
      async () => {
        // Get the screenshot as a blob
        const dataUrl = screenshot.capture({
          output: {
            format: 'image/png',
            quality: 0.92,
            isPreview: false,
          },
        });

        // Convert dataURL to Blob
        const response = await fetch(dataUrl);
        const blob = await response.blob();

        // Copy to clipboard
        await navigator.clipboard.write([
          new ClipboardItem({
            [blob.type]: blob,
          }),
        ]);
      },
      {
        loading: `Copying ${buildName}.png to clipboard...`,
        success: `Copied ${buildName}.png to clipboard`,
        error: `Failed to copy ${buildName}.png to clipboard`,
      },
    );
  }, [buildName, screenshot]);

  const handleCopyDataUrlToClipboard = useCallback(async () => {
    toast.promise(
      async () => {
        const dataUrl = screenshot.capture({
          output: {
            format: 'image/webp',
            quality: 0.2,
            isPreview: true,
          },
        });

        // Copy to clipboard
        if (globalThis.isSecureContext) {
          void navigator.clipboard.writeText(dataUrl);
        } else {
          console.warn('Clipboard operations are only allowed in secure contexts.');
        }
      },
      {
        loading: `Copying data URL to clipboard...`,
        success: `Copied data URL to clipboard`,
        error: `Failed to copy data URL to clipboard`,
      },
    );
  }, [screenshot]);

  const buildItems = useMemo(
    (): ViewerControlItem[] => [
      {
        id: 'download-stl',
        label: 'Download STL',
        group: 'Export',
        icon: <BoxDown className="mr-2" />,
        action: async () => handleExport(buildName, 'stl'),
        disabled: shapes.length === 0,
      },
      {
        id: 'download-step',
        label: 'Download STEP',
        group: 'Export',
        icon: <BoxDown className="mr-2" />,
        action: async () => handleExport(buildName, 'step'),
        disabled: shapes.length === 0,
      },
      {
        id: 'update-thumbnail',
        label: 'Update thumbnail',
        group: 'Build',
        icon: <GalleryThumbnails className="mr-2 size-4" />,
        action: handleUpdateThumbnail,
        disabled: !screenshot.isReady,
      },
      {
        id: 'copy-png',
        label: 'Copy PNG to clipboard',
        group: 'Build',
        icon: <Clipboard className="mr-2 size-4" />,
        action: handleCopyPngToClipboard,
        disabled: !screenshot.isReady,
      },
      {
        id: 'copy-data-url',
        label: 'Copy data URL to clipboard',
        group: 'Build',
        icon: <Clipboard className="mr-2 size-4" />,
        action: handleCopyDataUrlToClipboard,
        disabled: !screenshot.isReady,
      },
      {
        id: 'download-png',
        label: 'Download PNG',
        group: 'Build',
        icon: <ImageDown className="mr-2 size-4" />,
        action: async () => handleDownloadPng(`${buildName}.png`),
        disabled: !screenshot.isReady,
      },
      {
        id: 'copy-code',
        label: 'Copy code to clipboard',
        group: 'Code',
        icon: <Clipboard className="mr-2 size-4" />,
        action: handleCopyCodeToClipboard,
        disabled: !code,
      },
      {
        id: 'download-code',
        label: 'Download code',
        group: 'Code',
        icon: <Download className="mr-2 size-4" />,
        action: handleDownloadCode,
        disabled: !code,
      },
    ],
    [
      handleUpdateThumbnail,
      screenshot.isReady,
      handleCopyPngToClipboard,
      handleCopyDataUrlToClipboard,
      handleDownloadPng,
      buildName,
      handleExport,
      shapes,
      code,
      handleCopyCodeToClipboard,
      handleDownloadCode,
    ],
  );

  const groupedControlItems = useMemo(() => {
    const groupedControlItemsMap: Record<string, { name: string; items: ViewerControlItem[] }> = {};
    const groupOrder: string[] = [];

    for (const item of buildItems) {
      if (!groupedControlItemsMap[item.group]) {
        groupedControlItemsMap[item.group] = { name: item.group, items: [] };
        groupOrder.push(item.group);
      }

      groupedControlItemsMap[item.group].items.push(item);
    }

    return Object.values(groupedControlItemsMap).sort(
      (a, b) => groupOrder.indexOf(a.name) - groupOrder.indexOf(b.name),
    );
  }, [buildItems]);

  const renderControlItemLabel = (item: ViewerControlItem, _selectedItem: ViewerControlItem | undefined) => (
    <div className="flex items-center">
      {item.icon}
      {item.label}
    </div>
  );

  const getControlItemValue = (item: ViewerControlItem) => item.id;
  const isControlItemDisabled = (item: ViewerControlItem) => Boolean(item.disabled);

  return (
    <div
      className={cn(
        'absolute top-0 right-0 z-50 m-2 mr-12 flex flex-row justify-end gap-2 md:mr-22',
        'group-data-[parameters-open=true]/chat-layout:mr-12',
      )}
    >
      <Tooltip>
        <ComboBoxResponsive<ViewerControlItem>
          groupedItems={groupedControlItems}
          renderLabel={renderControlItemLabel}
          getValue={getControlItemValue}
          defaultValue={undefined}
          isDisabled={isControlItemDisabled}
          popoverContentClassName="w-60 z-50"
          searchPlaceHolder="Search actions..."
          placeholder="Actions"
          onSelect={(itemId) => {
            const selectedItem = buildItems.find((item) => item.id === itemId);
            selectedItem?.action();
          }}
        >
          <TooltipTrigger asChild>
            <Button variant="overlay" size="icon" className="text-muted-foreground">
              <Menu className="size-4" />
            </Button>
          </TooltipTrigger>
        </ComboBoxResponsive>
        <TooltipContent>More actions</TooltipContent>
      </Tooltip>
    </div>
  );
}
