import { ReplicadViewer, type ReplicadViewerReference } from './replicad-viewer';
import { DownloadButton } from '@/components/download-button';
import { LoaderPinwheel, ImageDown, GalleryThumbnails, Clipboard } from 'lucide-react';
import { useReplicad } from './replicad-context';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BoxDown } from '@/components/icons/box-down';
import { Button } from '@/components/ui/button';
import { useBuild } from '@/hooks/use-build2';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from '@/components/ui/sonner';
import { cn } from '@/utils/ui';

export function ReplicadStudio() {
  const { status, downloadSTL, mesh } = useReplicad();
  const { updateThumbnail, build } = useBuild();
  const canvasReference = useRef<ReplicadViewerReference>(null);
  const [isScreenshotReady, setIsScreenshotReady] = useState(false);

  // Handle canvas ready state changes
  const handleCanvasReady = (ready: boolean) => {
    setIsScreenshotReady(ready);
  };

  const downloadPNG = async () => {
    if (!canvasReference.current || !isScreenshotReady) {
      throw new Error('Screenshot attempted before renderer was ready');
    }

    // Use the captureScreenshot method to render the scene on demand and capture it
    const dataURL = canvasReference.current.captureScreenshot({
      output: {
        format: 'image/png',
        quality: 0.92,
      },
    });

    // Convert dataURL to Blob
    const response = await fetch(dataURL);
    const blob = await response.blob();

    return blob;
  };

  const updateThumbnailScreenshot = useCallback(() => {
    if (!canvasReference.current || !isScreenshotReady) {
      throw new Error('Screenshot attempted before renderer was ready');
    }

    const dataURL = canvasReference.current.captureScreenshot({
      output: {
        format: 'image/webp',
        quality: 0.92,
      },
    });

    updateThumbnail(dataURL);
  }, [isScreenshotReady]);

  const handleUpdateThumbnail = async () => {
    updateThumbnailScreenshot();
    toast.success('Thumbnail updated');
  };

  // Automatically update the thumbnail when the mesh is loaded and the screenshot is ready
  useEffect(() => {
    if (mesh && isScreenshotReady && !status.isComputing) {
      // Update the thumbnail after a delay to allow the canvas to render
      const timeout = setTimeout(() => {
        updateThumbnailScreenshot();
      }, 500);

      return () => clearTimeout(timeout);
    }
  }, [mesh, isScreenshotReady, status.isComputing]);

  const copyToClipboard = async () => {
    if (!canvasReference.current || !isScreenshotReady) {
      throw new Error('Screenshot attempted before renderer was ready');
    }

    try {
      // Get the screenshot as a blob
      const dataURL = canvasReference.current.captureScreenshot({
        output: {
          format: 'image/png',
          quality: 0.92,
          isPreview: false,
        },
      });

      // Convert dataURL to Blob
      const response = await fetch(dataURL);
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
  };

  useEffect(() => {
    // Check if build exists, has no thumbnail, and screenshot capability is ready
    if (build && (!build.thumbnail || build.thumbnail === '') && isScreenshotReady) {
      // Automatically set the thumbnail
      try {
        updateThumbnailScreenshot();
      } catch (error) {
        console.error('Failed to auto-generate thumbnail:', error);
      }
    }
  }, [build, isScreenshotReady, updateThumbnailScreenshot]);

  return (
    <>
      <div className="flex size-full flex-row">
        <div className="relative min-w-0 flex-1">
          <ReplicadViewer
            mesh={mesh}
            zoomLevel={1.25}
            enableGizmo
            enableGrid
            enableZoom
            enableAxesHelper
            enableCameraControls
            ref={canvasReference}
            onCanvasReady={handleCanvasReady}
          />
          {/* Loading state, only show when mesh is loaded and computing */}
          {mesh && (status.isComputing || status.isBuffering) && (
            <div className="absolute top-[90%] left-[50%] -translate-x-[50%] -translate-y-[90%]">
              <div className="border-neutral-200 m-auto flex items-center gap-2 rounded-md border bg-background/70 p-2 backdrop-blur-sm">
                <span className="font-mono text-sm text-muted-foreground">
                  {status.isBuffering ? 'Buffering...' : 'Rendering...'}
                </span>
                <LoaderPinwheel className="h-6 w-6 animate-spin text-primary ease-in-out" />
              </div>
            </div>
          )}
          <div className="absolute bottom-0 left-0">
            {status.error && (
              <div className="rounded-tr-md bg-destructive/10 p-0.5 text-xs text-destructive">{status.error}</div>
            )}
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
              onClick={handleUpdateThumbnail}
              className="group relative text-muted-foreground"
              disabled={!isScreenshotReady}
            >
              {isScreenshotReady ? (
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
              onClick={copyToClipboard}
              className="group relative text-muted-foreground"
              disabled={!isScreenshotReady}
            >
              {isScreenshotReady ? (
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
          getBlob={downloadPNG}
          title={`${build?.name}.png`}
          className="text-muted-foreground"
          tooltip={isScreenshotReady ? 'Download PNG' : 'Preparing renderer...'}
          disabled={!isScreenshotReady}
        >
          {isScreenshotReady ? (
            <ImageDown className="size-4" />
          ) : (
            <LoaderPinwheel className="animate-spin ease-in-out" />
          )}
        </DownloadButton>
        <DownloadButton
          variant="overlay"
          size="icon"
          getBlob={downloadSTL}
          title={`${build?.name}.stl`}
          className="group text-muted-foreground"
          disabled={!mesh}
          tooltip="Download STL"
        >
          {mesh ? <BoxDown /> : <LoaderPinwheel className="animate-spin ease-in-out" />}
        </DownloadButton>
      </div>
    </>
  );
}
