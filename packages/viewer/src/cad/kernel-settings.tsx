import { Cpu, RotateCcw } from 'lucide-react';
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuSwitchItem,
} from '@taucad/ui/components/dropdown-menu';
import { DropdownMenuSliderItem } from '@taucad/ui/components/menu-slider-item';
import { keepMenuOpen, SettingsSubViewRow } from '#cad/settings-sub-view-row.jsx';

/** A JSON Schema node, as far as the kernel settings read one. */
type SchemaNode = Readonly<{
  type?: unknown;
  title?: unknown;
  description?: unknown;
  default?: unknown;
  minimum?: unknown;
  maximum?: unknown;
  exclusiveMinimum?: unknown;
  exclusiveMaximum?: unknown;
  multipleOf?: unknown;
  examples?: unknown;
  enum?: unknown;
  oneOf?: unknown;
  properties?: Readonly<Record<string, SchemaNode>>;
  'x-tau-unit'?: unknown;
  'x-tau-labels'?: unknown;
}>;

type NumberField = Readonly<{
  kind: 'number';
  path: readonly string[];
  label: string;
  unit: string | undefined;
  min: number;
  max: number;
  /** False when `min` only starts the drag window. */
  hasMinimum: boolean;
  /** False when `max` only ends the drag window: a typed value may go past it. */
  hasMaximum: boolean;
  exclusiveMinimum: number | undefined;
  exclusiveMaximum: number | undefined;
  step: number;
  /** What the row shows with no value: the default, else the schema's first example (an option the kernel resolves). */
  shown: number;
}>;

type BooleanField = Readonly<{ kind: 'boolean'; path: readonly string[]; label: string }>;

/** The value an unset enum row offers when the schema declares no default: the kernel decides, so the row says so. */
const kernelDefaultValue = '';

/**
 * One of a string enum: a dropdown row showing the current value, opening a submenu of the values. A schema without
 * a default (the kernel resolves the value, perhaps from another option) also offers Default, which unsets it.
 */
type EnumField = Readonly<{
  kind: 'enum';
  path: readonly string[];
  label: string;
  values: ReadonlyArray<Readonly<{ value: string; label: string }>>;
  /** The schema's or the view's default; `undefined` when the kernel resolves an unset value itself. */
  defaultValue: string | undefined;
}>;

/**
 * A setting that is one of a list of presets or an explicit object, never both: a `oneOf` of a string enum and an
 * object. It shows as one radio list, the presets then Custom; Custom also shows the object's number rows in their
 * units. A choice replaces the whole value; nothing is carried across.
 */
type ChoiceField = Readonly<{
  kind: 'choice';
  path: readonly string[];
  label: string;
  presets: readonly string[];
  explicitFields: readonly NumberField[];
  /** The explicit object a choice of Custom starts with: each field's example value. */
  explicitSeed: Readonly<Record<string, number>>;
}>;

/** The radio value that stands for a choice's explicit object; preset names never contain a space. */
const customChoiceValue = 'custom values';

/**
 * A run of settings under an optional heading: the schema's top-level leaves, or one object's leaves.
 *
 * @public
 */
export type KernelSettingsGroup = Readonly<{
  label: string | undefined;
  fields: ReadonlyArray<NumberField | BooleanField | EnumField | ChoiceField>;
}>;

const asNumber = (value: unknown): number | undefined => (typeof value === 'number' ? value : undefined);

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

const firstExample = (node: SchemaNode): number | undefined =>
  Array.isArray(node.examples) ? asNumber(node.examples[0]) : undefined;

