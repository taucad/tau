/**
 * The project runtime's pure helpers, outside React (app state orchestration plan § 4 A6b): what the runtime's children
 * and `ProjectProvider` both call. They lived in `hooks/use-project.tsx`; the runtime imported them from there, which
 * would be an import cycle now that the provider builds its runtime (A6a risk).
 *
 * @module
 */
import {
  describeProjectManifestIssue,
  parameterEntryPath,
  projectToManifest,
  readProjectManifestBytes,
  serializeProjectManifest,
} from '@taucad/types';
import type { Project, ProjectManifestParseIssue } from '@taucad/types';
import type { ParameterSetOutcome } from '@taucad/parameters';
import type { FileContentService } from '@taucad/fs-client/file-content-service';
import { FileNotFoundError } from '@taucad/fs-client/file-content-errors';
import { compareChatsByRecency } from '@taucad/chat-ui/utils/chat-recency.utils';
import { isNotFound } from '@taucad/chat-ui/db/attachment-store';
import type { QueryClient } from '@tanstack/react-query';
import type { Chat } from '@taucad/chat';
import type { ChatStorage } from '@taucad/files-ui/types/chat-storage.types';
import type { RevisionStatusProjection } from '@taucad/revisions';
import { chatsLanded, chatsOpen } from '#hooks/use-project-availability.js';

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Parameter operation failed.';

/**
 * Whether `chatId` is a chat the client already holds — freshly created here, or
 * present in a current non-deleted chat list. Such a chat needs no async
 * ensure round trip, so the editor can focus it synchronously. Deleted-inclusive
 * and invalidated lists cannot authorize a stale route.
 *
 * @returns True when the chat is already known.
 */
export function isKnownChatId({
  chatId,
  createdChatId,
  projectId,
  queryClient,
}: {
  readonly chatId: string;
  readonly createdChatId: string | undefined;
  readonly projectId: string;
  readonly queryClient: QueryClient;
}): boolean {
  if (chatId === createdChatId) {
    return true;
  }
  const visibleChatKeys = [
    ['chats', projectId, { includeDeleted: false }],
    ['chats', projectId, 'records', { includeDeleted: false }],
  ];
  return visibleChatKeys.some((queryKey) => {
    const state = queryClient.getQueryState<Array<Pick<Chat, 'id'>>>(queryKey);
    return state !== undefined && !state.isInvalidated && state.data?.some((chat) => chat.id === chatId) === true;
  });
}

/** Settlements that prove this actor wrote the bytes now held in its snapshot. */
export const shouldDispatchParameterSettlement = (outcome: ParameterSetOutcome | undefined): boolean =>
  outcome?.status === 'committed' && (outcome.write === 'applied' || outcome.write === 'reconciled');

export const parameterStageForSettlement = ({
  entryPath,
  outcome,
  bytes,
}: Readonly<{
  entryPath: string;
  outcome: ParameterSetOutcome | undefined;
  bytes: Uint8Array<ArrayBuffer> | undefined;
}>): Record<string, Uint8Array<ArrayBuffer>> | undefined =>
  shouldDispatchParameterSettlement(outcome) && bytes !== undefined
    ? { [parameterEntryPath(entryPath)]: bytes }
    : undefined;

type FocusedChatWorker = Pick<ChatStorage, 'getChatRecordsForResource' | 'createNavigationRepairChat'>;

/**
 * Whether the focused chat's ensure may make a new chat (SP2h): during a Tau Cloud open once the chats may open
 * ({@link chatsOpen}: their records landed, the entry closure readable, the open neither failed nor another
 * account's), never on an empty list read before the remote's chats arrived; otherwise once a Tau remote's chats have
 * landed ({@link chatsLanded}: projected, or chat sync is off).
 *
 * @param status - The revision client's projection, `undefined` before its first.
 * @param isCloudOpenPending - Whether a Tau Cloud open is still owed for the project.
 * @param canOpen - Whether this account may open the project.
 * @returns `true` when a chat may be made.
 */
export const mayCreateChat = (
  status: Pick<RevisionStatusProjection, 'sync' | 'remote' | 'readiness'> | undefined,
  isCloudOpenPending: boolean,
  canOpen: boolean,
): boolean =>
  isCloudOpenPending ? chatsOpen(status, true, canOpen) : status?.remote.kind !== 'tau' || chatsLanded(status);

export async function ensureFocusedChatForProject({
  projectId,
  requestedChatId,
  persistedChatId,
  worker,
  onCreatedChat,
  canCreateChat = () => true,
}: {
  readonly projectId: string;
  readonly requestedChatId: string | undefined;
  readonly persistedChatId: string | undefined;
  readonly worker: FocusedChatWorker;
  /** Called with the chat it created empty. */
  readonly onCreatedChat?: (chatId: string) => void;
  readonly canCreateChat?: () => boolean;
}): Promise<
  { type: 'focusedChatEnsured'; focusedChatId: string } | { type: 'focusedChatDeferred'; focusedChatId?: undefined }
