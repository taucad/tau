import type { IChangeEvent } from '@rjsf/core';
import { Info } from 'lucide-react';
import React, { useCallback, useDeferredValue, useMemo, useState } from 'react';
import Form from '@rjsf/core';
import type { RJSFSchema } from '@rjsf/utils';
import { SearchInput } from '@taucad/ui/components/search-input';
import { cn } from '@taucad/ui/utils/cn';
import { templates, uiSchema, widgets } from '#parameters/rjsf-theme.jsx';
import { rjsfFields } from '#parameters/rjsf-field-path.jsx';
import type { ParameterEdit, RJSFContext, Units } from '#parameters/rjsf-context.js';
import {
  mergeFormDefaults,
  normalizeRjsfFormData,
  resetRjsfField,
  rjsfDefaultFormStateBehavior,
  rjsfIdPrefix,
  rjsfIdSeparator,
} from '#parameters/rjsf-utils.js';
import { extractModifiedProperties } from '#utils/object.js';
import { PanelEmptyState } from '@taucad/ui/components/panel-empty-state';
import { rjsfValidator } from '#parameters/rjsf-validator.js';
import type { ParameterManifest } from '@taucad/parameters';
import type { ParameterGroup } from '@taucad/types';

type ParametersProperties = {
  readonly parameters: Record<string, unknown>;
  readonly defaultParameters: Record<string, unknown>;
  readonly jsonSchema: RJSFSchema | undefined;
  /**
   * The group's modified values after a change, and the modified values the change was made from. An
   * authority writes only the fields that differ between them, so a stale rendered value of another
   * field is never written back.
   */
  readonly onParametersChange: (parameters: Record<string, unknown>, base: Record<string, unknown>) => void;
  readonly className?: string;
  readonly enableSearch?: boolean;
  readonly filterTerm?: string;
  readonly searchPlaceholder?: string;
  readonly emptyMessage?: string;
  readonly emptyDescription?: string;
  readonly units: Units;
  readonly isInitialExpanded?: boolean;
  readonly isAllExpanded?: boolean;
  readonly parameterManifest: ParameterManifest;
  readonly parameterGroup?: ParameterGroup;
  readonly parameterEdit: ParameterEdit;
  /** Render the root rows without the standalone catalog card. */
  readonly presentation?: 'catalog' | 'embedded';
};

/* oxlint-disable react/set-state-in-effect -- The `use no memo` boundary preserves the existing controlled search reset and focus timing. */
/**
 * Renders the parameter form for a model from its JSON schema, with optional filtering and group expansion.
 *
 * @param props - The parameter values, defaults, schema, change handler and display options.
 * @returns The parameters panel.
 * @public
 */
