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
              <Button
                variant="outline"
                size="icon"
                onClick={resetAllParameters}
                className="mt-2 mr-12 text-muted-foreground"
              >
                <RefreshCcw />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reset all parameters</TooltipContent>
          </Tooltip>
        )}
      </div>
      {allParameters &&
        Object.entries(allParameters).map(([key, value]) => {
          const prettyKey = pascalCaseToWords(key);
          return (
            <div key={key} className="@container/parameter flex flex-col gap-0.5">
              <div className="flex h-auto min-h-6 flex-row justify-between gap-2">
                <div className="flex flex-row items-baseline gap-2">
                  <span className={cn(parameters[key] !== undefined && 'font-bold')}>{prettyKey}</span>
                  <span className="hidden text-xs text-muted-foreground @[10rem]/parameter:block">{typeof value}</span>
                </div>
                {parameters[key] !== undefined && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="xs"
                        className="text-muted-foreground"
                        onClick={() => resetSingleParameter(key)}
                      >
                        <RefreshCcwDot />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Reset "{prettyKey}"</TooltipContent>
                  </Tooltip>
                )}
              </div>
              <div className="mt-auto flex w-full flex-row gap-2">
                {typeof value === 'number' && (
                  <Slider
                    value={[value]}
                    min={0}
                    max={defaultParameters[key] * 4}
                    step={1}
                    onValueChange={([newValue]) => handleParameterChange(key, Number(newValue))}
                    className={cn(
                      //
                      '[&_[data-slot="slider-track"]]:h-4',
                      '[&_[data-slot="slider-track"]]:rounded-md',
                      '[&_[data-slot="slider-thumb"]]:size-5.5',
                      '[&_[data-slot="slider-thumb"]]:border-1',
                    )}
                  />
                )}
                {typeof value === 'boolean' ? (
                  <Switch
                    size="lg"
                    checked={value}
                    onCheckedChange={(checked) => handleParameterChange(key, checked)}
                  />
                ) : typeof value === 'number' ? (
                  <Input
                    type="number"
                    value={value}
                    onChange={(event) => handleParameterChange(key, Number.parseFloat(event.target.value))}
                    className="h-6 w-14 min-w-14 bg-background p-1"
                  />
                ) : typeof value === 'string' ? (
                  <Input
                    type="text"
                    value={value}
                    onChange={(event) => handleParameterChange(key, event.target.value)}
                    className="h-6 bg-background p-1"
                  />
                ) : // eslint-disable-next-line unicorn/no-null -- null is required by React
                null}
              </div>
            </div>
          );
        })}
    </>
  );
};
