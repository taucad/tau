import { z } from 'zod';

const schema = z.object({
  connectionId: z.uuid(),
  repositoryId: z.number().int().positive(),
  repositoryUrl: z.url(),
  generation: z.number().int().positive(),
});
export type GithubProjectBinding = z.infer<typeof schema>;
const key = (projectId: string): string => `tau:github-project:${projectId}`;

/** Nonsecret user-local choice of GitHub identity for one project. */
export const githubProjectBinding = Object.freeze({
  get(projectId: string): GithubProjectBinding | undefined {
    try {
      const value = globalThis.localStorage.getItem(key(projectId));
      if (value === null) {
        return undefined;
      }
      const parsed = schema.safeParse(JSON.parse(value));
      return parsed.success ? parsed.data : undefined;
    } catch {
      return undefined;
    }
  },
  set(projectId: string, binding: GithubProjectBinding): void {
    globalThis.localStorage.setItem(key(projectId), JSON.stringify(schema.parse(binding)));
  },
  remove(projectId: string): void {
    globalThis.localStorage.removeItem(key(projectId));
  },
});
