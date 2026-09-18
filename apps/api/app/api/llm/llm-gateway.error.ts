import { HttpException } from '@nestjs/common';
import type { HttpStatus } from '@nestjs/common';

export type LlmGatewayErrorType =
  | 'BILLING_RECOVERY_UNAVAILABLE'
  | 'FUNDED_HELPER_LIMIT'
  | 'FUNDED_OPERATION_LIMIT'
  | 'INSUFFICIENT_CREDIT'
  | 'INVALID_REQUEST'
  | 'MODEL_NOT_IN_CATALOG'
  | 'ORIGIN_NOT_ALLOWED'
  /**
   * The provider account behind the key Tau spent against has no credit or is
   * not billable. Distinct from INSUFFICIENT_CREDIT, which is the customer's own
   * Tau balance. `details` carries `providerId`, the provider's own
   * `providerCode` when it sent one, and `accountOwner`: `operator` on a
   * self-hosted API, whose message is the provider's own sentence, or `tau` on
   * Cloud, whose message never names the supplier's state.
   */
  | 'PROVIDER_ACCOUNT_EXHAUSTED'
  | 'PROVIDER_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'UNAUTHENTICATED'
  /**
   * The upstream provider refused the relayed request (a non-429 4xx). Distinct
   * from PROVIDER_UNAVAILABLE so a malformed or unsupported request is not
   * reported to the client as a provider outage. The message names the upstream
   * status only — the upstream body is never forwarded.
   */
  | 'UPSTREAM_REJECTED';

export class LlmGatewayError extends HttpException {
  /**
   * @param status - HTTP status the gateway answers with.
   * @param type - Stable refusal code its clients switch on.
   * @param message - User-safe reason.
   * @param details - Structured fields the code owns, carried inside the typed
   * envelope so the exception filter forwards them untouched. An
   * `INSUFFICIENT_CREDIT` denial carries `requiredCreditAtoms`,
   * `availableCreditAtoms` and `routeId`.
   */
  // oxlint-disable-next-line max-params -- the envelope's four independent fields; bundling them would hide the wire shape at every call site
  public constructor(
    status: HttpStatus,
    type: LlmGatewayErrorType,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super({ type: 'error', error: { type, message, ...(details === undefined ? {} : { details }) } }, status);
    // Logs and in-process callers read the user-safe reason, not Nest's derived class name.
    this.message = message;
  }
}
