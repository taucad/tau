/* oxlint-disable react/prop-types -- causes false positives, they are actually typed */
import type {
  RegistryWidgetsType,
  TemplatesType,
  UiSchema,
  FieldTemplateProps,
  ObjectFieldTemplateProps,
  IconButtonProps,
  WidgetProps,
  ArrayFieldTemplateProps,
  ErrorListProps,
  RJSFSchema,
} from '@rjsf/utils';
import { ChevronDown } from 'lucide-react';
import { Fragment, useEffect, useState } from 'react';
import { Button } from '#components/ui/button.js';
import { Input } from '#components/ui/input.js';
import { ParametersBoolean } from '#components/geometry/parameters/parameters-boolean.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#components/ui/select.js';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '#components/ui/collapsible.js';
import { cn } from '#utils/ui.utils.js';
import { formatDisplayLabel } from '#utils/string.utils.js';
import { ModifiedIndicator } from '#components/ui/modified-indicator.js';
import { HighlightText } from '#components/highlight-text.js';
import { ParametersWidget } from '#components/geometry/parameters/parameters-widget.js';
import {
  rjsfIdToJsonPath,
  rjsfIdPrefix,
  rjsfIdSeparator,
  isSchemaMatchingSearch,
  getFieldDefaultValue,
} from '#components/geometry/parameters/rjsf-utils.js';
import { hasCustomValue } from '#utils/object.utils.js';
import { EmptyItems } from '#components/ui/empty-items.js';
import { InlineCode } from '#components/code/code-block.js';
import type { RJSFContext } from '#components/geometry/parameters/rjsf-context.js';

// Custom Field Template with Reset Button and Search Filtering
// oxlint-disable-next-line complexity -- consider refactoring.
function FieldTemplate(props: FieldTemplateProps<Record<string, unknown>, RJSFSchema, RJSFContext>): React.ReactNode {
  const { label, help, required, description, errors, children, schema, formData, id, registry } = props;

  if (schema.type === 'object' || schema.type === 'array') {
    const isRoot = id === rjsfIdPrefix;
    const { formContext } = registry;

    // If we're searching and this object/array has no matching nested properties, don't render it
    if (!isRoot && formContext.searchTerm && !isSchemaMatchingSearch(schema, formContext.searchTerm, label)) {
      return null;
    }

    return (
      <div data-slot='field-group' className='field-group group/field-group [&+.field-group]:mt-2'>
        {children}
      </div>
    );
  }

  // Always call hooks at the very top level
  const { formContext } = registry;
  const prettyLabel = formatDisplayLabel(label);
  const descriptionText = typeof schema.description === 'string' ? schema.description : '';

  // Check if we need to filter this field
  if (formContext.searchTerm) {
    // Check if this field matches the search
    const labelMatches = formContext.shouldShowField(prettyLabel);
    const descriptionMatches = descriptionText && formContext.shouldShowField(descriptionText);

    // If field doesn't match, check if it's inside a matching parent group
    // by checking the parent group names in the ID path
    let isInMatchingGroup = false;
    if (!labelMatches && !descriptionMatches) {
      // Parse the ID to extract parent group names (e.g., ///root///handrails///colors///post)
      const idParts = id.split(rjsfIdSeparator).filter(Boolean);
      // Skip 'root' and check if any parent segment matches
      for (let i = 1; i < idParts.length - 1; i++) {
        const parentSegment = idParts[i];
        if (parentSegment) {
          const parentName = formatDisplayLabel(parentSegment);
          // oxlint-disable-next-line max-depth -- consider refactoring.
          if (formContext.shouldShowField(parentName)) {
            isInMatchingGroup = true;
            break;
          }
        }
      }
    }

    const shouldShow = labelMatches || descriptionMatches || isInMatchingGroup;

    if (!shouldShow) {
      return null;
    }
  }

  // Convert RJSF ID to JSON path using schema-aware parsing
  const fieldPath = rjsfIdToJsonPath(id);

  // Get the appropriate default value (handles array items specially)
  const defaultValue = formContext.defaultParameters
    ? getFieldDefaultValue({
        fieldPath,
        formData,
        schemaDefault: schema.default,
        defaultParameters: formContext.defaultParameters,
      })
    : schema.default;

  const fieldHasValue = hasCustomValue(formData, defaultValue, fieldPath);

  const handleReset = () => {
    formContext.resetSingleParameter(fieldPath);
  };

  return (
    <div className='group/field @container/parameter my-1.5 flex flex-col gap-0.5 px-2.5 transition-colors'>
      <div className='flex items-center gap-2 @[240px]/parameter:flex-row'>
        <div className='flex min-w-0 shrink-0 items-center gap-1.5 @[240px]/parameter:w-[40%]'>
          <span
            className={cn(
              'truncate text-sm',
              fieldHasValue ? 'font-medium text-foreground' : 'font-normal text-muted-foreground',
            )}
            aria-label={`Parameter: ${prettyLabel}`}
          >
            <HighlightText text={prettyLabel} searchTerm={formContext.searchTerm} />
            {required ? <span className='text-destructive/50'>*</span> : null}
          </span>
          {fieldHasValue ? (
            <ModifiedIndicator
              onReset={handleReset}
              tooltip={`Reset ${prettyLabel}`}
              tooltipSide='left'
              className='group-hover/field:**:data-[slot=dot]:opacity-0 group-hover/field:**:data-[slot=icon]:opacity-100'
            />
          ) : null}
        </div>
        <div className='flex min-w-0 flex-1 items-center justify-end gap-2'>{children}</div>
      </div>
      {descriptionText ? (
        <div className='text-xs text-muted-foreground/70'>
          <HighlightText text={descriptionText} searchTerm={formContext.searchTerm} />
        </div>
      ) : (
        description
      )}
      {help}
      {errors}
    </div>
  );
}

