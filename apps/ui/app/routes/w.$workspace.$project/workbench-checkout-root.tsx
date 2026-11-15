import { useRevisionPinMemory } from '#routes/w.$workspace.$project/chat-revisions-pin.js';

/**
 * Where the workbench's file services are rooted (S27, A1, A2).
 *
 * *Switch* is one verb with two implementations a person never distinguishes.
 * When the target branch has a linked checkout, the workbench **re-roots**: the
 * selection moves in `project-revisions.machine` and every consumer — Files,
 * the editor, the viewer, parameters, the main-file selector — re-issues its
 * rooted view at the new route.
 *
 * The selection is **not** route state: A38 gave it to the revision root and the
 * projection publishes it with the route it resolves to. Since A7b the focused
 * session's `revisions` child follows it, with nothing mounted (row S23):
 * it installs the linked checkouts' routes, then moves the file manager's root.
 * What stays here is the pin's memory, which a *Switch* outlives a reload with.
 *
 * @returns Nothing; it only remembers the pin.
 */
export function WorkbenchCheckoutRoot(): undefined {
  /* R22: a *Switch* pin outlives a reload, whether or not the Revisions pane is open. */
  useRevisionPinMemory();
  return undefined;
}
