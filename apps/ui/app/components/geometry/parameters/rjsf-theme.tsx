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
  ArrayFieldTemplateItemType,
  ErrorListProps,
  RJSFSchema,
} from '@rjsf/utils';
import { ChevronDown, Info, SearchX, Trash2 } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { projectParameterField } from '@taucad/parameters';
import { Button } from '@taucad/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { Input } from '@taucad/ui/components/input';
import { ParametersBoolean } from '#components/geometry/parameters/parameters-boolean.js';
import { ParameterSelect } from '#components/geometry/parameters/parameter-select.js';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import { cn } from '@taucad/ui/utils/cn';
import { nestedActionVariants } from '@taucad/ui/components/nested-action.variants';
import { formatDisplayLabel } from '#utils/string.utils.js';
import { ModifiedIndicator } from '#components/ui/modified-indicator.js';
import { HighlightText } from '#components/highlight-text.js';
import { PaneVirtualList } from '#components/panes/pane-virtual-list.js';
import { paneFieldGroupSpacingClassName } from '#components/panes/pane-spacing.styles.js';
import { ParameterGroupCard } from '#components/geometry/parameters/parameter-group-card.js';
import {
  FieldLabelContext,
  ParametersWidget,
  useFieldLabel,
} from '#components/geometry/parameters/parameters-widget.js';
import {
  isSchemaMatchingSearch,
  getFieldDefaultValue,
  getDiscriminatedUnionInfo,
  isObjectLikeSchema,
} from '#components/geometry/parameters/rjsf-utils.js';
import { hasCustomValue } from '#utils/object.utils.js';
import { PanelEmptyState } from '#components/ui/panel-empty-state.js';
import { InlineCode } from '#components/code/code-block.js';
import { rjsfLayoutContext, useRjsfLayoutContext } from '#components/geometry/parameters/rjsf-context.js';
import { toInstancePointer, useRenderedFieldPath } from '#components/geometry/parameters/rjsf-field-path.js';
import type { RJSFContext, RjsfLayoutContextValue } from '#components/geometry/parameters/rjsf-context.js';

const ArrayItemRemoveAction = ({ action }: { readonly action: RjsfLayoutContextValue['arrayItemAction'] }) => {
  if (!action) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* The sidebar row's action: 24 px, nested-action tone, so it reads as a surface on the lit header. */}
        <Button
          type='button'
          variant='ghost'
          size='icon'
          className={nestedActionVariants({ className: 'mr-1 size-6 shrink-0 text-muted-foreground' })}
          aria-label={action.label}
          onClick={(event) => {
            event.stopPropagation();
            action.onRemove();
          }}
        >
          <Trash2 aria-hidden='true' className='size-3.5' />
        </Button>
      </TooltipTrigger>
      <TooltipContent side='left'>{action.label}</TooltipContent>
    </Tooltip>
  );
};

function useParameterDisclosure(formContext: RJSFContext, id: string) {
  const { arrayDisclosure } = useRjsfLayoutContext();
  const path = useRenderedFieldPath()?.path;
  const disclosureKey =
    arrayDisclosure && path
      ? `${arrayDisclosure.key}/${JSON.stringify(path.slice(arrayDisclosure.parentDepth + 1))}`
      : id;
  const [isOpen, setLocalOpen] = useState(
    () => formContext.disclosure?.choices.get(disclosureKey) ?? formContext.allExpanded,
  );
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Follow the owner's explicit Expand/Collapse all generation.
    setLocalOpen(formContext.disclosure?.choices.get(disclosureKey) ?? formContext.allExpanded);
  }, [formContext.allExpanded, formContext.disclosure, disclosureKey]);
  const setIsOpen = useCallback(
    (next: boolean) => {
      formContext.disclosure?.choices.set(disclosureKey, next);
      setLocalOpen(next);
    },
    [formContext.disclosure, disclosureKey],
  );
  return [isOpen, setIsOpen] as const;
}

