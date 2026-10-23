import { useSelector } from '@xstate/react';
import { useCallback, useMemo } from 'react';
import type { KernelProvider, KernelIssue, IssueSeverity } from '@taucad/runtime';
import { idPrefix, languageFromKernel } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import { formatViewerIssue, ViewerIssues as ViewerIssuesBar } from '@taucad/workbench-panes/shell/viewer-issues';
import type { ViewerIssueLocation, ViewerNotice } from '@taucad/workbench-panes/shell/viewer-issues';
import { MarkdownViewer } from '#components/markdown/markdown-viewer.js';
import { useProject } from '#hooks/use-project.js';
import { useCad, useCadSelector } from '#hooks/use-cad.js';
import { useNativeKernelDownload } from '#hooks/use-native-kernel-download.js';
import type { NativeKernelDownload } from '#hooks/use-native-kernel-download.js';
import { formatBytes } from '#lib/format-bytes.js';
import { useChats } from '#hooks/use-chats.js';
import { useCadChatClient } from '#chat-clients/use-cad-chat-client.js';
import { buildUserMessage } from '#utils/chat.utils.js';
import { decodeTextFile } from '#utils/filesystem.utils.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useProjectWorkspace } from '#routes/w.$workspace.$project/project-workspace-context.js';
import { selectCadEntryIssues, selectCadFailureIssues } from '#machines/cad.machine.js';

const severityRank: Record<IssueSeverity, number> = { error: 0, warning: 1, info: 2 };

type FormatErrorPromptOptions = {
  errors: readonly KernelIssue[];
  filePath: string;
  code: string;
  kernel: KernelProvider;
};

/**
 * Formats one or more kernel issues into a prompt for AI assistance.
 */
function formatErrorPrompt({ errors, filePath, code, kernel }: FormatErrorPromptOptions): string {
  const [first] = errors;
  const errorText = errors.map((error) => formatViewerIssue(error)).join('\n\n');

  // Get code context around the first issue's line (if available)
  let codeContext = '';
  const errorLine = first?.location?.startLineNumber;
  if (code && errorLine) {
    const lines = code.split('\n');
    const startLine = Math.max(0, errorLine - 3);
    const endLine = Math.min(lines.length, errorLine + 3);
    const contextLines = lines.slice(startLine, endLine);
    codeContext = contextLines
      .map((line, index) => {
        const lineNumber = startLine + index + 1;
        const marker = lineNumber === errorLine ? '> ' : '  ';

        return `${marker}${lineNumber} | ${line}`;
      })
      .join('\n');
  }

  const subject = errors.length > 1 ? `${errors.length} issues` : 'an error';

  return `I'm getting ${subject} in my ${kernel} code and need help fixing ${errors.length > 1 ? 'them' : 'it'}.

**File:** ${filePath}

${errorText}

${
  codeContext
    ? `**Code Context:**
\`\`\`
${codeContext}
\`\`\`
`
    : ''
}
${
  code
    ? `**Full Code:**
\`\`\`${languageFromKernel[kernel]}
${code}
\`\`\`
`
    : ''
}

Please analyze the error and fix the code. Focus on:
1. Identifying the root cause of the error
2. Providing a corrected version of the code
3. Explaining what was wrong and why the fix works

