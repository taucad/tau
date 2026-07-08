import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import { Extension } from '@tiptap/core';
import { Suggestion } from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import type { EditorState } from '@tiptap/pm/state';
import { Blocks, Zap } from 'lucide-react';
import { cn } from '#utils/ui.utils.js';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '#components/ui/hover-card.js';
import { menuContentVariants, menuItemVariants } from '#components/ui/menu.variants.js';
import type {
  SlashCommandItem,
  SuggestionPopupState,
  SuggestionRenderCallbacks,
} from '#components/chat/tiptap/suggestion-types.js';

const slashCommandPluginKey = new PluginKey('slashCommand');

export const defaultCommands: SlashCommandItem[] = [
  {
    id: 'compress',
    label: '/compress',
    description: 'Compress conversation context',
    group: 'Commands',
    enabled: false,
  },
];

export const isEnabledSlashCommandItem = (item: SlashCommandItem): boolean => item.enabled !== false;

export const getEnabledSlashCommandItems = (items: readonly SlashCommandItem[]): SlashCommandItem[] =>
  items.filter((item) => isEnabledSlashCommandItem(item));

export type SlashCommandOptions = {
  getItems?: (query: string) => SlashCommandItem[];
  renderCallbacks: SuggestionRenderCallbacks<SlashCommandItem>;
  onCommand?: (item: SlashCommandItem) => void;
};

export function shouldAllowSlashCommandTrigger({
  state,
  range,
}: {
  readonly state: EditorState;
  readonly range: { readonly from: number };
}): boolean {
  const $from = state.doc.resolve(range.from);
  if ($from.parentOffset === 0) {
    return true;
  }

  const previousCharacter = state.doc.textBetween(range.from - 1, range.from, '\n', '\0');
  return /\s/.test(previousCharacter);
}

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: 'slashCommand',

  addOptions() {
    return {
      getItems: undefined,
      renderCallbacks: {
        onStateChange: () => undefined,
        keydownHandlerRef: { current: undefined },
      },
      onCommand: undefined,
    };
  },

  addProseMirrorPlugins() {
    const { getItems, renderCallbacks, onCommand } = this.options;

    const defaultGetItems = (query: string): SlashCommandItem[] => {
      const all = getEnabledSlashCommandItems(defaultCommands);
      if (!query) {
        return all;
      }
      const q = query.toLowerCase();
      return all.filter((item) => item.label.toLowerCase().includes(q) || item.description.toLowerCase().includes(q));
    };

    const itemsFunction = getItems ?? defaultGetItems;

    return [
      // oxlint-disable-next-line new-cap -- Tiptap's Suggestion factory is PascalCase
      Suggestion<SlashCommandItem>({
        pluginKey: slashCommandPluginKey,
        editor: this.editor,
        char: '/',
        items: ({ query }) => itemsFunction(query),
        allowedPrefixes: null,
        allow: ({ state, range }) => shouldAllowSlashCommandTrigger({ state, range }),
        command: ({ editor, range, props }) => {
          const item = props as SlashCommandItem;
          if (!isEnabledSlashCommandItem(item)) {
            return;
          }

          if (item.group === 'Commands') {
            editor.chain().focus().deleteRange(range).run();
            onCommand?.(item);
            return;
          }

          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent({
              type: 'contextChip',
              attrs: {
                id: item.id,
                label: item.label,
                chipType: 'skill',
              },
            })
            .insertContent(' ')
            .run();
        },
        render: () => ({
          onStart(properties) {
            renderCallbacks.onStateChange({
              query: properties.query,
              items: properties.items,
              command: properties.command as (item: SlashCommandItem) => void,
              clientRect: properties.clientRect ?? undefined,
            } as SuggestionPopupState<SlashCommandItem>);
          },
          onUpdate(properties) {
            renderCallbacks.onStateChange({
              query: properties.query,
              items: properties.items,
              command: properties.command as (item: SlashCommandItem) => void,
              clientRect: properties.clientRect ?? undefined,
            } as SuggestionPopupState<SlashCommandItem>);
          },
          onExit() {
            renderCallbacks.onStateChange(undefined);
          },
          onKeyDown({ event }) {
            return renderCallbacks.keydownHandlerRef.current?.(event) ?? false;
          },
        }),
      }),
    ];
  },
});

// --- Dropdown UI Component ---

const groupIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  Skills: Blocks,
  Commands: Zap,
};