function CompositeFieldTemplate({
  children,
  formData,
  label,
  schema,
  formContext,
  id,
  action,
}: {
  readonly children: React.ReactNode;
  readonly formData: unknown;
  readonly label: string;
  readonly schema: RJSFSchema;
  readonly formContext: RJSFContext;
  readonly id: string;
  readonly action?: RjsfLayoutContextValue['arrayItemAction'];
}): React.ReactNode {
  'use no memo';

  const union = getDiscriminatedUnionInfo(schema);
  const { arrayDisclosure } = useRjsfLayoutContext();
  const [isOpen, setIsOpen] = useParameterDisclosure(formContext, id);
  const selectedBranchContext = useMemo(
    () => ({ embeddedDiscriminator: union?.discriminator, arrayDisclosure }),
    [union?.discriminator, arrayDisclosure],
  );

  useEffect(() => {
    if (formContext.searchTerm.trim().length > 0) {
      // oxlint-disable-next-line react/set-state-in-effect -- The `use no memo` boundary preserves synchronous RJSF search expansion.
      setIsOpen(true);
    }
  }, [formContext.searchTerm]);

  if (!union) {
    return children;
  }

  const selectedValue =
    typeof formData === 'object' && formData !== null
      ? (formData as Record<string, unknown>)[union.discriminator]
      : undefined;
  const selectedIndex = union.values.findIndex((value) => Object.is(value, selectedValue));
  const selectedBranch = union.branches[Math.max(0, selectedIndex)];
  const propertyCount = Object.keys(selectedBranch?.properties ?? {}).length;
  const prettyTitle = formatDisplayLabel(label);
  const discriminatorLabel = formatDisplayLabel(union.discriminator);

  return (
    <ParameterGroupCard
      title={prettyTitle}
      searchTerm={formContext.searchTerm}
      trailing={<span className='shrink-0 text-xs text-muted-foreground tabular-nums'>({propertyCount})</span>}
      isOpen={isOpen}
      headerActions={<ArrayItemRemoveAction action={action} />}
      bodyClassName='grid grid-cols-[minmax(0,40%)_minmax(0,1fr)] items-center [&>.panel]:contents [&>.panel>.field-group]:col-span-2 [&>.panel>.form-group]:col-start-2 [&>.panel>.form-group]:row-start-1 [&>.panel>.form-group]:flex [&>.panel>.form-group]:justify-end [&>.panel>.form-group]:py-1.5 [&>.panel>.form-group]:pr-2.5'
      onOpenChange={setIsOpen}
    >
      <span className='col-start-1 row-start-1 truncate px-2.5 text-sm text-muted-foreground'>
        {discriminatorLabel}
      </span>
      <rjsfLayoutContext.Provider value={selectedBranchContext}>{children}</rjsfLayoutContext.Provider>
    </ParameterGroupCard>
  );
}

