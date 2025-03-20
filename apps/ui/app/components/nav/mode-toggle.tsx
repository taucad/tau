/* eslint-disable unicorn/no-null */
import { Laptop, Moon, Sun } from 'lucide-react';
import { Theme, useTheme } from 'remix-themes';

import { Button } from '../ui/button';
import { SidebarMenuButton } from '../ui/sidebar';
import { useCookie } from '@/utils/cookies';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { useKeydown } from '@/hooks/use-keydown';
import { KeyShortcut } from '../ui/key-shortcut';

const THEME_COOKIE_NAME = 'tau-theme-mode';

// null is used to represent the system theme
type ThemeWithSystem = Theme | null;

export function ModeToggle() {
  const [, setTheme] = useTheme();
  const [theme, setThemeCookie] = useCookie<ThemeWithSystem>(THEME_COOKIE_NAME, null);

  const cycleTheme = () => {
    let newTheme;
    if (theme === Theme.LIGHT) {
      newTheme = Theme.DARK;
    } else if (theme === Theme.DARK) {
      newTheme = null; // Use the correct constant or value for system theme
    } else {
      newTheme = Theme.LIGHT;
    }
    setTheme(newTheme);
    setThemeCookie(newTheme);
  };

  const { formattedKeyCombination } = useKeydown(
    {
      key: 'u',
      metaKey: true,
    },
    cycleTheme,
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <SidebarMenuButton asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={cycleTheme}
            className="group relative overflow-hidden w-auto"
            data-theme={theme ?? 'system'}
          >
            <Sun
              className="h-[1.2rem] w-[1.2rem] transition-transform duration-500 -translate-x-[400%] rotate-[-180deg] origin-right
              group-data-[theme=light]:translate-x-0 group-data-[theme=light]:rotate-0"
            />
            <Moon
              className="absolute h-[1.2rem] w-[1.2rem] transition-transform duration-500 translate-x-[400%] rotate-[180deg] origin-left
              group-data-[theme=dark]:translate-x-0 group-data-[theme=dark]:rotate-0"
            />
            <Laptop
              className="absolute h-[1.2rem] w-[1.2rem] transition-transform duration-500 translate-y-[400%] origin-top
              group-data-[theme=system]:translate-y-0 "
            />
            <span className="sr-only">Toggle theme</span>
          </Button>
        </SidebarMenuButton>
      </TooltipTrigger>
      <TooltipContent side="right" className="flex items-center align-baseline gap-2">
        Toggle theme{' '}
        <KeyShortcut variant="tooltip" className="ml-1">
          {formattedKeyCombination}
        </KeyShortcut>
      </TooltipContent>
    </Tooltip>
  );
}
