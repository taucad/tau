import { describe, expect, it } from 'vitest';
import { projectRouteId, registerEagerRouteModules } from '#lib/eager-route-modules.js';
import { routeClasses } from '#lib/route-classes.js';

const projectRouteModule = { default: (): undefined => undefined, handle: { enablePageHeader: false } };
const eagerRouteModules = { [projectRouteId]: projectRouteModule };

describe('registerEagerRouteModules (F11, A15b2)', () => {
  it("adds the project route's module to the router's module cache, so a click commits without loading it", () => {
    const modules: Record<string, unknown> = { root: { default: (): undefined => undefined } };
    const host = { __reactRouterRouteModules: modules };

    expect(registerEagerRouteModules(eagerRouteModules, host)).toEqual([projectRouteId]);
    expect(host.__reactRouterRouteModules[projectRouteId]).toEqual(projectRouteModule);
    expect(Object.keys(host.__reactRouterRouteModules)).toEqual(['root', projectRouteId]);
  });

  it('leaves a module the document already loaded for the route', () => {
    const loaded = { default: (): undefined => undefined };
    const modules: Record<string, unknown> = { [projectRouteId]: loaded };
    const host = { __reactRouterRouteModules: modules };

    expect(registerEagerRouteModules(eagerRouteModules, host)).toEqual([]);
    expect(host.__reactRouterRouteModules[projectRouteId]).toBe(loaded);
  });

  it('adds nothing when no document set a module cache, so no router hydrates', () => {
    const host: { __reactRouterRouteModules?: Record<string, unknown> } = {};

    expect(registerEagerRouteModules(eagerRouteModules, host)).toEqual([]);
    expect(host.__reactRouterRouteModules).toBeUndefined();
  });

  it("names the project route as React Router's flat routes do", () => {
    const projectClass = routeClasses.find((routeClass) => routeClass.id === 'project');

    expect(projectClass?.routes).toEqual(['w.$workspace.$project']);
    expect(projectRouteId).toBe(`routes/${projectClass?.routes[0] ?? ''}`);
  });
});
