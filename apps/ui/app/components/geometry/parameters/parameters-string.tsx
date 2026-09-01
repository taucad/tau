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