// Custom Field Template with Reset Button and Search Filtering
// oxlint-disable-next-line complexity -- consider refactoring.
function FieldTemplate(props: FieldTemplateProps<Record<string, unknown>, RJSFSchema, RJSFContext>): React.ReactNode {
  const { label, help, required, description, errors, children, schema, formData, id, registry } = props;
  const { formContext } = registry;
  const layoutContext = useRjsfLayoutContext();
  const renderedField = useRenderedFieldPath();
  const fieldPath = renderedField?.path;
  const ancestorMatches =
    fieldPath?.slice(0, -1).some((segment) => formContext.shouldShowField(formatDisplayLabel(segment))) ?? false;
  const instancePointer = fieldPath === undefined ? undefined : toInstancePointer(fieldPath);
  const { parameterManifest, parameterGroup } = formContext;
  /* Every field template re-renders on each filter keystroke; the projection depends on none of it.
   * A group's pointer has no binding, so projecting it returns at once. */
  const fieldProjection = useMemo(
    () =>
      instancePointer === undefined
        ? undefined
        : projectParameterField(parameterManifest, instancePointer, {}, parameterGroup),
    [instancePointer, parameterGroup, parameterManifest],
  );

  if (layoutContext.embeddedDiscriminator !== undefined && layoutContext.embeddedDiscriminator === fieldPath?.at(-1)) {
    return null;
  }

  const discriminatedUnion = getDiscriminatedUnionInfo(schema);
  if (discriminatedUnion) {
    if (formContext.searchTerm && !ancestorMatches && !isSchemaMatchingSearch(schema, formContext.searchTerm, label)) {
      return null;
    }

    return (
      <div data-slot='field-group' className={cn('field-group group/field-group', paneFieldGroupSpacingClassName)}>
        <CompositeFieldTemplate
          id={id}
          formData={formData}
          label={label}
          schema={schema}
          formContext={formContext}
          action={layoutContext.arrayItemAction}
        >
          {children}
        </CompositeFieldTemplate>
      </div>
    );
  }

  if (isObjectLikeSchema(schema) || schema.type === 'array') {
    const isRoot = id === formContext.idPrefix;

    // If we're searching and this object/array has no matching nested properties, don't render it
    if (
      !isRoot &&
      formContext.searchTerm &&
      !ancestorMatches &&
      !isSchemaMatchingSearch(schema, formContext.searchTerm, label)
    ) {
      return null;
    }

    return (
      <div data-slot='field-group' className={cn('field-group group/field-group', paneFieldGroupSpacingClassName)}>
        {children}
      </div>
    );
  }

  // Always call hooks at the very top level
  const prettyLabel = formatDisplayLabel(label);
  const descriptionText = typeof schema.description === 'string' ? schema.description : '';

  // Check if we need to filter this field
  if (formContext.searchTerm) {
    // Check if this field matches the search
    const labelMatches = formContext.shouldShowField(prettyLabel);
    const descriptionMatches = descriptionText && formContext.shouldShowField(descriptionText);

    const shouldShow = labelMatches || descriptionMatches || ancestorMatches;

    if (!shouldShow) {
      return null;
    }
  }

  // Get the appropriate default value (handles array items specially)
  const defaultValue =
    formContext.defaultParameters && fieldPath !== undefined
      ? getFieldDefaultValue({
          fieldPath,
          formData,
          schemaDefault: schema.default,
          defaultParameters: formContext.defaultParameters,
        })
      : schema.default;

  const fieldHasValue =
    fieldPath !== undefined &&
    (Object.is(formData, null) ? !Object.is(defaultValue, null) : hasCustomValue(formData, defaultValue, fieldPath));
  const canReset = !(renderedField?.isArrayItem && defaultValue === undefined);
  const inferredHint =
    fieldProjection?.guessed === true
      ? fieldProjection.inferredFields?.includes('unit') === true
        ? 'Inferred unit'
        : 'Inferred semantics'
      : undefined;

  const handleReset = () => {
    if (fieldPath !== undefined && canReset) {
      formContext.resetSingleParameter({ fieldPath, defaultValue });
    }
  };

  return (
    <div
      data-slot='parameter-field'
      className='group/field @container/parameter my-1.5 flex flex-col gap-0.5 px-2.5 transition-colors'
    >
      <div className='flex items-center gap-2 @[240px]/parameter:flex-row'>
        <div className='flex min-w-0 shrink-0 items-center gap-1.5 @[240px]/parameter:w-[40%]'>
          <div className='flex min-w-0 items-center gap-0.5'>
            <span
              className={cn(
                'min-w-0 truncate text-sm',
                fieldHasValue ? 'font-medium text-foreground' : 'font-normal text-muted-foreground',
              )}
              aria-label={`Parameter: ${prettyLabel}`}
            >
              <HighlightText text={prettyLabel} searchTerm={formContext.searchTerm} />
              {required ? <span className='text-feature/50'>*</span> : null}
            </span>
            {inferredHint ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon-xs'
                    className='text-muted-foreground/60 hover:bg-transparent hover:text-foreground'
                    aria-label={`${inferredHint} for ${prettyLabel}`}
                  >
                    <Info aria-hidden='true' className='size-3' />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{inferredHint}</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
          {fieldHasValue && canReset ? (
            <ModifiedIndicator
              onReset={handleReset}
              tooltip={`Reset ${prettyLabel}`}
              tooltipSide='left'
              className='group-hover/field:**:data-[slot=dot]:opacity-0 group-hover/field:**:data-[slot=icon]:opacity-100'
            />
          ) : null}
        </div>
        <div className='flex min-w-0 flex-1 items-center justify-end gap-2'>
          <FieldLabelContext.Provider value={prettyLabel}>{children}</FieldLabelContext.Provider>
        </div>
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
  'use no memo';

  const { title, description, properties, idSchema, registry, schema } = props;

  const { formContext } = registry;
  const layoutContext = useRjsfLayoutContext();
  const descendantLayout = useMemo<RjsfLayoutContextValue>(
    () => ({ arrayDisclosure: layoutContext.arrayDisclosure }),
    [layoutContext.arrayDisclosure],
  );

  const [isOpen, setIsOpen] = useParameterDisclosure(formContext, idSchema.$id);
  const isRoot = idSchema.$id === formContext.idPrefix;

  // Check if the group should be visible by checking:
  // 1. If the group title itself matches the search term, OR
  // 2. If any child properties (or their nested children) match
  const prettyTitle = formatDisplayLabel(title);
  const groupTitleMatches = formContext.shouldShowField(prettyTitle);

  // Use the schema to check if any nested properties match
  const hasMatchingNestedProperties = isSchemaMatchingSearch(schema, formContext.searchTerm);

  // Show the group if either the title matches OR any nested properties match
  const groupPath = useRenderedFieldPath()?.path;
  const ancestorMatches =
    groupPath?.some((segment) => formContext.shouldShowField(formatDisplayLabel(segment))) ?? false;
  const shouldShowGroup = groupTitleMatches || hasMatchingNestedProperties || ancestorMatches;

  // Force group open when there's an active search and this group has matches
  useEffect(() => {
    const hasActiveSearch = formContext.searchTerm.trim().length > 0;
    if (hasActiveSearch && shouldShowGroup) {
      // oxlint-disable-next-line react/set-state-in-effect -- The `use no memo` boundary preserves synchronous RJSF search expansion.
      setIsOpen(true);
    }
  }, [formContext.searchTerm, shouldShowGroup]);

  if (isRoot) {
    if (formContext.rootPresentation === 'embedded') {
      return (
        <div data-slot='embedded-form-root' className='properties empty:hidden'>
          <ParameterPropertyList
            properties={properties}
            schema={schema}
            searchTerm={formContext.searchTerm}
            title={prettyTitle}
          />
        </div>
      );
    }

    return (
      <div className='[&:has(.properties:not(:empty))_.no-params]:hidden'>
        <PanelEmptyState
          icon={SearchX}
          title={`No parameters matching "${formContext.searchTerm}"`}
          className='no-params break-all'
        />
        <div
          data-slot='parameter-catalog'
          className='properties m-2 overflow-hidden rounded-md border border-border bg-card p-1 empty:hidden'
        >
          <ParameterPropertyList
            properties={properties}
            schema={schema}
            searchTerm={formContext.searchTerm}
            title={prettyTitle}
          />
        </div>
      </div>
    );
  }

  const isEmbeddedUnionBranch =
    layoutContext.embeddedDiscriminator !== undefined &&
    Object.hasOwn(schema.properties ?? {}, layoutContext.embeddedDiscriminator);

  if (isEmbeddedUnionBranch) {
    return (
      <>
        {description ? <div className='px-2.5 py-1.5 text-xs text-muted-foreground'>{description}</div> : null}
        <ParameterPropertyList
          properties={properties}
          schema={schema}
          searchTerm={formContext.searchTerm}
          title={prettyTitle}
        />
      </>
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
    <ParameterGroupCard
      title={prettyTitle}
      searchTerm={formContext.searchTerm}
      trailing={
        <span className={cn('shrink-0 text-xs tabular-nums text-muted-foreground', isCountFiltered && 'italic')}>
          {countDisplay}
        </span>
      }
      isOpen={isOpen}
      headerActions={<ArrayItemRemoveAction action={layoutContext.arrayItemAction} />}
      onOpenChange={setIsOpen}
    >
      <rjsfLayoutContext.Provider value={descendantLayout}>
        {description ? <div className='px-2.5 py-1.5 text-xs text-muted-foreground'>{description}</div> : null}
        <ParameterPropertyList
          properties={properties}
          schema={schema}
          searchTerm={formContext.searchTerm}
          title={prettyTitle}
        />
      </rjsfLayoutContext.Provider>
    </ParameterGroupCard>
  );
}

function ArrayFieldTemplate(
  props: ArrayFieldTemplateProps<Record<string, unknown>, RJSFSchema, RJSFContext>,
): React.ReactNode {
  'use no memo';

  const { title, items, canAdd, onAddClick, registry, schema } = props;
  const { formContext } = registry;

  const [isOpen, setIsOpen] = useParameterDisclosure(formContext, props.idSchema.$id);

  // Check if the array should be visible by checking:
  // 1. If the array title itself matches the search term, OR
  // 2. If the array items schema matches (indicating children would match)
  const prettyTitle = formatDisplayLabel(title);

  // Check if the schema or its title matches the search
  const arrayPath = useRenderedFieldPath()?.path;
  const ancestorMatches =
    arrayPath?.some((segment) => formContext.shouldShowField(formatDisplayLabel(segment))) ?? false;
  const shouldShowArray = isSchemaMatchingSearch(schema, formContext.searchTerm, title) || ancestorMatches;

  // Force array open when there's an active search and this array has matches
  useEffect(() => {
    const hasActiveSearch = formContext.searchTerm.trim().length > 0;
    if (hasActiveSearch && shouldShowArray) {
      // oxlint-disable-next-line react/set-state-in-effect -- The `use no memo` boundary preserves synchronous RJSF search expansion.
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
    <Collapsible
      data-slot='parameter-group'
      open={isOpen}
      className='group/parameter-group w-full overflow-hidden rounded-lg border border-transparent transition-colors duration-150 data-[state=open]:border-border data-[state=open]:bg-background motion-reduce:transition-none'
      onOpenChange={setIsOpen}
    >
      <CollapsibleTrigger
        className='group/collapsible flex min-h-8 w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors duration-150 hover:bg-sidebar-accent focus-visible:focus-outline data-[state=open]:rounded-b-none motion-reduce:transition-none'
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

      <CollapsibleContent data-slot='parameter-group-content' className='border-t border-border/70 px-2.5 py-1'>
        <ParameterArrayList items={items} title={prettyTitle} />
        {canAdd ? (
          <Button type='button' variant='outline' size='sm' className='my-1.5' onClick={onAddClick}>
            Add item ({prettyTitle})
          </Button>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}

type ParameterProperty = ObjectFieldTemplateProps<
  Record<string, unknown>,
  RJSFSchema,
  RJSFContext
>['properties'][number];
type ParameterArrayItem = ArrayFieldTemplateItemType<Record<string, unknown>, RJSFSchema, RJSFContext>;
const propertyKey = (property: ParameterProperty): string => property.name;
const arrayItemKey = (item: ParameterArrayItem): string => item.key;
const renderProperty = (_index: number, property: ParameterProperty): React.ReactNode => property.content;

const ParameterPropertyList = memo(function ParameterPropertyList({
  properties,
  schema,
  searchTerm,
  title,
}: {
  readonly properties: ParameterProperty[];
  readonly schema: RJSFSchema;
  readonly searchTerm: string;
  readonly title: string;
}): React.JSX.Element {
  const fieldPath = useRenderedFieldPath()?.path;
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const ancestorMatches =
    title.toLowerCase().includes(normalizedSearch) ||
    (fieldPath?.some((segment) => formatDisplayLabel(segment).toLowerCase().includes(normalizedSearch)) ?? false);
  const visible = useMemo(
    () =>
      properties.filter((property) => {
        if (property.hidden) {
          return false;
        }
        if (!searchTerm.trim() || ancestorMatches) {
          return true;
        }
        const child = schema.properties?.[property.name];
        return typeof child === 'object' && isSchemaMatchingSearch(child, searchTerm, property.name);
      }),
    [properties, schema, searchTerm, ancestorMatches],
  );
  if (visible.length <= 20) {
    return <>{visible.map((property) => property.content)}</>;
  }
  return (
    <div className='field-group col-span-2'>
      <PaneVirtualList
        data={visible}
        getItemKey={propertyKey}
        itemContent={renderProperty}
        ariaLabel={`Parameters: ${title || 'Model'}`}
      />
    </div>
  );
});

const ParameterArrayList = memo(function ParameterArrayList({
  items,
  title,
}: {
  readonly items: ParameterArrayItem[];
  readonly title: string;
}): React.JSX.Element {
  const renderItem = useCallback(
    (_index: number, item: ParameterArrayItem) => <ScopedArrayFieldItem item={item} title={title} />,
    [title],
  );
  return (
    <PaneVirtualList
      data={items}
      getItemKey={arrayItemKey}
      itemContent={renderItem}
      itemSpacing={items.some((item) => isObjectLikeSchema(item.schema)) ? 'groups' : undefined}
      ariaLabel={`Items: ${title}`}
    />
  );
});

function ScopedArrayFieldItem({
  item,
  title,
}: {
  readonly item: ArrayFieldTemplateItemType<Record<string, unknown>, RJSFSchema, RJSFContext>;
  readonly title: string;
}): React.ReactNode {
  const { key, ...itemProps } = item;
  const parentDepth = useRenderedFieldPath()?.path.length ?? 0;
  const layoutContext = useMemo<RjsfLayoutContextValue>(
    () => ({
      objectArrayItem: isObjectLikeSchema(item.schema),
      arrayDisclosure: { key, parentDepth },
      arrayItemAction: item.hasRemove
        ? {
            label: `Remove ${title} ${item.index + 1}`,
            onRemove: item.onDropIndexClick(item.index),
          }
        : undefined,
    }),
    [item, key, parentDepth, title],
  );

  return (
    <rjsfLayoutContext.Provider value={layoutContext}>
      <ArrayFieldItemTemplate key={key} {...itemProps} />
    </rjsfLayoutContext.Provider>
  );
}

// Custom Select Widget for Enums
function SelectWidget(props: WidgetProps): React.ReactNode {
  const { id, options, onChange, onBlur, onFocus, placeholder, name, disabled, readonly, autofocus } = props;
  const layoutContext = useRjsfLayoutContext();
  const fieldLabel = useFieldLabel(name);
  // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- RJSF leaves widget values untyped.
  const { value } = props;
  const isDisabled = disabled === true || readonly === true;
  const selectedValue =
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';

  const { enumOptions, enumDisabled } = options;

  if (!enumOptions) {
    throw new Error('No enum options provided');
  }

  const handleChange = (newValue: string) => {
    if (isDisabled) {
      return;
    }
    if (newValue === '') {
      onChange(undefined);
      return;
    }
    const matched = enumOptions.find((opt) => String(opt.value) === newValue);
    onChange(matched ? matched.value : newValue);
  };

  const prettyLabel = layoutContext.embeddedDiscriminator
    ? formatDisplayLabel(layoutContext.embeddedDiscriminator)
    : fieldLabel;

  return (
    <ParameterSelect
      id={id}
      shouldAutoFocus={autofocus}
      label={prettyLabel ? `Select for ${prettyLabel}` : 'Select option'}
      value={selectedValue}
      isDisabled={isDisabled}
      placeholder={placeholder}
      groups={[
        {
          options: enumOptions.map((option) => ({
            value: String(option.value),
            label: String(option.label),
            // oxlint-disable-next-line @typescript-eslint/no-unsafe-argument -- value is untyped in RJSF
            disabled: enumDisabled?.includes(option.value),
          })),
        },
      ]}
      onChange={handleChange}
      onFocus={() => {
        onFocus(id, value);
      }}
      onBlur={() => {
        onBlur(id, value);
      }}
    />
  );
}

function ArrayFieldItemTemplate(
  props: ArrayFieldTemplateItemType<Record<string, unknown>, RJSFSchema, RJSFContext>,
): React.ReactNode {
  const { children } = props;
  const layoutContext = useRjsfLayoutContext();

  if (layoutContext.objectArrayItem) {
    return <div className='w-full'>{children}</div>;
  }

  return (
    <div className='flex items-center gap-2'>
      <div className='min-w-0 flex-1'>{children}</div>
      <ArrayItemRemoveAction action={layoutContext.arrayItemAction} />
    </div>
  );
}

function CustomCheckboxWidget(props: WidgetProps): React.ReactNode {
  // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- value is untyped in RJSF
  const { id, value, onChange, onBlur, onFocus, name, disabled, readonly, autofocus } = props;
  const isDisabled = disabled === true || readonly === true;
  const prettyLabel = useFieldLabel(name);
  return (
    <ParametersBoolean
      id={id}
      value={Boolean(value)}
      name={name}
      disabled={isDisabled}
      autoFocus={autofocus}
      aria-label={`Toggle for ${prettyLabel}`}
      onFocus={() => {
        onFocus(id, value);
      }}
      onBlur={() => {
        onBlur(id, value);
      }}
      onChange={(nextValue) => {
        if (!isDisabled) {
          onChange(nextValue);
        }
      }}
    />
  );
}

function SimpleInputWidget(
  props: WidgetProps<Record<string, unknown>, RJSFSchema, RJSFContext> & { readonly inputType: string },
): React.ReactNode {
  // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- value is untyped in RJSF
  const { id, value, onChange, onBlur, onFocus, inputType, name, disabled, readonly, autofocus } = props;
  const prettyLabel = useFieldLabel(name);
  return (
    <Input
      id={id}
      type={inputType}
      value={typeof value === 'string' || typeof value === 'number' ? value : ''}
      disabled={disabled}
      readOnly={readonly}
      autoFocus={autofocus}
      className='h-(--param-field-h) w-full rounded-(--param-field-radius) border-border/50 bg-muted pr-6 pl-2 text-right text-sm text-(--param-field-color) shadow-none transition-colors hover:border-border hover:text-(--param-field-color-focus) focus-visible:border-border focus-visible:text-(--param-field-color-focus)'
      aria-label={prettyLabel ? `Input for ${prettyLabel}` : undefined}
      onFocus={() => {
        onFocus(id, value);
      }}
      onBlur={() => {
        onBlur(id, value);
      }}
      onChange={(event) => {
        if (!disabled && !readonly) {
          onChange(event.target.value);
        }
      }}
    />
  );
}

export const widgets: RegistryWidgetsType<Record<string, unknown>, RJSFSchema, RJSFContext> = {
  CheckboxWidget: CustomCheckboxWidget,
  EmailWidget: (props) => <SimpleInputWidget {...props} inputType='email' />,
  HiddenWidget: (props) => <SimpleInputWidget {...props} inputType='hidden' />,
  PasswordWidget: (props) => <SimpleInputWidget {...props} inputType='password' />,
  RangeWidget: ParametersWidget,
  SelectWidget,
  TextWidget: ParametersWidget,
  UpDownWidget: ParametersWidget,
};

export const templates: TemplatesType<Record<string, unknown>, RJSFSchema, RJSFContext> = {
  ButtonTemplates: {
    SubmitButton: () => null,
    AddButton: (props: IconButtonProps<Record<string, unknown>, RJSFSchema, RJSFContext>) => (
      <Button type='button' variant='outline' size='sm' disabled={props.disabled} onClick={props.onClick}>
        Add
      </Button>
    ),
    CopyButton: (props: IconButtonProps<Record<string, unknown>, RJSFSchema, RJSFContext>) => (
      <Button type='button' variant='outline' size='sm' disabled={props.disabled} onClick={props.onClick}>
        Copy
      </Button>
    ),
    MoveDownButton: (props: IconButtonProps<Record<string, unknown>, RJSFSchema, RJSFContext>) => (
      <Button type='button' variant='outline' size='sm' disabled={props.disabled} onClick={props.onClick}>
        ↓
      </Button>
    ),
    MoveUpButton: (props: IconButtonProps<Record<string, unknown>, RJSFSchema, RJSFContext>) => (
      <Button type='button' variant='outline' size='sm' disabled={props.disabled} onClick={props.onClick}>
        ↑
      </Button>
    ),
    RemoveButton: (props: IconButtonProps<Record<string, unknown>, RJSFSchema, RJSFContext>) => (
      <Button type='button' variant='outline' size='sm' disabled={props.disabled} onClick={props.onClick}>
        Remove
      </Button>
    ),
  },
  FieldTemplate,
  ObjectFieldTemplate,
  ArrayFieldTemplate,
  ArrayFieldDescriptionTemplate: ({ description }) =>
    description ? <div className='mb-2 text-sm text-muted-foreground'>{description}</div> : null,
  ArrayFieldItemTemplate,
  ArrayFieldTitleTemplate: ({ title }) => (title ? <h3 className='mb-2 font-medium'>{title}</h3> : null),
  BaseInputTemplate: ({ id, value, onChange, onBlur, onFocus, disabled, readonly, autofocus }) => (
    <Input
      id={id}
      value={typeof value === 'string' || typeof value === 'number' ? value : ''}
      disabled={disabled}
      readOnly={readonly}
      autoFocus={autofocus}
      className='h-(--param-field-h) w-full rounded-(--param-field-radius) border-border/50 bg-muted pr-6 pl-2 text-right text-sm text-(--param-field-color) shadow-none transition-colors hover:border-border hover:text-(--param-field-color-focus) focus-visible:border-border focus-visible:text-(--param-field-color-focus)'
      onFocus={() => {
        onFocus(id, value);
      }}
      onBlur={() => {
        onBlur(id, value);
      }}
      onChange={(event) => {
        if (!disabled && !readonly) {
          onChange(event.target.value);
        }
      }}
    />
  ),
  DescriptionFieldTemplate: ({ description }) =>
    description ? <div className='mb-2 text-sm text-muted-foreground'>{description}</div> : null,
  ErrorListTemplate: ({ errors }: ErrorListProps) => (
    <div className='space-y-1 px-3'>
      {errors.map((error) => (
        <div
          key={`${error.schemaPath}-${error.property}-${error.name}-${JSON.stringify(error.params)}`}
          className='text-sm text-feature'
        >
          {error.stack}
        </div>
      ))}
    </div>
  ),
  FieldErrorTemplate: ({ errors }) => (errors ? <div className='mt-1 text-xs text-feature'>{errors}</div> : null),
  FieldHelpTemplate: ({ help }) => (help ? <div className='mt-1 text-xs text-muted-foreground'>{help}</div> : null),
  TitleFieldTemplate: ({ title }) => (title ? <h2 className='mb-2 text-lg font-medium'>{title}</h2> : null),
  UnsupportedFieldTemplate({ reason, schema }) {
    const fieldPath = useRenderedFieldPath()?.path;
    const fieldName = fieldPath?.at(-1) ?? 'root';
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
  // oxlint-disable-next-line typescript/promise-function-async -- RJSF's ReactNode includes Promise, but this wrapper is synchronous.
  WrapIfAdditionalTemplate: ({ children }) => children,
};

export const uiSchema: UiSchema<Record<string, unknown>, RJSFSchema, RJSFContext> = {
  'ui:widget': 'ParametersWidget',
  'ui:globalOptions': {
    addable: true,
    copyable: true,
    orderable: true,
    removable: true,
    label: true,
  },
  'ui:options': {
    hideError: false,
    submitButtonOptions: {
      norender: true,
    },
  },
} as const satisfies UiSchema<Record<string, unknown>, RJSFSchema, RJSFContext>;
