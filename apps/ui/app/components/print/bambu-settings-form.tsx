/**
 * Bambu Studio's settings as a grouped form (blueprint U2, D8): process tabs
 * (Quality, Strength, Speed, Support, Others, All other settings) and filament
 * sections, each folded until opened, with a filter, a modified mark and reset
 * per setting, and a count with reset-all. Only open groups mount their rows,
 * so the ~600 settings of a resolved preset stay cheap.
 *
 * @module
 */

import { memo, useCallback, useMemo, useState } from 'react';
import { ChevronRight, RotateCcw } from 'lucide-react';
import type { JSONSchema7 } from '@taucad/json-schema';
import type { BambuStudioSettings } from '@taucad/slicer/bambu-studio';
import { Button } from '@taucad/ui/components/button';
import { Checkbox } from '@taucad/ui/components/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import { cn } from '@taucad/ui/utils/cn';
import { SearchInput } from '#components/search-input.js';

/** One setting as the form lists it. */
type Leaf = Readonly<{ key: string; title: string; description: string; schema: JSONSchema7; searchText: string }>;
type Group = Readonly<{ id: string; label: string; scope: string; leaves: readonly Leaf[] }>;

const percentPattern = /^-?(?:\d+\.?\d*|\.\d+)%$/u;
const fieldClass =
  'h-7 w-full min-w-0 rounded-md border border-input bg-background px-2 text-xs text-foreground aria-invalid:border-destructive';

const asSchema = (value: unknown): JSONSchema7 | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as JSONSchema7) : undefined;

const typesOf = (schema: JSONSchema7): readonly string[] =>
  Array.isArray(schema.type) ? schema.type : schema.type === undefined ? [] : [schema.type];

const collectGroups = (settings: BambuStudioSettings): readonly Group[] =>
  settings.groups.flatMap((group) => {
    const properties = asSchema(
      asSchema(settings.schema.properties?.[group.scope])?.properties?.[group.id],
    )?.properties;
    const leaves = Object.entries(properties ?? {}).flatMap(([key, value]): Leaf[] => {
      const schema = asSchema(value);
      if (!schema) {
        return [];
      }
      const title = schema.title ?? key;
      const description = schema.description ?? '';
      return [{ key, title, description, schema, searchText: `${key} ${title} ${description}`.toLowerCase() }];
    });
    return leaves.length === 0 ? [] : [{ id: group.id, label: group.label, scope: group.scope, leaves }];
  });

/** A value as an input shows it. */
const display = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
};

/**
 * Parse what the person typed for a number, number-or-percent, text or list setting.
 *
 * @returns The value to store, or `undefined` when the text is not valid for the setting.
 */
const parseTyped = (schema: JSONSchema7, text: string): unknown => {
  const trimmed = text.trim();
  const types = typesOf(schema);
  if (types.includes('array')) {
    return parseList(schema, trimmed);
  }
  if (trimmed === '') {
    return types.includes('null') ? null : types.includes('string') && !types.includes('number') ? '' : undefined;
  }
  if (types.includes('number') || types.includes('integer')) {
    const number = Number(trimmed);
    if (
      Number.isFinite(number) &&
      (!types.includes('integer') || types.includes('number') || Number.isInteger(number))
    ) {
      const { minimum = -Infinity, maximum = Infinity } = schema;
      return number >= minimum && number <= maximum ? number : undefined;
    }
    return types.includes('string') && percentPattern.test(trimmed) ? trimmed : undefined;
  }
  return trimmed;
};

/** A list setting typed as comma-separated items. */
const parseList = (schema: JSONSchema7, text: string): unknown => {
  const items = asSchema(schema.items) ?? {};
  const parts = text === '' ? [] : text.split(',').map((part) => parseTyped(items, part));
  return parts.includes(undefined) ? undefined : parts;
};

type ControlProperties = Readonly<{
  id: string;
  leaf: Leaf;
  value: unknown;
  onCommit: (key: string, value: unknown) => void;
}>;

