import type { IChangeEvent } from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import { RefreshCcw, ChevronRight, Info } from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';
import Form from '@rjsf/core';
import type { RJSFSchema } from '@rjsf/utils';
import { SearchInput } from '#components/search-input.js';
import { Button } from '#components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { cn } from '#utils/ui.utils.js';
import { templates, uiSchema, widgets } from '#components/geometry/parameters/rjsf-theme.js';
import type { RJSFContext } from '#components/geometry/parameters/rjsf-theme.js';
import { rjsfIdPrefix, rjsfIdSeparator } from '#components/geometry/parameters/rjsf-utils.js';
import { deleteValueAtPath } from '#utils/object.utils.js';
import { EmptyItems } from '#components/ui/empty-items.js';
import { hasJsonSchemaObjectProperties } from '#utils/schema.utils.js';

type ParametersProperties = {
  readonly parameters: Record<string, unknown>;
  readonly defaultParameters: Record<string, unknown>;
  readonly jsonSchema: RJSFSchema | undefined;
  readonly onParametersChange: (parameters: Record<string, unknown>) => void;
  readonly className?: string;
  readonly enableSearch?: boolean;
  readonly searchPlaceholder?: string;
  readonly enableExpandAll?: boolean;
  readonly emptyMessage?: string;
  readonly emptyDescription?: string;
};

export function Parameters({
  parameters,
  defaultParameters,
  jsonSchema,
  onParametersChange,
  className,
  enableSearch = true,
  searchPlaceholder = 'Search parameters...',
  enableExpandAll = true,
  emptyMessage = 'No parameters available',
  emptyDescription = 'Parameters will appear here when they become available for this model',
}: ParametersProperties): React.JSX.Element {
  const [allExpanded, setAllExpanded] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const searchInputReference = React.useRef<HTMLInputElement>(null);

  const setParameters = useCallback(
    (newParameters: Record<string, unknown>) => {
      onParametersChange(newParameters);
    },
    [onParametersChange],
  );

  // Enhanced reset function that handles nested paths and arrays
  const resetSingleParameter = useCallback(
    (fieldPath: string[]) => {
      const currentParameters = { ...parameters };

      if (fieldPath.length === 0) {
        // Root level reset (shouldn't happen in normal usage)
        setParameters({});
        return;
      }

      const updatedParameters = deleteValueAtPath(currentParameters, fieldPath);

      setParameters(updatedParameters);
    },
    [parameters, setParameters],
  );

  const resetAllParameters = useCallback(() => {
    setParameters({});
  }, [setParameters]);

  const toggleAllGroups = useCallback(() => {
    const newExpandedState = !allExpanded;
    setAllExpanded(newExpandedState);
  }, [allExpanded]);

  const handleSearchChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchTerm('');
  }, []);

  const formContext = useMemo<RJSFContext>(
    () => ({
      allExpanded,
      searchTerm,
      resetSingleParameter,
      shouldShowField(text) {
        if (!searchTerm) {
          return true;
        }

        return text.toLowerCase().includes(searchTerm.toLowerCase());
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
    <div data-slot="parameters" className={cn('group flex h-full w-full flex-col', className)}>
      {hasParameters ? (
        <>
          {/* Search and Controls Bar */}
          {enableSearch || enableExpandAll ? (
            <div className="flex w-full flex-row gap-2 p-2">
              {enableSearch ? (
                <SearchInput
                  ref={searchInputReference}
                  placeholder={searchPlaceholder}
                  value={searchTerm}
                  className="h-7 w-full bg-background"
                  onChange={handleSearchChange}
                  onClear={clearSearch}
                />
              ) : null}

              {Object.keys(parameters).length > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="overlay"
                      size="icon"
                      className="size-7 text-muted-foreground transition-colors hover:text-foreground"
                      onClick={resetAllParameters}
                    >
                      <RefreshCcw />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Reset all parameters</TooltipContent>
                </Tooltip>
              )}

              {enableExpandAll && hasJsonSchemaObjectProperties(jsonSchema) ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="overlay"
                      size="icon"
                      className="size-7 text-muted-foreground transition-colors hover:text-foreground"
                      aria-expanded={allExpanded}
                      onClick={toggleAllGroups}
                    >
                      <ChevronRight
                        className={cn(
                          'size-4 transition-transform duration-300 ease-in-out',
                          allExpanded && 'rotate-90',
                        )}
                      />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{allExpanded ? 'Collapse all' : 'Expand all'}</TooltipContent>
                </Tooltip>
              ) : null}
            </div>
          ) : null}
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
            className="flex flex-1 flex-col px-0 py-0"
            onChange={handleChange}
            onSubmit={handleSubmit}
          />
        </>
      ) : (
        <EmptyItems>
          <div className="mb-3 rounded-full bg-muted/50 p-2">
            <Info className="size-6 text-muted-foreground" strokeWidth={1.5} />
          </div>
          <h3 className="mb-1 text-base font-medium">{emptyMessage}</h3>
          <p className="text-muted-foreground">{emptyDescription}</p>
        </EmptyItems>
      )}
    </div>
  );
}
