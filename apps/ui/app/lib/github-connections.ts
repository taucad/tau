import { z } from 'zod';
import { ENV } from '#environment.config.js';

const githubId = z.number().int().positive();
const connectionSchema = z.object({
  id: z.uuid(),
  subject: githubId,
  login: z.string().min(1),
  avatarUrl: z.url().optional(),
  generation: z.number().int().positive(),
});
const installationSchema = z.object({
  id: githubId,
  owner: z.object({ id: githubId, login: z.string(), avatarUrl: z.url().nullable(), type: z.string() }),
  repositorySelection: z.enum(['all', 'selected']),
  suspended: z.boolean(),
  permissions: z.record(z.string(), z.string()),
});
const repositorySchema = z.object({
  id: githubId,
  name: z.string(),
  fullName: z.string(),
  owner: z.object({ id: githubId, login: z.string(), avatarUrl: z.url().nullable(), type: z.string() }),
  visibility: z.enum(['public', 'private', 'internal']),
  access: z.enum(['unknown', 'read', 'write']),
  archived: z.boolean(),
  disabled: z.boolean(),
  description: z.string().nullable(),
  defaultBranch: z.string(),
  htmlUrl: z.url(),
  cloneUrl: z.url(),
});
const branchSchema = z.object({
  name: z.string().min(1),
  head: z
    .string()
    .regex(/^[0-9a-f]{40}$/u)
    .optional(),
});
const treeFileSchema = z.object({
  path: z.string().min(1),
  mode: z.enum(['100644', '100755']),
  size: z.number().int().nonnegative(),
  oid: z.string().regex(/^[0-9a-f]{40}$/u),
});

export type GithubConnection = z.infer<typeof connectionSchema>;
export type GithubInstallation = z.infer<typeof installationSchema>;
export type GithubRepository = z.infer<typeof repositorySchema>;
export type GithubBranch = z.infer<typeof branchSchema>;
export type GithubTreeFile = z.infer<typeof treeFileSchema>;

const apiUrl = (path: string): string => `${ENV.TAU_API_URL.replace(/\/$/u, '')}/v1/github${path}`;

async function request<Output>(path: string, schema: z.ZodType<Output>, init?: RequestInit): Promise<Output> {
  const response = await fetch(apiUrl(path), {
    ...init,
    credentials: 'include',
    cache: 'no-store',
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message = z.object({ message: z.string().optional(), code: z.string().optional() }).safeParse(body);
    throw new Error(
      message.success
        ? (message.data.message ?? message.data.code ?? 'GitHub request failed.')
        : 'GitHub request failed.',
    );
  }
  return schema.parse(body);
}

export const githubConnections = Object.freeze({
  list: async (): Promise<readonly GithubConnection[]> => request('/connections', z.array(connectionSchema)),
  start: async (
    returnTo: string,
    completionMode: 'browser' | 'desktop-poll' = 'browser',
  ): Promise<{ attemptId: string; authorizationUrl: string }> =>
    request('/connections/start', z.object({ attemptId: z.uuid(), authorizationUrl: z.url() }), {
      method: 'POST',
      body: JSON.stringify({ returnTo, completionMode }),
    }),
  complete: async (attemptId: string): Promise<GithubConnection> =>
    request('/connections/complete', connectionSchema, { method: 'POST', body: JSON.stringify({ attemptId }) }),
  cancel: async (attemptId: string): Promise<void> => {
    await request(`/connection-attempts/${encodeURIComponent(attemptId)}`, z.void(), { method: 'DELETE' });
  },
  remove: async (connectionId: string): Promise<void> => {
    await request(`/connections/${encodeURIComponent(connectionId)}`, z.void(), { method: 'DELETE' });
  },
  configuration: async (): Promise<{ installUrl: string }> =>
    request('/configuration', z.object({ installUrl: z.url() })),
  installations: async (connectionId: string, page = 1) =>
    request(
      `/installations?connectionId=${encodeURIComponent(connectionId)}&page=${String(page)}`,
      z.object({
        totalCount: z.number().int().nonnegative(),
        installations: z.array(installationSchema),
        page: z.number(),
      }),
    ),
  repositories: async (connectionId: string, installationId: number, page = 1) =>
    request(
      `/repositories?connectionId=${encodeURIComponent(connectionId)}&installationId=${String(installationId)}&page=${String(page)}`,
      z.object({
        totalCount: z.number().int().nonnegative(),
        repositories: z.array(repositorySchema),
        page: z.number(),
      }),
    ),
  branches: async (connectionId: string, repositoryId: number, page = 1) =>
    request(
      `/repositories/${String(repositoryId)}/branches?connectionId=${encodeURIComponent(connectionId)}&page=${String(page)}`,
      z.object({ branches: z.array(branchSchema), page: z.number() }),
    ),
  tree: async (connectionId: string, repositoryId: number, head: string) =>
    request(
      `/repositories/${String(repositoryId)}/tree?connectionId=${encodeURIComponent(connectionId)}&head=${encodeURIComponent(head)}`,
      z.object({ files: z.array(treeFileSchema), manifestBase64: z.string().optional() }),
    ),
  token: async (connectionId: string): Promise<{ accessToken: string; expiresAt: string; generation: number }> =>
    request(
      `/connections/${encodeURIComponent(connectionId)}/token`,
      z.object({
        accessToken: z.string().min(1),
        expiresAt: z.iso.datetime(),
        generation: z.number().int().positive(),
      }),
      { method: 'POST' },
    ),
});
