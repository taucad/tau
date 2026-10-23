/**
 * The page's issues in the shared viewer bar (PAR-4): the issues desktop shows, with the plugin's actions. A file link
 * opens the file in the host where it can (Codex desktop) and is the path otherwise; the issue action is the page's
 * Add to chat route; a kernel that is not prepared offers `prepare_kernel`; a failed KCL source says that Zoo is not
 * connected yet (DEF-1).
 */
import { useCallback, useMemo, useState } from 'react';
import type { TauViewerIssue } from '@taucad/mcp/viewer-protocol';
import type { KernelIssue } from '@taucad/runtime/types';
import { formatViewerIssue, unpreparedKernelOf, ViewerIssues } from '@taucad/workbench-panes/shell/viewer-issues';
import type { ViewerIssueLocation, ViewerIssuesProps, ViewerNotice } from '@taucad/workbench-panes/shell/viewer-issues';
import type { ChatRoute, HostBridge } from '#app/host-bridge.js';

/** The tool that prepares a native kernel; `tau mcp` serves it where it can download. */
const prepareKernelToolName = 'prepare_kernel';

/** The issue code a native kernel refuses with until it is prepared. */
const kernelNotPrepared = 'KERNEL_NOT_PREPARED';

/** What the page lists: the shown source's issues and whether its build failed. */
export type PageIssues = Readonly<{
  issues: readonly TauViewerIssue[];
  isFailed: boolean;
  /** The source the issues are for, when the page knows it: the file Add to chat names and a prepare shows again. */
  sourceFile: string | undefined;
}>;

/** The issue action's name per Add to chat route, as the page's other chat actions name it. */
const issueAction: Readonly<Record<ChatRoute, string>> = {
  context: 'Add to chat',
  message: 'Send to chat',
  clipboard: 'Copy issue',
};

/**
 * What Add to chat says about issues: the file and each issue as desktop's Fix with AI lists it.
 *
 * @param issues - The issues to fix.
 * @param sourceFile - The source they are for, when known.
 * @returns The chat text.
 */
export const issueChatText = (issues: readonly KernelIssue[], sourceFile: string | undefined): string =>
  [
    `Fix ${issues.length > 1 ? `these ${String(issues.length)} issues` : 'this issue'}${sourceFile === undefined ? '' : ` in ${sourceFile}`}:`,
    ...issues.map((issue) => formatViewerIssue(issue).trimEnd()),
  ].join('\n\n');

/**
 * Whether the failed source needs Zoo, which the agent plugin does not connect to yet (DEF-1).
 *
 * @param source - The page's issues.
 * @returns Whether to say so.
 */
const needsZoo = (source: PageIssues): boolean => source.isFailed && source.sourceFile?.endsWith('.kcl') === true;

/** The notice for KCL while Zoo credentials are deferred. */
const zooDeferredNotice: ViewerNotice = {
  message:
    'KCL models render through Zoo, which the Tau agent plugin does not connect to yet. Open the project in Tau to render it.',
};

type Preparation = Readonly<
  { kernel: string; phase: 'preparing' } | { kernel: string; phase: 'failed'; message: string }
>;

/**
 * The notice for a kernel preparation the person started: running, or why it stopped. Before it starts, the refusal
 * itself offers Prepare.
 *
 * @param preparation - The preparation.
 * @param prepare - Starts it again.
 * @returns The notice.
 */
const prepareNotice = (preparation: Preparation, prepare: (kernel: string) => void): ViewerNotice =>
  preparation.phase === 'preparing'
    ? {
        message: `Preparing the ${preparation.kernel} kernel runtime. It is needed once; the model renders when it is ready.`,
      }
    : {
        message: preparation.message,
        actionLabel: 'Retry',
        onAct: () => {
          prepare(preparation.kernel);
        },
      };

type PageViewerIssuesProps = Readonly<{
  bridge: HostBridge;
  /** What to list, from {@link PageIssues}. */
  source: PageIssues;
  chatRoute: ChatRoute;
  /** Shows the source again once its kernel is prepared. */
  onPrepared: (sourceFile: string | undefined) => void;
  /** Reports an outcome over the canvas, such as "Added to chat". */
  onNotice: (text: string) => void;
  children: ViewerIssuesProps['children'];
}>;

/**
 * The page's issues in the shared viewer bar.
 *
 * @param props - The bridge, the issues, the chat route, what a prepare and a notice do, and where the parts go.
 * @returns What `children` places.
 */
export function PageViewerIssues({
  bridge,
  source,
  chatRoute,
  onPrepared,
  onNotice,
  children,
}: PageViewerIssuesProps): React.ReactNode {
  const [preparation, setPreparation] = useState<Preparation | undefined>(undefined);
  const { sourceFile } = source;

  const prepare = useCallback(
    (kernel: string) => {
      setPreparation({ kernel, phase: 'preparing' });
      // async-iife: bootstrap — a click starts the preparation; its outcome lands in state and shows the source again.
      void (async () => {
        try {
          await bridge.callTool(prepareKernelToolName, { kernel });
          setPreparation(undefined);
          onPrepared(sourceFile);
        } catch (error) {
          setPreparation({ kernel, phase: 'failed', message: error instanceof Error ? error.message : String(error) });
        }
      })();
    },
    [bridge, onPrepared, sourceFile],
  );
  const onPrepareKernel = useCallback(
    (issue: KernelIssue) => {
      const unprepared = unpreparedKernelOf([issue]);
      if (unprepared !== undefined) {
        prepare(unprepared.kernel);
      }
    },
    [prepare],
  );

  const notices = [
    preparation === undefined ? undefined : prepareNotice(preparation, prepare),
    needsZoo(source) ? zooDeferredNotice : undefined,
  ].filter((notice): notice is ViewerNotice => notice !== undefined);
  /* While a preparation runs or stopped, its notice stands in for the refusal, as desktop's download does. */
  const issues =
    preparation === undefined ? source.issues : source.issues.filter((issue) => issue.code !== kernelNotPrepared);

  const onFix = useCallback(
    async ({ issues: targets }: Readonly<{ issues: readonly KernelIssue[] }>) => {
      try {
        const route = await bridge.addToChat({ text: issueChatText(targets, sourceFile), references: [] });
        onNotice(
          route === 'clipboard'
            ? 'Copied; paste it into your chat'
            : route === 'message'
              ? 'Sent to chat'
              : 'Added to chat',
        );
      } catch {
        onNotice('Could not add to chat');
      }
    },
    [bridge, onNotice, sourceFile],
  );

  const { openFile } = bridge;
  const onOpenLocation = useMemo(
    () =>
      openFile === undefined
        ? undefined
        : ({ fileName }: ViewerIssueLocation) => {
            const relativePath = fileName.replace(/^\/+/u, '');
            // async-iife: bootstrap — a click opens the file; a refusal becomes a notice.
            void (async () => {
              try {
                await openFile(relativePath);
              } catch {
                onNotice(`Could not open ${relativePath}`);
              }
            })();
          },
    [onNotice, openFile],
  );

  return (
    <ViewerIssues
      issues={issues}
      isFailed={source.isFailed && issues.length > 0}
      notices={notices}
      onOpenLocation={onOpenLocation}
      onFix={onFix}
      fixLabel={issueAction[chatRoute]}
      /* Only an issue that names its kernel can be prepared from here. */
      onPrepareKernel={unpreparedKernelOf(issues) === undefined ? undefined : onPrepareKernel}
    >
      {children}
    </ViewerIssues>
  );
}
