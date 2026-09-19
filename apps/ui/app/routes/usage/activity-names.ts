/* oxlint-disable typescript/no-restricted-types -- The billing wire returns explicit JSON nulls; swapping them for `undefined` would stop modelling what the API returns. */
/**
 * Names for the opaque identities a usage receipt carries.
 *
 * `activity.projectHint` and `activity.chatHint` are owner-scoped ids, nullable
 * at every layer, and this page never renders one: an id tells a reader nothing
 * and is not theirs to read. Each is resolved to the name they gave the thing,
 * or replaced by a label that says why it could not be.
 */

/** Spend that belongs to no project or chat of its own: Tau's own helper surfaces, and history older than the hints. */
const otherTauActivity = 'Other Tau activity';

/**
 * The project a receipt belongs to, by name.
 *
 * Resolved against `GET /v1/projects`, which is the account's own listing, so a
 * project that was deleted, that lives only on a `tau serve` workspace, or that
 * this device is offline from has no name to give. That is a different answer
 * from "no project at all", and the two must not collapse: one says the spend
 * was Tau's own work, the other says it was the reader's and cannot be named.
 *
 * @param hint - `activity.projectHint`, null when the spend had no project.
 * @param names - Project id to project name, from the cloud listing.
 * @returns A name a reader recognises, never the raw id.
 */
export const projectLabel = (hint: string | null, names: ReadonlyMap<string, string>): string => {
  if (hint === null) {
    return otherTauActivity;
  }
  return names.get(hint) ?? 'Project not available';
};

/**
 * What the Chat row can honestly say.
 *
 * Chat names live in each project's own storage, so naming one here means
 * opening every project this device holds (`getAllChats`) and still answering
 * nothing for a chat made on another device. That is more work than a billing
 * table may ask for, so the row reports whether the spend belongs to a chat at
 * all and leaves the name to the chat itself.
 *
 * @param hint - `activity.chatHint`, null when the spend had no chat.
 * @returns The label for the Chat row.
 */
export const chatLabel = (hint: string | null): string =>
  hint === null ? otherTauActivity : 'Chat name not available';
