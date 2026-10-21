import { expectTypeOf } from 'vitest';
import type { ProjectManifest } from '@taucad/project-core';
import { createProjectIdentityActor, createProjectIdentityResolver } from '@taucad/project-core/identity';
import type { ProjectIdentityActors, ProjectIdentityResult } from '@taucad/project-core/identity';

declare const actors: ProjectIdentityActors;
declare const manifest: ProjectManifest;
// @ts-expect-error Runtime identity is not an authored manifest field.
void manifest.id;
const actor = createProjectIdentityActor({ input: { locationKey: '/project', mode: 'ensure' }, actors });
actor.send({ type: 'cancel' });
expectTypeOf(actor.getSnapshot().output).toEqualTypeOf<ProjectIdentityResult | undefined>();
const resolver = createProjectIdentityResolver({ actors });
resolver.actor.send({ type: 'clear' });
expectTypeOf(resolver.resolve({ locationKey: '/project', mode: 'read' })).toEqualTypeOf<
  Promise<ProjectIdentityResult>
>();
// @ts-expect-error Identity operations require an explicit physical storage location.
void resolver.resolve({ mode: 'ensure' });
// @ts-expect-error Destructive replacement is not an identity resolution mode.
void resolver.resolve({ locationKey: '/project', mode: 'overwrite' });
