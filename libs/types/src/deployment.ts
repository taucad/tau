import { z } from 'zod';

/**
 * The deployment answer an API publishes at `GET /v1/deployment`: which edition it runs and whether its model gateway
 * runs the funded protocol (binds `x-tau-operation-id` and answers attempt lookups). It is the same for every caller,
 * so it carries no account data and no secret, and a host caches it per API origin for `maxAgeSeconds`.
 *
 * A host reads it with {@link parseDeploymentAnswer}. Only a `valid` answer selects behaviour: a malformed body, like a
 * timeout or a `5xx`, never means "not funded".
 */

/** The route that publishes the answer, relative to the API origin. @public */
export const deploymentAnswerPath = '/v1/deployment';

/** The answer's shape. A later incompatible shape takes a new `version`, which this one reads as malformed. @public */
export const deploymentAnswerSchema = z
  .object({
    version: z.literal(1),
    /** `cloud` when the API runs with `TAU_CLOUD_ENABLED`, else `self-host`. */
    edition: z.enum(['cloud', 'self-host']),
    billing: z.object({
      /** Whether the gateway runs the funded protocol; always `false` on a self-host API. */
      funded: z.boolean(),
      /** The API's billing environment (`staging`, `prod-us`, ...) when funded; informational for hosts. */
      environment: z.string().min(1).optional(),
    }),
    /** How long a host may reuse the answer for this origin. */
    maxAgeSeconds: z.number().int().min(0),
  })
  .refine((answer) => answer.edition === 'cloud' || !answer.billing.funded, {
    message: 'A self-host deployment is never funded',
    path: ['billing', 'funded'],
  })
  .refine((answer) => answer.billing.funded || answer.billing.environment === undefined, {
    message: 'Only a funded deployment names its billing environment',
    path: ['billing', 'environment'],
  });

/** One deployment answer. @public */
export type DeploymentAnswer = z.output<typeof deploymentAnswerSchema>;

/** The outcome of reading a response body as a deployment answer. @public */
export type DeploymentAnswerParse =
  | { readonly status: 'valid'; readonly answer: DeploymentAnswer }
  | { readonly status: 'malformed'; readonly reason: string };

/**
 * Read a decoded response body as a deployment answer. Unknown fields are dropped, so an API that adds one does not
 * break an older host; a missing or mistyped field, a different `version` or a self-host answer that claims funding is
 * `malformed`.
 *
 * @param body - The decoded JSON body of `GET /v1/deployment`.
 * @returns `valid` with the answer, or `malformed` with a short reason (never the body itself).
 * @public
 */
export const parseDeploymentAnswer = (body: unknown): DeploymentAnswerParse => {
  const parsed = deploymentAnswerSchema.safeParse(body);
  if (parsed.success) {
    return { status: 'valid', answer: parsed.data };
  }
  const issue = parsed.error.issues[0];
  const where = issue === undefined || issue.path.length === 0 ? 'answer' : issue.path.join('.');
  return { status: 'malformed', reason: `${where}: ${issue?.message ?? 'invalid'}` };
};
