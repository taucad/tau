import type { EditorStateMachineRef } from '#machines/editor.machine.js';

/**
 * Part-menu reveals ("Reveal in model tree", "Show kinematics") that reach a pane even when it opens because of them.
 *
 * The editor emits each reveal once. A pane the reveal opens (a lazy chunk on a phone, a new dockview panel) mounts
 * and subscribes after that emit has gone. The workspace holds a reveal no pane heard, and the next pane to subscribe
 * takes it, so the part is expanded and scrolled to on first use too.
 */

/** The pane a reveal is for. */
export type WorkbenchRevealKind = 'model' | 'kinematics';

/** The component a reveal names. */
export type WorkbenchRevealTarget = Readonly<{ entryPath: string; unitId: string; componentId: string }>;

type Channel = { subscribers: number; held: WorkbenchRevealTarget | undefined };

const channels = new WeakMap<EditorStateMachineRef, Record<WorkbenchRevealKind, Channel>>();

function channelOf(editorRef: EditorStateMachineRef, kind: WorkbenchRevealKind): Channel {
  let byKind = channels.get(editorRef);
  if (!byKind) {
    byKind = { model: { subscribers: 0, held: undefined }, kinematics: { subscribers: 0, held: undefined } };
    channels.set(editorRef, byKind);
  }
  return byKind[kind];
}

const targetOf = ({ entryPath, unitId, componentId }: WorkbenchRevealTarget): WorkbenchRevealTarget => ({
  entryPath,
  unitId,
  componentId,
});

/**
 * Called by the workspace for every reveal the editor emits: keeps it for the next subscriber when no pane heard it.
 *
 * @param editorRef - The project's editor actor.
 * @param kind - The pane the reveal is for.
 * @param target - The revealed component.
 */
export function holdUnheardReveal(
  editorRef: EditorStateMachineRef,
  kind: WorkbenchRevealKind,
  target: WorkbenchRevealTarget,
): void {
  const channel = channelOf(editorRef, kind);
  channel.held = channel.subscribers === 0 ? targetOf(target) : undefined;
}

/**
 * Subscribes a pane to its reveals: a held one first, then each one the editor emits.
 *
 * @param editorRef - The project's editor actor.
 * @param kind - The pane subscribing.
 * @param listener - Called with each revealed component.
 * @returns The unsubscribe function.
 */
export function subscribeWorkbenchReveal(
  editorRef: EditorStateMachineRef,
  kind: WorkbenchRevealKind,
  listener: (target: WorkbenchRevealTarget) => void,
): () => void {
  const channel = channelOf(editorRef, kind);
  channel.subscribers += 1;
  const subscription =
    kind === 'model'
      ? editorRef.on('modelComponentRevealRequested', (event) => {
          listener(targetOf(event));
        })
      : editorRef.on('kinematicsRevealRequested', (event) => {
          listener(targetOf(event));
        });
  const { held } = channel;
  channel.held = undefined;
  if (held) {
    listener(held);
  }
  return () => {
    channel.subscribers -= 1;
    subscription.unsubscribe();
  };
}
