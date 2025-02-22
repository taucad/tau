/* eslint-disable unicorn/no-null */
import { Laptop, Moon, Sun } from 'lucide-react';
import { Theme, useTheme } from 'remix-themes';

import { Button } from '../ui/button';
import { SidebarMenuButton } from '../ui/sidebar';
import { useCookie } from '@/utils/cookies';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { useKeydown } from '@/hooks/use-keydown';

const THEME_COOKIE_NAME = 'theme-mode';

type ThemeCookie = Theme | 'system';

const parseThemeCookie = (value: string): Theme | null => {
  if (value === 'system') {
    return null;
  }
  return value as Theme;
};

const stringifyThemeCookie = (value: Theme | null): ThemeCookie => {
  if (value === null) {
    return 'system';
  }
  return value;
};

export function ModeToggle() {
  const [, setTheme] = useTheme();
  const [theme, setThemeCookie] = useCookie(THEME_COOKIE_NAME, null, {
    parse: parseThemeCookie,
    stringify: stringifyThemeCookie,
  });

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

  useKeydown({
    key: 'u',
    callback: cycleTheme,
    ctrlKey: true,
    metaKey: true,
  });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <SidebarMenuButton asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={cycleTheme}
            className="group relative overflow-hidden w-auto"
            data-theme={stringifyThemeCookie(theme)}
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
      <TooltipContent side="right">Toggle theme (⌘U)</TooltipContent>
    </Tooltip>
  );
}
