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

/** One label for every project the account's listing did not name, so the filter offers them together. */
export const unresolvedProjectName = 'Project not available';

/**
 * What the page knows about project names.
 *
 * The listing is a request like any other, so "has not answered yet" is a state
 * a reader sees — it starts only once the snapshot is ready, with the table
 * already on screen. Collapsing it into the answered map makes every project
 * look settled and unnamed, which is what let one filter click select them all.
 *
 * - a map: the listing answered; a missing id really is unnamed
 * - `asking`: in flight, so nothing is known yet
 * - `unavailable`: the page will never ask (offline, signed out, or done refreshing)
 */
export type ProjectNames = ReadonlyMap<string, string> | 'asking' | 'unavailable';

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
 * @param names - The listing, or why the page does not have one.
 * @returns A name a reader recognises, never the raw id.
 */
export const projectLabel = (hint: string | null, names: ProjectNames): string => {
  if (hint === null) {
    return otherTauActivity;
  }
  if (names === 'asking') {
    return 'Finding the project…';
  }
  if (names === 'unavailable') {
    return unresolvedProjectName;
  }
  return names.get(hint) ?? unresolvedProjectName;
};

/**
 * The chat a receipt was spent in, by name.
 *
 * Chats live in their project's own storage, which `useChatName` reads only
 * once a reader opens the row. A chat made on another device, or one whose
 * storage cannot answer, has no name to give here — said plainly rather than
 * left as a loading label that never settles.
 *
 * The two hints are produced independently, so a chat hint can arrive with no
 * project hint beside it — and the chat's storage is found through its project.
 * There is then nowhere to look, which is not the same as having looked and
 * found nothing; only the second may say the chat is absent.
 *
 * @param activity - The receipt's `projectHint` and `chatHint`.
 * @param name - The resolved name, null when the lookup settled on nothing or
 * never ran, undefined while it is still reading.
 * @returns A name a reader recognises, never the raw id.
 */
export const chatLabel = (
  activity: { readonly projectHint: string | null; readonly chatHint: string | null },
  name: string | null | undefined,
): string => {
  if (activity.chatHint === null) {
    return otherTauActivity;
  }
  if (activity.projectHint === null) {
    return 'Chat name not available';
  }
  if (name === undefined) {
    return 'Finding the chat…';
  }
  return name ?? 'Chat not on this device';
};
