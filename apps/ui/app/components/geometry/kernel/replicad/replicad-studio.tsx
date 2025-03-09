import { ReplicadViewer, type ReplicadViewerReference } from './replicad-viewer';
import { DownloadButton } from '@/components/download-button';
import { LoaderPinwheel, ImageDown, GalleryThumbnails } from 'lucide-react';
import { useReplicad } from './replicad-context';
import { useRef, useState } from 'react';
import { BoxDown } from '@/components/icons/box-down';
import { Button } from '@/components/ui/button';
import { useBuild } from '@/hooks/use-build2';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from '@/components/ui/sonner';

export function ReplicadStudio() {
  const { status, downloadSTL, mesh } = useReplicad();
  const { updateThumbnail } = useBuild();
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
    const dataURL = canvasReference.current.captureScreenshot?.() || '';

    // Convert dataURL to Blob
    const response = await fetch(dataURL);
    const blob = await response.blob();

    return blob;
  };

  const handleUpdateThumbnail = async () => {
    if (!canvasReference.current || !isScreenshotReady) {
      throw new Error('Screenshot attempted before renderer was ready');
    }

    const dataURL = canvasReference.current.captureScreenshot?.() || '';
    updateThumbnail(dataURL);
    toast.success('Thumbnail updated');
  };

  return (
    <>
      <div className="flex flex-row w-full h-full">
        <div className="relative flex-1 min-w-0">
          <ReplicadViewer
            mesh={mesh}
            enableGizmo
            enableGrid
            enableZoom
            ref={canvasReference}
            onCanvasReady={handleCanvasReady}
          />
          {/* Loading state, only show when mesh is loaded and computing */}
          {mesh && (status.isComputing || status.isBuffering) && (
            <div className="absolute top-[90%] left-[50%] -translate-x-[50%] -translate-y-[90%]">
              <div className="m-auto flex items-center gap-2 bg-background/70 border border-neutral-200 backdrop-blur-sm p-2 rounded-md">
                <span className="text-sm font-mono text-muted-foreground">
                  {status.isBuffering ? 'Buffering...' : 'Rendering...'}
                </span>
                <LoaderPinwheel className="w-6 h-6 animate-spin text-primary ease-in-out" />
              </div>
            </div>
          )}
          <div className="absolute bottom-0 left-0">
            {status.error && (
              <div className="text-destructive p-0.5 rounded-tr-md bg-destructive/10 text-xs">{status.error}</div>
            )}
          </div>
        </div>
      </div>
      <div className="absolute top-0 right-0 flex flex-row justify-end gap-2 m-2 mr-12 z-50">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              onClick={handleUpdateThumbnail}
              className="text-muted-foreground relative group"
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
        <DownloadButton
          variant="outline"
          size="icon"
          getBlob={downloadPNG}
          title="screenshot.png"
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
          variant="outline"
          size="icon"
          getBlob={downloadSTL}
          title="model.stl"
          className="text-muted-foreground group"
          disabled={!mesh}
          tooltip="Download STL"
        >
          {mesh ? <BoxDown /> : <LoaderPinwheel className="animate-spin ease-in-out" />}
        </DownloadButton>
      </div>
    </>
  );
}
