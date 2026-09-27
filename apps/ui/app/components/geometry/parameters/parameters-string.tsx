import type { JSONValue } from '@taucad/types';
import { Input } from '@taucad/ui/components/input';
import { isValidColor, StringColorPicker } from '#components/ui/string-color-picker.js';
import { cn } from '@taucad/ui/utils/cn';

type ParametersStringProps = {
  readonly value: string;
  readonly defaultValue: string;
  readonly onChange: (value: string) => void;
} & Omit<React.ComponentProps<typeof Input>, 'type' | 'value' | 'onChange'>;

export function ParametersString({
  value,
  defaultValue,
  onChange,
  className,
  ...properties
}: ParametersStringProps): React.JSX.Element {
  // Check if either the current value or default value is a valid color
  // This ensures we show the color picker even when the value is cleared
  const isColorParameter = isValidColor(defaultValue);

  if (isColorParameter) {
    return (
      <StringColorPicker
        value={value}
        className={className}
        onChange={(newValue) => {
          onChange(newValue);
        }}
        {...properties}
      />
    );
  }

  // Otherwise, render a regular text input
  return (
    <Input
      autoComplete='off'
      type='text'
      value={value}
      className={cn(
        'h-(--param-field-h) w-full rounded-(--param-field-radius) border-border/50 bg-muted px-3 text-(--param-field-color) text-sm shadow-none transition-colors hover:border-border hover:text-(--param-field-color-focus) focus-visible:border-border focus-visible:text-(--param-field-color-focus)',
        className,
      )}
      onChange={(event) => {
        onChange(event.target.value);
      }}
      {...properties}
    />
  );
}

const decimalPattern = /^-?(?:\d+\.?\d*|\.\d+)$/u;
const fieldClassName =
  'h-(--param-field-h) w-full rounded-(--param-field-radius) border-border/50 bg-muted px-3 text-(--param-field-color) text-sm shadow-none transition-colors hover:border-border hover:text-(--param-field-color-focus) focus-visible:border-border focus-visible:text-(--param-field-color-focus)';

type ParametersNumberOrStringProps = {
  readonly value: unknown;
  /** The pattern a text value must match, such as a percentage; numbers need not. */
  readonly pattern: string | undefined;
  readonly minimum: number | undefined;
  readonly maximum: number | undefined;
  readonly isNullable: boolean;
  /** Receives a number, the matching text, or `null` when a nullable field is cleared. */
  readonly onChange: (value: JSONValue) => void;
} & Omit<React.ComponentProps<typeof Input>, 'type' | 'value' | 'defaultValue' | 'onChange' | 'pattern'>;

/**
 * A field that takes a number or a text value such as `50%`. It commits when the person leaves it
 * or presses Enter, and shows the stored value again when the text is neither.
 *
 * @param properties - The value, what it admits and the change handler.
 * @returns The field.
 */
export function ParametersNumberOrString({
  value,
  pattern,
  minimum = -Infinity,
  maximum = Infinity,
  isNullable,
  onChange,
  className,
  onBlur,
  onKeyDown,
  ...properties
}: ParametersNumberOrStringProps): React.JSX.Element {
  const shown = typeof value === 'number' || typeof value === 'string' ? String(value) : '';
  const commit = (input: HTMLInputElement): void => {
    const text = input.value.trim();
    const number = Number(text);
    const next =
      text === ''
        ? isNullable
          ? null
          : undefined
        : decimalPattern.test(text)
          ? number >= minimum && number <= maximum
            ? number
            : undefined
          : pattern !== undefined && new RegExp(pattern, 'u').test(text)
            ? text
            : undefined;
    if (next === undefined) {
      input.value = shown;
      return;
    }
    if (next !== value) {
      onChange(next);
    }
  };
  return (
    <Input
      // A new stored value (a reset, another preset) replaces the draft.
      key={shown}
      autoComplete='off'
      type='text'
      inputMode='decimal'
      defaultValue={shown}
      className={cn(fieldClassName, 'tabular-nums', className)}
      onBlur={(event) => {
        commit(event.currentTarget);
        onBlur?.(event);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          commit(event.currentTarget);
        }
        onKeyDown?.(event);
      }}
      {...properties}
    />
  );
}
