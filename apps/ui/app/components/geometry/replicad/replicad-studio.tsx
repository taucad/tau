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
  const { isComputing, error, downloadSTL } = useReplicadCode();

  const handleParameterChange = (key: string, value: any) => {
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
    <div className="flex flex-col h-full">
      <div className="flex-1 relative">
        <ReplicadViewer code={state.code} parameters={state.parameters} />
        {isComputing && (
          <div className="absolute flex items-center justify-center">
            <LoaderPinwheel className="w-8 h-8 animate-spin" />
          </div>
        )}
      </div>
      <div className="absolute top-0 right-11 z-10 flex flex-row justify-end gap-2 m-2">
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="text-muted-foreground rounded-md flex flex-row">
              <PencilRuler className="w-4 h-4 mr-2" />
              <span>Edit</span>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="text-sm absolute w-[90vw] md:w-96 top-12 -right-11 z-10 backdrop-blur-sm border p-2 rounded-md flex flex-col gap-1 justify-between">
              <span className="font-bold text-lg">Parameters</span>
              {error && <div className="text-destructive">{error}</div>}

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
                        <Switch checked={value} onCheckedChange={(checked) => handleParameterChange(key, checked)} />
                      ) : valueType === 'number' ? (
                        <>
                          <Slider
                            defaultValue={[value]}
                            min={0}
                            max={value * 2 || 100}
                            step={0.1}
                            onValueChange={([newValue]) => handleParameterChange(key, Number(newValue))}
                          />
                          <Input
                            type="number"
                            value={value}
                            onChange={(event) => handleParameterChange(key, Number.parseFloat(event.target.value))}
                            className="w-20 h-8"
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
    </div>
  );
}
