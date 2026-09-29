import { ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import type { GatewayErrorCode } from '@taucad/agent-host/wire';

/**
 * The gateway's refusal codes: the registry's gateway entries, which document each code (D11). A type import, erased
 * at build, so the existing devDependency on `@taucad/agent-host` is enough.
 */
export type LlmGatewayErrorType = GatewayErrorCode;

/** Turns the billing owner's closed-account refusal into the gateway's stable wire code. */
export const isBillingAccountClosed = (error: unknown): boolean => {
  if (!(error instanceof ForbiddenException)) {
    return false;
  }
  const body = error.getResponse();
  return typeof body === 'object' && 'code' in body && body.code === 'billing_account_closed';
};

export const billingAccountClosedError = (): LlmGatewayError =>
  new LlmGatewayError(
    HttpStatus.FORBIDDEN,
    'BILLING_ACCOUNT_CLOSED',
    'This Tau billing account is closed or restricted, so its model requests cannot be checked or charged.',
  );

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
