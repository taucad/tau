/** Verify GitHub's signed job identity before any new mutable installer pointer may change. */
import { createPublicKey, verify } from 'node:crypto';
import { z } from 'zod';

const issuer = 'https://token.actions.githubusercontent.com';
const audience = 'tau-desktop-installer-publication';
const keySchema = z.object({
  kty: z.literal('RSA'),
  kid: z.string(),
  n: z.string(),
  e: z.string(),
  alg: z.literal('RS256'),
});
const claimsSchema = z.object({
  iss: z.literal(issuer),
  aud: z.literal(audience),
  sub: z.string(),
  repository: z.literal('taucad/tau'),
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external GitHub/AWS wire field exactly.
  repository_owner: z.literal('taucad'),
  ref: z.literal('refs/heads/main'),
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external GitHub/AWS wire field exactly.
  workflow_ref: z.literal('taucad/tau/.github/workflows/desktop-route-promotion.yml@refs/heads/main'),
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external GitHub/AWS wire field exactly.
  workflow_sha: z.string().regex(/^[a-f\d]{40}$/u),
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external GitHub/AWS wire field exactly.
  run_id: z.string().regex(/^\d+$/u),
  exp: z.number(),
  iat: z.number(),
  nbf: z.number(),
});

/** Admit only a signed main-branch job in the channel's protected installer environment. */
export const verifyDesktopPublicationToken = (
  token: string,
  keySet: unknown,
  expected: {
    channel: 'production' | 'staging';
    operation?: 'promote-routes' | 'renew-routes';
    runId: string;
    workflowSha: string;
    /** Milliseconds since the Unix epoch. */
    now?: number;
  },
): void => {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid GitHub identity token');
  }
  const header = z
    .object({ alg: z.literal('RS256'), kid: z.string(), typ: z.literal('JWT') })
    .parse(JSON.parse(Buffer.from(parts[0]!, 'base64url').toString()));
  const keys = z
    .object({ keys: z.array(keySchema) })
    .parse(keySet)
    .keys.filter((key) => key.kid === header.kid);
  if (
    keys.length !== 1 ||
    !verify(
      'RSA-SHA256',
      Buffer.from(`${parts[0]}.${parts[1]}`),
      createPublicKey({ key: keys[0]!, format: 'jwk' }),
      Buffer.from(parts[2]!, 'base64url'),
    )
  ) {
    throw new Error('Untrusted GitHub job signature');
  }
  const claims = claimsSchema.parse(JSON.parse(Buffer.from(parts[1]!, 'base64url').toString()));
  const seconds = (expected.now ?? Date.now()) / 1000;
  if (
    claims.sub !==
      `repo:taucad/tau:environment:${expected.operation === 'renew-routes' ? 'desktop-installer-renewal' : 'desktop-installers'}-${expected.channel}` ||
    claims.run_id !== expected.runId ||
    claims.workflow_sha !== expected.workflowSha ||
    claims.exp <= seconds ||
    claims.nbf > seconds + 30 ||
    claims.iat > seconds + 30 ||
    claims.exp - claims.iat > 600
  ) {
    throw new Error('GitHub job is not authorized for this channel');
  }
};

/** Fetch identity from GitHub's runner endpoint, then verify against GitHub's fixed issuer key set. */
export const requireDesktopPublicationAuthority = async (
  channel: 'production' | 'staging',
  operation: 'promote-routes' | 'renew-routes',
): Promise<void> => {
  const requestUrl = process.env['ACTIONS_ID_TOKEN_REQUEST_URL'];
  const requestToken = process.env['ACTIONS_ID_TOKEN_REQUEST_TOKEN'];
  const runId = process.env['GITHUB_RUN_ID'];
  const workflowSha = process.env['GITHUB_SHA'];
  if (!requestUrl || !requestToken || !runId || !workflowSha) {
    throw new Error('Mutable publication requires the protected GitHub workflow');
  }
  const url = new URL(requestUrl);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.actions.githubusercontent.com')) {
    throw new Error('Unexpected GitHub identity endpoint');
  }
  url.searchParams.set('audience', audience);
  const identity = await fetch(url, {
    headers: { authorization: `Bearer ${requestToken}` },
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  if (!identity.ok) {
    throw new Error('GitHub job identity unavailable');
  }
  const { value } = z.object({ value: z.string().max(32_768) }).parse(await identity.json());
  const response = await fetch(`${issuer}/.well-known/jwks`, {
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error('GitHub issuer keys unavailable');
  }
  verifyDesktopPublicationToken(value, await response.json(), { channel, operation, runId, workflowSha });
};
