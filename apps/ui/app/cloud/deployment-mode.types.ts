/**
 * The display mode of an API origin (adaptive app deployment mode charter D2 to D5): whether this page shows the Tau
 * Cloud surfaces. Types only, so every ceiling may import it; the owner of the fact is the runtime's `deployment` child
 * in an adaptive build and a constant in a pinned one.
 */

/** Where a known mode comes from. @public */
export type DeploymentModeBasis =
  /** The build pins it (`cloud` or `self-host` ceiling); no request is made. */
  | 'pinned'
  /** The most recent ask in this page load answered it. */
  | 'confirmed'
  /** This install's record of the last explicit answer, not confirmed by the most recent ask. */
  | 'remembered'
  /** The API answered `404`: it predates the route, which reads as self-host for display (I2). */
  | 'absent';

/** Why the mode is unknown. @public */
export type DeploymentModeProblem =
  /** No answer yet; lasts at most one ask deadline (I15). */
  | 'pending'
  /** The last ask failed: a timeout, a refused connection, a `5xx` or a malformed body. */
  | 'unreachable'
  /** A funded answer named a billing environment this build does not know: update Tau (D7). */
  | 'unsupported'
  /** A funded answer named no billing environment: the server's billing is not set up (D7). */
  | 'misconfigured'
  /** This page load runs in safe mode, with Cloud off (D10). */
  | 'safe-mode';

/** The display mode as one snapshot (the charter's "The display mode"). @public */
export type DeploymentModeSnapshot =
  | Readonly<{
      state: 'funded';
      basis: 'pinned';
      /** A `cloud` build reads its billing environment from its own configuration, so the pin names none. */
      environment: undefined;
    }>
  | Readonly<{
      state: 'funded';
      basis: 'confirmed' | 'remembered';
      environment: string;
    }>
  | Readonly<{ state: 'unfunded'; basis: DeploymentModeBasis }>
  | Readonly<{ state: 'unknown'; problem: DeploymentModeProblem }>;

/** The build's ceiling (D1): which modes it can show. @public */
export type DeploymentCeiling = 'cloud' | 'self-host' | 'adaptive';
