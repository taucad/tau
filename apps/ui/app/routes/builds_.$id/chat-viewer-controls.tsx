import { Clipboard, LoaderPinwheel, GalleryThumbnails, ImageDown } from 'lucide-react';
import { useCallback, useEffect } from 'react';
import type { JSX } from 'react';
import { useSelector } from '@xstate/react';
import { DownloadButton } from '~/components/download-button.js';
import { BoxDown } from '~/components/icons/box-down.js';
import { Button } from '~/components/ui/button.js';
import { useBuildSelector } from '~/hooks/use-build.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip.js';
import { toast } from '~/components/ui/sonner.js';
import { cn } from '~/utils/ui.js';
import { CameraControl } from '~/components/geometry/cad/camera-control.js';
import { GridSizeIndicator } from '~/components/geometry/cad/grid-control.js';
import { ResetCameraControl } from '~/components/geometry/cad/reset-camera-control.js';
import { useGraphics } from '~/components/geometry/graphics/graphics-context.js';
import { cadActor } from '~/routes/builds_.$id/cad-actor.js';

export function ChatViewerControls(): JSX.Element {
  const shapes = useSelector(cadActor, (state) => state.context.shapes);
  const buildName = useBuildSelector((state) => state.build?.name);
  const updateThumbnail = useBuildSelector((state) => state.updateThumbnail);

  const { screenshot } = useGraphics();

  const downloadStl = useCallback(async (name: string) => {
    return new Promise<Blob>((resolve, reject) => {
      cadActor.send({ type: 'exportGeometry', format: 'stl' });
      const subscription = cadActor.subscribe((state) => {
        if (state.context.exportedBlob) {
          subscription.unsubscribe();
          toast.success(
            <p>
              Downloaded <span className="font-bold">{name}</span>
            </p>,
          );
          resolve(state.context.exportedBlob);
        } else if (state.matches('error') && typeof state.context.error === 'string') {
          toast.error(
            <p>
              Failed to download <span className="font-bold">{name}</span>
            </p>,
          );
          subscription.unsubscribe();
          reject(new Error(state.context.error));
        }
      });
    });
  }, []);

  const downloadPng = async (name: string) => {
    // Use the captureScreenshot method to render the scene on demand and capture it
    const dataUrl = screenshot.capture({
      output: {
        format: 'image/png',
        quality: 0.92,
      },
    });

    // Convert dataURL to Blob
    const response = await fetch(dataUrl);
    const blob = await response.blob();

    toast.success(
      <p>
        Downloaded <span className="font-bold">{name}</span>
      </p>,
    );

    return blob;
  };

  const updateThumbnailScreenshot = useCallback(() => {
    if (shapes.length > 0 && screenshot.isReady) {
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
    }
  }, [shapes, screenshot, updateThumbnail]);

  const handleUpdateThumbnail = useCallback(() => {
    updateThumbnailScreenshot();
    toast.success('Thumbnail updated');
  }, [updateThumbnailScreenshot]);

  // Subscribe the build to persist code & parameters changes
  useEffect(() => {
    const subscription = cadActor.subscribe((state) => {
      if (state.value === 'rendered' && state.context.shapes.length > 0) {
        console.log('updating thumbnail');
        // TODO: remove this timeout after refining the cad state machine to provide a more accurate signal
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

  const copyToClipboard = useCallback(async () => {
    try {
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

      toast.success('Image copied to clipboard');
    } catch (error) {
      console.error('Failed to copy image to clipboard:', error);
      toast.error('Failed to copy image to clipboard');
    }
  }, [screenshot]);

  return (
    <>
      <div className="absolute bottom-0 left-0 z-10 m-2">
        <div className="flex items-center gap-2">
          <CameraControl defaultAngle={60} className="w-60" />
          <GridSizeIndicator />
          <ResetCameraControl />
        </div>
      </div>
      <div
        className={cn(
          'absolute top-0 right-0 z-50 m-2 mr-12 flex flex-row justify-end gap-2 md:mr-22',
          'group-data-[parameters-open=true]/chat-layout:mr-12',
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="overlay"
              size="icon"
              className="group relative text-muted-foreground"
              disabled={!screenshot.isReady}
              onClick={handleUpdateThumbnail}
            >
              {screenshot.isReady ? (
                <GalleryThumbnails className="size-4" />
              ) : (
                <LoaderPinwheel className="animate-spin ease-in-out" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Update thumbnail</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="overlay"
              size="icon"
              className="group relative text-muted-foreground"
              disabled={!screenshot.isReady}
              onClick={copyToClipboard}
            >
              {screenshot.isReady ? (
                <Clipboard className="size-4" />
              ) : (
                <LoaderPinwheel className="animate-spin ease-in-out" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Copy to clipboard</TooltipContent>
        </Tooltip>

        <DownloadButton
          variant="overlay"
          size="icon"
          getBlob={async () => downloadPng(`${buildName}.png`)}
          title={`${buildName}.png`}
          className="text-muted-foreground"
          tooltip={screenshot.isReady ? 'Download PNG' : 'Preparing renderer...'}
          disabled={!screenshot.isReady}
        >
          {screenshot.isReady ? (
            <ImageDown className="size-4" />
          ) : (
            <LoaderPinwheel className="animate-spin ease-in-out" />
          )}
        </DownloadButton>
        <DownloadButton
          variant="overlay"
          size="icon"
          getBlob={async () => downloadStl(`${buildName}.stl`)}
          title={`${buildName}.stl`}
          className="group text-muted-foreground"
          disabled={shapes.length === 0}
          tooltip="Download STL"
        >
          {shapes.length > 0 ? <BoxDown /> : <LoaderPinwheel className="animate-spin ease-in-out" />}
        </DownloadButton>
      </div>
    </>
  );
}
