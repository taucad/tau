import type { JSX } from 'react';
import { Input } from '~/components/ui/input.js';
import { isValidColor, StringColorPicker } from '~/components/ui/string-color-picker.js';

type ChatParametersStringProps = {
  readonly value: string;
  readonly defaultValue: string;
  readonly onChange: (value: string) => void;
};

export function ChatParametersString({ value, defaultValue, onChange }: ChatParametersStringProps): JSX.Element {
  // Check if either the current value or default value is a valid color
  // This ensures we show the color picker even when the value is cleared
  const isColorParameter = isValidColor(defaultValue);

  if (isColorParameter) {
    return (
      <StringColorPicker
        value={value}
        onChange={(newValue) => {
          onChange(newValue);
        }}
      />
    );
  }

  // Otherwise, render a regular text input
  return (
    <Input
      autoComplete="off"
      type="text"
      value={value}
      className="h-6 flex-1 bg-background p-1"
      onChange={(event) => {
        onChange(event.target.value);
      }}
    />
  );
}
