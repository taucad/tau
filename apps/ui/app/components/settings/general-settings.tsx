import { Link } from 'react-router';
import { AlertCircle, Check, ChevronDown, Laptop, Moon, ShieldCheck, Sun } from 'lucide-react';
import { Loader } from '#components/ui/loader.js';
import { usePrivacyPreferences } from '#hooks/use-privacy-preferences.js';
import { Theme, useTheme, themeOptions } from '#hooks/use-theme.js';
import type { ThemeWithSystem } from '#hooks/use-theme.js';
import { useColor } from '#hooks/use-color.js';
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card.js';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { ColorPicker } from '#components/ui/color-picker.js';
import { Button } from '#components/ui/button.js';

type PrivacyMode = {
  id: 'share' | 'private';
  name: string;
  description: string;
};

const privacyModes: PrivacyMode[] = [
  {
    id: 'share',
    name: 'Share Data',
    description: 'Improve Tau for everyone',
  },
  {
    id: 'private',
    name: 'Privacy Mode',
    description: 'No training. Your data is not used to improve AI.',
  },
];

function getThemeIcon(themeId: ThemeWithSystem): React.JSX.Element {
  switch (themeId) {
    case Theme.LIGHT: {
      return <Sun className="size-4" />;
    }

    case Theme.DARK: {
      return <Moon className="size-4" />;
    }

    default: {
      return <Laptop className="size-4" />;
    }
  }
}

/**
 * General settings component containing privacy and appearance preferences.
 */
export function GeneralSettings(): React.JSX.Element {
  const { preferences, isLoading, error, updatePreferences, isUpdating } = usePrivacyPreferences();
  const { themeWithSystem, setTheme, currentOption } = useTheme();
  const { hue, setHue, resetHue } = useColor();

  const currentModeId = preferences?.allowsAiTraining ? 'share' : 'private';
  const currentMode = privacyModes.find((mode) => mode.id === currentModeId) ?? privacyModes[0]!;

  const handlePrivacyModeChange = (value: string): void => {
    updatePreferences({ allowsAiTraining: value === 'share' });
  };

  const handleThemeChange = (value: string): void => {
    const newTheme = value === 'null' ? null : (value as Theme);
    setTheme(newTheme);
  };

  return (
    <div className="flex flex-col gap-6 pb-6">
      {/* Appearance Section */}
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Theme Selector */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <span className="font-medium">Theme</span>
              <span className="text-sm text-muted-foreground">Select your preferred color scheme</span>
            </div>
            <ComboBoxResponsive
              title="Theme"
              description="Select your preferred color scheme"
              groupedItems={[{ name: 'Theme', items: themeOptions }]}
              getValue={(item) => String(item.id)}
              defaultValue={currentOption}
              isSearchEnabled={false}
              renderLabel={(item, selectedItem) => (
                <span className="flex w-full items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    {getThemeIcon(item.id)}
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">{item.name}</span>
                      <span className="text-xs text-muted-foreground">{item.description}</span>
                    </div>
                  </div>
                  {selectedItem?.id === item.id ? <Check className="size-4 shrink-0" /> : null}
                </span>
              )}
              onSelect={handleThemeChange}
            >
              <Button variant="outline" className="w-[160px] justify-between">
                <span className="flex items-center gap-2">
                  {getThemeIcon(themeWithSystem)}
                  <span className="truncate">{currentOption.name}</span>
                </span>
                <ChevronDown className="size-4 shrink-0 opacity-50" />
              </Button>
            </ComboBoxResponsive>
          </div>

          {/* Color Picker */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <span className="font-medium">Accent Color</span>
              <span className="text-sm text-muted-foreground">Customize the primary accent color</span>
            </div>
            <ColorPicker
              hasTooltip={false}
              value={{ h: hue, s: 100, l: 75 }}
              onReset={resetHue}
              onChange={(value) => {
                setHue(value.h);
              }}
            >
              <Button variant="outline" className="w-[160px] justify-between">
                <span className="flex items-center gap-2">
                  <span className="size-4 shrink-0 rounded-full bg-primary" />
                  <span className="truncate">Hue: {hue}°</span>
                </span>
                <ChevronDown className="size-4 shrink-0 opacity-50" />
              </Button>
            </ColorPicker>
          </div>
        </CardContent>
      </Card>

      {/* Privacy Section */}
      <Card>
        <CardHeader>
          <CardTitle>Privacy</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader className="size-5 text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="size-4 shrink-0" />
              <span>Unable to load privacy preferences. Check your connection and refresh.</span>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 font-medium">
                  {currentModeId === 'share' ? (
                    <>
                      <Check className="size-4 text-primary" />
                      Data Sharing Enabled
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="size-4 text-primary" />
                      Privacy Mode Enabled
                    </>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {currentModeId === 'share' ? (
                    <>
                      Your prompts and generated designs will be stored and used to improve our AI features.{' '}
                      <Link to="/legal/privacy#9.2.1" className="underline hover:text-foreground">
                        Learn more
                      </Link>
                    </>
                  ) : (
                    <>
                      No training. Your data is not used to improve AI features.{' '}
                      <Link to="/legal/privacy#9.2.1" className="underline hover:text-foreground">
                        Learn more
                      </Link>
                    </>
                  )}
                </p>
              </div>
              <ComboBoxResponsive
                title="Privacy Mode"
                description="Select how your data is used"
                groupedItems={[{ name: 'Privacy Settings', items: privacyModes }]}
                getValue={(item) => item.id}
                defaultValue={currentMode}
                isSearchEnabled={false}
                renderLabel={(item, selectedItem) => (
                  <span className="flex w-full items-center justify-between gap-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">{item.name}</span>
                      <span className="text-xs text-muted-foreground">{item.description}</span>
                    </div>
                    {selectedItem?.id === item.id ? <Check className="size-4 shrink-0" /> : null}
                  </span>
                )}
                onSelect={handlePrivacyModeChange}
              >
                <Button variant="outline" disabled={isUpdating} className="w-[160px] justify-between">
                  <span className="truncate">{currentMode.name}</span>
                  <ChevronDown className="size-4 shrink-0 opacity-50" />
                </Button>
              </ComboBoxResponsive>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
