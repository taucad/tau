/**
 * What the Export pane needs from its host beyond the shared units. Each host (the Tau app, the agent plugin viewer)
 * implements it over its own state.
 *
 * @public
 */
export type ExportSource = Readonly<Record<never, never>>;
