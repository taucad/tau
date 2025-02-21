import { Button } from '@/components/ui/button';
import { SidebarMenuButton } from '@/components/ui/sidebar';
import { Pipette } from 'lucide-react';
import { ColorPicker, ColorPickerValue } from '../ui/color-picker';
import { useCookie } from '@/utils/cookies';
import { useEffect } from 'react';
import { cn } from '@/utils/ui';

export const COLOR_COOKIE_NAME = 'tau-color-hue';
export const COLOR_COOKIE_EXPIRATION = 365;
const OKLCH_TO_HSL_HUE_DIFF = 17.95;

// Function to update CSS variables
const updateRootStyles = (hue: number) => {
  const root = document.documentElement;
  root.style.setProperty('--hue-primary', `${hue}deg`);
};

export const ColorToggle = () => {
  const [colorCookie, setColorCookie] = useCookie(COLOR_COOKIE_NAME, 266, {
    parse: Number,
    stringify: String,
  });

  // Update styles whenever the colorCookie changes
  useEffect(() => {
    updateRootStyles(colorCookie + OKLCH_TO_HSL_HUE_DIFF);
  }, [colorCookie]);

  const handleChange = (value: ColorPickerValue) => {
    setColorCookie(value.h);
  };

  return (
    <SidebarMenuButton asChild>
      <ColorPicker asChild value={{ h: colorCookie, s: 50, l: 50 }} onChange={handleChange} disableSaturation>
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