function SettingControl({ id, leaf, value, onCommit }: ControlProperties): React.JSX.Element {
  const { schema, key } = leaf;
  const choices = schema.oneOf?.map((choice) => asSchema(choice)).filter((choice) => choice !== undefined);
  if (choices && choices.length > 0) {
    return (
      <select
        id={id}
        className={fieldClass}
        value={value === null ? '' : display(value)}
        onChange={(event) => {
          const picked = choices.find((choice) => display(choice.const) === event.target.value);
          onCommit(key, picked?.const ?? null);
        }}
      >
        {choices.map((choice) => (
          <option key={display(choice.const)} value={display(choice.const)}>
            {choice.title ?? display(choice.const)}
          </option>
        ))}
      </select>
    );
  }
  if (typesOf(schema).includes('boolean')) {
    return (
      <Checkbox
        id={id}
        checked={value === true}
        onCheckedChange={(checked) => {
          onCommit(key, checked === true);
        }}
      />
    );
  }
  const types = typesOf(schema);
  const isNumber = (types.includes('number') || types.includes('integer')) && !types.includes('string');
  const commit = (input: HTMLInputElement): void => {
    const parsed = parseTyped(schema, input.value);
    if (parsed === undefined) {
      // Not valid for this setting: show the stored value again rather than keep an unsendable draft.
      input.value = display(value);
      return;
    }
    onCommit(key, parsed);
  };
  return (
    <input
      // A new stored value (a reset, a preset change) replaces the draft.
      key={display(value)}
      id={id}
      type={isNumber ? 'number' : 'text'}
      inputMode={isNumber ? 'decimal' : undefined}
      min={isNumber ? schema.minimum : undefined}
      max={isNumber ? schema.maximum : undefined}
      step={isNumber ? 'any' : undefined}
      placeholder={types.includes('null') ? 'Printer value' : undefined}
      className={cn(fieldClass, 'tabular-nums')}
      defaultValue={display(value)}
      onBlur={(event) => {
        commit(event.currentTarget);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          commit(event.currentTarget);
        }
      }}
    />
  );
}

const SettingRow = memo(function SettingRow({
  leaf,
  value,
  isModified,
  onCommit,
  onReset,
}: {
  readonly leaf: Leaf;
  readonly value: unknown;
  readonly isModified: boolean;
  readonly onCommit: (key: string, value: unknown) => void;
  readonly onReset: (key: string) => void;
}): React.JSX.Element {
  const id = `bambu-setting-${leaf.key}`;
  const unit = (leaf.schema as Record<string, unknown>)['x-tau-unit'];
  return (
    <div className='flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 py-0.5 text-xs'>
      <label htmlFor={id} title={leaf.description} className='flex min-w-0 flex-1 basis-40 items-center gap-1.5'>
        {isModified ? <span aria-hidden className='size-1.5 shrink-0 rounded-full bg-primary' /> : null}
        <span className='min-w-0 truncate'>{leaf.title}</span>
        {isModified ? <span className='sr-only'>(changed)</span> : null}
      </label>
      <div className='flex w-40 shrink-0 items-center gap-1'>
        <SettingControl id={id} leaf={leaf} value={value} onCommit={onCommit} />
        {typeof unit === 'string' ? (
          <span className='shrink-0 text-muted-foreground'>{unit === 'Cel' ? '°C' : unit}</span>
        ) : null}
      </div>
      <Button
        type='button'
        size='icon-xs'
        variant='ghost'
        aria-label={`Reset ${leaf.title}`}
        className={cn(!isModified && 'invisible')}
        disabled={!isModified}
        onClick={() => {
          onReset(leaf.key);
        }}
      >
        <RotateCcw aria-hidden />
      </Button>
    </div>
  );
});

/**
 * Bambu Studio's settings for the selected presets, grouped as Bambu Studio groups them.
 *
 * @param properties - The settings, their current values, the person's overrides and the change handler.
 * @returns The form.
 * @public
 */
