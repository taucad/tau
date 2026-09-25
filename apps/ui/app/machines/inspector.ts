import type { InspectionEvent } from 'xstate';

// Toggle this to enable/disable inspector
const inspectEnabled = false;

/**
 * Logs every event an actor transitions on.
 *
 * XState v6 reports each transition as one `@xstate.transition` inspection event, carrying the
 * event, the snapshot, the microsteps and the executed actions together. No Stately browser
 * inspector release supports v6, so the console is the inspector.
 *
 * @param args - The inspection event.
 */
export function consoleInspector(args: InspectionEvent): void {
  if (args.type === '@xstate.transition') {
    console.info('XState Event:', args.event);
  }
}

// oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- enables easy debugging
export const inspect = inspectEnabled ? consoleInspector : undefined;
