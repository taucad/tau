/**
 * Minimal browser-compatible WebSocket test double for {@link ZooWebSocketTransport}.
 * Buffers outbound frames, emits `open` on a microtask, and supports synthetic inbound messages.
 *
 * @internal
 */
import { Topic } from '@taucad/events';

const readyStateConnecting = 0;
const readyStateOpen = 1;
const readyStateClosed = 3;

/**
 * Test double implementing the subset of `WebSocket` used by {@link ZooWebSocketTransport}.
 */
export class ZooFakeWebSocket {
  public binaryType: BinaryType = 'arraybuffer';
  public readyState = readyStateConnecting;
  public readonly url: string;
  /** Outbound frames (JSON auth + modeling requests). */
  public readonly sentFrames: string[] = [];
  private readonly eventTopics = new Map<string, Topic<Event>>();
  private readonly listenerUnsubscribes = new Map<string, Map<(event: Event) => void, () => void>>();

  /**
   * Buffers the URL string and schedules a synthetic `open` event.
   *
   * @param url - Target ws URL (stored for debugging).
   * @param _protocols - Ignored; keeps the browser `WebSocket` constructor shape.
   */
  public constructor(url: string | URL, _protocols?: string | string[]) {
    void _protocols;
    this.url = String(url);
    queueMicrotask(() => {
      if (this.readyState === readyStateConnecting) {
        this.readyState = readyStateOpen;
        this.dispatch('open', new Event('open'));
      }
    });
  }

  /**
   * Registers an event listener (browser `WebSocket` subset).
   *
   * @param type - Event name (`open`, `close`, `message`, `error`).
   * @param listener - Callback invoked with a DOM `Event` or `MessageEvent`.
   */
  public addEventListener(type: string, listener: (event: Event) => void): void {
    const unsubscribes = this.listenerUnsubscribes.get(type) ?? new Map<(event: Event) => void, () => void>();
    if (unsubscribes.has(listener)) {
      return;
    }
    const topic = this.eventTopics.get(type) ?? new Topic<Event>({ name: `zoo-websocket:${type}` });
    this.eventTopics.set(type, topic);
    unsubscribes.set(listener, topic.subscribe(listener));
    this.listenerUnsubscribes.set(type, unsubscribes);
  }

  /**
   * Removes a listener registered via {@link addEventListener}.
   *
   * @param type - Event name.
   * @param listener - Same function reference passed to `addEventListener`.
   */
  public removeEventListener(type: string, listener: (event: Event) => void): void {
    const unsubscribes = this.listenerUnsubscribes.get(type);
    const unsubscribe = unsubscribes?.get(listener);
    if (!unsubscribes || !unsubscribe) {
      return;
    }
    unsubscribe();
    unsubscribes.delete(listener);
    if (unsubscribes.size === 0) {
      this.listenerUnsubscribes.delete(type);
      this.eventTopics.get(type)?.dispose();
      this.eventTopics.delete(type);
    }
  }

  /**
   * Records outbound string frames (used to assert auth / modeling JSON).
   *
   * @param data - Wire payload; only `string` frames are captured for assertions.
   */
  public send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    if (typeof data === 'string') {
      this.sentFrames.push(data);
    }
  }

  /**
   * Emulates socket shutdown and notifies `close` listeners.
   *
   * @param code - WebSocket close code (default `1000`).
   * @param reason - Close reason string.
   */
  public close(code = 1000, reason = ''): void {
    if (this.readyState === readyStateClosed) {
      return;
    }

    this.readyState = readyStateClosed;
    this.dispatch('close', new ZooFakeCloseEvent(code, reason));
  }

  /**
   * Deliver an inbound engine frame to `message` listeners.
   *
   * @param data - JSON string or raw `ArrayBuffer` payload.
   */
  public testEmitMessage(data: string | ArrayBuffer): void {
    const event =
      typeof data === 'string' ? new MessageEvent('message', { data }) : new MessageEvent('message', { data });
    this.dispatch('message', event);
  }

  private dispatch(type: string, event: Event): void {
    this.eventTopics.get(type)?.emit(event);
  }
}

class ZooFakeCloseEvent extends Event {
  public readonly code: number;
  public readonly reason: string;

  public constructor(code: number, reason: string) {
    super('close');
    this.code = code;
    this.reason = reason;
  }
}