// Custom Object Field Template with Collapsible and Search Filtering
function ObjectFieldTemplate(
  props: ObjectFieldTemplateProps<Record<string, unknown>, RJSFSchema, RJSFContext>,
): React.ReactNode {
  const { title, description, properties, idSchema, registry, schema } = props;

  const { formContext } = registry;

  const [isOpen, setIsOpen] = useState<boolean | undefined>(() => formContext.allExpanded);
  const isRoot = idSchema.$id === rjsfIdPrefix;

  useEffect(() => {
    setIsOpen(formContext.allExpanded);
  }, [formContext.allExpanded]);

  // Check if the group should be visible by checking:
  // 1. If the group title itself matches the search term, OR
  // 2. If any child properties (or their nested children) match
  const prettyTitle = formatDisplayLabel(title);
  const groupTitleMatches = formContext.shouldShowField(prettyTitle);

  // Use the schema to check if any nested properties match
  const hasMatchingNestedProperties = isSchemaMatchingSearch(schema, formContext.searchTerm);

  // Show the group if either the title matches OR any nested properties match
  const shouldShowGroup = groupTitleMatches || hasMatchingNestedProperties;

  // Force group open when there's an active search and this group has matches
  useEffect(() => {
    const hasActiveSearch = formContext.searchTerm.trim().length > 0;
    if (hasActiveSearch && shouldShowGroup) {
      setIsOpen(true);
    }
  }, [formContext.searchTerm, shouldShowGroup]);

  if (isRoot) {
    return (
      <div className='[&:has(.properties:not(:empty))_.no-params]:hidden'>
        <EmptyItems className='no-params break-all'>
          No parameters matching &quot;{formContext.searchTerm}&quot;
        </EmptyItems>
        <div
          data-slot='parameter-catalog'
          className='properties m-2 overflow-hidden rounded-xl border border-border bg-card p-1 empty:hidden'
        >
          {properties.map((element) => element.content)}
        </div>
      </div>
    );
  }

  // Don't render the group if neither title nor children would be visible
  if (!shouldShowGroup) {
    return null;
  }

  const totalPropertiesCount = properties.length;

  // Calculate filtered count when searching
  const isFiltering = formContext.searchTerm.trim().length > 0;
  const filteredPropertiesCount = isFiltering
    ? properties.filter((property) => {
        const propertyName = property.name;
        // Get the schema for this child property from the parent schema
        const childSchema = schema.properties?.[propertyName];
        if (!childSchema || typeof childSchema !== 'object' || Array.isArray(childSchema)) {
          return false;
        }

        // Check if this direct child property matches
        return isSchemaMatchingSearch(childSchema as RJSFSchema, formContext.searchTerm, propertyName);
      }).length
    : totalPropertiesCount;

  // Show filtered/total format when filtering and counts differ
  const isCountFiltered = isFiltering && filteredPropertiesCount !== totalPropertiesCount;
  const countDisplay = isCountFiltered
    ? `(${filteredPropertiesCount}/${totalPropertiesCount})`
    : `(${totalPropertiesCount})`;

  return (
    <Collapsible
      data-slot='parameter-group'
      open={isOpen}
      className='group/parameter-group w-full overflow-hidden rounded-lg border border-transparent transition-colors duration-150 data-[state=open]:border-border data-[state=open]:bg-background motion-reduce:transition-none'
      onOpenChange={setIsOpen}
    >
      <CollapsibleTrigger
        className='group/collapsible flex min-h-8 w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors duration-150 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset data-[state=open]:rounded-b-none motion-reduce:transition-none'
        aria-label={`Group: ${prettyTitle}`}
      >
        <h3 className='min-w-0 flex-1 truncate text-sm font-medium text-foreground'>
          <HighlightText text={prettyTitle} searchTerm={formContext.searchTerm} />
        </h3>
        <span className={cn('shrink-0 text-xs tabular-nums text-muted-foreground', isCountFiltered && 'italic')}>
          {countDisplay}
        </span>
        <ChevronDown
          aria-hidden='true'
          className='size-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-out group-data-[state=open]/collapsible:rotate-180 motion-reduce:transition-none'
        />
      </CollapsibleTrigger>

      <CollapsibleContent
        data-slot='parameter-group-content'
        className='border-t border-border/70 px-0 py-1 [&>.field-group]:mx-1'
      >
        {description ? <div className='px-2.5 py-1.5 text-xs text-muted-foreground'>{description}</div> : null}
        {properties.map((element) => element.content)}
      </CollapsibleContent>
    </Collapsible>
  );
}

