import { projectToManifest } from '@taucad/types';
import type { Project } from '@taucad/types';

/** Build a resolved runtime project while keeping serialized declarations id-free. */
export const createProjectFixture = (project: Omit<Project, '$schema'>): Project => ({
  ...projectToManifest(project),
  id: project.id,
});
