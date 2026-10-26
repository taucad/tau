/**
 * Preview's compact top bar (canvas HDR-12, charter D11, W9).
 *
 * One 48px row, as the shell pages' phone bar draws it: the sidebar, a back-to-parent crumb that returns to the
 * project ("‹ Bracket", named "Back to Bracket"), the page title, then Preview's own two controls: Workbench, which
 * opens the drawer with Parameters, Files, Export and Details, and one More menu for the rest. Each destination is
 * here once (I4): Export lives in the Workbench, and the crumb is the way to the editor, so More holds no Edit.
 */
import { useCallback, useRef, useState } from 'react';
import { Download, Ellipsis, PanelBottom, PanelLeft, Settings } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { DrawerTrigger } from '@taucad/ui/components/drawer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { PageParentCrumb } from '#components/layout/page.js';
import { SidebarTrigger } from '#components/ui/sidebar.js';
import { ProjectSettingsDialog } from '#routes/w.$workspace.$project_.preview/project-settings-dialog.js';

/** The menu that holds Preview's page actions on the compact bar. */
export const previewMoreActionsLabel = 'More preview actions';

/**
 * A tooltip that stays shut on a coarse pointer. There a bar control's tooltip could open only from focus, and the
 * focus it gets is the focus the drawer, the menu or the settings dialog hands back on close: the tooltip would pop
 * over the bar after every tap. The project bar avoids it by never handing focus to a tooltipped control; these two
 * controls must take focus back (T6), so their tooltips decline to open instead.
 */
const useBarTooltip = (): { readonly open: boolean; readonly onOpenChange: (open: boolean) => void } => {
  const [open, setOpen] = useState(false);
  const onOpenChange = useCallback((next: boolean) => {
    if (next && globalThis.matchMedia('(pointer: coarse)').matches) {
      return;
    }
    setOpen(next);
  }, []);
  return { open, onOpenChange };
};

/**
 * The compact Preview bar. It renders inside the workbench layout's `Drawer`, whose trigger it supplies.
 *
 * @param props - The project and its actions.
 * @returns The 48px bar.
 * @public
 */
export function PreviewPhoneTopBar({
  projectName,
  editorUrl,
  onDownloadSource,
}: {
  readonly projectName: string | undefined;
  /** The project's editor, the crumb's parent. */
  readonly editorUrl: string;
  readonly onDownloadSource: () => void;
}): React.JSX.Element {
  const moreRef = useRef<HTMLButtonElement>(null);
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const parent = projectName ?? 'Project';
  const workbenchTooltip = useBarTooltip();
  const moreTooltip = useBarTooltip();
  return (
    <header data-slot='preview-top-bar' className='flex h-12 shrink-0 items-center gap-0.5 border-b bg-background px-1'>
      {/* I3: every control in the bar is a 40px target, as in the shell's phone bar. */}
      <SidebarTrigger className='size-10 md:hidden'>
        <PanelLeft aria-hidden data-slot='sidebar-panel-icon' className='size-5' />
      </SidebarTrigger>
      {/* The shell's back-to-parent crumb; here it shrinks first, so the title stays. */}
      <PageParentCrumb to={editorUrl} label={parent} className='shrink' />
      {/* oxlint-disable-next-line tau-lint/no-raw-page-heading -- The route draws its own 48px bar (`enablePageHeader: false`); `PageHeader` is the 36px page title row, so this bar title is the page's one heading. */}
      <h1 className='min-w-fit flex-1 truncate px-1 text-sm font-medium'>
        <span className='sr-only'>{parent} </span>
        Preview
      </h1>
      <Tooltip {...workbenchTooltip}>
        <DrawerTrigger asChild>
          <TooltipTrigger asChild>
            <Button type='button' variant='ghost' size='icon-lg' aria-label='Workbench'>
              <PanelBottom aria-hidden className='size-5' />
            </Button>
          </TooltipTrigger>
        </DrawerTrigger>
        <TooltipContent>Workbench</TooltipContent>
      </Tooltip>
      <DropdownMenu>
        <Tooltip {...moreTooltip}>
          <DropdownMenuTrigger asChild>
            <TooltipTrigger asChild>
              <Button ref={moreRef} type='button' variant='ghost' size='icon-lg' aria-label={previewMoreActionsLabel}>
                <Ellipsis aria-hidden className='size-5' />
              </Button>
            </TooltipTrigger>
          </DropdownMenuTrigger>
          <TooltipContent>{previewMoreActionsLabel}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align='end'>
          <DropdownMenuItem onSelect={onDownloadSource}>
            <Download aria-hidden />
            Download source
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setSettingsOpen(true);
            }}
          >
            <Settings aria-hidden />
            Project settings
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ProjectSettingsDialog
        controlled={{
          open: isSettingsOpen,
          onOpenChange: setSettingsOpen,
          returnFocus: () => moreRef.current?.focus(),
        }}
      />
    </header>
  );
}
