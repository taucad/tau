import {
  GatewayModelTransportError,
  createGatewayModelTransport,
  gatewayResponseError,
  isGatewayProviderKind,
} from '#transport/gateway-model-transport.js';
import type {
  GatewayFundedOperationProtocol,
  GatewayModelTransportOptions,
} from '#transport/gateway-model-transport.js';
import type { InvocationFunding, InvocationResolutionRequest, ModelTransport } from '#waist/ports.js';
import { attemptReceiptSchema } from '#wire/gateway.js';
import type { InvocationResolution } from '#wire/gateway.js';

type CloudOptions = Omit<GatewayModelTransportOptions, 'fundedOperations'> & {
  /**
   * The account the gateway charges, read from the host's credential port on every prepare (W6 RH-S6; W11 GI-Q6).
   * Absent or `undefined`, the host cannot check an attempt's account.
   */
  readonly principal?: (() => string | undefined | Promise<string | undefined>) | undefined;
};

const validIdentity = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 128 && /^[!-~]+$/u.test(value);

/**
 * One owner-scoped GET of the attempt route; the caller maps the answer.
 *
 * @param options - The transport's gateway configuration.
 * @param attemptId - The attempt key to look up.
 * @param signal - Cancels the lookup.
 * @returns The route's raw response.
 */
const fetchAttempt = async (options: CloudOptions, attemptId: string, signal: AbortSignal): Promise<Response> => {
  if (!validIdentity(attemptId)) {
    throw new GatewayModelTransportError({
      code: 'INVALID_REQUEST',
      message: 'Invalid Tau invocation attempt identity.',
    });
  }
  const headers = new Headers();
  const token = await options.auth?.();
  if (token !== undefined) {
    headers.set('authorization', `Bearer ${token}`);
  }
  return (options.fetch ?? globalThis.fetch.bind(globalThis))(
    new URL(
      `v1/billing/attempts/gateway/${encodeURIComponent(attemptId)}`,
      options.baseUrl.endsWith('/') ? options.baseUrl : `${options.baseUrl}/`,
    ),
    { credentials: 'include', headers, signal },
  );
};

const isTimeout = (reason: unknown): boolean => reason instanceof DOMException && reason.name === 'TimeoutError';

const malformed = (): GatewayModelTransportError =>
  new GatewayModelTransportError({
    code: 'MALFORMED_RESPONSE',
    message: 'Tau attempt lookup returned an answer this build cannot read. Update Tau, then resume the chat.',
  });

/**
 * Maps the route's answer (GI mapping table). A body this build cannot read is a defect, never a wait.
 *
 * @param body - The route's parsed JSON body.
 * @returns The host's resolution.
 */
const toResolution = (body: unknown): InvocationResolution => {
  const parsed = attemptReceiptSchema.safeParse(body);
  if (!parsed.success) {
    throw malformed();
  }
  const answer = parsed.data;
  switch (answer.state) {
    case 'pending': {
      return { status: 'pending' };
    }
    case 'unavailable': {
      return { status: 'unavailable' };
    }
    case 'not_found': {
      // RV5-F3: a bare not_found comes from an image older than the void, which did not fence the key.
      return answer.voided === true ? { status: 'voided' } : { status: 'unavailable' };
    }
    case 'terminal': {
      return {
        status: 'terminal',
        operationId: answer.operationId,
        outcome: answer.receipt.customerState,
        chargedCreditAtoms: answer.receipt.chargedCreditAtoms,
      };
    }
  }
};

/** RA-Q5: the run actor's opening waits on this lookup, so the transport bounds it; past it the answer is `unavailable`. */
const attemptLookupTimeout = 10_000;

const resolveInvocation = async (
  options: CloudOptions,
  request: InvocationResolutionRequest,
): Promise<InvocationResolution> => {
  const deadline = new AbortController();
  const timer = setTimeout(() => {
    deadline.abort(new DOMException('The attempt lookup timed out.', 'TimeoutError'));
  }, attemptLookupTimeout);
  try {
    return await lookUpAttempt(options, request, AbortSignal.any([request.signal, deadline.signal]));
  } finally {
    clearTimeout(timer);
  }
};

const lookUpAttempt = async (
  options: CloudOptions,
  { attemptId, signal }: InvocationResolutionRequest,
  bounded: AbortSignal,
): Promise<InvocationResolution> => {
  // A timeout, the caller's or the bound's, is "no answer now"; any other cancellation is the caller's to handle.
  const cancelled = (): boolean => signal.aborted && !isTimeout(signal.reason);
  let response: Response;
  try {
    response = await fetchAttempt(options, attemptId, bounded);
  } catch (error) {
    if (error instanceof GatewayModelTransportError || cancelled()) {
      throw error;
    }
    return { status: 'unavailable' };
  }
  if (response.status === 401) {
    // RV5-F2: never `unavailable` or `voided`; the same retry class (`reauth`) `stream()` throws.
    throw new GatewayModelTransportError({
      code: 'UNAUTHENTICATED',
      message: 'Sign in to Tau again to finish this chat; its last model request cannot be checked until then.',
      status: response.status,
    });
  }
  if (response.status === 403) {
    // A closed or restricted account or a refused origin is its own code (`BILLING_ACCOUNT_CLOSED`,
    // `BILLING_ACCOUNT_RESTRICTED`, `ORIGIN_NOT_ALLOWED`), read as `stream()` reads a 403 and passed through with its
    // details: never a sign-in failure, which signing in again would not fix.
    throw await gatewayResponseError(response);
  }
  if (!response.ok) {
    return { status: 'unavailable' };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (cancelled()) {
      throw error;
    }
    if (bounded.aborted) {
      return { status: 'unavailable' };
    }
    throw malformed();
  }
  return toResolution(body);
};

const fundedOperations: GatewayFundedOperationProtocol = {
  bindResponse(response) {
    const operationId = response.headers.get('x-tau-operation-id');
    if (!validIdentity(operationId)) {
      throw new GatewayModelTransportError({
        code: 'MALFORMED_RESPONSE',
        message: 'Tau model gateway did not return a valid operation identity.',
        status: response.status,
      });
    }
    return { operationId };
  },
};

/**
 * Create Tau Cloud's funded gateway transport.
 *
 * Self-host compositions import {@link createGatewayModelTransport} instead,
 * leaving this module and its billing recovery route outside their build graph.
 *
 * @param options - Gateway configuration shared with the provider transport.
 * @returns A provider transport with mandatory operation binding and recovery, and its `funded` facet.
 * @public
 */
export const createTauCloudGatewayModelTransport = (
  options: CloudOptions,
): ModelTransport & { readonly funding: InvocationFunding } => {
  const { principal, ...gateway } = options;
  return {
    ...createGatewayModelTransport({ ...gateway, fundedOperations }),
    funding: {
      type: 'funded',
      usesBillingAttempt: isGatewayProviderKind,
      resolveInvocation: async (request) => resolveInvocation(gateway, request),
      // The transport holds a bearer or a cookie, never the account id: the host's credential port supplies it.
      principal: async () => principal?.(),
    },
  };
};
