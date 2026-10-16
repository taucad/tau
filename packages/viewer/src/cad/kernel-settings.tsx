import { Cpu } from 'lucide-react';
import { DropdownMenuItem, DropdownMenuSwitchItem } from '@taucad/ui/components/dropdown-menu';
import { DropdownMenuDisclosureItem } from '@taucad/ui/components/menu-disclosure-item';
import { DropdownMenuSliderItem } from '@taucad/ui/components/menu-slider-item';
import { MenuSegmentedControl } from '#cad/menu-segmented-control.jsx';

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
}>;

type BooleanField = Readonly<{ kind: 'boolean'; path: readonly string[]; label: string }>;

/**
 * A setting that is one of a list of presets or an explicit object, never both: a `oneOf` of a string enum and an
 * object. It shows as two modes, Preset (the presets as one segmented control) and Custom (the object's number rows in
 * their units). Switching modes replaces the whole value; nothing is carried across.
 */
type ChoiceField = Readonly<{
  kind: 'choice';
  path: readonly string[];
  label: string;
  presets: readonly string[];
  /** The preset a switch from Custom starts with: the view's default preset, else the schema's, else the first. */
  presetSeed: string;
  explicitFields: readonly NumberField[];
  /** The explicit object a switch from a preset starts with: each field's example value. */
  explicitSeed: Readonly<Record<string, number>>;
}>;

type ChoiceMode = 'preset' | 'custom';

const choiceModes = [
  { value: 'preset', label: 'Preset' },
  { value: 'custom', label: 'Custom' },
] as const satisfies ReadonlyArray<{ value: ChoiceMode; label: string }>;

/**
 * A run of settings under an optional heading: the schema's top-level leaves, or one object's leaves.
 *
 * @public
 */
