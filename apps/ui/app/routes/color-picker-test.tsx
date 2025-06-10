import React, { useState } from 'react';
import type { JSX } from 'react';
import { StringColorPicker, isValidColor } from '~/components/ui/string-color-picker.js';

export default function ColorPickerTest(): JSX.Element {
  const [colors, setColors] = useState({
    hex: '#ff0000',
    rgb: 'rgb(0, 255, 0)',
    rgba: 'rgba(0, 0, 255, 0.5)',
    rgbaTransparent: 'rgba(255, 128, 0, 0.3)',
    rgbaOpaque: 'rgba(128, 0, 255, 1.0)',
    hsl: 'hsl(120, 100%, 50%)',
    hsla: 'hsla(240, 100%, 50%, 0.8)',
    named: 'purple',
    lab: 'lab(50% 20 -30)',
    oklch: 'oklch(70% 0.15 180)',
    p3: 'color(display-p3 0.8 0.2 0.6)',
    invalid: 'not-a-color',
  });

  const handleColorChange = (key: string, value: string) => {
    setColors((previous) => ({
      ...previous,
      [key]: value,
    }));
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-8 text-3xl font-bold text-foreground">Color Picker Test</h1>

        <div className="space-y-6">
          {Object.entries(colors).map(([key, value]) => (
            <div key={key} className="space-y-2">
              <div className="flex items-center gap-4">
                <span className="w-16 text-sm font-medium text-foreground capitalize">{key}:</span>
                <span className={`text-sm ${isValidColor(value) ? 'text-green-600' : 'text-red-600'}`}>
                  {isValidColor(value) ? '✓ Valid' : '✗ Invalid'}
                </span>
                <div
                  className="h-8 w-8 rounded border border-border"
                  style={{ backgroundColor: isValidColor(value) ? value : 'transparent' }}
                />
              </div>

              <div className="max-w-md">
                <StringColorPicker
                  value={value}
                  onChange={(newValue) => {
                    handleColorChange(key, newValue);
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-lg bg-muted p-6">
          <h2 className="mb-4 text-xl font-semibold text-foreground">Current Values:</h2>
          <pre className="overflow-x-auto text-sm text-muted-foreground">{JSON.stringify(colors, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}
