import { SettingsGroup, SettingsRow } from '#components/settings/settings-item.js';
import { Check, ChevronDown, Circle, Contrast, Laptop, Moon, Sun } from 'lucide-react';
import { Theme, useTheme, themeOptions } from '#hooks/use-theme.js';
import type { ThemeWithSystem } from '#hooks/use-theme.js';
import { useColor } from '#hooks/use-color.js';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';
import { ComboBoxResponsive } from '@taucad/ui/components/combobox-responsive';
import { ColorPicker } from '#components/ui/color-picker.js';
import { Button } from '@taucad/ui/components/button';
import { Switch } from '@taucad/ui/components/switch';

function getThemeIcon(themeId: ThemeWithSystem): React.JSX.Element {
  switch (themeId) {
    case Theme.LIGHT: {
      return <Sun className='size-4' />;
    }

    case Theme.DARK: {
      return <Moon className='size-4' />;
    }

    case Theme.BLACK: {
      return <Circle className='size-4 fill-black' />;
    }

    case Theme.HIGH_CONTRAST: {
      return <Contrast className='size-4' />;
    }

    default: {
      return <Laptop className='size-4' />;
    }
  }
}

/**
 * General settings: how Tau looks and feels on this device.
 */
export function GeneralSettings(): React.JSX.Element {
  const { themeWithSystem, setTheme, currentOption } = useTheme();
  const { hue, setHue, resetHue } = useColor();
  const [areCodeInlayHintsEnabled, setCodeInlayHintsEnabled] = useCookie(cookieName.codeInlayHints, false);
  const [usePointerCursors, setUsePointerCursors] = useCookie(cookieName.pointerCursors, false);

  const handleThemeChange = (value: string): void => {
    const newTheme = value === 'null' ? null : (value as Theme);
    setTheme(newTheme);
  };

  return (
    <div className='flex flex-col gap-6 pb-6'>
      <SettingsGroup title='Appearance'>
        <SettingsRow
          settingId='theme'
          title='Theme'
          description='Choose light, dark or match your system'
          control={
            <ComboBoxResponsive
              title='Theme'
              description='Select your preferred color scheme'
              groupedItems={[{ name: 'Theme', items: themeOptions }]}
              getValue={(item) => String(item.id)}
              value={currentOption}
              isSearchEnabled={false}
              renderLabel={(item, selectedItem) => (
                <span className='flex w-full items-center justify-between gap-4'>
                  <div className='flex items-center gap-2'>
                    {getThemeIcon(item.id)}
                    <div className='flex flex-col gap-0.5'>
                      <span className='font-medium'>{item.name}</span>
                      <span className='text-xs text-muted-foreground'>{item.description}</span>
                    </div>
                  </div>
                  {selectedItem?.id === item.id ? <Check className='size-4 shrink-0' /> : null}
                </span>
              )}
              onSelect={handleThemeChange}
            >
              <Button variant='outline' size='sm' className='w-36 justify-between'>
                <span className='flex items-center gap-2'>
                  {getThemeIcon(themeWithSystem)}
                  <span className='truncate'>{currentOption.name}</span>
                </span>
                <ChevronDown className='size-4 shrink-0 opacity-50' />
              </Button>
            </ComboBoxResponsive>
          }
        />
        <SettingsRow
          settingId='accent-color'
          title='Accent color'
          description='Tint buttons, links and highlights'
          control={
            <ColorPicker
              hasTooltip={false}
              value={{ h: hue, s: 100, l: 75 }}
              onReset={resetHue}
              onChange={(value) => {
                setHue(value.h);
              }}
            >
              <Button variant='outline' size='sm' className='w-36 justify-between'>
                <span className='flex items-center gap-2'>
                  <span className='size-4 shrink-0 rounded-full bg-primary' />
                  <span className='truncate'>Hue {hue}°</span>
                </span>
                <ChevronDown className='size-4 shrink-0 opacity-50' />
              </Button>
            </ColorPicker>
          }
        />
        <SettingsRow
          settingId='pointer-cursors'
          title='Pointer cursors'
          description='Show a hand cursor over buttons and links'
          control={
            <Switch aria-label='Pointer cursors' checked={usePointerCursors} onCheckedChange={setUsePointerCursors} />
          }
        />
      </SettingsGroup>
      <SettingsGroup title='Editor'>
        <SettingsRow
          settingId='code-inlay-hints'
          title='Code inlay hints'
          description='Show parameter names inline in code'
          control={
            <Switch
              aria-label='Code inlay hints'
              checked={areCodeInlayHintsEnabled}
              onCheckedChange={setCodeInlayHintsEnabled}
            />
          }
        />
      </SettingsGroup>
    </div>
  );
}