export type KernelSettingsGroup = Readonly<{
  label: string | undefined;
  fields: ReadonlyArray<NumberField | BooleanField | ChoiceField>;
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

const toField = (
  path: readonly string[],
  node: SchemaNode,
  fallback: unknown,
): NumberField | BooleanField | undefined => {
  const label = typeof node.title === 'string' ? node.title : humanize(path.at(-1) ?? '');
  if (node.type === 'boolean') {
    return { kind: 'boolean', path, label };
  }
  if (node.type !== 'number' && node.type !== 'integer') {
    // ponytail: numbers and switches only; a kernel offering text or choice options adds its row kind here.
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
  };
};

/**
 * Read a `oneOf` of exactly one string enum and one object with properties as a preset-or-explicit choice.
 *
 * @param key - The setting's property name.
 * @param node - The setting's schema.
 * @param defaultValue - The view's default for the setting, which seeds the Preset mode when it is a preset.
 * @returns The choice field, or `undefined` when the schema is not that union.
 */
const toChoiceField = (key: string, node: SchemaNode, defaultValue: unknown): ChoiceField | undefined => {
  if (!Array.isArray(node.oneOf) || node.oneOf.length !== 2) {
    return undefined;
  }
  const branches = node.oneOf as SchemaNode[];
  const presetBranch = branches.find((branch) => branch.type === 'string' && Array.isArray(branch.enum));
  const explicitBranch = branches.find((branch) => branch.type === 'object' && branch.properties);
  const presets = (presetBranch?.enum as unknown[] | undefined)?.filter(
    (value): value is string => typeof value === 'string',
  );
  const [firstPreset] = presets ?? [];
  if (!presets || firstPreset === undefined || !explicitBranch?.properties) {
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
    presetSeed:
      [defaultValue, node.default].find(
        (value): value is string => typeof value === 'string' && presets.includes(value),
      ) ?? firstPreset,
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
  const loose: Array<NumberField | BooleanField> = [];
  const groups: KernelSettingsGroup[] = [];
  for (const [key, node] of Object.entries(properties)) {
    const choice = toChoiceField(key, node, defaults[key]);
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
 * A nested leaf merges only into an object: a preset string beside it is replaced, never merged.
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
  /** Whether the settings start revealed; they start closed in the app. */
  isDefaultOpen?: boolean;
  onChange: (values: Record<string, unknown>) => void;
  onReset: () => void;
}>;

/**
 * The viewer settings menu's Kernel settings: the menus' shared disclosure, and while it is open, the current view's
 * options as the menu's own slider and switch rows, full width with their text at the menu's left edge.
 * Advanced, so it starts closed.
 * @public
 */
export function KernelSettings({
  groups,
  values,
  defaults,
  isDefaultOpen,
  onChange,
  onReset,
}: KernelSettingsProps): React.JSX.Element {
  const changedCount = countChangedSettings(groups, values, defaults);
  const valueAt = (path: readonly string[]): unknown => readPath(values, path) ?? readPath(defaults, path);
  const renderNumber = (field: NumberField, value: unknown, onValue: (next: number) => void): React.JSX.Element => (
    <DropdownMenuSliderItem
      key={field.path.join('.')}
      value={Number(value ?? field.min)}
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
        onValue(next);
      }}
    >
      {field.label}
    </DropdownMenuSliderItem>
  );
  const renderChoice = (field: ChoiceField): React.JSX.Element => {
    const current = valueAt(field.path);
    const mode: ChoiceMode = typeof current === 'string' ? 'preset' : 'custom';
    // The stored explicit object is the whole value: an edit changes one field of it and keeps the rest as they are.
    const explicit = mode === 'custom' ? (asRecord(current) ?? {}) : {};
    const replace = (next: unknown): void => {
      onChange(withSetting({ values, defaults }, field.path, next));
    };
    return (
      <div key={field.path.join('.')} className='flex flex-col gap-1'>
        <MenuSegmentedControl
          label={`${field.label} mode`}
          value={mode}
          segments={choiceModes}
          onValueChange={(next) => {
            replace(next === 'custom' ? { ...field.explicitSeed } : field.presetSeed);
          }}
        />
        {mode === 'preset' ? (
          <MenuSegmentedControl
            label={`${field.label} preset`}
            value={typeof current === 'string' ? current : ''}
            segments={field.presets.map((preset) => ({ value: preset, label: humanize(preset) }))}
            onValueChange={replace}
          />
        ) : (
          field.explicitFields.map((explicitField) => {
            const leaf = explicitField.path.at(-1) ?? '';
            return renderNumber(explicitField, explicit[leaf] ?? field.explicitSeed[leaf], (next) => {
              replace({ ...explicit, [leaf]: next });
            });
          })
        )}
      </div>
    );
  };
  return (
    <DropdownMenuDisclosureItem
      icon={<Cpu />}
      label='Kernel settings'
      description={
        changedCount === 0
          ? 'Using kernel defaults'
          : `${changedCount} changed from ${changedCount === 1 ? 'its default' : 'defaults'}`
      }
      isDefaultOpen={isDefaultOpen}
    >
      <div role='group' aria-label='Kernel settings' className='flex flex-col gap-1 pt-0.5'>
        {groups.map((group) => (
          <div key={group.label ?? ''} role='group' aria-label={group.label} className='flex flex-col gap-1'>
            {group.label ? (
              <div aria-hidden='true' className='px-3 pt-1 text-xs font-medium text-muted-foreground'>
                {group.label}
              </div>
            ) : null}
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
                return renderNumber(field, valueAt(field.path), (next) => {
                  onChange(withSetting({ values, defaults }, field.path, next));
                });
              }
              return renderChoice(field);
            })}
          </div>
        ))}
        <DropdownMenuItem
          className='text-muted-foreground'
          disabled={changedCount === 0}
          onSelect={(event) => {
            event.preventDefault();
            onReset();
          }}
        >
          Reset to defaults
        </DropdownMenuItem>
      </div>
    </DropdownMenuDisclosureItem>
  );
}
