import { util as zodUtility } from 'zod';

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
import type { ModelTransport } from '#waist/ports.js';

const validIdentity = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 128 && /^[\u0021-\u007E]+$/u.test(value);

const createFundedOperations = (
  options: Omit<GatewayModelTransportOptions, 'fundedOperations'>,
): GatewayFundedOperationProtocol => ({
  usesBillingAttempt: isGatewayProviderKind,
  bindResponse(response) {
    const operationId = response.headers.get('x-tau-operation-id');
    if (!validIdentity(operationId)) {
      throw new GatewayModelTransportError({
        code: 'MALFORMED_RESPONSE',
        message: 'Tau model gateway did not return a valid operation identity.',
        status: response.status,
      });
    }
    return { operationId, status: 'pending' };
  },
  lookupAttempt: async (attemptId, signal) => {
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
    const response = await (options.fetch ?? globalThis.fetch.bind(globalThis))(
      new URL(
        `v1/billing/attempts/gateway/${encodeURIComponent(attemptId)}`,
        options.baseUrl.endsWith('/') ? options.baseUrl : `${options.baseUrl}/`,
      ),
      { credentials: 'include', headers, signal },
    );
    if (!response.ok) {
      throw await gatewayResponseError(response);
    }
    const payload: unknown = await response.json();
    if (!zodUtility.isObject(payload)) {
      throw new GatewayModelTransportError({
        code: 'MALFORMED_RESPONSE',
        message: 'Tau attempt lookup returned invalid JSON.',
      });
    }
    if (payload['state'] === 'not_found') {
      return undefined;
    }
    const { operationId, state } = payload;
    if (!validIdentity(operationId) || (state !== 'pending' && state !== 'terminal' && state !== 'unavailable')) {
      throw new GatewayModelTransportError({
        code: 'MALFORMED_RESPONSE',
        message: 'Tau attempt lookup returned an invalid operation envelope.',
      });
    }
    return { operationId, status: state };
  },
});

/**
 * Create Tau Cloud's funded gateway transport.
 *
 * Self-host compositions import {@link createGatewayModelTransport} instead,
 * leaving this module and its billing recovery route outside their build graph.
 *
 * @param options - Gateway configuration shared with the provider transport.
 * @returns A provider transport with mandatory operation binding and recovery.
 * @public
 */
export const createTauCloudGatewayModelTransport = (
  options: Omit<GatewayModelTransportOptions, 'fundedOperations'>,
): ModelTransport => createGatewayModelTransport({ ...options, fundedOperations: createFundedOperations(options) });