/** `linearTolerance` → `Linear tolerance`, the menu's sentence case. */
const humanize = (key: string): string => {
  const words = key
    .replaceAll(/([\da-z])([A-Z])/g, '$1 $2')
    .replaceAll(/[_-]+/g, ' ')
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const unitSymbols: Readonly<Record<string, string>> = { deg: '°', percent: '%' };

/** One step a tenth of the default's order of magnitude, so a drag can reach values near the default. */
const stepFor = (value: number, isInteger: boolean): number => {
  const step = value === 0 ? 0.01 : 10 ** (Math.floor(Math.log10(Math.abs(value))) - 1);
  return isInteger ? Math.max(1, Math.round(step)) : step;
};

/** A string enum's values with their labels: the schema's `x-tau-labels`, else each value in sentence case. */
const enumValues = (node: SchemaNode): Array<{ value: string; label: string }> | undefined => {
  if (!Array.isArray(node.enum) || (node.type !== undefined && node.type !== 'string')) {
    return undefined;
  }
  const values = node.enum.filter((value): value is string => typeof value === 'string');
  if (values.length === 0 || values.length !== node.enum.length) {
    return undefined;
  }
  const labels = asRecord(node['x-tau-labels']) ?? {};
  return values.map((value) => {
    const label = labels[value];
    return { value, label: typeof label === 'string' ? label : humanize(value) };
  });
};

const toField = (
  path: readonly string[],
  node: SchemaNode,
  fallback: unknown,
): NumberField | BooleanField | EnumField | undefined => {
  const label = typeof node.title === 'string' ? node.title : humanize(path.at(-1) ?? '');
  if (node.type === 'boolean') {
    return { kind: 'boolean', path, label };
  }
  const values = enumValues(node);
  if (values) {
    const defaultValue = [fallback, node.default].find(
      (value): value is string => typeof value === 'string' && values.some((entry) => entry.value === value),
    );
    return { kind: 'enum', path, label, values, defaultValue };
  }
  if (node.type !== 'number' && node.type !== 'integer') {
    // ponytail: numbers, switches and enums only; a kernel offering free text adds its row kind here.
    return undefined;
  }
  const isInteger = node.type === 'integer';
  const defaultValue = asNumber(node.default) ?? asNumber(fallback) ?? firstExample(node) ?? 0;
  const step = asNumber(node.multipleOf) ?? stepFor(defaultValue, isInteger);
  const minimum = asNumber(node.minimum);
  const maximum = asNumber(node.maximum);
  const exclusiveMinimum = asNumber(node.exclusiveMinimum);
  const exclusiveMaximum = asNumber(node.exclusiveMaximum);
  // Without a declared bound, the parameter form's window: zero to twice the default.
  const windowMax = defaultValue > 0 ? defaultValue * 2 : 100;
  const unit = typeof node['x-tau-unit'] === 'string' ? node['x-tau-unit'] : undefined;
  return {
    kind: 'number',
    path,
    label,
    unit: unit === undefined ? undefined : (unitSymbols[unit] ?? unit),
    min: minimum ?? (exclusiveMinimum === undefined ? 0 : exclusiveMinimum + step),
    max: maximum ?? (exclusiveMaximum === undefined ? windowMax : exclusiveMaximum - step),
    hasMinimum: minimum !== undefined,
    hasMaximum: maximum !== undefined,
    exclusiveMinimum,
    exclusiveMaximum,
    step,
    shown: defaultValue,
  };
};

/**
 * Read a `oneOf` of exactly one string enum and one object with properties as a preset-or-explicit choice.
 *
 * @param key - The setting's property name.
 * @param node - The setting's schema.
 * @returns The choice field, or `undefined` when the schema is not that union.
 */
const toChoiceField = (key: string, node: SchemaNode): ChoiceField | undefined => {
  if (!Array.isArray(node.oneOf) || node.oneOf.length !== 2) {
    return undefined;
  }
  const branches = node.oneOf as SchemaNode[];
  const presetBranch = branches.find((branch) => branch.type === 'string' && Array.isArray(branch.enum));
  const explicitBranch = branches.find((branch) => branch.type === 'object' && branch.properties);
  const presets = (presetBranch?.enum as unknown[] | undefined)?.filter(
    (value): value is string => typeof value === 'string',
  );
  if (!presets || presets.length === 0 || !explicitBranch?.properties) {
    return undefined;
  }
  const explicitFields: NumberField[] = [];
  const explicitSeed: Record<string, number> = {};
  for (const [leaf, child] of Object.entries(explicitBranch.properties)) {
    const field = toField([key, leaf], child, undefined);
    if (field?.kind === 'number') {
      explicitFields.push(field);
      explicitSeed[leaf] = firstExample(child) ?? field.min;
    }
  }
  if (explicitFields.length === 0) {
    return undefined;
  }
  return {
    kind: 'choice',
    path: [key],
    label: typeof node.title === 'string' ? node.title : humanize(key),
    presets,
    explicitFields,
    explicitSeed,
  };
};

/**
 * The settings a view's option schema offers: its top-level leaves, then each object's leaves under its title, and
 * each preset-or-explicit choice under its own title.
 *
 * @public
 */
export const kernelSettingsGroups = (schema: unknown, defaults: Record<string, unknown>): KernelSettingsGroup[] => {
  const properties = (schema as SchemaNode | undefined)?.properties ?? {};
  const loose: Array<NumberField | BooleanField | EnumField> = [];
  const groups: KernelSettingsGroup[] = [];
  for (const [key, node] of Object.entries(properties)) {
    const choice = toChoiceField(key, node);
    if (choice) {
      groups.push({ label: choice.label, fields: [choice] });
      continue;
    }
    if (node.type === 'object' && node.properties) {
      const nested = (defaults[key] ?? node.default ?? {}) as Record<string, unknown>;
      const fields = Object.entries(node.properties).flatMap(([leaf, child]) => {
        const field = toField([key, leaf], child, nested[leaf]);
        return field ? [field] : [];
      });
      if (fields.length > 0) {
        groups.push({ label: typeof node.title === 'string' ? node.title : humanize(key), fields });
      }
      continue;
    }
    const field = toField([key], node, defaults[key]);
    if (field) {
      loose.push(field);
    }
  }
  return loose.length > 0 ? [{ label: undefined, fields: loose }, ...groups] : groups;
};

const readPath = (source: Record<string, unknown>, path: readonly string[]): unknown => {
  let value: unknown = source;
  for (const key of path) {
    value = value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;
  }
  return value;
};

/**
 * The whole option set with one setting changed: a kernel reads every declared value, not only the changed one.
 * A nested leaf merges only into an object: a preset string beside it is replaced, never merged. A top-level
 * `undefined` removes the setting.
 *
 * @public
 */
export const withSetting = (
  current: Readonly<{ values: Record<string, unknown>; defaults: Record<string, unknown> }>,
  path: readonly string[],
  value: unknown,
): Record<string, unknown> => {
  const { values, defaults } = current;
  const [key, leaf] = path;
  if (key === undefined) {
    return values;
  }
  const merged = { ...defaults, ...values };
  if (leaf === undefined) {
    if (value === undefined) {
      // An unset value is absent, so the kernel resolves it; a present `undefined` would not survive the record.
      return Object.fromEntries(Object.entries(merged).filter(([name]) => name !== key));
    }
    return { ...merged, [key]: value };
  }
  const nested = { ...asRecord(defaults[key]), ...asRecord(values[key]), [leaf]: value };
  return { ...merged, [key]: nested };
};

/**
 * How many settings differ from the kernel's defaults.
 *
 * @public
 */
export const countChangedSettings = (
  groups: readonly KernelSettingsGroup[],
  values: Record<string, unknown>,
  defaults: Record<string, unknown>,
): number =>
  groups
    .flatMap((group) => group.fields)
    .filter((field) => {
      const value = readPath(values, field.path);
      return value !== undefined && !Object.is(value, readPath(defaults, field.path));
    }).length;

type KernelSettingsProps = Readonly<{
  groups: readonly KernelSettingsGroup[];
  values: Record<string, unknown>;
  defaults: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  onReset: () => void;
}>;

/**
 * The viewer settings menu's Kernel settings: one row reading "Defaults" or how many settings are changed, opening
 * the current view's options as a sub-view of radio lists, slider rows and switch rows, with Reset to defaults last.
 * The sub-view stays open on a choice.
 * @public
 */
export function KernelSettings({
  groups,
  values,
  defaults,
  onChange,
  onReset,
}: KernelSettingsProps): React.JSX.Element {
  const changedCount = countChangedSettings(groups, values, defaults);
  const valueAt = (path: readonly string[]): unknown => readPath(values, path) ?? readPath(defaults, path);
  const renderNumber = (
    field: NumberField,
    row: Readonly<{ value: unknown; onValue: (next: number) => void; isInset?: boolean }>,
  ): React.JSX.Element => (
    <DropdownMenuSliderItem
      key={field.path.join('.')}
      isInset={row.isInset}
      value={Number(row.value ?? field.shown)}
      min={field.min}
      max={field.max}
      hasMinimum={field.hasMinimum}
      hasMaximum={field.hasMaximum}
      step={field.step}
      trailingAdornment={field.unit}
      aria-label={field.label}
      onValueChange={(next) => {
        // A typed value outside an exclusive bound is not a setting the kernel accepts.
        if (
          (field.exclusiveMinimum !== undefined && next <= field.exclusiveMinimum) ||
          (field.exclusiveMaximum !== undefined && next >= field.exclusiveMaximum)
        ) {
          return;
        }
        row.onValue(next);
      }}
    >
      {field.label}
    </DropdownMenuSliderItem>
  );
  const renderEnum = (field: EnumField): React.JSX.Element => {
    const current = valueAt(field.path);
    const selected = typeof current === 'string' ? current : (field.defaultValue ?? kernelDefaultValue);
    const options =
      field.defaultValue === undefined
        ? [{ value: kernelDefaultValue, label: 'Default' }, ...field.values]
        : field.values;
    const shown = options.find((option) => option.value === selected)?.label ?? selected;
    return (
      <DropdownMenuSub key={field.path.join('.')}>
        <DropdownMenuSubTrigger aria-label={`${field.label}, ${shown}`} textValue={field.label}>
          <span>{field.label}</span>
          <span className='ml-auto pl-3 text-muted-foreground'>{shown}</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          {/* The Back row reads "Back", so the sub-view, the group named for the setting, shows its name. */}
          <DropdownMenuLabel>{field.label}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={selected}
            onValueChange={(next) => {
              if (next !== selected) {
                onChange(withSetting({ values, defaults }, field.path, next === kernelDefaultValue ? undefined : next));
              }
            }}
          >
            {options.map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value} onSelect={keepMenuOpen}>
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  };
  const renderChoice = (field: ChoiceField): React.JSX.Element => {
    const current = valueAt(field.path);
    const isCustom = typeof current !== 'string';
    // The stored explicit object is the whole value: an edit changes one field of it and keeps the rest as they are.
    const explicit = isCustom ? (asRecord(current) ?? {}) : {};
    const selected = isCustom ? customChoiceValue : current;
    const replace = (next: unknown): void => {
      onChange(withSetting({ values, defaults }, field.path, next));
    };
    return (
      <div key={field.path.join('.')} className='flex flex-col gap-0.5'>
        {/* The setting's group names the list. */}
        <DropdownMenuRadioGroup
          value={selected}
          onValueChange={(next) => {
            if (next !== selected) {
              replace(next === customChoiceValue ? { ...field.explicitSeed } : next);
            }
          }}
        >
          {field.presets.map((preset) => (
            <DropdownMenuRadioItem key={preset} value={preset} onSelect={keepMenuOpen}>
              {humanize(preset)}
            </DropdownMenuRadioItem>
          ))}
          <DropdownMenuRadioItem value={customChoiceValue} onSelect={keepMenuOpen}>
            Custom
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        {isCustom
          ? field.explicitFields.map((explicitField) => {
              const leaf = explicitField.path.at(-1) ?? '';
              return renderNumber(explicitField, {
                value: explicit[leaf] ?? field.explicitSeed[leaf],
                onValue: (next) => {
                  replace({ ...explicit, [leaf]: next });
                },
                // The explicit values belong to Custom: their labels start where the radio labels do.
                isInset: true,
              });
            })
          : undefined}
      </div>
    );
  };
  return (
    <SettingsSubViewRow
      icon={<Cpu />}
      label='Kernel settings'
      value={changedCount === 0 ? 'Defaults' : `${changedCount} changed`}
    >
      {groups.map((group) => (
        <div key={group.label ?? ''} role='group' aria-label={group.label} className='flex flex-col gap-0.5'>
          {/* The group is named for assistive technology; its heading is for the eye. */}
          {group.label ? <DropdownMenuLabel aria-hidden='true'>{group.label}</DropdownMenuLabel> : undefined}
          {group.fields.map((field) => {
            if (field.kind === 'boolean') {
              return (
                <DropdownMenuSwitchItem
                  key={field.path.join('.')}
                  isChecked={valueAt(field.path) === true}
                  onIsCheckedChange={(isChecked) => {
                    onChange(withSetting({ values, defaults }, field.path, isChecked));
                  }}
                >
                  {field.label}
                </DropdownMenuSwitchItem>
              );
            }
            if (field.kind === 'number') {
              return renderNumber(field, {
                value: valueAt(field.path),
                onValue: (next) => {
                  onChange(withSetting({ values, defaults }, field.path, next));
                },
              });
            }
            if (field.kind === 'enum') {
              return renderEnum(field);
            }
            return renderChoice(field);
          })}
        </div>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        disabled={changedCount === 0}
        onSelect={(event) => {
          event.preventDefault();
          onReset();
        }}
      >
        <RotateCcw />
        Reset to defaults
      </DropdownMenuItem>
    </SettingsSubViewRow>
  );
}
