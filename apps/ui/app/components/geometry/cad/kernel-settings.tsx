import { Cpu } from 'lucide-react';
import { DropdownMenuItem, DropdownMenuSwitchItem } from '@taucad/ui/components/dropdown-menu';
import { DropdownMenuDisclosureItem } from '#components/ui/menu-disclosure-item.js';
import { DropdownMenuSliderItem } from '#components/ui/menu-slider-item.js';

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

/** A run of settings under an optional heading: the schema's top-level leaves, or one object's leaves. */
export type KernelSettingsGroup = Readonly<{
  label: string | undefined;
  fields: ReadonlyArray<NumberField | BooleanField>;
}>;

const asNumber = (value: unknown): number | undefined => (typeof value === 'number' ? value : undefined);

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
  const defaultValue = asNumber(node.default) ?? asNumber(fallback) ?? 0;
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

/** The settings a view's option schema offers: its top-level leaves, then each object's leaves under its title. */
export const kernelSettingsGroups = (schema: unknown, defaults: Record<string, unknown>): KernelSettingsGroup[] => {
  const properties = (schema as SchemaNode | undefined)?.properties ?? {};
  const loose: Array<NumberField | BooleanField> = [];
  const groups: KernelSettingsGroup[] = [];
  for (const [key, node] of Object.entries(properties)) {
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

/** The whole option set with one setting changed: a kernel reads every declared value, not only the changed one. */
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
  const nested = {
    ...(defaults[key] as Record<string, unknown> | undefined),
    ...(values[key] as Record<string, unknown> | undefined),
    [leaf]: value,
  };
  return { ...merged, [key]: nested };
};

/** How many settings differ from the kernel's defaults. */
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
            {group.fields.map((field) =>
              field.kind === 'number' ? (
                <DropdownMenuSliderItem
                  key={field.path.join('.')}
                  value={Number(valueAt(field.path) ?? field.min)}
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
                    onChange(withSetting({ values, defaults }, field.path, next));
                  }}
                >
                  {field.label}
                </DropdownMenuSliderItem>
              ) : (
                <DropdownMenuSwitchItem
                  key={field.path.join('.')}
                  isChecked={valueAt(field.path) === true}
                  onIsCheckedChange={(isChecked) => {
                    onChange(withSetting({ values, defaults }, field.path, isChecked));
                  }}
                >
                  {field.label}
                </DropdownMenuSwitchItem>
              ),
            )}
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
