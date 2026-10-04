import { useEffect, useId, useRef } from 'react';
import type { IDockviewHeaderActionsProps } from 'dockview-react';
import { MessageCircle } from 'lucide-react';
import { useSelector } from '@xstate/react';
import { cn } from '@taucad/ui/utils/cn';
import { StatusMark } from '#components/nav/status-mark.js';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import { PaneButton } from '#components/ui/pane-button.js';
import { useSidebar } from '#components/ui/sidebar.js';
import { useIsTopLeftGroup } from '#components/panes/use-is-top-right-group.js';
import { selectChatFacts, useChatSidebarStatus } from '#hooks/use-sidebar-status.js';
import type { SidebarFacts } from '#hooks/use-sidebar-status.js';
import { useProject } from '#hooks/use-project.js';
import { formatKeyCombination } from '#utils/keys.utils.js';
import type { KeyCombination } from '#utils/keys.utils.js';
import { useProjectWorkspace, useWorkspaceLanes } from '#routes/w.$workspace.$project/project-workspace-context.js';

type Place = 'lane' | 'viewer';

/** ⌃C toggles the chat lane; `ChatHistory` binds it, this control advertises it. */
export const toggleChatKeyCombination = {
  key: 'c',
  ctrlKey: true,
} satisfies KeyCombination;

/**
 * Which mount takes focus next (B-2). The toggle lives in two places — the
 * chat pane header while the lane is open, the viewer's tab bar while it is
 * not — so a keyboard click on one hands focus to the other rather than
 * dropping it on `body`.
 */
let focusClaim: Place | undefined;

/**
 * Where the mark's centre sits: on the bubble's outline, 30° above its
 * right-hand edge. `MessageCircle` draws its bubble as a radius-9 circle on
 * lucide's 24-unit grid, centred in the 14 px icon, centred in the 28 px
 * button; the mark's 24 px slot is centred on that point.
 */
const markPosition = (() => {
  const button = 28;
  const radius = (9 / 24) * 14;
  const angle = Math.PI / 6;
  return {
    left: button / 2 + radius * Math.cos(angle) - 12,
    top: button / 2 - radius * Math.sin(angle) - 12,
  };
})();

/**
 * The sidebar's own `StatusMark`, threaded on the bubble's stroke over a disc
 * of the strip's fill one pixel wider than the mark. No count: its numeral
 * would hang into the tab; the tooltip and the description carry it.
 */
const LaneMark = ({ facts }: { readonly facts: SidebarFacts }): React.ReactNode =>
  facts.mark === 'none' ? undefined : (
    <span
      aria-hidden
      data-slot='chat-toggle-mark'
      data-mark={facts.mark}
      className='pointer-events-none absolute flex size-6 items-center justify-center'
      style={markPosition}
    >
      <span
        className={cn(
          'absolute rounded-full bg-(--fade-scrim-into,var(--background))',
          facts.mark === 'failed' ? 'size-3.5' : 'size-2.5',
        )}
      />
      <StatusMark facts={{ ...facts, count: undefined }} />
    </span>
  );

/**
 * The one control for the chat lane: pressed at the head of the chat pane
 * header while the lane is open, and at the head of the viewer's tab bar,
 * carrying the focused chat's status mark, while it is not (R3: a visible
 * lane owns its own state, so the open mount never shows a mark).
 *
 * @param props - Which of the two mounts this is.
 * @returns The toggle.
 */
export function ChatLaneToggle({ place }: { readonly place: Place }): React.JSX.Element {
  const ref = useRef<HTMLButtonElement>(null);
  const sentenceId = useId();
  const { setChatOpen } = useProjectWorkspace();
  const { chat: isOpen } = useWorkspaceLanes();
  const { editorRef, projectId } = useProject();
  const focusedChatId = useSelector(editorRef, (state) => state.context.focusedChatId);
  const status = useChatSidebarStatus(projectId, focusedChatId ?? '');
  const facts: SidebarFacts =
    place === 'viewer' && status !== undefined ? selectChatFacts(status) : { mark: 'none', sentence: undefined };

  useEffect(() => {
    if (focusClaim !== place || isOpen !== (place === 'lane')) {
      return;
    }
    // The lane's pane turns visible in Allotment's own layout pass. The claim is spent in the
    // frame, not here, so a cancelled run (StrictMode's double effect) leaves it for the re-run.
    const frame = requestAnimationFrame(() => {
      focusClaim = undefined;
      ref.current?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [isOpen, place]);

  return (
    <PaneButton
      ref={ref}
      data-slot='chat-lane-toggle'
      data-place={place}
      aria-label='Toggle Chat lane'
      aria-pressed={isOpen}
      aria-keyshortcuts='Control+C'
      aria-describedby={facts.sentence === undefined ? undefined : sentenceId}
      className='relative aria-pressed:text-foreground'
      tooltip={
        <span className='flex items-center gap-2'>
          Toggle Chat
          <KeyShortcut variant='tooltip'>{formatKeyCombination(toggleChatKeyCombination)}</KeyShortcut>
          {facts.sentence === undefined ? undefined : <span className='opacity-70'>· {facts.sentence}</span>}
        </span>
      }
      onClick={(event) => {
        if (document.activeElement === event.currentTarget) {
          focusClaim = place === 'lane' ? 'viewer' : 'lane';
        }
        setChatOpen(!isOpen);
      }}
    >
      <MessageCircle aria-hidden className='size-3.5' />
      <LaneMark facts={facts} />
      {/* Inside the button: `sr-only` is absolutely positioned, and a sibling
          would escape the tab bar's overflow clip. */}
      {facts.sentence === undefined ? undefined : (
        <span id={sentenceId} className='sr-only'>
          {facts.sentence}
        </span>
      )}
    </PaneButton>
  );
}

/**
 * The viewer's tab-bar prefix: the chat lane toggle at the head of the
 * top-left group's tabs, on desktop, while the chat lane is hidden.
 *
 * @param properties - Dockview's header-action props for the group.
 * @returns The toggle, or nothing in every other group and state.
 */
export function ViewerChatLaneToggle(properties: IDockviewHeaderActionsProps): React.JSX.Element | undefined {
  const isTopLeft = useIsTopLeftGroup(properties.group, properties.containerApi);
  const { chat: isChatVisible } = useWorkspaceLanes();
  const { isMobile } = useSidebar();
  if (!isTopLeft || isChatVisible || isMobile) {
    return undefined;
  }
  return (
    <div className='flex h-full items-center pl-1'>
      <ChatLaneToggle place='viewer' />
    </div>
  );
}
