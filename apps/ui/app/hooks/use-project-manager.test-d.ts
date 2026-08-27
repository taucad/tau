import { describe, expectTypeOf, it } from 'vitest';
import type { CreateProjectOptions } from '#hooks/use-project-manager.js';

describe('CreateProjectOptions location contract', () => {
  it('accepts Home, an exact workspace, and an omitted remembered location', () => {
    expectTypeOf<{ kernel: 'openscad'; location: { kind: 'home' } }>().toExtend<CreateProjectOptions>();
    expectTypeOf<{
      kernel: 'openscad';
      location: { kind: 'workspace'; workspaceId: string };
    }>().toExtend<CreateProjectOptions>();
    expectTypeOf<{ kernel: 'openscad' }>().toExtend<CreateProjectOptions>();
  });

  it('rejects physical backends and incomplete product locations', () => {
    expectTypeOf<CreateProjectOptions>().not.toHaveProperty('backend');
    expectTypeOf<CreateProjectOptions>().not.toHaveProperty('workspaceId');
    expectTypeOf<{ kernel: 'openscad'; location: { kind: 'workspace' } }>().not.toExtend<CreateProjectOptions>();
    expectTypeOf<{ kernel: 'openscad'; location: { kind: 'memory' } }>().not.toExtend<CreateProjectOptions>();
  });
});
