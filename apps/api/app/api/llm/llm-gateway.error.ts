import { HttpException, HttpStatus } from '@nestjs/common';

export type LlmGatewayErrorType =
  | 'INSUFFICIENT_CREDIT'
  | 'INVALID_REQUEST'
  | 'MODEL_NOT_IN_CATALOG'
  | 'ORIGIN_NOT_ALLOWED'
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
  public constructor(status: HttpStatus, type: LlmGatewayErrorType, message: string) {
    super({ type: 'error', error: { type, message } }, status);
  }
}
