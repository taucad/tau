import { useState } from 'react';
import { ThemeToggle } from '#components/nav/theme-toggle.js';
import { ColorToggle } from '#components/nav/color-toggle.js';
import { NavInfoContent, NavInfoTrigger } from '#components/nav/nav-info.js';
import { NavBugReportDialog } from '#components/nav/nav-bug-report-dialog.js';
import { Collapsible } from '#components/ui/collapsible.js';
import { SidebarMenuButton } from '#components/ui/sidebar.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { metaConfig } from '#constants/meta.constants.js';
import { SvgIcon } from '#components/icons/svg-icon.js';

export function NavFooter(): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} className='flex w-full flex-col-reverse' onOpenChange={setIsOpen}>
      <div className='flex w-full items-center justify-between'>
        <SidebarMenuButton asChild className='w-auto gap-1 overflow-hidden'>
          <a href={metaConfig.githubUrl} target='_blank' rel='noopener noreferrer'>
            <SvgIcon id='github' className='size-3!' />
            <span className='text-xs'>{metaConfig.githubRepo}</span>
            <span className='sr-only'>GitHub</span>
          </a>
        </SidebarMenuButton>
        <div className='flex flex-row items-center -space-x-1'>
          <Tooltip>
            <TooltipTrigger asChild>
              <SidebarMenuButton
                asChild
                className='size-7 cursor-pointer transition-colors hover:text-[#5865F2] focus-visible:text-[#5865F2]'
              >
                <a href={metaConfig.discordUrl} target='_blank' rel='noopener noreferrer'>
                  <SvgIcon id='discord' className='size-4!' />
                  <span className='sr-only'>Join our Discord</span>
                </a>
              </SidebarMenuButton>
            </TooltipTrigger>
            <TooltipContent side='top'>Join the Discord — say hi, swap CAD tips, shape what we build</TooltipContent>
          </Tooltip>
          <NavInfoTrigger isOpen={isOpen} />
          <NavBugReportDialog />
          <ColorToggle />
          <ThemeToggle />
        </div>
      </div>
      <NavInfoContent />
    </Collapsible>
  );
}
