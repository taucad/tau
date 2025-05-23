import { RefreshCcw, RefreshCcwDot, ChevronRight, Search, X, Info } from 'lucide-react';
import React, { useCallback, useMemo, memo, useState } from 'react';
import { useSelector } from '@xstate/react';
import { categorizeParameters } from '~/routes/builds_.$id/chat-parameters-sorter.js';
import { camelCaseToSentenceCase } from '~/utils/string.js';
import { Slider } from '~/components/ui/slider.js';
import { Switch } from '~/components/ui/switch.js';
import { Input } from '~/components/ui/input.js';
import { ChatParametersInputNumber } from '~/routes/builds_.$id/chat-parameters-input-number.js';
import { Button } from '~/components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip.js';
import { cn } from '~/utils/ui.js';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '~/components/ui/collapsible.js';
import { cadActor } from '~/routes/builds_.$id/cad-actor.js';

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

export const ChatParameters = memo(function () {
  const parameters = useSelector(cadActor, (state) => state.context.parameters);
  const defaultParameters = useSelector(cadActor, (state) => state.context.defaultParameters);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [allExpanded, setAllExpanded] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const setParameters = useCallback((newParameters: Record<string, unknown>) => {
    cadActor.send({ type: 'setParameters', parameters: newParameters });
  }, []);

  const { validParameters, allParameters, parameterGroups, filteredGroups, hasSearchResults } = useMemo(() => {
    const validParameters = validateParameters(parameters, defaultParameters);
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

    if (searchTerm) {
      const searchTermLower = searchTerm.toLowerCase();
      // For each group, check if any parameter matches the search term
      for (const [groupName, entries] of Object.entries(parameterGroups)) {
        const matchingEntries = entries.filter(([key]) => {
          const prettyKey = camelCaseToSentenceCase(key).toLowerCase();
          return prettyKey.includes(searchTermLower);
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
  }, [allExpanded, searchTerm, defaultParameters, parameters]);

  const handleParameterChange = useCallback(
    (key: string, value: unknown) => {
      // Update parameters directly
      setParameters({
        ...parameters,
        [key]: value,
      });
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
    setSearchTerm(event.target.value.toLowerCase());
  }, []);

  const clearSearch = useCallback(() => {
    setSearchTerm('');
  }, []);

  // Replace the isParameterMatch function with getHighlightedText
  const getHighlightedText = useCallback(
    (text: string): React.ReactNode => {
      if (!searchTerm) return text;

      const searchTermLower = searchTerm.toLowerCase();
      const textLower = text.toLowerCase();
      const index = textLower.indexOf(searchTermLower);

      if (index === -1) return text;

      return (
        <>
          {text.slice(0, Math.max(0, index))}
          <span className="font-bold text-primary">{text.slice(index, index + searchTermLower.length)}</span>
          {text.slice(Math.max(0, index + searchTermLower.length))}
        </>
      );
    },
    [searchTerm],
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
      if (type === 'number') {
        // Convert to number if it's a string that looks like a number
        const numericValue = Number.parseFloat(String(value));

        return (
          <div className="flex w-full flex-row items-center gap-2">
            <Slider
              value={[numericValue]}
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
                value={numericValue}
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
          autoComplete="off"
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

  const containerXpadding = 'px-4 md:px-2';
  const containerYpadding = 'py-4 md:py-2';

  const hasParameters = allParameters && Object.keys(allParameters).length > 0;

  return (
    <div className="flex h-full flex-col">
      <h1
        className={cn(
          'flex h-10 w-full flex-row items-center gap-2 text-lg font-medium',
          containerXpadding,
          'pt-2 pb-0 md:pt-3',
        )}
      >
        <span>Parameters</span>
        {hasParameters ? <span className="text-muted-foreground/50">({Object.keys(allParameters).length})</span> : null}
      </h1>
      {hasParameters ? (
        <>
          <div className={cn('flex w-full flex-row gap-2', containerXpadding, 'pt-2 pb-0 md:pt-4')}>
            <div className="relative w-full">
              <Input
                autoComplete="off"
                type="text"
                placeholder="Search parameters..."
                value={searchTerm}
                className="h-8 w-full bg-background pr-8 pl-8 text-sm"
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
            {Object.keys(validParameters).length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="overlay"
                    size="icon"
                    className="text-muted-foreground transition-colors hover:text-foreground"
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
                  className="text-muted-foreground transition-colors hover:text-foreground"
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

          {!hasSearchResults && searchTerm ? (
            <div className={cn('py-4 text-center text-sm text-muted-foreground', containerXpadding)}>
              No parameters matching &quot;{searchTerm}&quot;
            </div>
          ) : (
            <div className={cn('space-y-2 overflow-y-auto', containerXpadding, containerYpadding, 'pt-3 md:pt-3')}>
              {Object.entries(filteredGroups).map(([groupName, entries]) => (
                <Collapsible
                  key={groupName}
                  open={openGroups[groupName]}
                  className="overflow-hidden rounded-md border border-border/40"
                  onOpenChange={() => {
                    toggleGroup(groupName);
                  }}
                >
                  <CollapsibleTrigger className="group/collapsible flex w-full items-center justify-between bg-muted/70 p-2 transition-colors hover:bg-muted">
                    <h3 className="text-sm font-medium">
                      {groupName} <span className="text-muted-foreground/50">({entries.length})</span>
                    </h3>
                    <ChevronRight className="size-4 text-muted-foreground transition-transform duration-300 ease-in-out group-data-[state=open]/collapsible:rotate-90" />
                  </CollapsibleTrigger>

                  <CollapsibleContent className="p-1">
                    {entries.map(([key, value], index, parameterArray) => {
                      const prettyKey = camelCaseToSentenceCase(key);
                      const isLast = index === parameterArray.length - 1;

                      return (
                        <div key={key}>
                          <div
                            className={cn(
                              '@container/parameter flex flex-col gap-1.5 rounded-md p-2 transition-colors hover:bg-muted/30',
                            )}
                          >
                            <div className="flex h-auto min-h-6 flex-row justify-between gap-2">
                              <div className="flex flex-row items-baseline gap-2">
                                <span className={cn(parameters[key] === undefined ? 'font-normal' : 'font-medium')}>
                                  {getHighlightedText(prettyKey)}
                                </span>
                                <span className="hidden text-xs text-muted-foreground @[10rem]/parameter:block">
                                  {typeof value}
                                </span>
                              </div>
                              {parameters[key] !== undefined && (
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
              ))}
            </div>
          )}
        </>
      ) : (
        <div
          className={cn(
            'm-4 mt-2 flex h-full flex-col items-center justify-center rounded-md border border-dashed p-8 text-center md:m-2 md:mt-4',
            containerXpadding,
            containerYpadding,
          )}
        >
          <div className="mb-3 rounded-full bg-muted/50 p-2">
            <Info className="size-6 text-muted-foreground" strokeWidth={1.5} />
          </div>
          <h3 className="mb-1 text-base font-medium">No parameters available</h3>
          <p className="text-sm text-muted-foreground">
            Parameters will appear here when they become available for this model
          </p>
        </div>
      )}
    </div>
  );
});