> {
  const couldCreateBeforeRead = canCreateChat();
  const chats = await worker.getChatRecordsForResource(projectId);

  for (const candidateChatId of [requestedChatId, persistedChatId]) {
    const match = chats.find((chat) => chat.id === candidateChatId);
    if (match) {
      return { type: 'focusedChatEnsured', focusedChatId: match.id };
    }
  }

  if (chats.length > 0) {
    let mostRecent = chats[0]!;
    for (const candidate of chats) {
      if (compareChatsByRecency(candidate, mostRecent) < 0) {
        mostRecent = candidate;
      }
    }
    return { type: 'focusedChatEnsured', focusedChatId: mostRecent.id };
  }

  if (!couldCreateBeforeRead || !canCreateChat()) {
    return { type: 'focusedChatDeferred' };
  }
  const created = await worker.createNavigationRepairChat(projectId);
  onCreatedChat?.(created.id);
  return { type: 'focusedChatEnsured', focusedChatId: created.id };
}

/** What the workspace holds: the manifest it renders and why the bytes on disk are not that manifest. */
type ObservedManifestState = {
  readonly project: Project | undefined;
  readonly issue: ProjectManifestParseIssue | undefined;
};

const manifestStateKey = ({ project, issue }: ObservedManifestState): string =>
  [
    project === undefined ? '' : new TextDecoder().decode(serializeProjectManifest(projectToManifest(project))),
    ...(issue === undefined ? [] : describeProjectManifestIssue(issue)),
  ].join('\n');

/**
 * Follow `tau.json` while its project is open, never silently (blueprint R5).
 *
 * Valid JSON declarations (strict or degraded) reload
 * when it differs from what the workspace holds, so a degraded declaration
 * shows its issue at once. Syntax-invalid JSON retains the mounted manifest
 * and reports its issue. Bytes that no longer identify it — missing, unreadable, oversize, a
 * foreign `$schema` — are reported instead: the
 * workspace keeps its last good manifest open so the person can fix the file.
 */
export const createProjectManifestChangeObserver = ({
  projectId,
  getCurrent,
  reload,
  report,
  onSettled,
  onReconciled,
}: {
  readonly projectId: string;
  readonly getCurrent: () => ObservedManifestState;
  readonly reload: () => void;
  readonly report: (issue: ProjectManifestParseIssue) => void;
  readonly onSettled?: () => void;
  /**
   * The bytes the workspace's manifest was just found equal to; `undefined` once it is not known to be any bytes'
   * (a reload begins, or the bytes read are reported instead).
   */
  readonly onReconciled?: (bytes: Uint8Array<ArrayBuffer> | undefined) => void;
}): {
  readonly check: (input: { readonly readManifest: () => Promise<Uint8Array<ArrayBuffer>> }) => Promise<void>;
  readonly invalidate: () => void;
  readonly dispose: () => void;
} => {
  let disposed = false;
  let generation = 0;
  let lastObserved: string | undefined;

  const reportIssue = (issue: ProjectManifestParseIssue): void => {
    // A later return to the same bytes must reload to clear the report.
    lastObserved = undefined;
    onReconciled?.(undefined);
    report(issue);
    onSettled?.();
  };

  return {
    invalidate: () => {
      generation++;
    },
    check: async ({ readManifest }) => {
      const attempt = ++generation;
      let bytes: Uint8Array<ArrayBuffer>;
      try {
        bytes = await readManifest();
      } catch (error) {
        if (!disposed && attempt === generation) {
          reportIssue(
            error instanceof FileNotFoundError || isNotFound(error)
              ? { code: 'manifest-missing' }
              : { code: 'manifest-unreadable', message: errorMessage(error) },
          );
        }
        return;
      }
      if (disposed || attempt !== generation) {
        return;
      }
      const read = readProjectManifestBytes(bytes);
      if (!read.success) {
        reportIssue(read.issue);
        return;
      }
      const current = getCurrent();
      if (current.project !== undefined && read.issue?.code === 'manifest-invalid-json') {
        reportIssue(read.issue);
        return;
      }
      const observed = manifestStateKey({ project: { ...read.data, id: projectId }, issue: read.issue });
      if (current.project !== undefined && manifestStateKey(current) === observed) {
        onReconciled?.(bytes);
        onSettled?.();
        return;
      }
      /* The workspace holds another manifest than these bytes, whether or not a reload for them is already owed. */
      onReconciled?.(undefined);
      if (observed === lastObserved) {
        return;
      }
      lastObserved = observed;
      if (current.project === undefined || manifestStateKey(current) !== observed) {
        reload();
      }
    },
    dispose: () => {
      disposed = true;
    },
  };
};

/**
 * Read the open route's manifest: strict, or degraded with its issue. The
 * established route binding supplies identity independently of the declaration.
 * The bytes read come back too, so what the project was parsed from can be named.
 */
export async function resolveScopedProjectManifest({
  contentService,
  projectId,
}: {
  readonly contentService: FileContentService;
  readonly projectId: string;
}): Promise<{
  readonly project: Project;
  readonly issue?: ProjectManifestParseIssue;
  readonly bytes: Uint8Array<ArrayBuffer>;
}> {
  const outcome = await contentService.resolve('tau.json', { forceText: true });
  if (outcome.kind !== 'text') {
    throw new Error(`Cannot read tau.json for ${projectId}: ${outcome.kind}`);
  }

  const read = readProjectManifestBytes(outcome.content);
  if (!read.success) {
    throw new Error(`Invalid tau.json for ${projectId}: ${describeProjectManifestIssue(read.issue).join(' ')}`);
  }
  return {
    project: { ...read.data, id: projectId },
    ...(read.issue === undefined ? {} : { issue: read.issue }),
    bytes: outcome.content,
  };
}
