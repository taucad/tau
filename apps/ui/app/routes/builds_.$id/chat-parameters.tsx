import type { IChangeEvent } from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import { RefreshCcw, ChevronRight, Info, XIcon, SlidersHorizontal } from 'lucide-react';
import React, { useCallback, useMemo, memo, useState } from 'react';
import { useSelector } from '@xstate/react';
import Form from '@rjsf/core';
import type { RJSFSchema } from '@rjsf/utils';
import { SearchInput } from '#components/search-input.js';
import { Button } from '#components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import {
  FloatingPanel,
  FloatingPanelClose,
  FloatingPanelContent,
  FloatingPanelContentHeader,
  FloatingPanelContentTitle,
  FloatingPanelTrigger,
} from '#components/ui/floating-panel.js';
import { useKeydown } from '#hooks/use-keydown.js';
import type { KeyCombination } from '#utils/keys.utils.js';
import { formatKeyCombination } from '#utils/keys.utils.js';
import { cn } from '#utils/ui.utils.js';
import { useBuild } from '#hooks/use-build.js';
import { templates, uiSchema, widgets } from '#routes/builds_.$id/rjsf-theme.js';
import type { RJSFContext } from '#routes/builds_.$id/rjsf-theme.js';
import { rjsfIdPrefix, rjsfIdSeparator } from '#routes/builds_.$id/rjsf-utils.js';
import { deleteValueAtPath } from '#utils/object.utils.js';
import { EmptyItems } from '#components/ui/empty-items.js';

const toggleParametersKeyCombination = {
  key: 'x',
  ctrlKey: true,
} satisfies KeyCombination;

const focusSearchKeyCombination = {
  key: 'x',
  ctrlKey: true,
  shiftKey: true,
} satisfies KeyCombination;

// Parameters Trigger Component
export const ChatParametersTrigger = memo(function ({
  isOpen,
  onToggle,
}: {
  readonly isOpen: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <FloatingPanelTrigger
      icon={SlidersHorizontal}
      tooltipContent={
        <div className="flex items-center gap-2">
          {isOpen ? 'Close' : 'Open'} Parameters
          <KeyShortcut variant="tooltip">{formatKeyCombination(toggleParametersKeyCombination)}</KeyShortcut>
        </div>
      }
      className={isOpen ? 'text-primary' : undefined}
      onClick={onToggle}
    />
  );
});

export const ChatParameters = memo(function (props: {
  readonly className?: string;
  readonly isExpanded?: boolean;
  readonly setIsExpanded?: (value: boolean | ((current: boolean) => boolean)) => void;
}) {
  const { cadRef: cadActor } = useBuild();
  const { className, isExpanded = true, setIsExpanded } = props;
  const parameters = useSelector(cadActor, (state) => state.context.parameters);
  const defaultParameters = useSelector(cadActor, (state) => state.context.defaultParameters);
  const jsonSchema = useSelector(cadActor, (state) => state.context.jsonSchema);
  const [allExpanded, setAllExpanded] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const searchInputReference = React.useRef<HTMLInputElement>(null);

  const toggleParametersOpen = useCallback(() => {
    setIsExpanded?.((current) => !current);
  }, [setIsExpanded]);

  const { formattedKeyCombination: formattedParametersKeyCombination } = useKeydown(
    toggleParametersKeyCombination,
    toggleParametersOpen,
  );

  const focusSearchInput = useCallback(() => {
    // Open parameters panel if it's not already open
    if (!isExpanded) {
      setIsExpanded?.(true);
    }

    // Focus the search input
    // Use RAF to ensure DOM is updated AND painted before focusing the input
    requestAnimationFrame(() => {
      searchInputReference.current?.focus();
    });
  }, [isExpanded, setIsExpanded]);

  const { formattedKeyCombination: formattedSearchKeyCombination } = useKeydown(
    focusSearchKeyCombination,
    focusSearchInput,
  );

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

  const formContext = useMemo(
    () => ({
      allExpanded,
      searchTerm,
      resetSingleParameter,
      shouldShowField(text: string) {
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
    <FloatingPanel isOpen={isExpanded} side="right" className={className} onOpenChange={setIsExpanded}>
      <FloatingPanelClose
        icon={XIcon}
        tooltipContent={(isOpen) => (
          <div className="flex items-center gap-2">
            {isOpen ? 'Close' : 'Open'} Parameters
            <KeyShortcut variant="tooltip">{formattedParametersKeyCombination}</KeyShortcut>
          </div>
        )}
      />
      <FloatingPanelContent className="text-sm">
        {/* Header */}
        <FloatingPanelContentHeader>
          <FloatingPanelContentTitle>Parameters</FloatingPanelContentTitle>
        </FloatingPanelContentHeader>

        {hasParameters ? (
          <>
            {/* Search and Controls Bar */}
            <div className="flex w-full flex-row gap-2 p-2">
              <SearchInput
                ref={searchInputReference}
                placeholder="Search parameters..."
                value={searchTerm}
                className="h-8 w-full bg-background"
                keyboardShortcut={formattedSearchKeyCombination}
                onChange={handleSearchChange}
                onClear={clearSearch}
              />

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
                  <TooltipContent side="bottom">Reset all parameters</TooltipContent>
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
                <TooltipContent side="bottom">{allExpanded ? 'Collapse all' : 'Expand all'}</TooltipContent>
              </Tooltip>
            </div>
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
              className="flex size-full flex-col overflow-y-auto px-0 py-0"
              onChange={handleChange}
              onSubmit={handleSubmit}
            />
          </>
        ) : (
          <EmptyItems>
            <div className="mb-3 rounded-full bg-muted/50 p-2">
              <Info className="size-6 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <h3 className="mb-1 text-base font-medium">No parameters available</h3>
            <p className="text-muted-foreground">
              Parameters will appear here when they become available for this model
            </p>
          </EmptyItems>
        )}
      </FloatingPanelContent>
    </FloatingPanel>
  );
});
