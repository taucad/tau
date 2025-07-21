const xstateActorDoneEventPrefix = 'xstate.done.actor.';
type XstateActorDoneEvent = `${typeof xstateActorDoneEventPrefix}${string}`;

/**
 * Asserts that the event is a done event from an actor.
 *
 * @param event - The event to check.
 * @returns The event if it is a done event from an actor.
 * @throws An error if the event is not a done event from an actor.
 */
export function assertActorDoneEvent<Event extends { type: string }>(
  event: Event,
): asserts event is Extract<Event, { type: XstateActorDoneEvent }> {
  if (event.type.startsWith(xstateActorDoneEventPrefix)) {
    return;
  }

  throw new Error(`Expected actor done event, got ${event.type}`);
}
