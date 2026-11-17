/**
 * Where a project came from, as registering it on Tau Cloud says (B4c).
 *
 * One rule for every host that registers a project — the browser worker, the
 * desktop and `tau serve`, and the CLI — so a project linked to a GitHub
 * repository is registered as one whichever host connects it first. Tau Cloud
 * keeps the origin a project row was first created with, so a host that left
 * the field out would have that project's untrailered commits refused for good.
 */

import type { Remote } from '#revision-port.js';

/**
 * The `origin` field a project registers with: `github` when one of its remotes is a GitHub repository.
 *
 * @param remotes - The project's remotes, as its port lists them.
 * @returns `{ origin: 'github' }` for a GitHub-linked project, else nothing to send.
 * @public
 */
export const registrationOrigin = (remotes: ReadonlyArray<Pick<Remote, 'provider'>>): Readonly<{ origin?: 'github' }> =>
  remotes.some((remote) => remote.provider === 'github') ? { origin: 'github' } : {};
