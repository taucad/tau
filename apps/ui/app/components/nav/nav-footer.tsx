import { ThemeToggle } from '#components/nav/theme-toggle.js';
import { ColorToggle } from '#components/nav/color-toggle.js';
import { SidebarMenuButton } from '#components/ui/sidebar.js';
import { Button } from '#components/ui/button.js';
import { metaConfig } from '#constants/meta.constants.js';
import { SvgIcon } from '#components/icons/svg-icon.js';

export function NavFooter(): React.JSX.Element {
  return (
    <>
      <SidebarMenuButton asChild className="w-auto gap-1 overflow-hidden">
        <Button asChild variant="ghost" size="sm">
          <a href={metaConfig.githubUrl} target="_blank" rel="noopener noreferrer">
            <SvgIcon id="github" className="size-3!" />
            <span className="text-xs">{metaConfig.githubRepo}</span>
            <span className="sr-only">GitHub</span>
          </a>
        </Button>
      </SidebarMenuButton>
      <div className="flex flex-row items-center -space-x-1">
        <ColorToggle />
        <ThemeToggle />
      </div>
    </>
  );
}