Please update the code to resolve this error.`;
}

/**
 * The notice for a native kernel the desktop is downloading on first use, or could not download.
 * @param download - The download's state.
 * @returns A notice that cancels a running download or retries a stopped one.
 */
const downloadNotice = (download: NativeKernelDownload): ViewerNotice => {
  if (download.status === 'stopped') {
    return { message: download.message, actionLabel: 'Retry', onAct: download.retry };
  }
  const size = download.byteLength === undefined ? '' : ` (${formatBytes(download.byteLength)})`;
  const { progress } = download;
  return {
    message: `Downloading the ${download.kernel} kernel runtime${size}. It is needed once; the model renders when it is ready.`,
    actionLabel: 'Cancel',
    onAct: download.cancel,
    progress: progress === undefined || progress.total <= 0 ? 0 : Math.min(100, (progress.done / progress.total) * 100),
  };
};

type ViewerIssuesProps = Readonly<{
  /** Entry path being rendered in this viewer */
  entryPath: string;
  /** Shown first in the list, which opens for it: the view cannot show anything until it is resolved. */
  notice?: ViewerNotice;
  /**
   * Places the two parts in the viewer bar: `segment` (the failure and issue counts, which toggles the list) at
   * the start of its controls line, and `list` (the open issues) directly above that line.
   */
  children: (parts: Readonly<{ segment: React.ReactNode; list: React.ReactNode }>) => React.ReactNode;
}>;

/** Issue messages are Markdown, such as a backticked name. */
const renderIssueMessage = (message: string): React.ReactNode => (
  <MarkdownViewer className='inline w-auto! text-xs text-inherit [&_code]:bg-muted'>{message}</MarkdownViewer>
);

/**
 * The viewer's issues with Fix with AI, which needs the focused chat.
 */
function ChatViewerIssues(props: ViewerIssuesProps): React.ReactNode {
  const { getMainFilename, projectId, setFocusedChatId } = useProject();
  const { setChatOpen } = useProjectWorkspace();
  const fileManager = useFileManager();
  const { createChat } = useChats(projectId, { enabled: false });
  // The chat-client composes the per-request `agent` payload (model, kernel,
  // mode, toolChoice, testingEnabled, snapshot, contextPayload) from the
  // current chat's active values. Fix-with-AI no longer stamps any of those
  // fields onto the user message — the regression-coverage test asserts the
  // captured wire body carries the full `agent` block via the chat-client.
  const cadChat = useCadChatClient();
  const { agent } = cadChat;

  const handleFixWithAi = useCallback(
    async (targets: readonly KernelIssue[], createNewChat: boolean) => {
      if (targets.length === 0) {
        return;
      }

      const filePath = await getMainFilename();
      const fileContent = await fileManager.readFile(filePath);
      const code = decodeTextFile(fileContent);

      const errorPrompt = formatErrorPrompt({
        errors: targets,
        filePath,
        code,
        kernel: agent.kernel,
      });

      setChatOpen(true);

      if (createNewChat) {
        // Persist the pending user message with an explicit one-shot startup
        // request so hydration can fire this intentional Fix-with-AI turn
        // without treating every pending user tail as command state.
        const message = buildUserMessage({ text: errorPrompt });
        const newChat = await createChat({
          name: 'New chat',
          messages: [message],
          startupRequest: {
            id: generatePrefixedId(idPrefix.request),
            kind: 'regenerate-tail',
            messageId: message.id,
            message,
            source: 'fix-with-ai-new-chat',
            createdAt: Date.now(),
          },
          activeExecution: agent.execution,
          activeKernel: agent.kernel,
        });
        setFocusedChatId(newChat.id);
      } else {
        void cadChat.submit({ text: errorPrompt });
      }
    },
    [getMainFilename, fileManager, agent.kernel, agent.execution, createChat, setFocusedChatId, cadChat, setChatOpen],
  );
  return <ViewerIssuesContent {...props} onFixWithAi={handleFixWithAi} />;
}

/**
 * The CAD actor's issues for this entry in the shared viewer issues (the running phase is the top pill,
 * `ChatViewerStatus`), with the first-use download of a native kernel in place of its refusal.
 */
function ViewerIssuesContent({
  entryPath,
  notice,
  children,
  onFixWithAi,
}: ViewerIssuesProps &
  Readonly<{
    onFixWithAi?: (issues: readonly KernelIssue[], createNewChat: boolean) => Promise<void>;
  }>): React.ReactNode {
  const { projectRef, editorRef } = useProject();
  const openLocation = useCallback(
    ({ fileName, lineNumber, column }: ViewerIssueLocation) => {
      editorRef.send({
        type: 'openFile',
        path: fileName,
        source: 'user',
        lineNumber: lineNumber ?? 1,
        column: column ?? 1,
      });
    },
    [editorRef],
  );

  // CadProvider may retain the previous project's actor during a transition.
  const selectIsCadActorStale = useCallback(
    (snapshot: Parameters<typeof selectCadFailureIssues>[0]) => snapshot.context.parentRef !== projectRef,
    [projectRef],
  );
  const isCadActorStale = useCadSelector(selectIsCadActorStale, true);

  const failureIssues = useCadSelector(selectCadFailureIssues, undefined);
  const selectEntryIssues = useMemo(() => selectCadEntryIssues(entryPath), [entryPath]);
  const entryIssues = useCadSelector(selectEntryIssues, undefined);
  const errors = isCadActorStale ? undefined : (failureIssues ?? entryIssues);
  const ordered = useMemo(
    () => [...(errors ?? [])].sort((a, b) => severityRank[a.severity] - severityRank[b.severity]),
    [errors],
  );

  // Download on first use: a native kernel the desktop has not prepared yet downloads at once and renders again.
  const cad = useCad();
  const download = useNativeKernelDownload(ordered, () => {
    cad?.send({ type: 'initializeModel', entryPath });
  });
  const shown = download === undefined ? ordered : ordered.filter((issue) => issue.code !== 'KERNEL_NOT_PREPARED');
  const notices = [notice, download === undefined ? undefined : downloadNotice(download)].filter(
    (listed): listed is ViewerNotice => listed !== undefined,
  );
  const isFailed =
    !isCadActorStale && failureIssues !== undefined && failureIssues.length > 0 && (!download || shown.length > 0);

  return (
    <ViewerIssuesBar
      issues={shown}
      isFailed={isFailed}
      notices={notices}
      onOpenLocation={openLocation}
      onFix={onFixWithAi === undefined ? undefined : async ({ issues }) => onFixWithAi(issues, false)}
      onFixInNewChat={onFixWithAi === undefined ? undefined : async ({ issues }) => onFixWithAi(issues, true)}
      renderMessage={renderIssueMessage}
    >
      {children}
    </ViewerIssuesBar>
  );
}

/** Diagnostics retain their normal controls while optional chat data arrives. */
export function ViewerIssues(props: ViewerIssuesProps): React.ReactNode {
  const { editorRef } = useProject();
  const chatId = useSelector(editorRef, (snapshot) => snapshot.context.focusedChatId);
  return chatId === undefined ? <ViewerIssuesContent {...props} /> : <ChatViewerIssues {...props} />;
}
