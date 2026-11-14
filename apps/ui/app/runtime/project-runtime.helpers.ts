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
import type { ChatStorage } from '#types/storage.types.js';

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Parameter operation failed.';

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
}: {
  readonly projectId: string;
  readonly getCurrent: () => ObservedManifestState;
  readonly reload: () => void;
  readonly report: (issue: ProjectManifestParseIssue) => void;
  readonly onSettled?: () => void;
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
        onSettled?.();
        return;
      }
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
 */
export async function resolveScopedProjectManifest({
  contentService,
  projectId,
}: {
  readonly contentService: FileContentService;
  readonly projectId: string;
}): Promise<{ readonly project: Project; readonly issue?: ProjectManifestParseIssue }> {
  const outcome = await contentService.resolve('tau.json', { forceText: true });
  if (outcome.kind !== 'text') {
    throw new Error(`Cannot read tau.json for ${projectId}: ${outcome.kind}`);
  }

  const read = readProjectManifestBytes(outcome.content);
  if (!read.success) {
    throw new Error(`Invalid tau.json for ${projectId}: ${describeProjectManifestIssue(read.issue).join(' ')}`);
  }
  return { project: { ...read.data, id: projectId }, ...(read.issue === undefined ? {} : { issue: read.issue }) };
}
