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
import { useEffect, useState } from 'react';
import { Button } from '#components/ui/button.js';
import { Input } from '#components/ui/input.js';
import { ChatParametersBoolean } from '#routes/builds_.$id/chat-parameters-boolean.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#components/ui/select.js';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '#components/ui/collapsible.js';
import { cn } from '#utils/ui.js';
import { toSentenceCase } from '#utils/string.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { HighlightText } from '#components/highlight-text.js';
import { ChatParameterWidget } from '#routes/builds_.$id/chat-parameter-widget.js';
import { rjsfIdToJsonPath, hasCustomValue, rjsfIdPrefix } from '#routes/builds_.$id/rjsf-utils.js';

// eslint-disable-next-line @typescript-eslint/naming-convention -- RJSF uses this format for formContext
export type RJSFContext = {
  searchTerm: string;
  allExpanded: boolean;
  resetSingleParameter: (fieldPath: string[]) => void;
  shouldShowField: (prettyLabel: string) => boolean;
};

// Custom Field Template with Reset Button and Search Filtering
function FieldTemplate(props: FieldTemplateProps<Record<string, unknown>, RJSFSchema, RJSFContext>): React.ReactNode {
  const { label, help, required, description, errors, children, schema, formData, id, registry } = props;

  if (schema.type === 'object') {
    const isRoot = id === rjsfIdPrefix;
    return <div className={cn(!isRoot && 'my-2 first:mt-0 last:mb-0')}>{children}</div>;
  }

  // Always call hooks at the very top level
  const { formContext } = registry;
  const prettyLabel = toSentenceCase(label);

  if (!formContext.shouldShowField(prettyLabel)) {
    return null; // Hide field if it doesn't match search
  }

  // Convert RJSF ID to JSON path using schema-aware parsing
  const fieldPath = rjsfIdToJsonPath(id);

  // Check if field has custom value
  const defaultValue = schema.default;
  const fieldHasValue = hasCustomValue(formData, defaultValue);

  const handleReset = () => {
    formContext.resetSingleParameter(fieldPath);
  };

  return (
    <div className="@container/parameter flex flex-col rounded-md p-1 transition-colors hover:bg-muted/30">
      <div className="flex h-auto min-h-6 flex-row justify-between gap-2">
        <span className={cn(fieldHasValue ? 'font-medium' : 'font-normal')} aria-label={`Parameter: ${prettyLabel}`}>
          <HighlightText text={prettyLabel} searchTerm={formContext.searchTerm} />
          {required ? <span className="text-destructive">*</span> : null}
        </span>
        {fieldHasValue ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="xs"
                className="text-muted-foreground"
                onClick={handleReset}
              >
                <RefreshCcwDot className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Reset &quot;{prettyLabel}&quot;</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      {description}
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
  const { title, description, properties, idSchema, registry } = props;

  const { formContext } = registry;

  const [isOpen, setIsOpen] = useState<boolean | undefined>(true);
  const isRoot = idSchema.$id === rjsfIdPrefix;

  useEffect(() => {
    setIsOpen(formContext.allExpanded);
  }, [formContext.allExpanded]);

  if (isRoot) {
    return <div>{properties.map((element) => element.content)}</div>;
  }

  // FIXED: Check if the group should be visible by checking BOTH:
  // 1. If the group title itself matches the search term, OR
  // 2. If any child properties match the search term
  const prettyTitle = toSentenceCase(title);
  const groupTitleMatches = formContext.shouldShowField(prettyTitle);

  const hasVisibleChildProperties = properties.some((property) => {
    const propertyName = property.name;
    const prettyLabel = toSentenceCase(propertyName);
    return formContext.shouldShowField(prettyLabel);
  });

  // Show the group if either the title matches OR any children match
  const shouldShowGroup = groupTitleMatches || hasVisibleChildProperties;

  // Don't render the group if neither title nor children would be visible
  if (!shouldShowGroup) {
    return null;
  }

  const propertiesCount = properties.length;

  return (
    <Collapsible
      open={isOpen}
      className="w-full overflow-hidden rounded-md border"
      onOpenChange={setIsOpen}
    >
      <CollapsibleTrigger className="group/collapsible flex h-7 w-full items-center justify-between bg-neutral/5 pr-1.5 pl-2 transition-colors hover:bg-neutral/10">
        <h3 className="flex min-w-0 flex-1 items-center font-medium">
          <span className="truncate">{prettyTitle}</span>
          <span className="ml-1 flex-shrink-0 text-muted-foreground/50">({propertiesCount})</span>
        </h3>
        <ChevronRight className="size-4 text-muted-foreground transition-transform duration-300 ease-in-out group-data-[state=open]/collapsible:rotate-90" />
      </CollapsibleTrigger>

      <CollapsibleContent className="p-1">
        {description ? <div className="mb-2 px-1 text-sm text-muted-foreground">{description}</div> : null}
        {properties.map((element) => element.content)}
      </CollapsibleContent>
    </Collapsible>
  );
}

// Custom Select Widget for Enums
function SelectWidget(props: WidgetProps): React.ReactNode {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- value is untyped in RJSF
  const { options, value, onChange, placeholder } = props;

  const { enumOptions, enumDisabled } = options;

  const handleChange = (newValue: string) => {
    onChange(newValue === '' ? undefined : newValue);
  };

  if (!enumOptions) {
    throw new Error('No enum options provided');
  }

  return (
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- value is untyped in RJSF
    <Select value={value} onValueChange={handleChange}>
      <SelectTrigger size="sm" className="min-w-0 flex-1 bg-background">
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
  const { value, onChange } = props;
  return <ChatParametersBoolean value={Boolean(value)} onChange={onChange} />;
}

function SimpleInputWidget(props: WidgetProps & { readonly inputType: string }): React.ReactNode {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- value is untyped in RJSF
  const { value, onChange, inputType, schema } = props;
  return (
    <Input
      type={inputType}
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- value is untyped in RJSF
      value={value}
      defaultValue={schema.default as string}
      className="h-6 flex-1 bg-background p-1"
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
  ArrayFieldTemplate: (props: ArrayFieldTemplateProps) => (
    <div className="w-full space-y-2">
      {props.items.map((item) => item.children)}
      {props.canAdd ? (
        <Button type="button" variant="outline" size="sm" onClick={props.onAddClick}>
          Add Item
        </Button>
      ) : null}
    </div>
  ),
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
    <div className="space-y-1">
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
  UnsupportedFieldTemplate: () => <div className="text-sm text-destructive">Unsupported field type</div>,
  WrapIfAdditionalTemplate: async ({ children }) => children,
};

export const uiSchema: UiSchema = {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- RJSF uses this format for ui:globalOptions
  'ui:widget': 'ChatParameterWidget',
  // eslint-disable-next-line @typescript-eslint/naming-convention -- RJSF uses this format for ui:globalOptions
  'ui:globalOptions': {
    addable: true,
    copyable: false,
    orderable: true,
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
