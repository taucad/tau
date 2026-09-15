import { RevisionMarker } from '#routes/w.$workspace.$project/revision-marker.js';
import { useRevisionChanges, useRevisions } from '#hooks/use-revisions.js';
import { useRestoreToPoint } from '#hooks/use-restore-to-point.js';
import { useRevisionCommands } from '#hooks/use-revision-status.js';

/**
 * Binds a turn's `RevisionMarker` to the host-attested graph.
 *
 * Given the user message that anchors a turn, it looks up the revision that
 * turn recorded — attested by the settling host and carried on the revision
 * itself (`provenance.turnId`), so the card survives a reload with no second
 * store — and renders the shared card as the last assistant message's `footer`.
 * A turn that changed nothing recorded no revision and renders nothing (RV1).
 *
 * The active revision's card carries the "Modified" + Discard affordances when
 * the live FS has diverged from it via a manual edit (dirty). Restoring and
 * discarding both restore this card's own revision — for an older card that
 * moves the head back; for the active card it re-applies the current revision,
 * clearing the divergence (the risky-restore confirmation warns that unsaved
 * edits will be overwritten).
 */
export function ChatRevisionMarker({
  userMessageId,
}: {
  readonly userMessageId: string;
}): React.JSX.Element | undefined {
  const { byTurnId, headRevisionId } = useRevisions();
  const { restore, isBusy } = useRestoreToPoint();
  const commands = useRevisionCommands();
  const revision = byTurnId.get(userMessageId);
  const changes = useRevisionChanges(revision);

  if (!revision) {
    return undefined;
  }

  const isActive = headRevisionId !== undefined && headRevisionId === revision.revisionId;
  const restoreThis = (): void => {
    restore(revision.revisionId);
  };

  return (
    <RevisionMarker
      revision={revision}
      changes={changes}
      isActive={isActive}
      isModified={false}
      isBusy={isBusy}
      onRestore={restoreThis}
      onDiscard={restoreThis}
      onTag={async (name) => {
        await commands.tag({ name, revisionId: revision.revisionId });
      }}
      onDeleteTag={commands.deleteTag}
    />
  );
}