function collectBatchCommandIds(message: Record<string, unknown>): string[] {
  const { cmds, commands, requests } = message;
  if (Array.isArray(requests)) {
    const ids: string[] = [];
    for (const item of requests) {
      if (item && typeof item === 'object' && item !== null && 'cmd_id' in item) {
        const raw = (item as { cmd_id?: unknown }).cmd_id;
        if (typeof raw === 'string') {
          ids.push(raw);
        }
      }
    }

    return ids;
  }

  if (commands && typeof commands === 'object' && !Array.isArray(commands)) {
    return Object.keys(commands as Record<string, unknown>);
  }

  if (cmds && typeof cmds === 'object' && !Array.isArray(cmds)) {
    return Object.keys(cmds as Record<string, unknown>);
  }

  return [];
}

/**
 * Wraps {@link ZooFakeWebSocket.send} so each outbound `modeling_cmd_req` / `modeling_cmd_batch_req`
 * receives a synthetic success response — enough for `Context.execute` integration tests without a real engine.
 *
 * @param socket - fake socket instance (usually {@link zooTestFakeSocketCapture.current})
 * @returns Restore function that unwraps the patch (call in `afterEach` / `finally`).
 * @public
 */
export function zooTestWrapSocketWithEngineAutoReply(socket: ZooFakeWebSocket): () => void {
  /* eslint-disable @typescript-eslint/naming-convention -- Zoo modeling WebSocket JSON uses API snake_case */
  const origSend = socket.send.bind(socket);
  const wrapped: typeof socket.send = (data) => {
    origSend(data);
    if (typeof data !== 'string') {
      return;
    }

    try {
      const message = JSON.parse(data) as Record<string, unknown>;
      const { type } = message;
      if (type === 'modeling_cmd_req') {
        const cmdId = message['cmd_id'];
        if (typeof cmdId === 'string') {
          queueMicrotask(() => {
            socket.testEmitMessage(
              JSON.stringify({
                success: true,
                request_id: cmdId,
                resp: { type: 'modeling', data: { modeling_response: { type: 'empty' } } },
              }),
            );
          });
        }

        return;
      }

      if (type === 'modeling_cmd_batch_req') {
        const batchId = message['batch_id'];
        if (typeof batchId !== 'string') {
          return;
        }

        const subIds = collectBatchCommandIds(message);
        const responses: Record<string, { response: { type: string } }> = {};
        for (const id of subIds) {
          responses[id] = { response: { type: 'empty' } };
        }

        queueMicrotask(() => {
          socket.testEmitMessage(
            JSON.stringify({
              success: true,
              request_id: batchId,
              resp: { type: 'modeling_batch', data: { responses } },
            }),
          );
        });
      }
    } catch {
      /* ignore non-json sends */
    }
  };

  socket.send = wrapped;
  /* eslint-enable @typescript-eslint/naming-convention -- Zoo modeling WebSocket JSON uses API snake_case */
  return () => {
    socket.send = origSend;
  };
}

/**
 * Latest socket constructed while a test patches `globalThis.WebSocket`.
 */
export const zooTestFakeSocketCapture: { current: ZooFakeWebSocket | undefined } = {
  current: undefined,
};

/**
 * Patches `globalThis.WebSocket` with {@link ZooFakeWebSocket} and captures the last instance.
 * Restore with {@link zooTestRestoreWebSocket}.
 *
 * @returns The previous `globalThis.WebSocket` constructor (restore via {@link zooTestRestoreWebSocket}).
 */
export function zooTestInstallFakeWebSocket(): typeof WebSocket {
  const previousWebSocket = globalThis.WebSocket;
  zooTestFakeSocketCapture.current = undefined;

  globalThis.WebSocket = class ZooFakeWebSocketGlobal extends ZooFakeWebSocket {
    public constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      zooTestFakeSocketCapture.current = this;
    }
  } as unknown as typeof WebSocket;

  return previousWebSocket;
}

/**
 * Restores `globalThis.WebSocket` after {@link zooTestInstallFakeWebSocket}.
 *
 * @param original - Value returned from {@link zooTestInstallFakeWebSocket}.
 */
export function zooTestRestoreWebSocket(original: typeof WebSocket): void {
  globalThis.WebSocket = original;
  zooTestFakeSocketCapture.current = undefined;
}
