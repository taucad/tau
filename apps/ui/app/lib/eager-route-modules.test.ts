import { describe, expect, it, vi } from 'vitest';
import { routeClasses } from '#lib/route-classes.js';

const projectRouteModule = vi.hoisted(() => ({ default: (): null => null, handle: { enablePageHeader: false } }));

vi.mock('#routes/w.$workspace.$project/route.js', () => projectRouteModule);

const { eagerRouteModules, projectRouteId, registerEagerRouteModules } = await import('#lib/eager-route-modules.js');

describe('registerEagerRouteModules (F11, A15b2)', () => {
  it("adds the project route's module to the router's module cache, so a click commits without loading it", () => {
    const host = { __reactRouterRouteModules: { root: { default: (): null => null } } as Record<string, unknown> };

    expect(registerEagerRouteModules(host)).toEqual([projectRouteId]);
    expect(host.__reactRouterRouteModules[projectRouteId]).toEqual(projectRouteModule);
    expect(Object.keys(host.__reactRouterRouteModules)).toEqual(['root', projectRouteId]);
  });

  it('leaves a module the document already loaded for the route', () => {
    const loaded = { default: (): null => null };
    const host = { __reactRouterRouteModules: { [projectRouteId]: loaded } as Record<string, unknown> };

    expect(registerEagerRouteModules(host)).toEqual([]);
    expect(host.__reactRouterRouteModules[projectRouteId]).toBe(loaded);
  });

  it('adds nothing when no document set a module cache, so no router hydrates', () => {
    const host: { __reactRouterRouteModules?: Record<string, unknown> } = {};

    expect(registerEagerRouteModules(host)).toEqual([]);
    expect(host.__reactRouterRouteModules).toBeUndefined();
  });

  it("names the project route as React Router's flat routes do", () => {
    const projectClass = routeClasses.find((routeClass) => routeClass.id === 'project');

    expect(projectClass?.routes).toEqual(['w.$workspace.$project']);
    expect(Object.keys(eagerRouteModules)).toEqual([`routes/${projectClass?.routes[0] ?? ''}`]);
  });
});
