import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebSocket } from 'ws';
import type { RawData } from 'ws';
import type { Environment } from '#config/environment.config.js';

const connectionTimeoutMilliseconds = 30_000;
const serviceUnavailableCloseCode = 1013;
const forbiddenCloseCodes = new Set([1005, 1006, 1015]);

const safeCloseCode = (code: number): number =>
  code >= 1000 && code <= 4999 && !forbiddenCloseCodes.has(code) ? code : 1011;

const rawDataText = (data: RawData): string => {
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString();
  }
  return data instanceof ArrayBuffer ? new TextDecoder().decode(data) : data.toString();
};

/** Server-side Zoo proxy. Cloud dispatch remains closed until the supplier exposes a hard spend/lifetime bound. */
@Injectable()
export class KernelsService {
  private readonly logger = new Logger(KernelsService.name);

  public constructor(
    private readonly config: ConfigService<Environment, true>,
    private readonly mode: 'cloud' | 'self-host',
  ) {}

  /** Opens the operator-owned self-host proxy, or truthfully refuses unqualified Tau-funded dispatch. */
  public createZooProxy(client: WebSocket, query: URLSearchParams, _userId: string): void {
    if (this.mode === 'cloud') {
      client.close(serviceUnavailableCloseCode, 'ZOO_SUPPLIER_LIMIT_UNQUALIFIED');
      return;
    }

    const apiKey = this.config.get('ZOO_API_KEY', { infer: true });
    if (!apiKey) {
      client.close(serviceUnavailableCloseCode, 'ZOO_API_KEY_NOT_CONFIGURED');
      return;
    }

    let url: URL;
    try {
      url = new URL('/ws/modeling/commands', this.config.get('ZOO_WEBSOCKET_URL', { infer: true }));
      for (const [key, value] of query) {
        url.searchParams.set(key, value);
      }
    } catch (error) {
      this.logger.error(`Invalid Zoo upstream configuration: ${String(error)}`);
      client.close(1011, 'Invalid Zoo upstream configuration');
      return;
    }

    this.connect(client, url, apiKey);
  }

  private connect(client: WebSocket, url: URL, apiKey: string): void {
    if (client.readyState !== WebSocket.OPEN) {
      return;
    }

    const upstream = new WebSocket(url);
    upstream.binaryType = 'arraybuffer';
    let closed = false;
    const connectionTimer = setTimeout(() => {
      if (upstream.readyState === WebSocket.CONNECTING) {
        upstream.terminate();
        if (client.readyState === WebSocket.OPEN) {
          client.close(1011, 'Zoo connection timed out');
        }
      }
    }, connectionTimeoutMilliseconds);

    const closeBoth = (source: 'client' | 'upstream', code: number, reason: Uint8Array<ArrayBuffer>): void => {
      if (closed) {
        return;
      }
      closed = true;
      clearTimeout(connectionTimer);
      const peer = source === 'client' ? upstream : client;
      if (peer.readyState === WebSocket.OPEN || peer.readyState === WebSocket.CONNECTING) {
        peer.close(safeCloseCode(code), new TextDecoder().decode(reason));
      }
    };

    upstream.on('open', () => {
      clearTimeout(connectionTimer);
      upstream.send(JSON.stringify({ type: 'headers', headers: { authorization: `Bearer ${apiKey}` } }));
    });
    upstream.on('message', (data, isBinary) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data, { binary: isBinary });
      }
    });
    client.on('message', (data, isBinary) => {
      if (upstream.readyState !== WebSocket.OPEN) {
        return;
      }
      if (!isBinary) {
        try {
          const parsed = JSON.parse(rawDataText(data)) as { type?: unknown };
          if (parsed.type === 'headers') {
            return;
          }
        } catch {
          // Forward non-JSON text frames unchanged.
        }
      }
      upstream.send(data, { binary: isBinary });
    });
    upstream.on('error', (error) => {
      this.logger.error(`Zoo upstream socket failed: ${String(error)}`);
      if (client.readyState === WebSocket.OPEN) {
        client.close(1011, 'Zoo connection failed');
      }
    });
    upstream.on('close', (code, reason) => {
      closeBoth('upstream', code, new Uint8Array(reason));
    });
    client.on('close', (code, reason) => {
      closeBoth('client', code, new Uint8Array(reason));
    });
  }
}
