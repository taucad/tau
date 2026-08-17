const originRegistry = new WeakMap<WeakKey, string>();
const authorityRegistry = new WeakMap<WeakKey, { authorities: readonly WeakKey[]; globallyVisible: boolean }>();

/**
 * Attach the originating bridge port id to a change event for intra-process
 * routing (coalescer merge rule, bridge skip-originator). Never serialised or
 * sent over the wire.
 *
 * @param event - Change event instance to tag (WeakMap key).
 * @param originClientId - Originating bridge port id.
 *
 * @public
 */
export function tagEventOrigin(event: WeakKey, originClientId: string): void {
  originRegistry.set(event, originClientId);
}

/**
 * Read the originating bridge port id for an event, if tagged.
 *
 * @param event - Change event to look up.
 * @returns The port id if tagged; otherwise `undefined`.
 *
 * @public
 */
export function getEventOrigin(event: WeakKey): string | undefined {
  return originRegistry.get(event);
}

/**
 * Attach captured provider-authority identities to an in-process event.
 *
 * @param event - Event instance to tag.
 * @param authorities - Exact captured mount entries that own the fact.
 * @param globallyVisible - Whether the fact still belongs to the current global route projection.
 * @public
 */
export function tagEventAuthorities(event: WeakKey, authorities: readonly WeakKey[], globallyVisible: boolean): void {
  authorityRegistry.set(event, { authorities: [...authorities], globallyVisible });
}

/**
 * Read captured provider-authority identities attached to an event.
 * @param event - Event instance to inspect.
 * @returns Captured identities, or `undefined` when none were attached.
 * @public
 */
export function getEventAuthorities(event: WeakKey): readonly WeakKey[] | undefined {
  return authorityRegistry.get(event)?.authorities;
}

/**
 * Whether an event may update the current global route projection.
 * @param event - Event instance to inspect.
 * @returns Whether the event is globally visible.
 * @public
 */
export function isEventGloballyVisible(event: WeakKey): boolean {
  return authorityRegistry.get(event)?.globallyVisible ?? true;
}

/**
 * Copy captured authority metadata to a newly cloned event. Origin is
 * intentionally excluded because the coalescer computes it from the complete
 * path history.
 *
 * @param source - Original event.
 * @param target - Newly cloned event.
 * @public
 */
export function copyEventAuthorities(source: WeakKey, target: WeakKey): void {
  const metadata = authorityRegistry.get(source);
  if (metadata !== undefined) {
    authorityRegistry.set(target, metadata);
  }
}
