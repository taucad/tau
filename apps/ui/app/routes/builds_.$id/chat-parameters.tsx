import { RefreshCcw, RefreshCcwDot } from 'lucide-react';
import { useCallback, useMemo, memo, useState, useEffect } from 'react';
import { pascalCaseToWords } from '@/utils/string.js';
import { Slider } from '@/components/ui/slider.js';
import { Switch } from '@/components/ui/switch.js';
import { Input } from '@/components/ui/input.js';
import { useBuild } from '@/hooks/use-build2.js';
import { Button } from '@/components/ui/button.js';
import { useCad } from '@/components/geometry/kernel/cad-context.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';
import { cn } from '@/utils/ui.js';
import { debounce } from '@/utils/functions.js';

/**
 * Filter parameters to only include the allowed parameters - allowed parameters are the keys of the default parameters
 *
 * @param parameters - The parameters to validate
 * @param defaultParameters - The default parameters
 * @returns The validated parameters
 */
const validateParameters = (parameters: Record<string, unknown>, defaultParameters: Record<string, unknown>) => {
  const allowedParameters = Object.keys(defaultParameters || {});
  return Object.fromEntries(Object.entries(parameters).filter(([key]) => allowedParameters.includes(key)));
};

export const ChatParameters = memo(function ({ debounceTime = 300 }: { readonly debounceTime?: number } = {}) {
  const { setParameters, parameters } = useBuild();
  const { defaultParameters } = useCad();
  const [localParameters, setLocalParameters] = useState(parameters);

  // Sync local parameters with actual parameters
  useEffect(() => {
    setLocalParameters(parameters);
  }, [parameters]);

  const { validParameters, allParameters } = useMemo(() => {
    const validParameters = validateParameters(localParameters, defaultParameters);
    const allParameters = { ...defaultParameters, ...validParameters };
    return { validParameters, allParameters };
  }, [localParameters, defaultParameters]);

  const debouncedSetParameters = useMemo(
    () =>
      debounce((newParameters: Record<string, unknown>) => {
        setParameters(newParameters);
      }, debounceTime),
    [setParameters, debounceTime],
  );

  const handleParameterChange = useCallback(
    (key: string, value: unknown) => {
      // Update local state immediately for responsive UI
      const newParameters = { ...localParameters, [key]: value };
      setLocalParameters(newParameters);

      // Debounce the actual parameter update
      void debouncedSetParameters(newParameters);
    },
    [localParameters, debouncedSetParameters],
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
                variant="overlay"
                size="icon"
                className="mt-2 mr-12 text-muted-foreground"
                onClick={resetAllParameters}
              >
                <RefreshCcw />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reset all parameters</TooltipContent>
          </Tooltip>
        )}
      </div>
      {allParameters
        ? Object.entries(allParameters).map(([key, value]) => {
            const prettyKey = pascalCaseToWords(key);
            return (
              <div key={key} className="@container/parameter flex flex-col gap-0.5">
                <div className="flex h-auto min-h-6 flex-row justify-between gap-2">
                  <div className="flex flex-row items-baseline gap-2">
                    <span className={cn(localParameters[key] !== undefined && 'font-bold')}>{prettyKey}</span>
                    <span className="hidden text-xs text-muted-foreground @[10rem]/parameter:block">
                      {typeof value}
                    </span>
                  </div>
                  {localParameters[key] !== undefined && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="xs"
                          className="text-muted-foreground"
                          onClick={() => {
                            resetSingleParameter(key);
                          }}
                        >
                          <RefreshCcwDot />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Reset &quot;{prettyKey}&quot;</TooltipContent>
                    </Tooltip>
                  )}
                </div>
                <div className="mt-auto flex w-full flex-row gap-2">
                  {typeof value === 'number' && (
                    <Slider
                      value={[value]}
                      min={0}
                      max={(defaultParameters[key] as number) * 4}
                      step={1}
                      className={cn(
                        //
                        '[&_[data-slot="slider-track"]]:h-4',
                        '[&_[data-slot="slider-track"]]:rounded-md',
                        '[&_[data-slot="slider-thumb"]]:size-5.5',
                        '[&_[data-slot="slider-thumb"]]:border-1',
                      )}
                      onValueChange={([newValue]) => {
                        handleParameterChange(key, Number(newValue));
                      }}
                    />
                  )}
                  {typeof value === 'boolean' ? (
                    <Switch
                      size="lg"
                      checked={value}
                      onCheckedChange={(checked) => {
                        handleParameterChange(key, checked);
                      }}
                    />
                  ) : typeof value === 'number' ? (
                    <Input
                      type="number"
                      value={value}
                      className="h-6 w-14 min-w-14 bg-background p-1"
                      onChange={(event) => {
                        handleParameterChange(key, Number.parseFloat(event.target.value));
                      }}
                    />
                  ) : typeof value === 'string' ? (
                    <Input
                      type="text"
                      value={value}
                      className="h-6 bg-background p-1"
                      onChange={(event) => {
                        handleParameterChange(key, event.target.value);
                      }}
                    />
                  ) : null}
                </div>
              </div>
            );
          })
        : null}
    </>
  );
});
