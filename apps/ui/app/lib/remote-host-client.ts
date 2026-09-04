import { z } from 'zod';

import { ENV } from '#environment.config.js';

const hostDeviceSchema = z.object({
  id: z.string(),
  label: z.string(),
  createdAt: z.coerce.date(),
  lastSeenAt: z.coerce.date().nullable(),
  revokedAt: z.coerce.date().nullable(),
  online: z.boolean(),
  runtimeVersion: z.string().optional(),
  capacity: z.number().int().positive().optional(),
  /**
   * Present only while the device is online *and* advertised the agent
   * capability in its control `ready` frame (W4 ruling 4). Its absence is the
   * only signal that a paired daemon has no agent workspace to place a turn on.
   */
  agent: z
    .object({
      workspaceRoot: z.string(),
      /** External ACP agents this daemon can start (W4-ACP); absent = Tau runs only. */
      externalAgents: z.array(z.string()).optional(),
    })
    .optional(),
  /**
   * The project this device is the cloud host *for* (launcher 3), or null for a
   * device the user paired themselves.
   *
   * It is what lets the selector show one "Tau Cloud" row for the project in
   * front of the user instead of another machine's name.
   */
  cloudProjectId: z.string().nullable().optional(),
});

const hostSessionSchema = z.object({
  id: z.string(),
  runtimeVersion: z.string(),
  expiresAt: z.iso.datetime(),
  url: z.url(),
  /** The relayed `/agent` socket, minted only for a device advertising the capability. */
  agentUrl: z.url().optional(),
});

const apiBase = (): string => `${ENV.TAU_API_URL.replace(/\/$/u, '')}/v1/agents`;

export type RemoteHostDevice = z.infer<typeof hostDeviceSchema>;
export type RemoteHostSession = z.infer<typeof hostSessionSchema>;

export class RemoteHostApiError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * What each refusal code means, in words the card can show.
 *
 * The API refuses with a `code` and usually no `message` — `ConflictException
 * ({ code: 'BUSY' })` for a daemon at capacity, and the daemon's own
 * `BUSY | CHILD_UNAVAILABLE | VERSION_MISMATCH` rejects arrive the same way.
 * Falling back to a generic sentence threw the only actionable fact away.
 */
const refusalMessages: Readonly<Record<string, string>> = {
  agentNotFound: 'That computer is no longer paired with your account.',
  busy: 'That computer is already running another Tau session. Try again in a moment.',
  childUnavailable: 'That computer could not start its Tau runtime.',
  cloudHostUnavailable: 'Tau Cloud is unavailable.',
  deviceOffline: 'That computer is offline. Start `tau serve` on it and try again.',
  versionMismatch: 'That computer runs a different Tau version. Update it and try again.',
};

/**
 * Refusals whose `error` field is the API's own sentence rather than Nest's
 * generic status phrase.
 *
 * `HttpExceptionFilter` maps an exception's string `message` onto `error` and
 * synthesises `"Conflict Exception"` when there is none, so appending `error`
 * to every phrase would bolt that noise onto sentences that already say more.
 * A cloud provisioning refusal is the one that carries a reason worth reading —
 * which image is missing, which daemon is down.
 */
const reasonedRefusals: ReadonlySet<string> = new Set(['CLOUD_HOST_UNAVAILABLE']);

const refusalMessage = (code: string, reason: string | undefined): string => {
  const key = code.toLowerCase().replaceAll(/_(?<letter>[a-z])/gu, (_match, letter: string) => letter.toUpperCase());
  const phrase = refusalMessages[key] ?? `Tau Host refused the request (${code}).`;
  return reason && reasonedRefusals.has(code) ? `${phrase.replace(/\.$/u, '')}: ${reason}` : phrase;
};

const request = async (path: string, init?: RequestInit): Promise<Response> => {
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    credentials: 'include',
    headers: { accept: 'application/json', ...init?.headers },
  });
  if (response.ok) {
    return response;
  }
  const body = (await response.json().catch(() => undefined)) as
    | { code?: string; message?: string; error?: string }
    | undefined;
  const code = body?.code ?? `HTTP_${String(response.status)}`;
  throw new RemoteHostApiError(code, body?.message ?? refusalMessage(code, body?.error));
};

export const listRemoteHosts = async (): Promise<RemoteHostDevice[]> => {
  const response = await request('');
  return z.array(hostDeviceSchema).parse(await response.json());
};

export const approveRemoteHostPairing = async (userCode: string): Promise<void> => {
  await request('/pairings/approve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userCode }),
  });
};

export const revokeRemoteHost = async (deviceId: string): Promise<void> => {
  await request(`/${encodeURIComponent(deviceId)}`, { method: 'DELETE' });
};

const cloudHostSchema = z.object({
  deviceId: z.string(),
  label: z.string(),
  state: z.enum(['existing', 'provisioned']),
});

/** What `POST /v1/agents/cloud` answers — never a credential. @public */
export type CloudHostProvisioning = z.infer<typeof cloudHostSchema>;

/**
 * Provision — or recover — this project's cloud host.
 *
 * Idempotent per owner and project: calling it for a project that already has a
 * host returns that host rather than starting a second one, so the selector can
 * call it on every choice without checking first.
 *
 * @param projectId - The project whose host this is.
 * @returns The device the caller can now place turns on.
 * @public
 */
export const provisionCloudHost = async (projectId: string): Promise<CloudHostProvisioning> => {
  const response = await request('/cloud', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId }),
  });
  return cloudHostSchema.parse(await response.json());
};

export const createRemoteHostSession = async (deviceId: string, runtimeVersion: string): Promise<RemoteHostSession> => {
  const response = await request(`/${encodeURIComponent(deviceId)}/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ runtimeVersion }),
  });
  return hostSessionSchema.parse(await response.json());
};
