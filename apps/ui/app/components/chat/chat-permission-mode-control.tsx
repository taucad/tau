import { useRef, useState } from 'react';
import { Check, Hand, ShieldAlert } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@taucad/ui/components/alert-dialog';
import { Button } from '@taucad/ui/components/button';
import { Command, CommandGroup, CommandItem, CommandList } from '@taucad/ui/components/command';
import { Popover, PopoverContent, PopoverTrigger } from '@taucad/ui/components/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { cn } from '@taucad/ui/utils/cn';
import { ghostPillClass } from '#components/chat/chat-agent-sheet.js';
import {
  bypassConfirmation,
  permissionModeAnnouncement,
  permissionModeName,
  permissionModeOptions,
} from '#components/chat/permission-mode-copy.js';
import { toast } from '#components/ui/sonner.js';
import { isDesktopTarget } from '#filesystem/desktop-bridge.js';
import { desktopPermissions } from '#filesystem/desktop-permissions.js';
import type { PermissionMode } from '#filesystem/desktop-permissions.js';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import { useChatPermissionMode } from '#hooks/use-permission-mode.js';
import { useProject } from '#hooks/use-project.js';
import { agentPlacementOf } from '#lib/agent-host-placement.js';

/* The glyph follows the mode, and its warning tone is never the only signal: the pill and its tooltip name the mode. */
const glyphs = {
  ask: { icon: Hand, tone: undefined },
  bypass: { icon: ShieldAlert, tone: 'text-warning' },
} as const;

/**
 * The Tau agent's permission mode on a desktop chat (blueprint D19, W9): Ask or Bypass, from the services host's
 * store. Switching to Bypass opens a focus-trapped confirmation every time, Cancel focused, and focus comes back to the
 * pill (RQ2). A change applies from the agent's next call. Shows nothing off desktop, for an external agent, or before
 * the chat exists.
 *
 * @public
 */
export function ChatPermissionModeControl({
  focusEditor,
}: {
  readonly focusEditor: () => void;
}): React.JSX.Element | undefined {
  const composer = useChatComposer();
  const project = useProject({ enableNoContext: true });
  const { execution } = composer.execution;
  const projectId = project?.projectId;
  const chatId = composer.session?.activeChatId;
  if (
    !isDesktopTarget ||
    desktopPermissions() === undefined ||
    execution.kind !== 'tau' ||
    agentPlacementOf(execution) !== 'desktop' ||
    projectId === undefined ||
    chatId === undefined
  ) {
    return undefined;
  }
  return <PermissionModePill projectId={projectId} chatId={chatId} focusEditor={focusEditor} />;
}

function PermissionModePill({
  projectId,
  chatId,
  focusEditor,
}: {
  readonly projectId: string;
  readonly chatId: string;
  readonly focusEditor: () => void;
}): React.JSX.Element | undefined {
  const { mode, setMode, isSaving } = useChatPermissionMode(projectId, chatId);
  const [isOpen, setIsOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  /* Set when the menu closes into the confirmation, so the menu does not hand focus to the editor first. */
  const toConfirmation = useRef(false);
  const closedOutside = useRef(false);

  if (mode === undefined) {
    return undefined;
  }

  const apply = async (next: PermissionMode, confirmed: boolean): Promise<void> => {
    try {
      const applied = await setMode(next, confirmed);
      setAnnouncement(permissionModeAnnouncement(applied, 'chat'));
    } catch {
      toast.error('Tau could not change this chat’s permissions.');
    }
  };

  const select = (next: PermissionMode): void => {
    if (next === mode) {
      setIsOpen(false);
      return;
    }
    if (next === 'bypass') {
      toConfirmation.current = true;
      setIsOpen(false);
      setIsConfirming(true);
      return;
    }
    setIsOpen(false);
    void apply(next, false);
  };

  const { icon: Icon, tone } = glyphs[mode];
  const name = permissionModeName(mode);
  return (
    <>
      <Tooltip>
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <TooltipTrigger asChild>
              <Button
                ref={triggerRef}
                variant='ghost'
                size='sm'
                data-chat-textarea-focustrap
                aria-label={`Permissions: ${name}`}
                disabled={isSaving}
                className={cn(
                  ghostPillClass,
                  'min-w-0 gap-1.5 group-data-[hide-mode]/bar:w-7 group-data-[hide-mode]/bar:px-0',
                )}
              >
                <Icon aria-hidden='true' className={cn('size-4 shrink-0', tone)} />
                <span className='max-w-28 truncate text-xs group-data-[hide-mode]/bar:hidden'>{name}</span>
              </Button>
            </TooltipTrigger>
          </PopoverTrigger>
          <PopoverContent
            align='start'
            data-chat-textarea-focustrap
            className='w-72 overflow-hidden p-0'
            onInteractOutside={() => {
              closedOutside.current = true;
            }}
            onCloseAutoFocus={(event) => {
              const wasOutside = closedOutside.current;
              closedOutside.current = false;
              if (toConfirmation.current) {
                toConfirmation.current = false;
                event.preventDefault();
                return;
              }
              if (!wasOutside) {
                event.preventDefault();
                focusEditor();
              }
            }}
          >
            <Command className='bg-transparent' defaultValue={mode} loop>
              <div className='px-3 pt-2 pb-1'>
                <span className='text-xs font-medium text-muted-foreground'>Permissions</span>
              </div>
              <CommandList>
                <CommandGroup className='pt-0'>
                  {permissionModeOptions.map((option) => {
                    const glyph = glyphs[option.value];
                    return (
                      <CommandItem
                        key={option.value}
                        value={option.value}
                        keywords={[option.name]}
                        className='h-auto items-start gap-2.5 py-1.5'
                        onSelect={() => {
                          select(option.value);
                        }}
                      >
                        <glyph.icon aria-hidden='true' className={cn('mt-0.5 size-4', glyph.tone)} />
                        <span className='flex min-w-0 flex-1 flex-col'>
                          <span>{option.name}</span>
                          <span className='text-xs text-muted-foreground'>{option.description}</span>
                        </span>
                        {option.value === mode ? (
                          <Check aria-hidden='true' className='mt-1' />
                        ) : (
                          <span className='size-3.5' />
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <TooltipContent>Permissions: {name}</TooltipContent>
      </Tooltip>
      <AlertDialog open={isConfirming} onOpenChange={setIsConfirming}>
        <AlertDialogContent
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            cancelRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{bypassConfirmation.title}</AlertDialogTitle>
            <AlertDialogDescription>{bypassConfirmation.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel ref={cancelRef} title={bypassConfirmation.cancelDescription}>
              {bypassConfirmation.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              title={bypassConfirmation.confirmChat}
              onClick={() => {
                void apply('bypass', true);
              }}
            >
              {bypassConfirmation.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <span role='status' aria-live='polite' className='sr-only'>
        {announcement}
      </span>
    </>
  );
}
