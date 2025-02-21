import { Button } from '@/components/ui/button';
import { SidebarMenuButton } from '@/components/ui/sidebar';
import { Pipette } from 'lucide-react';
import { ColorPicker, ColorPickerValue } from '../ui/color-picker';
import { useCookie } from '@/utils/cookies';
import { CSSProperties, useEffect } from 'react';
import { cn } from '@/utils/ui';

export const COLOR_COOKIE_NAME = 'tau-color-hue';
export const DEFAULT_COLOR = 242;
export const OKLCH_TO_HSL_HUE_DIFF = 17.95;
const HUE_CSS_VAR = '--hue-primary';

export const getRootColorStyle = (hue: number) => {
  return { [HUE_CSS_VAR]: `${computeHue(hue)}deg` } as CSSProperties;
};

const computeHue = (hue: number) => {
  return Number(hue) + OKLCH_TO_HSL_HUE_DIFF;
};

// Function to update CSS variables
const updateRootStyles = (hue: number) => {
  const root = document.documentElement;
  root.style.setProperty(HUE_CSS_VAR, `${hue}deg`);
};

export const ColorToggle = () => {
  const [colorCookie, setColorCookie] = useCookie(COLOR_COOKIE_NAME, DEFAULT_COLOR, {
    parse: Number,
    stringify: String,
  });

  // Update styles whenever the colorCookie changes
  useEffect(() => {
    updateRootStyles(computeHue(colorCookie));
  }, [colorCookie]);

  const handleChange = (value: ColorPickerValue) => {
    setColorCookie(value.h);
  };

  const handleReset = () => {
    setColorCookie(DEFAULT_COLOR);
  };

  return (
    <SidebarMenuButton asChild>
      <ColorPicker
        asChild
        value={{ h: colorCookie, s: 50, l: 50 }}
        onChange={handleChange}
        disableSaturation
        onReset={handleReset}
      >
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'w-auto overflow-hidden',
            // Active styles
            'data-[state=open]:bg-primary hover:data-[state=open]:bg-primary',
            // Text styles
            'data-[state=open]:text-primary-foreground hover:data-[state=open]:text-primary-foreground',
          )}
        >
          <Pipette className="w-4 h-4" />
        </Button>
      </ColorPicker>
    </SidebarMenuButton>
  );
};
