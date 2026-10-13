import { messageRole } from '@taucad/chat/constants';
import { ChatActivityStatus } from '#components/chat/chat-activity-status.js';
import { useChatContext, useChatSelector } from '#hooks/use-chat.js';
import { useProject } from '#hooks/use-project.js';
import { useChatSidebarStatus } from '#hooks/use-sidebar-status.js';
import { selectChatActivityCue } from '#utils/chat-activity-cue.js';

/** One live activity row outside the scrolling transcript, above the composer. */
export function ChatMessagePlanning({ className }: { readonly className?: string }): React.JSX.Element | undefined {
  const { projectId } = useProject();
  const { activeChatId } = useChatContext();
  const run = useChatSidebarStatus(projectId, activeChatId);
  const chatStatus = useChatSelector((state) => state.status);
  const trailing = useChatSelector((state) => state.messages.at(-1));
  const request = useChatSelector((state) => state.messages.findLast((message) => message.role === messageRole.user));
  const cue = selectChatActivityCue({
    runState: run?.state,
    chatStatus,
    parts: trailing?.role === messageRole.assistant ? trailing.parts : undefined,
  });
  return cue ? (
    <ChatActivityStatus cue={cue} startedAt={request?.metadata?.createdAt} className={className} />
  ) : undefined;
}
