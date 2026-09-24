import { Topic } from '@taucad/events';
import { z } from 'zod';

const schema = z.object({
  connectionId: z.uuid(),
  repositoryId: z.number().int().positive(),
  repositoryUrl: z.url(),
  generation: z.number().int().positive(),
  /**
   * The GitHub no-reply identity this project's revisions are authored with (D33).
   * GitHub declines a push carrying the account's private address (GH007), and a
   * commit cannot be re-authored after it is written, so the identity is fixed
   * at link time rather than looked up when the first revision is minted.
   */
  author: z.object({ name: z.string().min(1), email: z.email() }).optional(),
});
export type GithubProjectBinding = z.infer<typeof schema>;
const key = (projectId: string): string => `tau:github-project:${projectId}`;
const topic = new Topic<void>({ name: 'github-project-binding' });

/**
 * GitHub's no-reply address for one account, which pushes accept under the
 * "keep my email private" setting.
 *
 * @param subject - GitHub numeric user id.
 * @param login - GitHub login.
 * @returns The `<id>+<login>@users.noreply.github.com` address.
 */
export const githubNoreplyAuthor = (subject: number, login: string): { name: string; email: string } => ({
  name: login,
  email: `${String(subject)}+${login}@users.noreply.github.com`,
});

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
    topic.emit();
  },
  remove(projectId: string): void {
    globalThis.localStorage.removeItem(key(projectId));
    topic.emit();
  },
  /** Called after any binding is set or removed in this document. */
  subscribe: (listener: () => void): (() => void) => topic.subscribe(listener),
});
