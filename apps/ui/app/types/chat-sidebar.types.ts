/**
 * One chat row's run state — the architecture's agent-state table.
 *
 * It lives beside the other shared app types rather than on the sidebar hook
 * that first derived it, because the activity-cue infrastructure reads the same
 * vocabulary and infrastructure may not import from `#hooks/*`.
 *
 * @public
 */
export type ChatSidebarState =
  | 'idle'
  | 'queued'
  | 'working'
  | 'tool'
  | 'approval'
  | 'question'
  | 'reconnecting'
  | 'finishing'
  | 'done'
  | 'failed'
  | 'stopped';
