import { ThemeToggle } from "#components/nav/theme-toggle.js";
import { ColorToggle } from "#components/nav/color-toggle.js";
import { SidebarMenuButton } from "#components/ui/sidebar.js";
import { Button } from "#components/ui/button.js";
import { metaConfig } from "#config.js";
import { Github } from "#components/icons/github.js";

export function NavFooter(): React.JSX.Element {
  return (
    <>
      <SidebarMenuButton className="w-auto overflow-hidden gap-1" asChild>
        <Button variant="ghost" size="sm" asChild>
          <a href={metaConfig.githubUrl} target="_blank" rel="noopener noreferrer">
            <Github className="size-3!" />
            <span className="text-xs">{metaConfig.githubOwner}/{metaConfig.githubRepo}</span>
            <span className="sr-only">GitHub</span>
          </a></Button>
        </SidebarMenuButton>
      <div className="flex flex-row items-center gap-2">
        <ColorToggle />
        <ThemeToggle />
      </div>
    </>
  );
}
