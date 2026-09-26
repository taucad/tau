import { HttpException } from '@nestjs/common';
import type { HttpStatus } from '@nestjs/common';
import type { GatewayErrorCode } from '@taucad/agent-host/wire';

/**
 * The gateway's refusal codes: the registry's gateway entries, which document each code (D11). A type import, erased
 * at build, so the existing devDependency on `@taucad/agent-host` is enough.
 */
export type LlmGatewayErrorType = GatewayErrorCode;

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
