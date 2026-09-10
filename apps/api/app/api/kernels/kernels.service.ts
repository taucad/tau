import { Injectable } from '@nestjs/common';
import type { WebSocket } from 'ws';

const serviceUnavailableCloseCode = 1013;

/** Zoo proxy dispatch, closed until the B7 metering cutover. */
@Injectable()
export class KernelsService {
  public createZooProxy(clientSocket: WebSocket, _queryParameters: URLSearchParams, _userId: string): void {
    clientSocket.close(serviceUnavailableCloseCode, 'HOSTED_BILLING_MIGRATION_REQUIRED');
  }
}
