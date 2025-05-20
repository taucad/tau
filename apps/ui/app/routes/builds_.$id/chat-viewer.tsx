import { LoaderPinwheel, ImageDown, GalleryThumbnails, Clipboard } from 'lucide-react';
import { memo, useCallback, useEffect, useRef } from 'react';
import { useSelector } from '@xstate/react';
import { useGraphics } from '~/components/geometry/graphics/graphics-context.js';
import { CadViewer } from '~/components/geometry/cad/cad-viewer.js';
import { DownloadButton } from '~/components/download-button.js';
import { BoxDown } from '~/components/icons/box-down.js';
import { Button } from '~/components/ui/button.js';
import { useBuild } from '~/hooks/use-build.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip.js';
import { toast } from '~/components/ui/sonner.js';
import { cn } from '~/utils/ui.js';
import { CameraControl } from '~/components/geometry/cad/camera-control.js';
import { GridSizeIndicator } from '~/components/geometry/cad/grid-control.js';
import { ResetCameraControl } from '~/components/geometry/cad/reset-camera-control.js';
import { cadActor } from '~/routes/builds_.$id/cad-actor.js';
import { ChatViewerError } from '~/routes/builds_.$id/chat-viewer-error.js';

export const ChatViewer = memo(function () {
  const state = useSelector(cadActor, (state) => state.context.state);
  const shapes = useSelector(cadActor, (state) => state.context.shapes);
  const { updateThumbnail, build } = useBuild();
  const { screenshot } = useGraphics();

  const downloadStl = useCallback(async () => {
    return new Promise<Blob>((resolve, reject) => {
      cadActor.send({ type: 'exportShape', format: 'stl' });
      cadActor.subscribe((state) => {
        if (state.context.exportedBlob) {
          resolve(state.context.exportedBlob);
        } else if (state.matches('error') && typeof state.context.error === 'string') {
          reject(new Error(state.context.error));
        }
      });
    });
  }, []);

  // Add refs to track shapes and update state
  const lastShapesRef = useRef(shapes);

  const downloadPng = async () => {
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

    return blob;
  };

  const updateThumbnailScreenshot = useCallback(() => {
    if (shapes.length > 0 && screenshot.isReady && state === 'success') {
      const timeout = setTimeout(() => {
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

          // Update refs after successful update
          lastShapesRef.current = shapes;
        } catch (error) {
          console.error('Error updating thumbnail:', error);
        }
      }, 100);
      return () => {
        clearTimeout(timeout);
      };
    }
  }, [shapes, screenshot, state, updateThumbnail]);

  const handleUpdateThumbnail = useCallback(() => {
    updateThumbnailScreenshot();
    toast.success('Thumbnail updated');
  }, [updateThumbnailScreenshot]);

  // Modified effect to only update when shapes or build changes
  useEffect(() => {
    // Only trigger update when shapes changes (not just rendering state)
    const shapesChanged = shapes !== lastShapesRef.current;

    if (shapesChanged && shapes.length > 0 && screenshot.isReady && state === 'success') {
      console.log('Updating thumbnail - shapes or build changed');
      updateThumbnailScreenshot();
    }
  }, [shapes, screenshot.isReady, state, updateThumbnailScreenshot]);

  useEffect(() => {
    // Check if build exists, has no thumbnail, and screenshot capability is ready
    if (
      (!build?.thumbnail || build?.thumbnail === '') &&
      screenshot.isReady &&
      shapes.length > 0 &&
      state === 'success'
    ) {
      // Automatically set the thumbnail
      try {
        updateThumbnailScreenshot();
      } catch (error) {
        console.error('Failed to auto-generate thumbnail:', error);
      }
    }
  }, [build?.thumbnail, screenshot.isReady, shapes, state, updateThumbnailScreenshot]);

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
      <div className="relative size-full">
        <CadViewer enableGizmo enableGrid enableZoom enableAxesHelper shapes={shapes} zoomLevel={1.25} />
        <ChatViewerError />

        {/* Camera and grid controls */}
        <div className="absolute bottom-0 left-0 z-10 m-2">
          <div className="flex items-center gap-2">
            <CameraControl defaultAngle={60} className="w-60" />
            <GridSizeIndicator />
            <ResetCameraControl />
          </div>
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
          getBlob={downloadPng}
          title={`${build?.name}.png`}
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
          getBlob={downloadStl}
          title={`${build?.name}.stl`}
          className="group text-muted-foreground"
          disabled={shapes.length === 0}
          tooltip="Download STL"
        >
          {shapes.length > 0 ? <BoxDown /> : <LoaderPinwheel className="animate-spin ease-in-out" />}
        </DownloadButton>
      </div>
    </>
  );
});
