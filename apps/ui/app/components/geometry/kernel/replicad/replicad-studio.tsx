import { ReplicadViewer } from './replicad-viewer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { DownloadButton } from '@/components/download-button';
import { LoaderPinwheel, PencilRuler } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { pascalCaseToWords } from '@/utils/string';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useReplicad } from './replicad-context';

export function ReplicadStudio() {
  const { isComputing, error, downloadSTL, mesh, isBuffering, setParameters, parameters } = useReplicad();

  return (
    <>
      <div className="relative flex flex-col h-full">
        <ReplicadViewer mesh={mesh} />
        {/* Loading state, only show when mesh is loaded and computing */}
        {mesh && (isComputing || isBuffering) && (
          <div className="absolute top-[90%] left-[50%] -translate-x-[50%] -translate-y-[90%]">
            <div className="m-auto flex items-center gap-2 bg-background/70 border border-neutral-200 backdrop-blur-sm p-2 rounded-md">
              <span className="text-sm font-mono text-muted-foreground">
                {isBuffering ? 'Buffering...' : 'Rendering...'}
              </span>
              <LoaderPinwheel className="w-6 h-6 animate-spin text-primary ease-in-out" />
            </div>
          </div>
        )}
        <div className="absolute bottom-0 left-0">
          {error && <div className="text-destructive p-0.5 rounded-tr-md bg-destructive/10 text-xs">{error}</div>}
        </div>
      </div>
      <div className="absolute top-0 right-0 flex flex-row justify-end gap-1.5 m-1.5 mr-12">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="text-muted-foreground rounded-md flex flex-row gap-2">
              <PencilRuler className="w-4 h-4" />
              <span>Edit</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            onInteractOutside={(event) => {
              event.preventDefault();
            }}
            className="mr-1.5 mt-1.5 text-sm backdrop-blur-sm bg-background/50 rounded-md flex flex-col gap-2 justify-between"
          >
            <span className="font-bold text-lg">Parameters</span>
            {parameters &&
              Object.entries(parameters).map(([key, value]) => {
                const valueType = typeof value;

                return (
                  <div key={key} className="flex flex-row justify-between gap-4 items-center">
                    <div className="flex flex-col gap-1 w-full">
                      <span>{pascalCaseToWords(key)}</span>
                      {valueType === 'number' && (
                        <Slider
                          value={[value]}
                          min={0}
                          max={200}
                          step={1}
                          onValueChange={([newValue]) => setParameters(key, Number(newValue))}
                        />
                      )}
                    </div>
                    <div className="flex gap-3">
                      {valueType === 'boolean' ? (
                        <Switch size="lg" checked={value} onCheckedChange={(checked) => setParameters(key, checked)} />
                      ) : valueType === 'number' ? (
                        <>
                          <Input
                            type="number"
                            value={value}
                            onChange={(event) => setParameters(key, Number.parseFloat(event.target.value))}
                            className="w-12 h-8 p-1 bg-background"
                          />
                        </>
                      ) : undefined}
                    </div>
                  </div>
                );
              })}
          </PopoverContent>
        </Popover>
        <DownloadButton
          variant="outline"
          size="icon"
          getBlob={downloadSTL}
          title="model.stl"
          className="text-muted-foreground"
        />
      </div>
    </>
  );
}
