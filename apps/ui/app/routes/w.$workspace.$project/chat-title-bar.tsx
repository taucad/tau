import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, ChevronDown, Download, Pencil, SquarePen, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useSelector } from '@xstate/react';
import type { ChatRecord } from '@taucad/chat/schemas';
import { Button } from '@taucad/ui/components/button';
import {
  Drawer,
  DrawerAction,
  DrawerBar,
  DrawerContent,
  DrawerDescription,
  DrawerList,
  DrawerTitle,
  DrawerTrigger,
  drawerBarTitleClass,
  drawerRowAttributes,
} from '@taucad/ui/components/drawer';
import { cn } from '@taucad/ui/utils/cn';
import { ChatHistorySettings, useExportTranscript } from '#routes/w.$workspace.$project/chat-history-settings.js';
import { useActiveChatNaming } from '#routes/w.$workspace.$project/use-active-chat-naming.js';
import { useOpenNewChat } from '#routes/w.$workspace.$project/use-open-new-chat.js';
import { useChats } from '#hooks/use-chats.js';
import { useChatRecords } from '#hooks/use-chat-records.js';
import { useChatSelector } from '#hooks/use-chat.js';
import { useKeybinding } from '@taucad/ui/components/keyboard';
import { useProject } from '#hooks/use-project.js';
import { useProjectSlugs } from '#hooks/use-project-slug-route.js';
import { compareChatsByRecency } from '#utils/chat-recency.utils.js';
import { projectChatUrl } from '#utils/project-url.utils.js';
import type { KeyCombination } from '@taucad/ui/utils/keys';
import { InlineTextEditor } from '#components/inline-text-editor.js';
import { sidebarRowEditorClass } from '#components/nav/sidebar-row.js';
import { FloatingPanelButtonGroup, FloatingPanelContentHeaderActions } from '#components/ui/floating-panel.js';
import { PaneButton } from '@taucad/workbench-panes/components/pane-button';
import { useSidebar } from '#components/ui/sidebar.js';
import { ChatLaneToggle } from '#routes/w.$workspace.$project/chat-lane-toggle.js';
import { useWorkspaceLanes } from '#routes/w.$workspace.$project/project-workspace-context.js';

const newChatKeyCombination = {
  key: 'c',
  ctrlKey: true,
  shiftKey: true,
} satisfies KeyCombination;

/** One row of the phone chat switcher: a 44px target named by its label (I3, I6). */
function SwitcherRow({
  icon: Icon,
  label,
  isCurrent = false,
  isDisabled = false,
  onSelect,
}: {
  readonly icon?: LucideIcon;
  readonly label: string;
  readonly isCurrent?: boolean;
  readonly isDisabled?: boolean;
  readonly onSelect: () => void;
}): React.JSX.Element {
  return (
    // A drawer list row: the touch button's 0.5rem padding, a 1rem icon and a 0.75rem gap.
    <li
      {...drawerRowAttributes}
      className='relative [--drawer-row-gap:0.75rem] [--drawer-row-icon:1rem] [--drawer-row-inset:0.5rem]'
    >
      <Button
        variant='ghost'
        size='touch'
        data-slot='chat-switcher-row'
        aria-current={isCurrent ? 'true' : undefined}
        disabled={isDisabled}
        className='w-full justify-start gap-3 rounded-none font-normal'
        onClick={onSelect}
      >
        {Icon ? (
          <Icon aria-hidden className='size-4 shrink-0 text-muted-foreground' />
        ) : (
          <Check aria-hidden className={cn('size-4 shrink-0 text-muted-foreground', !isCurrent && 'invisible')} />
        )}
        <span className='min-w-0 truncate'>{label}</span>
      </Button>
    </li>
  );
}

/**
 * Hand focus back to the chat title once the switcher has gone. Opening another chat can replace the title while the
 * sheet closes, so a title that is no longer in the document gives way to the one that replaced it. Focus the person
 * has moved elsewhere in the meantime is left alone, and nothing waits past a second.
 *
 * @param trigger - The title that opened the switcher.
 */
function returnFocusToTitle(trigger: HTMLButtonElement | undefined): void {
  const take = (): boolean => {
    const title = trigger?.isConnected
      ? trigger
      : document.querySelector<HTMLButtonElement>('[data-slot="chat-title-button"]');
    if (!title) {
      return false;
    }
    if (document.activeElement === null || document.activeElement === document.body) {
      title.focus({ preventScroll: true });
    }
    return true;
  };
  if (take()) {
    return;
  }
  const until = performance.now() + 1000;
  const retry = (): void => {
    if (!take() && performance.now() < until) {
      requestAnimationFrame(retry);
    }
  };
  requestAnimationFrame(retry);
}

