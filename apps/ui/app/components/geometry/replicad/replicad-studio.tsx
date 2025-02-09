import { useReplicad } from './context';
import { useReplicadCode } from './use-replicad-code';
import { ReplicadViewer } from './replicad-viewer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { DownloadButton } from '@/components/download-button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { LoaderPinwheel, PencilRuler } from 'lucide-react';
import { useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { pascalCaseToWords } from '@/utils/string';
import { cn } from '@/utils/ui';
import { mockCode } from '@/components/mock-code';

export function ReplicadStudio() {
  const { state, dispatch } = useReplicad();
  const { isComputing, error, downloadSTL, mesh, isBuffering } = useReplicadCode();

  const handleParameterChange = (key: string, value: any) => {
    console.log('updating parameter', key, value);
    dispatch({
      type: 'UPDATE_PARAMETER',
      payload: { key, value },
    });
  };

  const handleDownload = async () => {
    const blob = await downloadSTL();
    if (!blob) throw new Error('Failed to generate STL file');
    return blob;
  };

  useEffect(() => {
    dispatch({ type: 'SET_CODE', payload: mockCode });
  }, [dispatch]);

  return (
    <>
      <div className="relative flex flex-col h-full">
        <ReplicadViewer mesh={mesh} />
        {/* Loading state, only show when mesh is loaded and computing */}
        {mesh && (isComputing || isBuffering) && (
          <div className="absolute top-[80%] left-[50%] -translate-x-[50%] -translate-y-[80%]">
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
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="text-muted-foreground rounded-md flex flex-row gap-2">
              <PencilRuler className="w-4 h-4" />
              <span>Edit</span>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="text-sm absolute w-[90dvw] md:w-96 top-12 -right-11 z-10 backdrop-blur-sm bg-background/50 border p-2 rounded-md flex flex-col gap-1 justify-between">
              <span className="font-bold text-lg">Parameters</span>
              {Object.entries(state.parameters).map(([key, value]) => {
                const valueType = typeof value;

                return (
                  <div
                    key={key}
                    className={cn(
                      'flex flex-col justify-between',
                      valueType === 'boolean' && 'flex-row items-center gap-2 my-2',
                    )}
                  >
                    <div className="capitalize">{pascalCaseToWords(key)}</div>
                    <div className="flex gap-4">
                      {valueType === 'boolean' ? (
                        <Switch
                          size="lg"
                          checked={value}
                          onCheckedChange={(checked) => handleParameterChange(key, checked)}
                        />
                      ) : valueType === 'number' ? (
                        <>
                          <Slider
                            defaultValue={[value]}
                            min={0}
                            max={200}
                            step={1}
                            onValueChange={([newValue]) => handleParameterChange(key, Number(newValue))}
                          />
                          <Input
                            type="number"
                            value={value}
                            onChange={(event) => handleParameterChange(key, Number.parseFloat(event.target.value))}
                            className="w-12 h-8 p-1 bg-background"
                          />
                        </>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
        <DownloadButton
          variant="outline"
          size="icon"
          getBlob={handleDownload}
          title="model.stl"
          className="text-muted-foreground"
        />
      </div>
    </>
  );
}
