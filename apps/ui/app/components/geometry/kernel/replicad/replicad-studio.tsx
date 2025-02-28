import { ReplicadViewer } from './replicad-viewer';
import { DownloadButton } from '@/components/download-button';
import { LoaderPinwheel } from 'lucide-react';
import { useReplicad } from './replicad-context';

export function ReplicadStudio() {
  const { status, downloadSTL, mesh } = useReplicad();

  return (
    <>
      <div className="flex flex-row w-full h-full">
        <div className="relative flex-1 min-w-0">
          <ReplicadViewer mesh={mesh} />
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
      <div className="absolute top-0 right-0 flex flex-row justify-end gap-1.5 m-2 mr-12">
        <DownloadButton
          variant="outline"
          size="icon"
          getBlob={downloadSTL}
          title="model.stl"
          className="text-muted-foreground"
          tooltip="Download STL"
        />
      </div>
    </>
  );
}