/**
 * The phone chat switcher the title opens (canvas CH-09, PN-CHAT-3): New chat, this project's chats by recency
 * (the sidebar's order), then Rename and Export for the open chat. It reads the same chat records and runs the
 * same actions as the desktop header, sidebar and chat menu; it adds no data path of its own.
 */
function ChatSwitcherSheet({
  name,
  isGeneratingName,
  chats,
  activeChatId,
  isNewChatReady,
  onNewChat,
  onRename,
}: {
  readonly name: string;
  readonly isGeneratingName: boolean;
  readonly chats: readonly ChatRecord[];
  readonly activeChatId: string | undefined;
  readonly isNewChatReady: boolean;
  readonly onNewChat: () => Promise<void>;
  readonly onRename: (() => void) | undefined;
}): React.JSX.Element {
  const { projectRef, projectId } = useProject();
  const projectName = useSelector(projectRef, (state) => state.context.project?.name) ?? 'this project';
  const slugs = useProjectSlugs(projectId);
  const navigate = useNavigate();
  const { canExport, exportTranscript } = useExportTranscript();
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  /*
   * What takes focus once the sheet has gone (its content unmounts after the exit animation). New chat hands it to
   * the new chat's composer; Rename starts the inline editor only then, because the editor replaces this sheet and
   * unmounting a drawer mid-close leaves vaul's nested body lock behind (iOS). Every other close returns it to the
   * title.
   */
  const handOff = useRef<'composer' | 'rename' | undefined>(undefined);
  const projectChats = useMemo(
    () =>
      chats.filter((chat) => chat.deletedAt === undefined && chat.purgedAt === undefined).sort(compareChatsByRecency),
    [chats],
  );
  const choose = (action: () => void): void => {
    setIsOpen(false);
    action();
  };
  const title = `Chats in ${projectName}`;

  return (
    <Drawer
      open={isOpen}
      onOpenChange={(open) => {
        if (open) {
          handOff.current = undefined;
        }
        setIsOpen(open);
      }}
    >
      <DrawerTrigger asChild>
        <button
          ref={triggerRef}
          type='button'
          data-slot='chat-title-button'
          aria-label={`${name}, ${title}`}
          className='flex h-10 min-w-0 flex-1 cursor-action items-center gap-1 rounded-md px-1 text-left text-sm font-medium outline-none hover:bg-accent focus-visible:focus-outline'
        >
          <span
            className={cn('fade-label min-w-0 text-foreground', isGeneratingName && 'animate-pulse')}
            aria-busy={isGeneratingName}
          >
            {name}
          </span>
          <ChevronDown aria-hidden className='size-3.5 shrink-0 text-muted-foreground' />
        </button>
      </DrawerTrigger>
      <DrawerContent
        onCloseAutoFocus={(event) => {
          const next = handOff.current;
          handOff.current = undefined;
          event.preventDefault();
          if (next === 'rename') {
            onRename?.();
            return;
          }
          if (next === undefined) {
            returnFocusToTitle(triggerRef.current ?? undefined);
          }
        }}
      >
        <DrawerBar>
          <DrawerTitle className={drawerBarTitleClass}>{title}</DrawerTitle>
          <DrawerDescription className='sr-only'>
            Switch to another chat in this project or start a new one.
          </DrawerDescription>
          <DrawerAction
            aria-label='Close chats'
            onClick={() => {
              setIsOpen(false);
            }}
          >
            <X aria-hidden className='size-4' />
          </DrawerAction>
        </DrawerBar>
        {/* Dividers in a drawer never span its full width: this one lines up with the title and close button. */}
        <div aria-hidden className='mx-4 h-px shrink-0 bg-border' />
        <div className='min-h-0 overflow-y-auto pb-3'>
          <DrawerList role='list' aria-label='Chats' className='py-1'>
            <SwitcherRow
              icon={SquarePen}
              label='New chat'
              isDisabled={!isNewChatReady}
              onSelect={() => {
                handOff.current = 'composer';
                choose(() => {
                  void onNewChat();
                });
              }}
            />
            {projectChats.map((chat) => (
              <SwitcherRow
                key={chat.id}
                label={chat.name}
                isCurrent={chat.id === activeChatId}
                isDisabled={slugs.status !== 'resolved'}
                onSelect={() => {
                  choose(() => {
                    if (slugs.status === 'resolved' && chat.id !== activeChatId) {
                      void navigate(projectChatUrl(slugs.value, chat.id), { state: { openChat: true } });
                    }
                  });
                }}
              />
            ))}
          </DrawerList>
          {/* Inset like the row dividers: from the rows' text to the rows' right inset. */}
          <div aria-hidden className='mr-2 ml-9 h-px bg-border' />
          <DrawerList role='list' aria-label='This chat' className='py-1'>
            <SwitcherRow
              icon={Pencil}
              label='Rename this chat'
              isDisabled={onRename === undefined}
              onSelect={() => {
                handOff.current = 'rename';
                setIsOpen(false);
              }}
            />
            <SwitcherRow
              icon={Download}
              label='Export transcript'
              isDisabled={!canExport}
              onSelect={() => {
                choose(exportTranscript);
              }}
            />
          </DrawerList>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/**
 * The chat pane's one header row: the active chat's name, renamed in place the
 * way a sidebar row is, with the chat menu at the end. On desktop the row opens
 * with the chat lane toggle, on the pixel it holds in the viewer's tab bar
 * while the lane is closed, so it replaces a generic close control; mobile has
 * no lanes and keeps `closeButton`. Chat collection navigation lives in the
 * sidebar; with the sidebar collapsed "New chat" follows the toggle. On a phone
 * the title opens the chat switcher instead (CH-09).
 */
export function ChatTitleBar({ closeButton }: { readonly closeButton?: ReactNode }): React.JSX.Element {
  const { isMobile, open: isSidebarOpen } = useSidebar();
  // One toggle in the document at a time: the viewer's tab bar holds it while the lane is hidden.
  const { chat: isChatVisible } = useWorkspaceLanes();
  const { openNewChat, isReady: canOpenNewChat } = useOpenNewChat();
  const { editorRef, projectRef, projectId } = useProject();
  const activeChatId = useSelector(editorRef, (state) => state.context.focusedChatId);
  const isProjectLoading = useSelector(projectRef, (state) => state.context.isLoading);
  const { chats, isLoading: isChatsLoading } = useChatRecords(projectId);
  const { applyGeneratedChatName, updateChatName } = useChats(projectId, { enabled: false });
  const firstMessage = useChatSelector((state) => state.messages[0]);
  const activeChat = useMemo(() => chats.find((chat) => chat.id === activeChatId), [chats, activeChatId]);
  const isGeneratingName = useActiveChatNaming({
    activeChat,
    firstMessage,
    isProjectLoading,
    isChatsLoading,
    applyGeneratedChatName,
  });
  const [isRenaming, setIsRenaming] = useState(false);
  const name = activeChat?.name ?? 'Chat';

  const createAndOpenChat = async (): Promise<void> => openNewChat();

  useKeybinding(newChatKeyCombination, createAndOpenChat);

  const startRename = (): void => {
    if (activeChat) {
      setIsRenaming(true);
    }
  };

  return (
    <>
      {!isMobile && isChatVisible ? <ChatLaneToggle place='lane' /> : null}
      {!isMobile && !isSidebarOpen ? (
        <PaneButton aria-label='New chat' disabled={!canOpenNewChat} tooltip='New chat' onClick={createAndOpenChat}>
          <SquarePen aria-hidden className='size-3.5 translate-y-[0.5px]' />
        </PaneButton>
      ) : null}
      <div
        className={cn(
          'relative flex min-w-0 flex-1 items-center self-stretch',
          // The editor draws no outline of its own (the sidebar's row does the same).
          isRenaming && 'rounded-sm focus-outline',
        )}
      >
        {isRenaming && activeChat ? (
          <InlineTextEditor
            value={activeChat.name}
            variant='ghost'
            shouldStartEditing
            ariaLabel='Chat name'
            // A field inside the desktop drag region cannot be typed into or selected.
            className={cn(sidebarRowEditorClass, '[app-region:no-drag]')}
            onSave={async (next) => {
              await updateChatName(activeChat.id, next);
            }}
            onEditingChange={(isEditing) => {
              if (!isEditing) {
                setIsRenaming(false);
              }
            }}
          />
        ) : isMobile ? (
          <ChatSwitcherSheet
            name={name}
            isGeneratingName={isGeneratingName}
            chats={chats}
            activeChatId={activeChatId}
            isNewChatReady={canOpenNewChat}
            onNewChat={createAndOpenChat}
            onRename={activeChat ? startRename : undefined}
          />
        ) : (
          <span className='fade-label flex-1 text-sm font-medium'>
            {/* The text, not its box, leaves the drag region: a double-click on a macOS drag
                region zooms the window, and the rest of the row still drags it. */}
            {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- Rename remains in the keyboard-accessible menu. */}
            <span
              className={cn('text-foreground [app-region:no-drag]', isGeneratingName && 'animate-pulse')}
              aria-busy={isGeneratingName}
              onDoubleClick={startRename}
            >
              {name}
            </span>
          </span>
        )}
        <FloatingPanelContentHeaderActions
          className={cn(
            !isRenaming && 'md:absolute md:inset-y-0 md:right-0',
            // A touch tablet keeps the desktop row but has no hover to reveal its menu (I2, D12).
            'pointer-coarse:opacity-100',
          )}
        >
          <FloatingPanelButtonGroup>
            <ChatHistorySettings onRename={startRename} />
          </FloatingPanelButtonGroup>
          {isMobile ? closeButton : null}
        </FloatingPanelContentHeaderActions>
      </div>
    </>
  );
}
