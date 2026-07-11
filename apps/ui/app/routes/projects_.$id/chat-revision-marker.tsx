import { RevisionMarker } from '#routes/projects_.$id/revision-marker.js';
import { useRevisions } from '#hooks/use-revisions.js';
import { useRestoreToPoint } from '#hooks/use-restore-to-point.js';

/**
 * Binds a turn's `RevisionMarker` to live state. Given the user message that
 * anchors a turn, it looks up that turn's Revision and renders the shared card
 * as the last assistant message's `footer` — after its content, before its
 * action row (copy/retry/cost); a non-mutating turn (no Revision — RV1)
 * renders nothing.
 *
 * The active revision's card carries the "Modified" + Discard affordances when
 * the live FS has diverged from it via a manual edit (dirty). Restoring and
 * discarding both dispatch a restore of this marker's own revision — for an
 * older card that moves the head back; for the active card it re-materializes
 * the current revision, clearing the divergence (the risky-restore confirm
 * warns that unsaved edits will be overwritten).
 */
export function ChatRevisionMarker({
  userMessageId,
}: {
  readonly userMessageId: string;
}): React.JSX.Element | undefined {
  const { byMessageId, headRevision, isDirty } = useRevisions();
  const { restore, isBusy } = useRestoreToPoint();

  const revision = byMessageId.get(userMessageId);
  if (!revision) {
    return undefined;
  }

  const isActive = headRevision?.n === revision.n;
  const restoreThis = (): void => {
    restore({ messageId: revision.messageId, anchor: revision.anchor });
  };

  return (
    <RevisionMarker
      revision={revision}
      isActive={isActive}
      isModified={isActive && isDirty}
      isBusy={isBusy}
      onRestore={restoreThis}
      onDiscard={restoreThis}
    />
  );
}
