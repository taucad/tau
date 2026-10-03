import { MaterialSwatch } from '#components/geometry/cad/material-swatch.js';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@taucad/ui/components/select';

/** A text-labelled enum option. A swatch supplements the name; it never replaces it. */
export type ParameterSelectOption = Readonly<{
  value: string;
  label: string;
  secondary?: string;
  swatch?: string;
  disabled?: boolean;
}>;

export type ParameterSelectGroup = Readonly<{
  label?: string;
  options: readonly ParameterSelectOption[];
}>;

/**
 * A parameter field's height (`--param-field-h`, 1.5rem in every pane), shared by the trigger and its options so the
 * selected option still lands on the trigger. The options are portaled outside the pane, so they read the fallback.
 */
const parameterFieldHeight = 'h-[var(--param-field-h,1.5rem)] py-0';

export const parameterSelectTriggerClass = `${parameterFieldHeight} min-w-0 flex-1 border-border/50 bg-muted text-(--param-field-color) shadow-none transition-colors hover:border-border hover:text-(--param-field-color-focus) focus-visible:border-border focus-visible:text-(--param-field-color-focus)`;

/** The Parameters select presentation, shared by schema fields and print setup. */
export function ParameterSelect({
  id,
  label,
  value,
  groups,
  placeholder,
  isDisabled,
  shouldAutoFocus,
  onChange,
  onFocus,
  onBlur,
}: {
  readonly id?: string;
  readonly label: string;
  readonly value: string;
  readonly groups: readonly ParameterSelectGroup[];
  readonly placeholder?: string;
  readonly isDisabled?: boolean;
  readonly shouldAutoFocus?: boolean;
  readonly onChange: (value: string) => void;
  readonly onFocus?: () => void;
  readonly onBlur?: () => void;
}): React.JSX.Element {
  const item = (option: ParameterSelectOption): React.JSX.Element => (
    <SelectItem key={option.value} value={option.value} disabled={option.disabled} className={parameterFieldHeight}>
      <span className='flex min-w-0 items-center gap-1.5'>
        {option.swatch === undefined ? null : (
          <MaterialSwatch materials={[{ color: option.swatch, roughness: 0.35, metalness: 0 }]} />
        )}
        <span className='truncate'>{option.label}</span>
        {option.secondary === undefined ? null : (
          <span className='shrink-0 text-muted-foreground tabular-nums'>{option.secondary}</span>
        )}
      </span>
    </SelectItem>
  );
  return (
    <Select size='sm' value={value} disabled={isDisabled} onValueChange={onChange}>
      <SelectTrigger
        id={id}
        autoFocus={shouldAutoFocus}
        aria-label={label}
        className={parameterSelectTriggerClass}
        onFocus={onFocus}
        onBlur={onBlur}
      >
        <SelectValue placeholder={placeholder ?? 'Choose an option'} />
      </SelectTrigger>
      <SelectContent>
        {groups.map((group, index) =>
          group.label === undefined ? (
            group.options.map(item)
          ) : (
            <SelectGroup key={`${group.label}-${String(index)}`} className='gap-0'>
              <SelectLabel>{group.label}</SelectLabel>
              {group.options.map(item)}
            </SelectGroup>
          ),
        )}
      </SelectContent>
    </Select>
  );
}