function titleFromCommandId(commandId: string): string {
  return commandId
    .split('-')
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

function SkillItemButton({
  item,
  globalIndex,
  isSelected,
  onSelect,
  onHover,
  buttonRef,
}: {
  readonly item: SlashCommandItem;
  readonly globalIndex: number;
  readonly isSelected: boolean;
  readonly onSelect: (index: number) => void;
  readonly onHover: (index: number) => void;
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React ref callback signature requires null
  readonly buttonRef: (element: HTMLButtonElement | null) => void;
}): React.JSX.Element {
  const button = (
    <button
      ref={buttonRef}
      type='button'
      data-selected={isSelected}
      className={cn(menuItemVariants({ highlight: 'selected' }), 'h-7 w-full gap-2 px-2.25 text-left font-normal')}
      onClick={() => {
        onSelect(globalIndex);
      }}
      onMouseEnter={() => {
        onHover(globalIndex);
      }}
    >
      <Blocks className='size-3.5 shrink-0' />
      <span className='shrink-0 text-foreground'>{item.title ?? titleFromCommandId(item.id)}</span>
      <span className='min-w-0 flex-1 truncate text-muted-foreground'>{item.description}</span>
      <span className='ml-2 shrink-0 text-muted-foreground'>{item.source ?? item.group}</span>
    </button>
  );

  if (!item.fullDescription) {
    return button;
  }

  return (
    <HoverCard>
      <HoverCardTrigger asChild>{button}</HoverCardTrigger>
      <HoverCardContent side='right' align='start' sideOffset={12} alignOffset={-4} className='w-72'>
        <div className='space-y-2'>
          <div className='flex items-center gap-2'>
            <Blocks className='size-4 shrink-0 text-muted-foreground' />
            <h4 className='text-sm font-semibold'>{item.title ?? titleFromCommandId(item.id)}</h4>
          </div>
          <p className='text-sm text-muted-foreground'>{item.fullDescription}</p>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

export const SlashCommandDropdown = memo(function SlashCommandDropdown({
  state,
  keydownHandlerRef,
}: {
  readonly state: SuggestionPopupState<SlashCommandItem>;
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React ref object
  readonly keydownHandlerRef: React.RefObject<((event: KeyboardEvent) => boolean) | undefined>;
}): React.JSX.Element | undefined {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const itemReferences = useRef<Map<number, HTMLButtonElement>>(new Map());

  const { items, command, clientRect } = state;

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  useEffect(() => {
    const element = itemReferences.current.get(selectedIndex);
    element?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const selectItem = useCallback(
    (index: number) => {
      const item = items[index];
      if (item && isEnabledSlashCommandItem(item)) {
        command(item);
      }
    },
    [items, command],
  );

  useEffect(() => {
    keydownHandlerRef.current = (event: KeyboardEvent): boolean => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((previous) => (previous <= 0 ? items.length - 1 : previous - 1));
        return true;
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex((previous) => (previous >= items.length - 1 ? 0 : previous + 1));
        return true;
      }
      if (event.key === 'Enter') {
        selectItem(selectedIndex);
        return true;
      }
      if (event.key === 'Escape') {
        return true;
      }
      return false;
    };

    return () => {
      keydownHandlerRef.current = undefined;
    };
  }, [items, selectedIndex, selectItem, keydownHandlerRef]);

  const rect = clientRect?.();
  if (!rect) {
    return undefined;
  }

  const groups = new Map<string, { items: SlashCommandItem[]; startIndex: number }>();
  let currentIndex = 0;
  for (const item of items) {
    const existing = groups.get(item.group);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.set(item.group, { items: [item], startIndex: currentIndex });
    }
    currentIndex++;
  }

  return createPortal(
    <div
      className={cn(
        menuContentVariants(),
        'fixed max-h-64 w-[min(44rem,calc(100vw-2rem))] overflow-y-auto border scroll-shadows-y',
      )}
      style={{
        left: rect.left,
        top: rect.top - 8,
        transform: 'translateY(-100%)',
      }}
    >
      {items.length === 0 ? (
        <div className='px-2 py-1.5 text-xs text-muted-foreground'>No commands found</div>
      ) : (
        [...groups.entries()].map(([groupName, group]) => {
          const GroupIcon = groupIcons[groupName] ?? Zap;
          return (
            <div key={groupName}>
              <div className='flex items-center gap-1.5 px-2.25 py-1 text-xs font-medium text-muted-foreground'>
                <GroupIcon className='size-3 shrink-0' />
                {groupName}
              </div>
              {group.items.map((item, itemIndex) => {
                const globalIndex = group.startIndex + itemIndex;
                return (
                  <SkillItemButton
                    key={item.id}
                    item={item}
                    globalIndex={globalIndex}
                    isSelected={globalIndex === selectedIndex}
                    onSelect={selectItem}
                    onHover={setSelectedIndex}
                    buttonRef={(element) => {
                      if (element) {
                        itemReferences.current.set(globalIndex, element);
                      } else {
                        itemReferences.current.delete(globalIndex);
                      }
                    }}
                  />
                );
              })}
            </div>
          );
        })
      )}
    </div>,
    document.body,
  );
});
