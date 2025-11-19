/* eslint-disable react/prop-types -- causes false positives, they are actually typed */
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
import { ChevronRight, RefreshCcwDot } from 'lucide-react';
import { Fragment, useEffect, useState } from 'react';
import { Button } from '#components/ui/button.js';
import { Input } from '#components/ui/input.js';
import { ChatParametersBoolean } from '#components/geometry/parameters/chat-parameters-boolean.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#components/ui/select.js';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '#components/ui/collapsible.js';
import { cn } from '#utils/ui.utils.js';
import { toTitleCase } from '#utils/string.utils.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { HighlightText } from '#components/highlight-text.js';
import { ChatParameterWidget } from '#components/geometry/parameters/chat-parameter-widget.js';
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
// eslint-disable-next-line complexity -- consider refactoring.
function FieldTemplate(props: FieldTemplateProps<Record<string, unknown>, RJSFSchema, RJSFContext>): React.ReactNode {
  const { label, help, required, description, errors, children, schema, formData, id, registry } = props;

  if (schema.type === 'object' || schema.type === 'array') {
    const isRoot = id === rjsfIdPrefix;
    const { formContext } = registry;

    // If we're searching and this object/array has no matching nested properties, don't render it
    if (!isRoot && formContext.searchTerm && !isSchemaMatchingSearch(schema, formContext.searchTerm, label)) {
      return null;
    }

    // Narrow down to check if root is an object with only nested children
    const isRootNestedOnlyChildren =
      isRoot &&
      schema.type === 'object' &&
      Object.values(schema.properties ?? {}).every(
        (property) =>
          property !== false && property !== true && (property.type === 'object' || property.type === 'array'),
      );

    return (
      <div
        data-slot="field-group"
        className={cn(
          'field-group group/field-group',

          // We can save some space by hiding the left border if the root is an object with only nested (object or array) children
          'data-[is-root-nested-only=true]:-ml-3.5',

          // Non root object fields.
          // These have a left border and a top/bottom border.
          !isRoot &&
            cn(
              'border-t border-b',
              'ml-2 border-l-6',
              // The last field group in the object should not have a bottom border
              '[.field-group:last-of-type]:border-b-0',
              // The first field group in the object should not have a top border
              '[.field-group+&]:border-t-0',
            ),
        )}
        data-is-root-nested-only={isRootNestedOnlyChildren}
      >
        {children}
      </div>
    );
  }

  // Always call hooks at the very top level
  const { formContext } = registry;
  const prettyLabel = toTitleCase(label);
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
          const parentName = toTitleCase(parentSegment);
          // eslint-disable-next-line max-depth -- consider refactoring.
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
    ? getFieldDefaultValue(fieldPath, formData, schema.default, formContext.defaultParameters)
    : schema.default;

  const fieldHasValue = hasCustomValue(formData, defaultValue, fieldPath);

  const handleReset = () => {
    formContext.resetSingleParameter(fieldPath);
  };

  return (
    <div className="@container/parameter my-3 flex flex-col gap-0.5 px-3 transition-colors">
      <div className="flex h-auto min-h-5 flex-row justify-between gap-2">
        <span
          className={cn('pb-0.25 text-sm', fieldHasValue ? 'font-medium' : 'font-normal')}
          aria-label={`Parameter: ${prettyLabel}`}
        >
          <HighlightText text={prettyLabel} searchTerm={formContext.searchTerm} />
          {required ? <span className="text-destructive">*</span> : null}
        </span>
        {fieldHasValue ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="xs"
                className="h-5 text-muted-foreground"
                aria-label={`Reset ${prettyLabel}`}
                onClick={handleReset}
              >
                <RefreshCcwDot className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Reset &quot;{prettyLabel}&quot;</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      {descriptionText ? (
        <div className="text-sm text-muted-foreground">
          <HighlightText text={descriptionText} searchTerm={formContext.searchTerm} />
        </div>
      ) : (
        description
      )}
      <div className="mt-auto flex w-full flex-row items-center gap-2">{children}</div>
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

  const [isOpen, setIsOpen] = useState<boolean | undefined>(true);
  const isRoot = idSchema.$id === rjsfIdPrefix;

  useEffect(() => {
    setIsOpen(formContext.allExpanded);
  }, [formContext.allExpanded]);

  // Check if the group should be visible by checking:
  // 1. If the group title itself matches the search term, OR
  // 2. If any child properties (or their nested children) match
  const prettyTitle = toTitleCase(title);
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
      <div className="[&:has(.properties:not(:empty))_.no-params]:hidden">
        <EmptyItems className="no-params break-all group-data-[is-root-nested-only=true]/field-group:ml-5.5">
          No parameters matching &quot;{formContext.searchTerm}&quot;
        </EmptyItems>
        <div className="properties">{properties.map((element) => element.content)}</div>
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
    <Collapsible open={isOpen} className="w-full" onOpenChange={setIsOpen}>
      <CollapsibleTrigger
        className="group/collapsible flex h-8 w-full items-center justify-between px-3 py-1.5 transition-colors hover:bg-muted/70"
        aria-label={`Group: ${prettyTitle}`}
      >
        <h3 className="flex min-w-0 flex-1 items-center text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <span className="truncate">
            <HighlightText text={prettyTitle} searchTerm={formContext.searchTerm} />
          </span>
          <span className={cn('ml-1.5 flex-shrink-0 text-muted-foreground/50', isCountFiltered && 'italic')}>
            {countDisplay}
          </span>
        </h3>
        <ChevronRight className="size-3.5 text-muted-foreground transition-transform duration-200 ease-in-out group-data-[state=open]/collapsible:rotate-90" />
      </CollapsibleTrigger>

      <CollapsibleContent className="px-0 py-0">
        {description ? <div className="px-3 py-2 text-sm text-muted-foreground">{description}</div> : null}
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

  const [isOpen, setIsOpen] = useState<boolean | undefined>(true);

  useEffect(() => {
    setIsOpen(formContext.allExpanded);
  }, [formContext.allExpanded]);

  // Check if the array should be visible by checking:
  // 1. If the array title itself matches the search term, OR
  // 2. If the array items schema matches (indicating children would match)
  const prettyTitle = toTitleCase(title);

  // Check if the schema or its title matches the search
  const shouldShowArray = isSchemaMatchingSearch(schema, formContext.searchTerm, title);

  // Force array open when there's an active search and this array has matches
  useEffect(() => {
    const hasActiveSearch = formContext.searchTerm.trim().length > 0;
    if (hasActiveSearch && shouldShowArray) {
      setIsOpen(true);
    }
  }, [formContext.searchTerm, shouldShowArray]);

  // Don't render the array if it wouldn't be visible
  if (!shouldShowArray) {
    return null;
  }

  const itemCount = items.length;
  const countDisplay = `(${itemCount})`;

  return (
    <Collapsible open={isOpen} className="w-full" onOpenChange={setIsOpen}>
      <CollapsibleTrigger
        className="group/collapsible flex h-8 w-full items-center justify-between px-3 py-1.5 transition-colors hover:bg-muted/70"
        aria-label={`Group: ${prettyTitle}`}
      >
        <h3 className="flex min-w-0 flex-1 items-center text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <span className="truncate">
            <HighlightText text={prettyTitle} searchTerm={formContext.searchTerm} />
          </span>
          <span className="ml-1.5 flex-shrink-0 text-muted-foreground/50">{countDisplay}</span>
        </h3>
        <ChevronRight className="size-3.5 text-muted-foreground transition-transform duration-200 ease-in-out group-data-[state=open]/collapsible:rotate-90" />
      </CollapsibleTrigger>

      <CollapsibleContent className="px-0 py-0">
        {items.map((item) => (
          <Fragment key={item.key}>{item.children}</Fragment>
        ))}
        {canAdd ? (
          <Button type="button" variant="outline" size="sm" className="mx-2 my-2" onClick={onAddClick}>
            Add item ({prettyTitle})
          </Button>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}

// Custom Select Widget for Enums
function SelectWidget(props: WidgetProps): React.ReactNode {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- value is untyped in RJSF
  const { options, value, onChange, placeholder, name } = props;

  const { enumOptions, enumDisabled } = options;

  const handleChange = (newValue: string) => {
    onChange(newValue === '' ? undefined : newValue);
  };

  if (!enumOptions) {
    throw new Error('No enum options provided');
  }

  const prettyLabel = name ? toTitleCase(name) : '';

  return (
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- value is untyped in RJSF
    <Select value={value} onValueChange={handleChange}>
      <SelectTrigger
        size="sm"
        className="min-w-0 flex-1 bg-background"
        aria-label={prettyLabel ? `Select for ${prettyLabel}` : undefined}
      >
        <SelectValue placeholder={placeholder ?? 'Choose an option'} />
      </SelectTrigger>
      <SelectContent>
        {placeholder ? (
          <SelectItem value="" className="h-7">
            <span className="truncate">{placeholder}</span>
          </SelectItem>
        ) : null}
        {enumOptions.map((option) => (
          <SelectItem
            key={String(option.value)}
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- value is untyped in RJSF
            value={option.value}
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- value is untyped in RJSF
            disabled={enumDisabled?.includes(option.value)}
            className="h-7"
          >
            <span className="truncate">{option.label}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CustomCheckboxWidget(props: WidgetProps): React.ReactNode {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- value is untyped in RJSF
  const { value, onChange, name } = props;
  return <ChatParametersBoolean value={Boolean(value)} name={name} onChange={onChange} />;
}

function SimpleInputWidget(props: WidgetProps & { readonly inputType: string }): React.ReactNode {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- value is untyped in RJSF
  const { value, onChange, inputType, schema, name } = props;
  const prettyLabel = name ? toTitleCase(name) : '';
  return (
    <Input
      type={inputType}
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- value is untyped in RJSF
      value={value}
      defaultValue={schema.default as string}
      className="h-6 flex-1 bg-background p-1"
      aria-label={prettyLabel ? `Input for ${prettyLabel}` : undefined}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    />
  );
}

export const widgets: RegistryWidgetsType = {
  CheckboxWidget: CustomCheckboxWidget,
  EmailWidget: (props) => <SimpleInputWidget {...props} inputType="email" />,
  HiddenWidget: (props) => <SimpleInputWidget {...props} inputType="hidden" />,
  PasswordWidget: (props) => <SimpleInputWidget {...props} inputType="password" />,
  RangeWidget: ChatParameterWidget,
  SelectWidget,
  TextWidget: ChatParameterWidget,
  UpDownWidget: ChatParameterWidget,
  ChatParameterWidget,
};

export const templates: TemplatesType = {
  ButtonTemplates: {
    SubmitButton: () => null,
    AddButton: (props: IconButtonProps) => (
      <Button type="button" variant="outline" size="sm" disabled={props.disabled} onClick={props.onClick}>
        Add
      </Button>
    ),
    CopyButton: (props: IconButtonProps) => (
      <Button type="button" variant="outline" size="sm" disabled={props.disabled} onClick={props.onClick}>
        Copy
      </Button>
    ),
    MoveDownButton: (props: IconButtonProps) => (
      <Button type="button" variant="outline" size="sm" disabled={props.disabled} onClick={props.onClick}>
        ↓
      </Button>
    ),
    MoveUpButton: (props: IconButtonProps) => (
      <Button type="button" variant="outline" size="sm" disabled={props.disabled} onClick={props.onClick}>
        ↑
      </Button>
    ),
    RemoveButton: (props: IconButtonProps) => (
      <Button type="button" variant="destructive" size="sm" disabled={props.disabled} onClick={props.onClick}>
        Remove
      </Button>
    ),
  },
  FieldTemplate,
  ObjectFieldTemplate,
  ArrayFieldTemplate,
  ArrayFieldDescriptionTemplate: ({ description }) =>
    description ? <div className="mb-2 text-sm text-muted-foreground">{description}</div> : null,
  ArrayFieldItemTemplate: ({ children, hasRemove, onDropIndexClick, index }) => (
    <div className="flex items-center gap-2">
      <div className="flex-1">{children}</div>
      {hasRemove ? (
        <Button type="button" variant="destructive" size="sm" onClick={onDropIndexClick(index)}>
          Remove
        </Button>
      ) : null}
    </div>
  ),
  ArrayFieldTitleTemplate: ({ title }) => (title ? <h3 className="mb-2 font-medium">{title}</h3> : null),
  BaseInputTemplate: ({ value, onChange, schema }) => (
    <Input
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- value is untyped in RJSF
      value={value}
      defaultValue={schema.default as string}
      className="h-6 flex-1 bg-background p-1"
      onChange={(event) => {
        onChange(event.target.value);
      }}
    />
  ),
  DescriptionFieldTemplate: ({ description }) =>
    description ? <div className="mb-2 text-sm text-muted-foreground">{description}</div> : null,
  ErrorListTemplate: ({ errors }: ErrorListProps) => (
    <div className="space-y-1 px-3">
      {errors.map((error) => (
        <div key={error.property} className="text-sm text-destructive">
          {error.stack}
        </div>
      ))}
    </div>
  ),
  FieldErrorTemplate: ({ errors }) => (errors ? <div className="mt-1 text-xs text-destructive">{errors}</div> : null),
  FieldHelpTemplate: ({ help }) => (help ? <div className="mt-1 text-xs text-muted-foreground">{help}</div> : null),
  TitleFieldTemplate: ({ title }) => (title ? <h2 className="mb-2 text-lg font-medium">{title}</h2> : null),
  UnsupportedFieldTemplate({ reason, schema, idSchema }) {
    const fieldPath = idSchema?.$id ? rjsfIdToJsonPath(idSchema.$id) : [];
    const fieldName = fieldPath.at(-1) ?? 'root';
    const isArrayType = schema.type === 'array';
    const isObjectType = schema.type === 'object';

    return (
      <div
        aria-label={`Invalid Field: ${fieldName}`}
        className={cn(
          'flex flex-col gap-2.5 bg-warning/10 p-3',
          // Since we don't have access to the parent field group,
          // we inset the border by the same amount as the border of the field group,
          // thus removing duplicate borders of different colors.
          '-my-px -ml-1.5 border-y border-l-6 border-warning',
          // Apply full border with rounded corners if the field is not an array or object,
          // as we already have a border for those.
          !isArrayType && !isObjectType && 'rounded-md border',
        )}
      >
        <div className="flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-baseline gap-1.5">
              <span className="font-semibold">Invalid Field</span>
              <span className="text-muted-foreground/40">&mdash;</span>
              <InlineCode className="text-sm font-medium">{fieldName}</InlineCode>
            </div>
            {reason ? (
              <p aria-label={`Invalid Field Reason: ${fieldName}`} className="text-sm text-muted-foreground">
                Reason: {reason}
              </p>
            ) : null}
            {isArrayType ? (
              <div
                aria-label={`Array Requirements: ${fieldName}`}
                className="flex flex-col gap-1 rounded-md border border-warning/30 bg-background/80 p-2.5"
              >
                <p className="text-sm font-medium">Array Requirements</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
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
  'ui:widget': 'ChatParameterWidget',
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