function ArrayFieldTemplate(
  props: ArrayFieldTemplateProps<Record<string, unknown>, RJSFSchema, RJSFContext>,
): React.ReactNode {
  const { title, items, canAdd, onAddClick, registry, schema } = props;
  const { formContext } = registry;

  const [isOpen, setIsOpen] = useState<boolean | undefined>(() => formContext.allExpanded);

  useEffect(() => {
    setIsOpen(formContext.allExpanded);
  }, [formContext.allExpanded]);

  // Check if the array should be visible by checking:
  // 1. If the array title itself matches the search term, OR
  // 2. If the array items schema matches (indicating children would match)
  const prettyTitle = formatDisplayLabel(title);

  // Check if the schema or its title matches the search
  const shouldShowArray = isSchemaMatchingSearch(schema, formContext.searchTerm, title);

  // Force array open when there's an active search and this array has matches
  useEffect(() => {
    const hasActiveSearch = formContext.searchTerm.trim().length > 0;
    if (hasActiveSearch && shouldShowArray) {
      setIsOpen(true);
    }
  }, [formContext.searchTerm, shouldShowArray]);

  if (Array.isArray(schema.items)) {
    return (
      <div aria-label={`Invalid Field: ${title}`} className='rounded-md border border-warning bg-warning/10 p-2.5'>
        Fixed-length tuple fields are not supported.
      </div>
    );
  }

  // Don't render the array if it wouldn't be visible
  if (!shouldShowArray) {
    return null;
  }

  const itemCount = items.length;
  const countDisplay = `(${itemCount})`;

  return (
    <Collapsible
      data-slot='parameter-group'
      open={isOpen}
      className='group/parameter-group w-full overflow-hidden rounded-lg border border-transparent transition-colors duration-150 data-[state=open]:border-border data-[state=open]:bg-background motion-reduce:transition-none'
      onOpenChange={setIsOpen}
    >
      <CollapsibleTrigger
        className='group/collapsible flex min-h-8 w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors duration-150 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset data-[state=open]:rounded-b-none motion-reduce:transition-none'
        aria-label={`Group: ${prettyTitle}`}
      >
        <h3 className='min-w-0 flex-1 truncate text-sm font-medium text-foreground'>
          <HighlightText text={prettyTitle} searchTerm={formContext.searchTerm} />
        </h3>
        <span className='shrink-0 text-xs text-muted-foreground tabular-nums'>{countDisplay}</span>
        <ChevronDown
          aria-hidden='true'
          className='size-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-out group-data-[state=open]/collapsible:rotate-180 motion-reduce:transition-none'
        />
      </CollapsibleTrigger>

      <CollapsibleContent
        data-slot='parameter-group-content'
        className='border-t border-border/70 px-0 py-1 [&>.field-group]:mx-1'
      >
        {items.map((item) => (
          <Fragment key={item.key}>{item.children}</Fragment>
        ))}
        {canAdd ? (
          <Button type='button' variant='outline' size='sm' className='mx-2.5 my-1.5' onClick={onAddClick}>
            Add item ({prettyTitle})
          </Button>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}

// Custom Select Widget for Enums
function SelectWidget(props: WidgetProps): React.ReactNode {
  // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- value is untyped in RJSF
  const { options, value, onChange, placeholder, name } = props;

  const { enumOptions, enumDisabled } = options;

  if (!enumOptions) {
    throw new Error('No enum options provided');
  }

  const handleChange = (newValue: string) => {
    if (newValue === '') {
      onChange(undefined);
      return;
    }
    const matched = enumOptions.find((opt) => String(opt.value) === newValue);
    onChange(matched ? matched.value : newValue);
  };

  const prettyLabel = name ? formatDisplayLabel(name) : '';

  return (
    <Select value={String(value ?? '')} onValueChange={handleChange}>
      <SelectTrigger
        size='sm'
        className='h-(--param-field-h) min-w-0 flex-1 rounded-(--param-field-radius) border-border/50 bg-muted text-(--param-field-color) shadow-none transition-colors hover:border-border hover:text-(--param-field-color-focus) focus-visible:border-border focus-visible:text-(--param-field-color-focus) focus-visible:ring-0'
        aria-label={prettyLabel ? `Select for ${prettyLabel}` : undefined}
      >
        <SelectValue placeholder={placeholder ?? 'Choose an option'} />
      </SelectTrigger>
      <SelectContent>
        {placeholder ? (
          <SelectItem value='' className='h-7'>
            <span className='truncate'>{placeholder}</span>
          </SelectItem>
        ) : null}
        {enumOptions.map((option) => (
          <SelectItem
            key={String(option.value)}
            value={String(option.value)}
            // oxlint-disable-next-line @typescript-eslint/no-unsafe-argument -- value is untyped in RJSF
            disabled={enumDisabled?.includes(option.value)}
            className='h-7'
          >
            <span className='truncate'>{option.label}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CustomCheckboxWidget(props: WidgetProps): React.ReactNode {
  // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- value is untyped in RJSF
  const { value, onChange, name } = props;
  return <ParametersBoolean value={Boolean(value)} name={name} onChange={onChange} />;
}

function SimpleInputWidget(props: WidgetProps & { readonly inputType: string }): React.ReactNode {
  // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- value is untyped in RJSF
  const { value, onChange, inputType, schema, name } = props;
  const prettyLabel = name ? formatDisplayLabel(name) : '';
  return (
    <Input
      type={inputType}
      // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- value is untyped in RJSF
      value={value}
      defaultValue={schema.default as string}
      className='h-(--param-field-h) w-full rounded-(--param-field-radius) border-border/50 bg-muted pr-6 pl-2 text-right text-sm text-(--param-field-color) shadow-none transition-colors hover:border-border hover:text-(--param-field-color-focus) focus-visible:border-border focus-visible:text-(--param-field-color-focus) focus-visible:ring-0'
      aria-label={prettyLabel ? `Input for ${prettyLabel}` : undefined}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    />
  );
}

export const widgets: RegistryWidgetsType = {
  CheckboxWidget: CustomCheckboxWidget,
  EmailWidget: (props) => <SimpleInputWidget {...props} inputType='email' />,
  HiddenWidget: (props) => <SimpleInputWidget {...props} inputType='hidden' />,
  PasswordWidget: (props) => <SimpleInputWidget {...props} inputType='password' />,
  RangeWidget: ParametersWidget,
  SelectWidget,
  TextWidget: ParametersWidget,
  UpDownWidget: ParametersWidget,
};

export const templates: TemplatesType = {
  ButtonTemplates: {
    SubmitButton: () => null,
    AddButton: (props: IconButtonProps) => (
      <Button type='button' variant='outline' size='sm' disabled={props.disabled} onClick={props.onClick}>
        Add
      </Button>
    ),
    CopyButton: (props: IconButtonProps) => (
      <Button type='button' variant='outline' size='sm' disabled={props.disabled} onClick={props.onClick}>
        Copy
      </Button>
    ),
    MoveDownButton: (props: IconButtonProps) => (
      <Button type='button' variant='outline' size='sm' disabled={props.disabled} onClick={props.onClick}>
        ↓
      </Button>
    ),
    MoveUpButton: (props: IconButtonProps) => (
      <Button type='button' variant='outline' size='sm' disabled={props.disabled} onClick={props.onClick}>
        ↑
      </Button>
    ),
    RemoveButton: (props: IconButtonProps) => (
      <Button type='button' variant='destructive' size='sm' disabled={props.disabled} onClick={props.onClick}>
        Remove
      </Button>
    ),
  },
  FieldTemplate,
  ObjectFieldTemplate,
  ArrayFieldTemplate,
  ArrayFieldDescriptionTemplate: ({ description }) =>
    description ? <div className='mb-2 text-sm text-muted-foreground'>{description}</div> : null,
  ArrayFieldItemTemplate: ({ children, hasRemove, onDropIndexClick, index }) => (
    <div className='flex items-center gap-2'>
      <div className='flex-1'>{children}</div>
      {hasRemove ? (
        <Button type='button' variant='destructive' size='sm' onClick={onDropIndexClick(index)}>
          Remove
        </Button>
      ) : null}
    </div>
  ),
  ArrayFieldTitleTemplate: ({ title }) => (title ? <h3 className='mb-2 font-medium'>{title}</h3> : null),
  BaseInputTemplate: ({ value, onChange, schema }) => (
    <Input
      // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- value is untyped in RJSF
      value={value}
      defaultValue={schema.default as string}
      className='h-(--param-field-h) w-full rounded-(--param-field-radius) border-border/50 bg-muted pr-6 pl-2 text-right text-sm text-(--param-field-color) shadow-none transition-colors hover:border-border hover:text-(--param-field-color-focus) focus-visible:border-border focus-visible:text-(--param-field-color-focus) focus-visible:ring-0'
      onChange={(event) => {
        onChange(event.target.value);
      }}
    />
  ),
  DescriptionFieldTemplate: ({ description }) =>
    description ? <div className='mb-2 text-sm text-muted-foreground'>{description}</div> : null,
  ErrorListTemplate: ({ errors }: ErrorListProps) => (
    <div className='space-y-1 px-3'>
      {errors.map((error) => (
        <div key={error.property} className='text-sm text-destructive'>
          {error.stack}
        </div>
      ))}
    </div>
  ),
  FieldErrorTemplate: ({ errors }) => (errors ? <div className='mt-1 text-xs text-destructive'>{errors}</div> : null),
  FieldHelpTemplate: ({ help }) => (help ? <div className='mt-1 text-xs text-muted-foreground'>{help}</div> : null),
  TitleFieldTemplate: ({ title }) => (title ? <h2 className='mb-2 text-lg font-medium'>{title}</h2> : null),
  UnsupportedFieldTemplate({ reason, schema, idSchema }) {
    const fieldPath = idSchema?.$id ? rjsfIdToJsonPath(idSchema.$id) : [];
    const fieldName = fieldPath.at(-1) ?? 'root';
    const isArrayType = schema.type === 'array';

    return (
      <div
        aria-label={`Invalid Field: ${fieldName}`}
        className='flex flex-col gap-2.5 rounded-md border border-warning bg-warning/10 p-2.5'
      >
        <div className='flex items-start gap-2'>
          <div className='flex min-w-0 flex-1 flex-col gap-1.5'>
            <div className='flex flex-wrap items-baseline gap-1.5'>
              <span className='font-semibold'>Invalid Field</span>
              <span className='text-muted-foreground/40'>&mdash;</span>
              <InlineCode className='text-sm font-medium'>{fieldName}</InlineCode>
            </div>
            {reason ? (
              <p aria-label={`Invalid Field Reason: ${fieldName}`} className='text-sm text-muted-foreground'>
                Reason: {reason}
              </p>
            ) : null}
            {isArrayType ? (
              <div
                aria-label={`Array Requirements: ${fieldName}`}
                className='flex flex-col gap-1 rounded-md border border-warning/30 bg-background/80 p-2.5'
              >
                <p className='text-sm font-medium'>Array Requirements</p>
                <p className='text-xs leading-relaxed text-muted-foreground'>
                  All items must be the same type. Use a single type instead of using mixed types or tuples.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  },
  WrapIfAdditionalTemplate: async ({ children }) => children,
};

export const uiSchema: UiSchema = {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- RJSF uses this format for ui:globalOptions
  'ui:widget': 'ParametersWidget',
  // eslint-disable-next-line @typescript-eslint/naming-convention -- RJSF uses this format for ui:globalOptions
  'ui:globalOptions': {
    addable: true,
    copyable: true,
    orderable: true,
    removable: true,
    label: true,
  },
  // eslint-disable-next-line @typescript-eslint/naming-convention -- RJSF uses this format for ui:options
  'ui:options': {
    hideError: false,
    submitButtonOptions: {
      norender: true,
    },
  },
} as const satisfies UiSchema;
