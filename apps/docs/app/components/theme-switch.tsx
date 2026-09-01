import type { ComponentProps } from 'react';
import { useTheme } from 'fumadocs-ui/provider/base';

const themes = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'black', label: 'Black' },
  { value: 'high-contrast', label: 'High contrast' },
] as const;

export const TauThemeSwitch = ({ className, ...properties }: ComponentProps<'div'>): React.JSX.Element => {
  const { setTheme, theme } = useTheme();

  return (
    <div className={className} data-theme-toggle='' {...properties}>
      <select
        aria-label='Theme'
        className='h-8 max-w-36 rounded-md border border-border bg-background px-2 font-mono text-xs text-foreground'
        value={theme ?? 'system'}
        onChange={(event) => {
          setTheme(event.target.value);
        }}
      >
        {themes.map(({ label, value }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
};
