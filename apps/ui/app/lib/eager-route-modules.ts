/**
 * The project route's module in the entry graph (loading-states blueprint, § Client navigation; lane A15b2, F11).
 *
 * React Router commits a client navigation, and so changes the URL, only once every matched route's module has
 * loaded: a route whose module is not yet in its module cache is created with a lazy loader, and the router awaits
 * that loader's whole module before the navigation completes. A click from Home on a project row therefore waited
 * for `routes/w.$workspace.$project` to download, 3 s with that chunk held, before the URL, the selected row or the
 * workspace frame could change.
 *
 * The route module is small: its frame, gates and notices (about 12 KB compressed beyond what Home already loads),
 * while the workspace itself stays in the lazy `project-live-sessions` chunk the route loads after it commits. So the
 * entry imports it statically and hands it to the router's module cache before hydration. The router then creates
 * the route with its component in place and a click commits at once; the frame paints from the frame hint while the
 * workspace chunk is still on its way.
 *
 * React Router reads `window.__reactRouterRouteModules` once, when `HydratedRouter` creates its routes, and the
 * document's own script assigns it just before it imports the entry. A document that rendered the project route
 * already lists it, and is left as it is. The entry imports the route module and passes it in: `lib/` imports no
 * route (workspace project policy).
 */

/** The project route's id in React Router's manifest. */
export const projectRouteId = 'routes/w.$workspace.$project';

type RouteModulesHost = { __reactRouterRouteModules?: Record<string, unknown> };

/**
 * Add the entry graph's route modules to React Router's module cache. Call it before hydration.
 *
 * @param eagerRouteModules - The route modules the entry graph carries, by route id.
 * @param host - The window whose router hydrates; `globalThis` by default.
 * @returns The route ids it added; none when the document set no module cache (no `HydratedRouter` will run).
 */
export function registerEagerRouteModules(
  eagerRouteModules: Readonly<Record<string, unknown>>,
  host: RouteModulesHost = globalThis as RouteModulesHost,
): readonly string[] {
  const modules = host.__reactRouterRouteModules;
  if (modules === undefined) {
    return [];
  }
  const added: string[] = [];
  for (const [id, module] of Object.entries(eagerRouteModules)) {
    if (!(id in modules)) {
      modules[id] = module;
      added.push(id);
    }
  }
  return added;
}