export function Parameters({
  parameters,
  defaultParameters,
  jsonSchema,
  onParametersChange,
  className,
  enableSearch = true,
  filterTerm,
  searchPlaceholder = 'Filter parameters…',
  emptyMessage = 'No parameters available',
  emptyDescription = 'Parameters will appear here when they become available for this model',
  units,
  isInitialExpanded = true,
  isAllExpanded,
  parameterManifest,
  parameterGroup,
  parameterEdit,
  presentation = 'catalog',
}: ParametersProperties): React.JSX.Element {
  'use no memo';

  // Use controlled state if provided, otherwise use initial value
  const allExpanded = isAllExpanded ?? isInitialExpanded;
  const [localFilterTerm, setLocalFilterTerm] = useState('');
  const activeFilterTerm = filterTerm ?? localFilterTerm;
  const searchInputReference = React.useRef<HTMLInputElement>(null);
  // Ref to track current form data from RJSF's onChange handler
  const currentFormDataRef = React.useRef<Record<string, unknown>>({});
  // Ref to track previous enableSearch value to detect changes
  const previousEnableSearchRef = React.useRef(enableSearch);

  // Focus the search input when search changes from disabled to enabled (not on initial render)
  React.useEffect(() => {
    const wasDisabled = !previousEnableSearchRef.current;
    const isNowEnabled = enableSearch;

    // Only focus if transitioning from disabled to enabled
    if (wasDisabled && isNowEnabled && searchInputReference.current) {
      searchInputReference.current.focus();
    }

    previousEnableSearchRef.current = enableSearch;
  }, [enableSearch]);

  // Clear search term when search is hidden
  React.useEffect(() => {
    if (!enableSearch) {
      setLocalFilterTerm('');
    }
  }, [enableSearch]);

  const setParameters = useCallback(
    (newParameters: Record<string, unknown>, baseParameters: Record<string, unknown>) => {
      // Extract only modified parameters before calling onParametersChange
      onParametersChange(
        extractModifiedProperties(newParameters, defaultParameters),
        extractModifiedProperties(baseParameters, defaultParameters),
      );
    },
    [onParametersChange, defaultParameters],
  );

  const resetSingleParameter = useCallback<RJSFContext['resetSingleParameter']>(
    (input) => {
      const base = currentFormDataRef.current;
      const updatedParameters = resetRjsfField({ ...input, formData: base });
      if (updatedParameters !== undefined) {
        currentFormDataRef.current = updatedParameters;
        setParameters(updatedParameters, base);
      }
    },
    [setParameters],
  );

  const handleSearchChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setLocalFilterTerm(event.target.value);
  }, []);

  const clearSearch = useCallback(() => {
    setLocalFilterTerm('');
  }, []);

  /* The term invalidates every field, so the search box paints first and the row pass follows as
   * interruptible work that later keystrokes coalesce. */
  const deferredFilterTerm = useDeferredValue(activeFilterTerm);
  const authority = parameterEdit.kind === 'authoritative' ? parameterEdit.commit : undefined;
  const disclosure = useMemo(
    () => ({ allExpanded, authority, choices: new Map<string, boolean>() }),
    [allExpanded, authority],
  );
  const formContext = useMemo<RJSFContext>(
    () => ({
      idPrefix: rjsfIdPrefix,
      rootPresentation: presentation,
      allExpanded,
      disclosure,
      searchTerm: deferredFilterTerm,
      resetSingleParameter,
      defaultParameters,
      shouldShowField(text) {
        if (!deferredFilterTerm) {
          return true;
        }

        return text.toLowerCase().includes(deferredFilterTerm.toLowerCase());
      },
      units,
      parameterManifest,
      parameterGroup,
      parameterEdit,
      presentation,
    }),
    [
      allExpanded,
      disclosure,
      deferredFilterTerm,
      resetSingleParameter,
      defaultParameters,
      units,
      parameterManifest,
      parameterGroup,
      parameterEdit,
    ],
  );

  const mergedData = useMemo(
    () => mergeFormDefaults(jsonSchema ?? {}, defaultParameters, parameters),
    [jsonSchema, defaultParameters, parameters],
  );
  /* A number row shows its own draft while it is being edited, so the form's re-render is never what
   * acknowledges an edit; deferring it keeps the whole RJSF tree off the urgent path while every
   * widget still settles on the committed data. */
  const deferredData = useDeferredValue(mergedData);
  const hasParameters = jsonSchema && Object.keys(jsonSchema.properties ?? {}).length > 0;

  // Initialize the ref with the current edited parameters when component mounts or data changes
  React.useEffect(() => {
    currentFormDataRef.current = mergedData;
  }, [mergedData]);

  const handleChange = (event: IChangeEvent<Record<string, unknown>, RJSFSchema, RJSFContext>) => {
    if (!jsonSchema) {
      return;
    }
    const formData = normalizeRjsfFormData(jsonSchema, event.formData ?? {}) as Record<string, unknown>;
    // The change was made on what the form rendered, which can trail the record.
    const base = normalizeRjsfFormData(jsonSchema, deferredData) as Record<string, unknown>;
    currentFormDataRef.current = formData;
    setParameters(formData, base);
  };

  return (
    <div
      data-slot='parameters'
      /* Fields are 24px for a mouse and the 40px touch row under a coarse pointer, so every typed
       * value, select and boolean row is a phone-sized target (I3). Inputs take 16px type there so
       * iOS does not zoom the page on focus. */
      className={cn(
        'group flex w-full flex-col [--param-field-h:1.5rem] pointer-coarse:[--param-field-h:2.5rem] pointer-coarse:[&_input]:text-base',
        presentation === 'catalog' && 'h-full',
        className,
      )}
      style={
        {
          '--param-field-radius': 'var(--radius-md)',
          '--param-field-color': 'var(--color-muted-foreground)',
          '--param-field-color-focus': 'var(--color-foreground)',
        } as React.CSSProperties
      }
    >
      {hasParameters ? (
        <>
          {/* Search Bar */}
          {enableSearch ? (
            <div className='flex w-full flex-row gap-1.5 border-b bg-sidebar px-2 py-1.5'>
              <SearchInput
                ref={searchInputReference}
                aria-label={searchPlaceholder}
                placeholder={searchPlaceholder}
                value={localFilterTerm}
                className='h-6 w-full bg-background text-sm pointer-coarse:h-10'
                onChange={handleSearchChange}
                onClear={clearSearch}
              />
            </div>
          ) : null}
          <Form<Record<string, unknown>, RJSFSchema, RJSFContext>
            tagName={presentation === 'embedded' ? 'div' : 'form'}
            validator={rjsfValidator}
            templates={templates}
            schema={jsonSchema}
            uiSchema={uiSchema}
            idPrefix={rjsfIdPrefix}
            idSeparator={rjsfIdSeparator}
            widgets={widgets}
            fields={rjsfFields}
            formData={deferredData}
            formContext={formContext}
            experimental_defaultFormStateBehavior={rjsfDefaultFormStateBehavior}
            className='flex flex-1 scroll-shadows-y flex-col overflow-x-hidden px-0 py-0 [--scroll-fade-end:transparent] [--scroll-fade-size:28px]'
            onChange={handleChange}
          />
        </>
      ) : (
        <PanelEmptyState icon={Info} title={emptyMessage} description={emptyDescription} />
      )}
    </div>
  );
}
/* oxlint-enable react/set-state-in-effect */