export function BambuSettingsForm({
  settings,
  defaults,
  overrides,
  onChange,
}: {
  readonly settings: BambuStudioSettings;
  /** Bambu key → value of the selected presets. */
  readonly defaults: Readonly<Record<string, unknown>>;
  /** Bambu key → value the person changed. */
  readonly overrides: Readonly<Record<string, unknown>>;
  readonly onChange: (overrides: Record<string, unknown>) => void;
}): React.JSX.Element {
  const groups = useMemo(() => collectGroups(settings), [settings]);
  const [filter, setFilter] = useState('');
  const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(new Set());
  const term = filter.trim().toLowerCase();
  const visible = useMemo(
    () =>
      term === ''
        ? groups
        : groups
            .map((group) => ({ ...group, leaves: group.leaves.filter((leaf) => leaf.searchText.includes(term)) }))
            .filter((group) => group.leaves.length > 0),
    [groups, term],
  );
  const changedCount = Object.keys(overrides).length;
  const commit = useCallback(
    (key: string, value: unknown) => {
      const { [key]: _previous, ...rest } = overrides;
      onChange(JSON.stringify(value) === JSON.stringify(defaults[key]) ? rest : { ...rest, [key]: value });
    },
    [defaults, onChange, overrides],
  );
  const reset = useCallback(
    (key: string) => {
      const { [key]: _removed, ...rest } = overrides;
      onChange(rest);
    },
    [onChange, overrides],
  );

  return (
    <div role='group' aria-label='Bambu Studio settings' className='flex min-w-0 flex-col gap-2'>
      <div className='flex min-w-0 items-center gap-2'>
        <SearchInput
          aria-label='Filter settings'
          placeholder='Filter settings'
          value={filter}
          className='h-7 text-xs'
          containerClassName='min-w-0 flex-1'
          onChange={(event) => {
            setFilter(event.target.value);
          }}
          onClear={() => {
            setFilter('');
          }}
        />
        <span role='status' className='shrink-0 text-xs text-muted-foreground tabular-nums'>
          {changedCount === 0 ? 'Preset values' : `${String(changedCount)} changed`}
        </span>
        <Button
          type='button'
          size='xs'
          variant='outline'
          disabled={changedCount === 0}
          onClick={() => {
            onChange({});
          }}
        >
          Reset all
        </Button>
      </div>
      {visible.length === 0 ? (
        <p className='text-xs text-muted-foreground'>No setting matches “{filter.trim()}”.</p>
      ) : null}
      {(['process', 'filament'] as const).map((scope) => {
        const scoped = visible.filter((group) => group.scope === scope);
        if (scoped.length === 0) {
          return null;
        }
        return (
          <div key={scope} className='flex min-w-0 flex-col'>
            <h4 className='px-1 pb-1 text-xs font-medium text-muted-foreground'>
              {scope === 'process' ? 'Process' : 'Filament'}
            </h4>
            {scoped.map((group) => {
              const isOpen = term !== '' || openGroups.has(group.id);
              const changed = group.leaves.filter((leaf) => Object.hasOwn(overrides, leaf.key)).length;
              return (
                <Collapsible
                  key={group.id}
                  open={isOpen}
                  onOpenChange={(open) => {
                    setOpenGroups((current) => {
                      const next = new Set(current);
                      if (open) {
                        next.add(group.id);
                      } else {
                        next.delete(group.id);
                      }
                      return next;
                    });
                  }}
                >
                  <CollapsibleTrigger className='group/settings flex min-h-7 w-full items-center gap-2 rounded-md px-1 text-left text-xs hover:bg-accent/50'>
                    <ChevronRight
                      aria-hidden
                      className='size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 ease-out group-data-[state=open]/settings:rotate-90 motion-reduce:transition-none'
                    />
                    <span className='min-w-0 flex-1 truncate'>{group.label}</span>
                    {changed > 0 ? (
                      <span className='shrink-0 text-muted-foreground tabular-nums'>
                        <span className='sr-only'>, </span>
                        {`${String(changed)} changed`}
                      </span>
                    ) : null}
                  </CollapsibleTrigger>
                  <CollapsibleContent className='flex min-w-0 flex-col pr-1 pb-1 pl-6'>
                    {group.leaves.map((leaf) => (
                      <SettingRow
                        key={leaf.key}
                        leaf={leaf}
                        value={Object.hasOwn(overrides, leaf.key) ? overrides[leaf.key] : defaults[leaf.key]}
                        isModified={Object.hasOwn(overrides, leaf.key)}
                        onCommit={commit}
                        onReset={reset}
                      />
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
