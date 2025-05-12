import { LoaderPinwheel, ImageDown, GalleryThumbnails, Clipboard } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import type { JSX } from 'react';
import { useGraphics } from '../graphics/graphics-context.js';
import { CadViewer } from '@/components/geometry/kernel/cad-viewer.js';
import { useCad } from '@/components/geometry/kernel/cad-context.js';
import { DownloadButton } from '@/components/download-button.js';
import { BoxDown } from '@/components/icons/box-down.js';
import { Button } from '@/components/ui/button.js';
import { useBuild } from '@/hooks/use-build2.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';
import { toast } from '@/components/ui/sonner.js';
import { cn } from '@/utils/ui.js';

export function CadStudio(): JSX.Element {
  const { status, downloadStl, mesh } = useCad();
  const { updateThumbnail, build } = useBuild();
  const { screenshot } = useGraphics();

  // Add refs to track mesh and update state
  const lastMeshRef = useRef(mesh);
  const lastBuildIdRef = useRef(build ? build.id : undefined);

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
    if (mesh && screenshot.isReady && !status.isComputing) {
      const timeout = setTimeout(() => {
        try {
          const dataUrl = screenshot.capture({
            output: {
              format: 'image/webp',
              quality: 0.92,
            },
          });

          updateThumbnail(dataUrl);
          console.log('Thumbnail updated successfully');

          // Update refs after successful update
          lastMeshRef.current = mesh;
          lastBuildIdRef.current = build ? build.id : undefined;
        } catch (error) {
          console.error('Error updating thumbnail:', error);
        }
      }, 100);
      return () => {
        clearTimeout(timeout);
      };
    }
  }, [mesh, screenshot, status.isComputing, updateThumbnail, build]);

  const handleUpdateThumbnail = useCallback(() => {
    updateThumbnailScreenshot();
    toast.success('Thumbnail updated');
  }, [updateThumbnailScreenshot]);

  // Modified effect to only update when mesh or build changes
  useEffect(() => {
    // Only trigger update when mesh changes (not just rendering state)
    const meshChanged = mesh !== lastMeshRef.current;
    const buildIdChanged = build && build.id !== lastBuildIdRef.current;

    if ((meshChanged || buildIdChanged) && mesh && screenshot.isReady && !status.isComputing) {
      console.log('Updating thumbnail - mesh or build changed');
      updateThumbnailScreenshot();
    }
  }, [mesh, build, screenshot.isReady, status.isComputing, updateThumbnailScreenshot]);

  useEffect(() => {
    // Check if build exists, has no thumbnail, and screenshot capability is ready
    if (build && (!build.thumbnail || build.thumbnail === '') && screenshot.isReady && mesh && !status.isComputing) {
      // Automatically set the thumbnail
      try {
        updateThumbnailScreenshot();
      } catch (error) {
        console.error('Failed to auto-generate thumbnail:', error);
      }
    }
  }, [build, screenshot.isReady, mesh, status.isComputing, updateThumbnailScreenshot]);

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
      <div className="flex size-full flex-row">
        <div className="relative min-w-0 flex-1">
          <CadViewer
            enableGizmo
            enableGrid
            enableZoom
            enableAxesHelper
            enableCameraControls
            mesh={mesh}
            zoomLevel={1.25}
          />
          {/* Loading state, only show when mesh is loaded and computing */}
          {mesh && (status.isComputing || status.isBuffering) ? (
            <div className="absolute top-[90%] left-[50%] -translate-x-[50%] -translate-y-[90%]">
              <div className="border-neutral-200 m-auto flex items-center gap-2 rounded-md border bg-background/70 p-2 backdrop-blur-sm">
                <span className="font-mono text-sm text-muted-foreground">
                  {status.isBuffering ? 'Buffering...' : 'Rendering...'}
                </span>
                <LoaderPinwheel className="h-6 w-6 animate-spin text-primary ease-in-out" />
              </div>
            </div>
          ) : null}
          <div className="absolute bottom-12 left-2">
            {status.error ? (
              <div className="rounded-md bg-destructive/10 px-3 py-0.5 text-xs text-destructive">{status.error}</div>
            ) : null}
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
              // Disabled={!screenshot.isReady}
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
          disabled={!mesh}
          tooltip="Download STL"
        >
          {mesh ? <BoxDown /> : <LoaderPinwheel className="animate-spin ease-in-out" />}
        </DownloadButton>
      </div>
    </>
  );
}
