/**
 * What the Parameters pane needs from its host beyond the shared units. Each host (the Tau app, the agent plugin viewer)
 * implements it over its own state.
 *
 * @public
 */
export type ParametersSource = Readonly<Record<never, never>>;
