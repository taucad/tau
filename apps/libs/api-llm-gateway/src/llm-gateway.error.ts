import { ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import type { GatewayErrorCode } from '@taucad/agent-host/wire';

/**
 * The gateway's refusal codes: the registry's gateway entries, which document each code (D11). A type import, erased
 * at build, so the existing devDependency on `@taucad/agent-host` is enough.
 */
export type LlmGatewayErrorType = GatewayErrorCode;

/**
 * Bounded retry estimates for the funded-admission refusals (B9 `:292`).
 *
 * Neither denial carries a per-request estimate, so each value is the blueprint's
 * own bound for the condition: 30 seconds is B9's due-to-terminal p99 target
 * (`llm-admission-failsafe-and-recovery-blueprint.md:251`), after which a saturating
 * funded operation has reached terminal; 60 seconds is the recovery claim lease
 * (`credit-ledger.service.ts:1069`), after which another claimant's lease expires.
 */
export const fundedRetryAfterSeconds: ReadonlyMap<string, number> = new Map<string, number>([
  ['FUNDED_OPERATION_LIMIT', 30],
  ['FUNDED_HELPER_LIMIT', 30],
  ['BILLING_RECOVERY_UNAVAILABLE', 60],
]);

/** Turns the billing owner's closed-account refusal into the gateway's stable wire code. */
export const isBillingAccountClosed = (error: unknown): boolean => {
  if (!(error instanceof ForbiddenException)) {
    return false;
  }
  const body = error.getResponse();
  return typeof body === 'object' && 'code' in body && body.code === 'billing_account_closed';
};

/** A closed-account refusal whose account is open but restricted by an operator, not closing or closed. */
export const isBillingAccountRestricted = (error: unknown): boolean => {
  if (!isBillingAccountClosed(error) || !(error instanceof ForbiddenException)) {
    return false;
  }
  const body = error.getResponse();
  return typeof body === 'object' && 'restricted' in body && body.restricted === true;
};

export const billingAccountClosedError = (): LlmGatewayError =>
  new LlmGatewayError(
    HttpStatus.FORBIDDEN,
    'BILLING_ACCOUNT_CLOSED',
    'This Tau billing account is closed or restricted, so its model requests cannot be checked or charged.',
  );

/** An operator paused this route; another route still answers, so the client offers a model switch. */
export const modelRoutePausedError = (routeId: string): LlmGatewayError =>
  new LlmGatewayError(
    HttpStatus.SERVICE_UNAVAILABLE,
    'MODEL_ROUTE_PAUSED',
    "This model route is paused by Tau's operators.",
    { routeId },
  );

/** Admission refused spending on an account whose own balance is in question; no route or retry changes it. */
export const billingAccountRestrictedError = (): LlmGatewayError =>
  new LlmGatewayError(HttpStatus.FORBIDDEN, 'BILLING_ACCOUNT_RESTRICTED', 'This Tau billing account is restricted.');

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
