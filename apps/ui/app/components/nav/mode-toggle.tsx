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
  // eslint-disable-next-line unicorn/no-null -- null is used as the system theme, undefined can't be stored in local storage.
  const [theme, setThemeCookie] = useCookie<ThemeWithSystem>(THEME_COOKIE_NAME, null);

  const cycleTheme = () => {
    let newTheme;
    if (theme === Theme.LIGHT) {
      newTheme = Theme.DARK;
    } else if (theme === Theme.DARK) {
      // eslint-disable-next-line unicorn/no-null -- null is used as the system theme, undefined can't be stored in local storage.
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
            className="group relative w-auto overflow-hidden"
            data-theme={theme ?? 'system'}
          >
            <Sun className="h-[1.2rem] w-[1.2rem] origin-right -translate-x-[400%] rotate-[-180deg] transition-transform duration-500 group-data-[theme=light]:translate-x-0 group-data-[theme=light]:rotate-0" />
            <Moon className="absolute h-[1.2rem] w-[1.2rem] origin-left translate-x-[400%] rotate-[180deg] transition-transform duration-500 group-data-[theme=dark]:translate-x-0 group-data-[theme=dark]:rotate-0" />
            <Laptop className="absolute h-[1.2rem] w-[1.2rem] origin-top translate-y-[400%] transition-transform duration-500 group-data-[theme=system]:translate-y-0" />
            <span className="sr-only">Toggle theme</span>
          </Button>
        </SidebarMenuButton>
      </TooltipTrigger>
      <TooltipContent side="right" className="flex items-center gap-2 align-baseline">
        Toggle theme{' '}
        <KeyShortcut variant="tooltip" className="ml-1">
          {formattedKeyCombination}
        </KeyShortcut>
      </TooltipContent>
    </Tooltip>
  );
}
