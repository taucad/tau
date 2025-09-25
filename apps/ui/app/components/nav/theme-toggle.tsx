import { Laptop, Moon, Sun } from 'lucide-react';
import { Theme, useTheme } from 'remix-themes';
import { SidebarMenuButton } from '#components/ui/sidebar.js';
import { useCookie } from '#hooks/use-cookie.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { useKeydown } from '#hooks/use-keydown.js';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import { cookieName } from '#constants/cookie.constants.js';

// Null is used to represent the system theme
// eslint-disable-next-line @typescript-eslint/no-restricted-types -- null is used to represent the system theme, as it's serializable in JSON
type ThemeWithSystem = Theme | null;

export function ThemeToggle(): React.JSX.Element {
  const [, setTheme] = useTheme();

  const [theme, setThemeCookie] = useCookie<ThemeWithSystem>(cookieName.theme, null);

  const cycleTheme = () => {
    let newTheme;
    if (theme === Theme.LIGHT) {
      newTheme = Theme.DARK;
    } else if (theme === Theme.DARK) {
      newTheme = null;
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
        <SidebarMenuButton
          className="group relative w-auto overflow-hidden"
          data-theme={theme ?? 'system'}
          onClick={cycleTheme}
        >
          <Sun className="h-[1.2rem] w-[1.2rem] origin-right -translate-x-[400%] rotate-[-180deg] transition-transform duration-500 group-data-[theme=light]:translate-x-0 group-data-[theme=light]:rotate-0" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] origin-left translate-x-[400%] rotate-[180deg] transition-transform duration-500 group-data-[theme=dark]:translate-x-0 group-data-[theme=dark]:rotate-0" />
          <Laptop className="absolute h-[1.2rem] w-[1.2rem] origin-top translate-y-[400%] transition-transform duration-500 group-data-[theme=system]:translate-y-0" />
          <span className="sr-only">Toggle theme</span>
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
