import { pascalCaseToWords } from '@/utils/string';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { useBuild } from '@/hooks/use-build2';
import { Button } from '@/components/ui/button';
import { useReplicad } from '@/components/geometry/kernel/replicad/replicad-context';
import { RefreshCcw, RefreshCcwDot } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/utils/ui';
import { useCallback, useMemo } from 'react';

/**
 * Filter parameters to only include the allowed parameters - allowed parameters are the keys of the default parameters
 *
 * @param parameters - The parameters to validate
 * @param defaultParameters - The default parameters
 * @returns The validated parameters
 */
export const validateParameters = (parameters: Record<string, unknown>, defaultParameters: Record<string, unknown>) => {
  const allowedParameters = Object.keys(defaultParameters || {});
  return Object.fromEntries(Object.entries(parameters).filter(([key]) => allowedParameters.includes(key)));
};

export const ChatParameters = () => {
  const { setParameters, parameters } = useBuild();
  const { defaultParameters } = useReplicad();

  const { validParameters, allParameters } = useMemo(() => {
    const validParameters = validateParameters(parameters, defaultParameters);
    const allParameters = { ...defaultParameters, ...validParameters };
    return { validParameters, allParameters };
  }, [parameters, defaultParameters]);

  const handleParameterChange = useCallback(
    (key: string, value: unknown) => {
      setParameters({ ...parameters, [key]: value });
    },
    [parameters, setParameters],
  );

  const resetAllParameters = useCallback(() => {
    setParameters({});
  }, [setParameters]);

  const resetSingleParameter = useCallback(
    (key: string) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [key]: _, ...rest } = parameters;
      setParameters(rest);
    },
    [parameters, setParameters],
  );

  return (
    <>
      {/* <div>Default</div>
      <div>{JSON.stringify(defaultParameters, undefined, 2)}</div>
      <div>Actual</div>
      <div>{JSON.stringify(parameters, undefined, 2)}</div> */}
      <div className="absolute top-0 right-0">
        {Object.keys(validParameters).length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" onClick={resetAllParameters} className="mr-12 mt-2">
                <RefreshCcw />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reset all parameters</TooltipContent>
          </Tooltip>
        )}
      </div>
      {allParameters &&
        Object.entries(allParameters).map(([key, value]) => {
          const valueType = typeof value;
          const prettyKey = pascalCaseToWords(key);
          return (
            <div key={key} className="flex flex-col gap-1">
              <div className="flex flex-row gap-2 justify-between">
                <div className="flex flex-row gap-2 items-baseline">
                  <span className={cn(parameters[key] !== undefined && 'font-bold')}>{prettyKey}</span>
                  <span className="text-xs text-muted-foreground">{valueType}</span>
                </div>
                {parameters[key] !== undefined && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="xs"
                        className="[&_svg]:text-muted-foreground"
                        onClick={() => resetSingleParameter(key)}
                      >
                        <RefreshCcwDot />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Reset {prettyKey}</TooltipContent>
                  </Tooltip>
                )}
              </div>
              <div className="flex flex-row gap-2 w-full mt-auto">
                {valueType === 'number' && (
                  <Slider
                    value={[value as number]}
                    min={0}
                    max={defaultParameters[key] * 4}
                    step={1}
                    onValueChange={([newValue]) => handleParameterChange(key, Number(newValue))}
                    className={cn(
                      //
                      '[&_[data-slot="track"]]:h-6',
                      '[&_[data-slot="track"]]:rounded-md',
                      '[&_[data-slot="thumb"]]:bg-primary',
                      '[&_[data-slot="thumb"]]:size-9',
                      '[&_[data-slot="thumb"]]:border-border',
                      '[&_[data-slot="thumb"]]:border-2',
                    )}
                  />
                )}
                {valueType === 'boolean' ? (
                  <Switch
                    size="lg"
                    checked={value as boolean}
                    onCheckedChange={(checked) => handleParameterChange(key, checked)}
                  />
                ) : valueType === 'number' ? (
                  <Input
                    type="number"
                    value={value as number}
                    onChange={(event) => handleParameterChange(key, Number.parseFloat(event.target.value))}
                    className="w-14 h-8 p-1 bg-background shadow-none"
                  />
                ) : valueType === 'string' ? (
                  <Input
                    type="text"
                    value={value as string}
                    onChange={(event) => handleParameterChange(key, event.target.value)}
                    className="h-8 p-1 bg-background shadow-none"
                  />
                ) : // eslint-disable-next-line unicorn/no-null
                null}
              </div>
            </div>
          );
        })}
    </>
  );
};
