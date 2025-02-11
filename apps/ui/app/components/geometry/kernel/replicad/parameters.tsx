import { pascalCaseToWords } from '@/utils/string';
import { useReplicad } from './replicad-context';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';

export const Parameters = () => {
  const { setParameters, parameters } = useReplicad();
  return (
    <>
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
                      className="w-14 h-8 p-1 bg-background"
                    />
                  </>
                ) : undefined}
              </div>
            </div>
          );
        })}
    </>
  );
};
