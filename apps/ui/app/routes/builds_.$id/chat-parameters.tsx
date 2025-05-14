import { RefreshCcw, RefreshCcwDot, ChevronRight, Search, X } from 'lucide-react';
import { useCallback, useMemo, memo, useState, useEffect } from 'react';
import { categorizeParameters } from '@/routes/builds_.$id/chat-parameters-sorter.js';
import { pascalCaseToWords } from '@/utils/string.js';
import { Slider } from '@/components/ui/slider.js';
import { Switch } from '@/components/ui/switch.js';
import { Input } from '@/components/ui/input.js';
import { ChatParametersInputNumber } from '@/routes/builds_.$id/chat-parameters-input-number.js';
import { useBuild } from '@/hooks/use-build2.js';
import { Button } from '@/components/ui/button.js';
import { useCad } from '@/components/geometry/cad/cad-context.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';
import { cn } from '@/utils/ui.js';
import { debounce } from '@/utils/functions.js';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible.js';

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
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [allExpanded, setAllExpanded] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

  // Sync local parameters with actual parameters
  useEffect(() => {
    setLocalParameters(parameters);
  }, [parameters]);

  // Debounce search term to prevent excessive re-renders
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.toLowerCase());
    }, 200);

    return () => {
      clearTimeout(handler);
    };
  }, [searchTerm]);

  const { validParameters, allParameters, parameterGroups, filteredGroups, hasSearchResults } = useMemo(() => {
    const validParameters = validateParameters(localParameters, defaultParameters);
    const allParameters = { ...defaultParameters, ...validParameters };
    const parameterEntries = Object.entries(allParameters);

    // Use the imported categorizeParameters function
    const parameterGroups = categorizeParameters(parameterEntries);

    // Initialize open state for new groups
    setOpenGroups((previous) => {
      const newState = { ...previous };
      for (const group of Object.keys(parameterGroups)) {
        newState[group] ??= allExpanded; // Default to current expanded state
      }

      return newState;
    });

    // Filter groups based on search term
    const filteredGroups: Record<string, Array<[string, unknown]>> = {};
    let hasSearchResults = false;

    if (debouncedSearchTerm) {
      // For each group, check if any parameter matches the search term
      for (const [groupName, entries] of Object.entries(parameterGroups)) {
        const matchingEntries = entries.filter(([key]) => {
          const prettyKey = pascalCaseToWords(key).toLowerCase();
          return prettyKey.includes(debouncedSearchTerm);
        });

        if (matchingEntries.length > 0) {
          filteredGroups[groupName] = matchingEntries;
          hasSearchResults = true;

          // Auto-expand groups with matching entries
          setOpenGroups((previous) => ({
            ...previous,
            [groupName]: true,
          }));
        }
      }
    } else {
      // No search term, show all groups
      Object.assign(filteredGroups, parameterGroups);
      hasSearchResults = true;
    }

    return {
      validParameters,
      allParameters,
      parameterGroups,
      filteredGroups,
      hasSearchResults,
    };
  }, [localParameters, defaultParameters, allExpanded, debouncedSearchTerm]);

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

  const toggleGroup = useCallback((group: string) => {
    setOpenGroups((previous) => ({
      ...previous,
      [group]: !previous[group],
    }));
  }, []);

  const toggleAllGroups = useCallback(() => {
    const newExpandedState = !allExpanded;
    setAllExpanded(newExpandedState);

    // Update all groups to match the new state
    if (parameterGroups) {
      setOpenGroups(Object.fromEntries(Object.keys(parameterGroups).map((group) => [group, newExpandedState])));
    }
  }, [allExpanded, parameterGroups]);

  const handleSearchChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchTerm('');
  }, []);

  // Determine if a parameter name matches the search term for highlighting
  const isParameterMatch = useCallback(
    (key: string): boolean => {
      if (!debouncedSearchTerm) return false;
      const prettyKey = pascalCaseToWords(key).toLowerCase();
      return prettyKey.includes(debouncedSearchTerm);
    },
    [debouncedSearchTerm],
  );

  const renderParameterInput = useCallback(
    (key: string, value: unknown) => {
      // Determine the type of parameter
      const type = typeof value;

      // If it's a boolean, render a switch
      if (type === 'boolean') {
        return (
          <Switch
            size="lg"
            checked={Boolean(value)}
            onCheckedChange={(checkedValue) => {
              handleParameterChange(key, checkedValue);
            }}
          />
        );
      }

      // If it's a number, render an appropriate numeric input
      if (type === 'number' || /^\d+(\.\d+)?$/.test(String(value))) {
        // Convert to number if it's a string that looks like a number
        const numericValue = type === 'number' ? value : Number.parseFloat(String(value));

        return (
          <div className="flex w-full flex-row items-center gap-2">
            <Slider
              value={[numericValue as number]}
              min={0}
              max={(defaultParameters[key] as number) * 4 || 100}
              step={1}
              className={cn(
                'flex-1',
                '[&_[data-slot="slider-track"]]:h-4',
                '[&_[data-slot="slider-track"]]:rounded-md',
                '[&_[data-slot="slider-thumb"]]:size-5.5',
                '[&_[data-slot="slider-thumb"]]:border-1',
                '[&_[data-slot="slider-thumb"]]:transition-transform',
                '[&_[data-slot="slider-thumb"]]:hover:scale-110',
                '[&_[data-slot="slider-track"]]:bg-muted',
              )}
              onValueChange={([newValue]) => {
                handleParameterChange(key, Number(newValue));
              }}
            />
            <div className="flex flex-row items-center">
              <ChatParametersInputNumber
                value={numericValue as number}
                className="h-6 w-12 bg-background p-1"
                name={key}
                onChange={(event) => {
                  handleParameterChange(key, Number.parseFloat(event.target.value));
                }}
              />
            </div>
          </div>
        );
      }

      // For string values, render a text input
      return (
        <Input
          type="text"
          value={String(value)}
          className="h-6 w-12 bg-background p-1"
          onChange={(event) => {
            handleParameterChange(key, event.target.value);
          }}
        />
      );
    },
    [handleParameterChange, defaultParameters],
  );

  return (
    <>
      <div className="mb-2 flex flex-col">
        <div className="relative mb-3">
          <Input
            type="text"
            placeholder="Search parameters..."
            value={searchTerm}
            className="h-8 pr-8 pl-8 text-sm"
            onChange={handleSearchChange}
          />
          <Search className="absolute top-2 left-2 size-4 text-muted-foreground" />
          {searchTerm ? (
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-1 right-1 size-6 p-0 text-muted-foreground hover:text-foreground"
              onClick={clearSearch}
            >
              <X className="size-3.5" />
            </Button>
          ) : null}
        </div>

        <div className="absolute top-0 right-0 flex gap-2">
          {Object.keys(validParameters).length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="overlay"
                  size="icon"
                  className="mt-2 text-muted-foreground transition-colors hover:text-foreground"
                  onClick={resetAllParameters}
                >
                  <RefreshCcw />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reset all parameters</TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="overlay"
                size="icon"
                className="mt-2 mr-12 text-muted-foreground transition-colors hover:text-foreground"
                aria-expanded={allExpanded}
                onClick={toggleAllGroups}
              >
                <ChevronRight
                  className={cn('size-4 transition-transform duration-300 ease-in-out', allExpanded && 'rotate-90')}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{allExpanded ? 'Collapse all' : 'Expand all'}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {!hasSearchResults && debouncedSearchTerm ? (
        <div className="py-4 text-center text-sm text-muted-foreground">
          No parameters matching &quot;{debouncedSearchTerm}&quot;
        </div>
      ) : null}

      <div className="space-y-3">
        {allParameters
          ? Object.entries(filteredGroups).map(([groupName, entries]) => (
              <Collapsible
                key={groupName}
                open={openGroups[groupName]}
                className="overflow-hidden rounded-md border border-border/40"
                onOpenChange={() => {
                  toggleGroup(groupName);
                }}
              >
                <CollapsibleTrigger className="group/collapsible flex w-full items-center justify-between bg-muted/30 p-2 transition-colors hover:bg-muted/50">
                  <h3 className="text-sm font-medium">{groupName}</h3>
                  <ChevronRight className="size-4 text-muted-foreground transition-transform duration-300 ease-in-out group-data-[state=open]/collapsible:rotate-90" />
                </CollapsibleTrigger>

                <CollapsibleContent className="p-1">
                  {entries.map(([key, value], index, parameterArray) => {
                    const prettyKey = pascalCaseToWords(key);
                    const isLast = index === parameterArray.length - 1;
                    const isMatch = isParameterMatch(key);

                    return (
                      <div key={key}>
                        <div
                          className={cn(
                            '@container/parameter flex flex-col gap-1.5 rounded-md p-2 transition-colors hover:bg-muted/30',
                          )}
                        >
                          <div className="flex h-auto min-h-6 flex-row justify-between gap-2">
                            <div className="flex flex-row items-baseline gap-2">
                              <span
                                className={cn(
                                  localParameters[key] === undefined ? 'font-normal' : 'font-medium',
                                  isMatch && 'font-medium text-primary',
                                )}
                              >
                                {prettyKey}
                              </span>
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
                                    className="text-muted-foreground opacity-70 transition-opacity hover:opacity-100"
                                    onClick={() => {
                                      resetSingleParameter(key);
                                    }}
                                  >
                                    <RefreshCcwDot className="size-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Reset &quot;{prettyKey}&quot;</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                          <div className="mt-auto flex w-full flex-row items-center gap-2">
                            {renderParameterInput(key, value)}
                          </div>
                        </div>
                        {!isLast && <div className="my-1 h-px w-full bg-border/30" />}
                      </div>
                    );
                  })}
                </CollapsibleContent>
              </Collapsible>
            ))
          : null}
      </div>
    </>
  );
});
