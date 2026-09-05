// oxlint-disable-next-line node-js/prefer-global/buffer -- Buffer is required for the Zoo API
import { Buffer } from 'node:buffer';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebSocket } from 'ws';
import { z } from 'zod';
import type { Models } from '@kittycad/lib';
import type { Environment } from '#config/environment.config.js';
import { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import { MetricsService } from '#telemetry/metrics.js';
import { ZooSessionMeter } from '#api/kernels/zoo-session-meter.js';

/** Connection timeout — how long to wait for Zoo WebSocket to open. Milliseconds. */
const zooConnectionTimeout = 30_000;

/** Maximum number of connection attempts before giving up */
const zooMaxRetries = 3;

type ZooSuccessResponse = Extract<Models['WebSocketResponse_type'], { success: true }>;
type ModelingSessionResponse = Omit<ZooSuccessResponse, 'resp'> & {
  resp: Extract<ZooSuccessResponse['resp'], { type: 'modeling_session_data' }>;
};
type HeadersRequest = Extract<Models['WebSocketRequest_type'], { type: 'headers' }>;

/* eslint-disable @typescript-eslint/naming-convention -- Zoo schemas mirror third-party WebSocket wire keys. */
const modelingSessionResponseSchema: z.ZodType<ModelingSessionResponse> = z.looseObject({
  success: z.literal(true),
  resp: z.looseObject({
    type: z.literal('modeling_session_data'),
    data: z.looseObject({
      session: z.looseObject({ api_call_id: z.string().min(1) }),
    }),
  }),
});

const headersRequestSchema: z.ZodType<HeadersRequest> = z.looseObject({
  type: z.literal('headers'),
  headers: z.record(z.string(), z.string()),
});
/* eslint-enable @typescript-eslint/naming-convention -- end Zoo wire schemas. */

/**
 * Type guard to check if the parsed message is a WebSocket request with headers type.
 * Used to intercept client authentication attempts.
 */
const isHeadersRequest = (data: unknown): boolean => headersRequestSchema.safeParse(data).success;

/**
 * RFC 6455 close codes that are reserved and must not be sent in a close frame.
 * - 1005: No Status Rcvd - must not be sent
 * - 1006: Abnormal Closure - must not be sent
 * - 1015: TLS Handshake - must not be sent
 */
const forbiddenCloseCodes = new Set([1005, 1006, 1015]);

/**
 * Validates a WebSocket close code according to RFC 6455.
 * Returns the original code if valid, otherwise returns 1011 (Internal Error).
 *
 * Valid codes: 1000-4999, excluding 1005, 1006, 1015
 * @param code - The close code to validate (may be undefined)
 * @returns A valid close code safe to send in a WebSocket close frame
 */
function getSafeCloseCode(code: number | undefined): number {
  // Missing or out of valid range (1000-4999)
  if (code === undefined || code < 1000 || code > 4999) {
    return 1011;
  }

  // Forbidden/reserved codes that must not be sent
  if (forbiddenCloseCodes.has(code)) {
    return 1011;
  }

  return code;
}

@Injectable()
export class KernelsService {
  private readonly logger = new Logger(KernelsService.name);
  private readonly zooApiKey: string;
  private readonly zooWebsocketUrl: string;

  public constructor(
    private readonly configService: ConfigService<Environment, true>,
    private readonly creditLedgerService: CreditLedgerService,
    private readonly metricsService: MetricsService,
  ) {
    this.zooApiKey = this.configService.get('ZOO_API_KEY', { infer: true });
    this.zooWebsocketUrl = this.configService.get('ZOO_WEBSOCKET_URL', { infer: true });
  }

  /**
   * Create a WebSocket connection to the Zoo API and handle bidirectional proxying.
   * Includes connection timeout and retry logic. Engine time is metered per
   * started minute against the caller's credit account (B8/Q35/AD14).
   * @param clientSocket - The client's WebSocket connection
   * @param queryParameters - Query parameters to forward to Zoo API
   * @param userId - Billing identity from the gateway's session gate
   */
  public createZooProxy(clientSocket: WebSocket, queryParameters: URLSearchParams, userId: string): void {
    // Build the Zoo API WebSocket URL with query parameters
    let zooUrl: URL;
    try {
      zooUrl = new URL('/ws/modeling/commands', this.zooWebsocketUrl);
      for (const [key, value] of queryParameters.entries()) {
        zooUrl.searchParams.set(key, value);
      }
    } catch (error) {
      this.logger.error('Failed to construct Zoo API URL:', error);
      if (clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.close(1011, 'Invalid upstream URL configuration');
      }

      return;
    }

    const meter = new ZooSessionMeter({
      creditLedgerService: this.creditLedgerService,
      metricsService: this.metricsService,
      userId,
      ratePerMinuteMicro: BigInt(this.configService.get('ZOO_ENGINE_RATE_MICRO_PER_MINUTE', { infer: true })),
      close: (code, reason) => {
        if (clientSocket.readyState === WebSocket.OPEN) {
          clientSocket.close(code, reason);
        }
      },
    });

    this.connectToZoo(clientSocket, zooUrl, 1, meter);
  }

  /**
   * Establish connection to Zoo API with retry logic.
   * @param clientSocket - The client's WebSocket connection
   * @param zooUrl - The Zoo API URL to connect to
   * @param attempt - Current attempt number (1-based)
   * @param meter - Engine-minute meter for the authenticated session
   */
  // eslint-disable-next-line max-params-no-constructor/max-params-no-constructor -- existing Zoo retry callback contract.
  private connectToZoo(clientSocket: WebSocket, zooUrl: URL, attempt: number, meter: ZooSessionMeter): void {
    // Check if client is still connected before attempting
    if (clientSocket.readyState !== WebSocket.OPEN) {
      this.logger.debug('Client already disconnected, skipping Zoo connection attempt');
      return;
    }

    this.logger.debug(`Connecting to Zoo API (attempt ${attempt}/${zooMaxRetries}): ${zooUrl.toString()}`);

    // Create connection to Zoo API
    let zooSocket: WebSocket;
    try {
      zooSocket = new WebSocket(zooUrl);
      zooSocket.binaryType = 'arraybuffer';
    } catch (error) {
      this.logger.error('Failed to create Zoo WebSocket:', error);
      // Client is guaranteed to be OPEN here (checked at function start, synchronous code path)
      clientSocket.close(1011, 'Failed to connect to upstream');

      return;
    }

    // Use a single state object to prevent race conditions when both sockets close simultaneously
    const connectionState = {
      isZooAuthenticated: false,
      clientClosed: false,
      zooClosed: false,
      isCleaningUp: false,
      connectionTimedOut: false,
    };

    // Connection timeout - close if Zoo doesn't open within timeout period
    const connectionTimeout = setTimeout(() => {
      if (zooSocket.readyState === WebSocket.CONNECTING) {
        connectionState.connectionTimedOut = true;
        this.logger.warn(`Zoo connection timeout after ${zooConnectionTimeout}ms (attempt ${attempt})`);
        zooSocket.close();

        // Retry if we haven't exceeded max attempts and client is still connected
        if (attempt < zooMaxRetries && clientSocket.readyState === WebSocket.OPEN) {
          this.logger.debug(`Retrying Zoo connection (attempt ${attempt + 1}/${zooMaxRetries})`);
          this.connectToZoo(clientSocket, zooUrl, attempt + 1, meter);
        } else if (clientSocket.readyState === WebSocket.OPEN) {
          clientSocket.close(1011, 'Upstream connection timeout');
        }
      }
    }, zooConnectionTimeout);

    /**
     * Attempts to claim exclusive cleanup responsibility.
     * Prevents double cleanup when both sockets close simultaneously.
     * @returns true if this caller should perform cleanup, false if another caller already claimed it
     */
    const tryClaimCleanup = (): boolean => {
      if (connectionState.isCleaningUp) {
        return false;
      }

      connectionState.isCleaningUp = true;

      return true;
    };

    /**
     * Clear the connection timeout. Called when connection succeeds or fails.
     */
    const clearConnectionTimeout = (): void => {
      clearTimeout(connectionTimeout);
    };

    // Handle Zoo socket open - send authentication
    zooSocket.addEventListener('open', () => {
      clearConnectionTimeout();

      // If client disconnected while Zoo was connecting, close immediately to prevent orphaned connection
      if (connectionState.clientClosed) {
        this.logger.debug('Zoo WebSocket connected but client already closed, terminating');
        zooSocket.close(1000, 'Client disconnected');
        return;
      }

      this.logger.debug('Zoo WebSocket connected, sending authentication');

      // Send authentication headers as expected by Zoo API
      const authMessage = JSON.stringify({
        type: 'headers',
        headers: {
          // eslint-disable-next-line @typescript-eslint/naming-convention -- Zoo API expects this format
          Authorization: `Bearer ${this.zooApiKey}`,
        },
      });
      zooSocket.send(authMessage);
    });

    // Handle messages from Zoo -> forward to client
    zooSocket.addEventListener('message', (event) => {
      if (connectionState.clientClosed) {
        return;
      }

      // Check if this is the authentication success response
      if (!connectionState.isZooAuthenticated && typeof event.data === 'string') {
        try {
          const parsed: unknown = JSON.parse(event.data);
          if (modelingSessionResponseSchema.safeParse(parsed).success) {
            connectionState.isZooAuthenticated = true;
            this.logger.debug('Zoo authentication successful');
            // Engine time starts at the auth marker (B8/Q35).
            meter.onAuthenticated();
          }
        } catch (error) {
          // Not JSON, continue forwarding - this is expected for non-JSON messages
          this.logger.verbose('Received non-JSON message from Zoo during auth check:', error);
        }
      }

      // Forward message to client
      try {
        if (clientSocket.readyState === WebSocket.OPEN) {
          if (event.data instanceof ArrayBuffer) {
            clientSocket.send(Buffer.from(event.data));
          } else {
            clientSocket.send(event.data);
          }
        }
      } catch (error) {
        this.logger.error('Error forwarding message to client:', error);
      }
    });

    // Handle messages from client -> forward to Zoo
    clientSocket.addEventListener('message', (event) => {
      // Client frames prove liveness for the Q35 idle window.
      meter.onClientActivity();
      if (connectionState.zooClosed) {
        return;
      }

      // Intercept and drop 'headers' messages from client - proxy handles authentication
      if (typeof event.data === 'string') {
        try {
          const parsed: unknown = JSON.parse(event.data);
          if (isHeadersRequest(parsed)) {
            this.logger.debug('Dropping client headers message - proxy handles authentication');
            return;
          }
        } catch (error) {
          // Not JSON, continue forwarding - this is expected for non-JSON messages
          this.logger.verbose('Received non-JSON message from client:', error);
        }
      }

      try {
        if (zooSocket.readyState === WebSocket.OPEN) {
          // Forward the message as-is (binary or text)
          zooSocket.send(event.data);
        }
      } catch (error) {
        this.logger.error('Error forwarding message to Zoo:', error);
      }
    });

    // Handle Zoo socket close
    zooSocket.addEventListener('close', (event) => {
      clearConnectionTimeout();
      connectionState.zooClosed = true;
      this.logger.debug(`Zoo WebSocket closed: code=${event.code}, reason=${event.reason}`);

      // If this was a timeout-triggered close, retry logic is handled by the timeout callback
      if (connectionState.connectionTimedOut) {
        return;
      }

      meter.stop();

      if (tryClaimCleanup() && clientSocket.readyState === WebSocket.OPEN) {
        // Forward the close code if valid per RFC 6455, otherwise use 1011 (Internal Error)
        const closeCode = getSafeCloseCode(event.code);
        clientSocket.close(closeCode, event.reason || 'Upstream connection closed');
      }
    });

    // Handle Zoo socket error
    zooSocket.addEventListener('error', (event) => {
      clearConnectionTimeout();
      this.logger.error('Zoo WebSocket error:', event);

      // If this was a timeout-triggered error, retry logic is handled by the timeout callback
      if (connectionState.connectionTimedOut) {
        return;
      }

      if (tryClaimCleanup() && clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.close(1011, 'Upstream connection error');
      }
    });

    // Handle client socket close
    clientSocket.addEventListener('close', () => {
      clearConnectionTimeout();
      connectionState.clientClosed = true;
      this.logger.debug('Client WebSocket closed');
      // Abrupt drops settle here — every started minute is already charged (S53).
      meter.stop();

      // Close Zoo socket if it's open OR still connecting (prevents orphaned connections)
      if (
        tryClaimCleanup() &&
        (zooSocket.readyState === WebSocket.OPEN || zooSocket.readyState === WebSocket.CONNECTING)
      ) {
        zooSocket.close();
      }
    });

    // Handle client socket error
    clientSocket.addEventListener('error', (event) => {
      clearConnectionTimeout();
      this.logger.error('Client WebSocket error:', event);

      // Close Zoo socket if it's open OR still connecting (prevents orphaned connections)
      if (
        tryClaimCleanup() &&
        (zooSocket.readyState === WebSocket.OPEN || zooSocket.readyState === WebSocket.CONNECTING)
      ) {
        zooSocket.close();
      }
    });
  }
}
