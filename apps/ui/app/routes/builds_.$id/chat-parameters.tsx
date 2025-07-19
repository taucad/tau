import type { IChangeEvent } from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import { RefreshCcw, ChevronRight, Search, X, Info } from 'lucide-react';
import React, { useCallback, useMemo, memo, useState } from 'react';
import { useSelector } from '@xstate/react';
import Form from '@rjsf/core';
import type { RJSFSchema } from '@rjsf/utils';
import { categorizeParameters } from '~/routes/builds_.$id/chat-parameters-sorter.js';
import { toSentenceCase } from '~/utils/string.js';
import { Input } from '~/components/ui/input.js';
import { Button } from '~/components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip.js';
import { cn } from '~/utils/ui.js';
import { cadActor } from '~/routes/builds_.$id/cad-actor.js';
import { templates, uiSchema, widgets } from '~/routes/builds_.$id/rjsf-theme.js';
import type { RJSFContext } from '~/routes/builds_.$id/rjsf-theme.js';
import { deleteNestedValue, rjsfIdSeparator, resetArrayItem, rjsfIdPrefix } from '~/routes/builds_.$id/rjsf-utils.js';

export const ChatParameters = memo(function () {
  const parameters = useSelector(cadActor, (state) => state.context.parameters);
  const defaultParameters = useSelector(cadActor, (state) => state.context.defaultParameters);
  const jsonSchema = useSelector(cadActor, (state) => state.context.jsonSchema);
  const [allExpanded, setAllExpanded] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const setParameters = useCallback((newParameters: Record<string, unknown>) => {
    cadActor.send({ type: 'setParameters', parameters: newParameters });
  }, []);

  // Enhanced reset function that handles nested paths and arrays
  const resetSingleParameter = useCallback(
    (fieldPath: string[]) => {
      const currentParameters = { ...parameters };

      if (fieldPath.length === 0) {
        // Root level reset (shouldn't happen in normal usage)
        setParameters({});
        return;
      }

      // Check if this might be an array item by looking for numeric indices
      const hasNumericIndex = fieldPath.some((segment) => /^\d+$/.test(segment));

      let updatedParameters: Record<string, unknown>;

      // eslint-disable-next-line unicorn/prefer-ternary -- better readability
      if (hasNumericIndex) {
        // Handle array item reset
        updatedParameters = resetArrayItem(currentParameters, fieldPath);
      } else {
        // Handle regular property reset
        updatedParameters = deleteNestedValue(currentParameters, fieldPath);
      }

      setParameters(updatedParameters);
    },
    [parameters, setParameters],
  );

  const { hasSearchResults } = useMemo(() => {
    const parameterEntries = Object.entries(defaultParameters);

    // Use the imported categorizeParameters function
    const parameterGroups = categorizeParameters(parameterEntries);

    // Filter groups based on search term
    const filteredGroups: Record<string, Array<[string, unknown]>> = {};
    let hasSearchResults = false;

    if (searchTerm) {
      const searchTermLower = searchTerm.toLowerCase();
      // For each group, check if any parameter matches the search term
      for (const [groupName, entries] of Object.entries(parameterGroups)) {
        const matchingEntries = entries.filter(([key]) => {
          const prettyKey = toSentenceCase(key).toLowerCase();
          return prettyKey.includes(searchTermLower);
        });

        if (matchingEntries.length > 0) {
          filteredGroups[groupName] = matchingEntries;
          hasSearchResults = true;
        }
      }
    } else {
      // No search term, show all groups
      Object.assign(filteredGroups, parameterGroups);
      hasSearchResults = true;
    }

    return {
      filteredGroups,
      hasSearchResults,
    };
  }, [searchTerm, defaultParameters]);

  const resetAllParameters = useCallback(() => {
    setParameters({});
  }, [setParameters]);

  const toggleAllGroups = useCallback(() => {
    const newExpandedState = !allExpanded;
    setAllExpanded(newExpandedState);
  }, [allExpanded]);

  const handleSearchChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value.toLowerCase());
  }, []);

  const clearSearch = useCallback(() => {
    setSearchTerm('');
  }, []);

  const containerXpadding = 'px-2';
  const containerYpadding = 'py-4 md:py-2';

  const formContext = useMemo(
    () => ({
      allExpanded,
      searchTerm: searchTerm.toLowerCase(),
      resetSingleParameter,
      shouldShowField(prettyLabel: string) {
        if (!searchTerm) return true;
        const searchableLabel = prettyLabel.toLowerCase();
        return searchableLabel.includes(searchTerm.toLowerCase());
      },
    }),
    [allExpanded, searchTerm, resetSingleParameter],
  );

  const mergedData = { ...defaultParameters, ...parameters };
  const hasParameters = jsonSchema && Object.keys(mergedData).length > 0;

  const handleChange = (event: IChangeEvent<Record<string, unknown>, RJSFSchema, RJSFContext>) => {
    setParameters(event.formData ?? {});
  };

  const handleSubmit = (event: IChangeEvent<Record<string, unknown>, RJSFSchema, RJSFContext>) => {
    setParameters(event.formData ?? {});
  };

  return (
    <div className="flex h-full flex-col">
      <div className={cn('border-b text-base font-medium text-muted-foreground', containerXpadding)}>
        <h2 className="flex h-11 items-center">Parameters</h2>
      </div>

      {hasParameters ? (
        <>
          {/* Search and Controls Bar */}
          <div className={cn('flex w-full flex-row gap-2', containerXpadding, 'py-2')}>
            <div className="relative w-full">
              <Input
                autoComplete="off"
                type="text"
                placeholder="Search parameters..."
                value={searchTerm}
                className="h-7 w-full bg-background pr-8 pl-8"
                onChange={handleSearchChange}
              />
              <Search className="absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
              {searchTerm ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-1/2 right-1 size-5 -translate-y-1/2 p-0 text-muted-foreground hover:text-foreground"
                  onClick={clearSearch}
                >
                  <X className="size-3.5" />
                </Button>
              ) : null}
            </div>

            {Object.keys(parameters).length > 0 && (
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
            <div className={cn('py-4 text-center text-muted-foreground', containerXpadding)}>
              No parameters matching &quot;{searchTerm}&quot;
            </div>
          ) : (
            <Form<Record<string, unknown>, RJSFSchema, RJSFContext>
              // @ts-expect-error -- TODO: fix this
              validator={validator}
              // @ts-expect-error -- TODO: fix this
              templates={templates}
              schema={jsonSchema}
              // @ts-expect-error -- TODO: fix this
              uiSchema={uiSchema}
              idPrefix={rjsfIdPrefix}
              idSeparator={rjsfIdSeparator}
              widgets={widgets}
              formData={mergedData}
              formContext={formContext}
              className={cn('flex size-full flex-col gap-2 overflow-y-auto pb-2', containerXpadding)}
              onChange={handleChange}
              onSubmit={handleSubmit}
            />
          )}
        </>
      ) : (
        <div
          className={cn(
            'm-4 mt-2 flex h-full flex-col items-center justify-center rounded-md border border-dashed p-8 text-center md:m-2',
            containerXpadding,
            containerYpadding,
          )}
        >
          <div className="mb-3 rounded-full bg-muted/50 p-2">
            <Info className="size-6 text-muted-foreground" strokeWidth={1.5} />
          </div>
          <h3 className="mb-1 text-base font-medium">No parameters available</h3>
          <p className="text-muted-foreground">Parameters will appear here when they become available for this model</p>
        </div>
      )}
    </div>
  );
});
