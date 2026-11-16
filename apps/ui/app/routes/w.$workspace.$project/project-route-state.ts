/**
 * What the project route is showing, handed down to everything below the outlet (blueprint W1).
 *
 * The gate derives one state from focus, the registry and the committed route (`machines/focus.route-state.ts`) and
 * publishes it here, so the shell always mounts and the route component picks between the editor and a notice. The
 * type itself is `#types/project-route-state.types.js`.
 */
import { createContext, useContext } from 'react';
import type { ProjectRouteState } from '#types/project-route-state.types.js';

/**
 * The route state the gate derived, for everything rendered below the outlet.
 *
 * `undefined` means this is not a project route. The provider is `ProjectRouteGate`. @public
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- React context objects are PascalCase; this module is `.ts` because the state is not JSX.
export const ProjectRouteStateContext = createContext<ProjectRouteState | undefined>(undefined);

/** Route-owned retry callback shared with the on-demand notice view. */
// eslint-disable-next-line @typescript-eslint/naming-convention -- React context objects are PascalCase.
export const ProjectRouteRetryContext = createContext<() => void>(() => undefined);

/**
 * Read what the project route is showing.
 *
 * @returns The current state, or undefined away from a project route.
 * @public
 */
export const useProjectRouteState = (): ProjectRouteState | undefined => useContext(ProjectRouteStateContext);
