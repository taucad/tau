import { z } from 'zod';
import { ENV } from '#environment.config.js';

/**
 * The API's directory record (SP-10).
 *
 * Live session state left with the API SDK client: the page holds the socket
 * now, so `connected` / `lastError` could only ever have been a stale guess.
 */
const paseoConnectionSchema = z.object({
  id: z.string(),
  label: z.string(),
  serverId: z.string(),
  relayEndpoint: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const apiBase = (): string => `${ENV.TAU_API_URL.replace(/\/$/u, '')}/v1/connectors/paseo`;

export type PaseoConnection = z.infer<typeof paseoConnectionSchema>;

/** One agent the daemon offers, as the selector renders it. @public */
export type PaseoAgent = {
  readonly id: string;
  readonly label: string;
  readonly provider: string;
  readonly status: string;
};

export class PaseoConnectionApiError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const request = async (path: string, init?: RequestInit): Promise<Response> => {
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    credentials: 'include',
    headers: { accept: 'application/json', ...init?.headers },
  });
  if (response.ok) {
    return response;
  }
  const body = (await response.json().catch(() => undefined)) as { code?: string; message?: string } | undefined;
  throw new PaseoConnectionApiError(
    body?.code ?? `HTTP_${String(response.status)}`,
    body?.message ?? 'Paseo connection request failed',
  );
};

export const listPaseoConnections = async (): Promise<PaseoConnection[]> => {
  const response = await request('');
  const result = z.object({ connections: z.array(paseoConnectionSchema) }).parse(await response.json());
  return result.connections;
};

export const pairPaseoConnection = async (input: {
  readonly offer: string;
  readonly password?: string;
  readonly label?: string;
}): Promise<PaseoConnection> => {
  const response = await request('/pair', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return paseoConnectionSchema.parse(await response.json());
};

export const revokePaseoConnection = async (connectionId: string): Promise<void> => {
  await request(`/${encodeURIComponent(connectionId)}`, { method: 'DELETE' });
};
