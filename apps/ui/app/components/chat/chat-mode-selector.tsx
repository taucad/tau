import { useRef, useState } from 'react';
import { Check, FileText, Hand, ShieldAlert, ShieldCheck, ShieldX, SlidersHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Command, CommandGroup, CommandItem, CommandList } from '@taucad/ui/components/command';
import { Popover, PopoverContent, PopoverTrigger } from '@taucad/ui/components/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { cn } from '@taucad/ui/utils/cn';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import { ghostPillClass } from '#components/chat/chat-agent-sheet.js';
import { configOptionOf, configValues } from '#components/chat/use-agent-config.js';
import type { AgentConfig } from '#components/chat/use-agent-config.js';
import { useKeybinding } from '#hooks/use-keyboard.js';
import { ariaKeyShortcuts, formatKeyCombination } from '#utils/keys.utils.js';
import type { KeyCombination } from '#utils/keys.utils.js';

export const toggleModeKeyCombination = {
  key: '.',
  modKey: true,
} satisfies KeyCombination;

/**
 * Glyphs for the permission modes the pinned adapters report, keyed by the
 * protocol's mode ids (Q8); anything else gets the generic glyph. Colour
 * belongs to the glyph, never the pill: plan reads as a feature, full access
 * as a warning.
 */
const modeGlyphs: Readonly<Record<string, { readonly icon: LucideIcon; readonly tone?: string }>> = {
  default: { icon: Hand },
  acceptEdits: { icon: ShieldCheck },
  plan: { icon: FileText, tone: 'text-feature' },
  dontAsk: { icon: ShieldX },
  bypassPermissions: { icon: ShieldAlert, tone: 'text-warning' },
  'read-only': { icon: Hand },
  agent: { icon: ShieldCheck },
  'agent-full-access': { icon: ShieldAlert, tone: 'text-warning' },
};

const glyphOf = (id: string): { readonly icon: LucideIcon; readonly tone?: string } =>
  modeGlyphs[id] ?? { icon: SlidersHorizontal };

/**
 * An external agent's permission mode: ghost, glyph first, its label the
 * second to leave when the bar needs the room. ⌘. steps to the next mode.
 * Tau has no mode in the composer (Q11), and an agent that reports none shows
 * nothing.
 *
 * @public
 */
export function ChatAgentModeControl({
  agentConfig,
  focusEditor,
  enableShortcut = true,
}: {
  readonly agentConfig: AgentConfig;
  readonly focusEditor: () => void;
  readonly enableShortcut?: boolean | (() => boolean);
}): React.JSX.Element | undefined {
  const [isOpen, setIsOpen] = useState(false);
  const closedOutside = useRef(false);
  const option = configOptionOf(agentConfig, 'mode');
  const values = option ? configValues(option) : [];
  const currentId = option ? String(agentConfig.valueOf(option)) : undefined;
  const currentIndex = values.findIndex((value) => value.value === currentId);
  const current = values[currentIndex];

  const step = (): void => {
    const next = values[(currentIndex + 1) % values.length];
    if (option && next) {
      agentConfig.select(option.id, next.value);
    }
  };
  useKeybinding(toggleModeKeyCombination, step, {
    enabled: () => values.length > 1 && (typeof enableShortcut === 'function' ? enableShortcut() : enableShortcut),
  });

  if (!option || !current) {
    return undefined;
  }
  const { icon: Icon, tone } = glyphOf(current.value);
  return (
    <Tooltip>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <TooltipTrigger asChild>
            <Button
              variant='ghost'
              size='sm'
              data-chat-textarea-focustrap
              aria-label={`Mode: ${current.name}`}
              aria-keyshortcuts={ariaKeyShortcuts(toggleModeKeyCombination)}
              className={cn(
                ghostPillClass,
                'min-w-0 gap-1.5 group-data-[hide-mode]/bar:w-7 group-data-[hide-mode]/bar:px-0',
              )}
            >
              <Icon aria-hidden='true' className={cn('size-4 shrink-0', tone)} />
              <span className='max-w-28 truncate text-xs group-data-[hide-mode]/bar:hidden'>{current.name}</span>
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
            if (!wasOutside) {
              event.preventDefault();
              focusEditor();
            }
          }}
        >
          <Command className='bg-transparent' defaultValue={current.value} loop>
            <div className='flex items-center justify-between px-3 pt-2 pb-1'>
              <span className='text-xs font-medium text-muted-foreground'>{option.name}</span>
              <KeyShortcut variant='ghost'>{formatKeyCombination(toggleModeKeyCombination)}</KeyShortcut>
            </div>
            <CommandList>
              <CommandGroup className='pt-0'>
                {values.map((value) => {
                  const glyph = glyphOf(value.value);
                  return (
                    <CommandItem
                      key={value.value}
                      value={value.value}
                      keywords={[value.name]}
                      className='h-auto items-start gap-2.5 py-1.5'
                      onSelect={() => {
                        agentConfig.select(option.id, value.value);
                        setIsOpen(false);
                      }}
                    >
                      <glyph.icon aria-hidden='true' className={cn('mt-0.5 size-4', glyph.tone)} />
                      <span className='flex min-w-0 flex-1 flex-col'>
                        <span>{value.name}</span>
                        {value.description ? (
                          <span className='text-xs text-muted-foreground'>{value.description}</span>
                        ) : null}
                      </span>
                      {value.value === current.value ? (
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
      <TooltipContent>
        <span className='flex items-center gap-1.5'>
          {option.name}: {current.name}
          <KeyShortcut variant='tooltip'>{formatKeyCombination(toggleModeKeyCombination)}</KeyShortcut>
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
