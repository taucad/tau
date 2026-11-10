/**
 * Start evidence for the X1C qualification: the printer's `project_file`
 * replies, read off the provider's MQTT stream and redacted as they arrive.
 *
 * A module of its own, without the operator script's hashbang, so the unit
 * tests can import it.
 */
import type { MachineNetworkStream } from '@taucad/runtime/machine';

/** `project_file` reply fields the start evidence keeps as they are: the command, its outcome and the ids it echoes. */
const keptReplyFields: ReadonlySet<string> = new Set([
  'command',
  'result',
  'reason',
  'sequence_id',
  'subtask_id',
  'task_id',
  'project_id',
]);

/**
 * Redact one `project_file` reply for the start evidence. The kept fields and error codes (any field whose name holds
 * `err`) keep their values and JSON types. Every other value becomes its JSON type, so serials, access codes,
 * addresses and `dev_id`-like fields never reach the file, whatever the firmware names them. The given values and
 * IPv4 addresses are masked wherever they remain, field names included.
 *
 * @param reply - The parsed MQTT payload.
 * @param sensitive - Values to mask wherever they appear: the printer's serial, address and access code.
 * @returns A redacted copy with the reply's shape.
 */
export const redactProjectFileReply = (reply: unknown, sensitive: readonly string[]): unknown => {
  const mask = (text: string): string => {
    let masked = text;
    for (const value of sensitive) {
      if (value !== '') {
        masked = masked.replaceAll(value, '[redacted]');
      }
    }
    return masked.replaceAll(/\b(?:\d{1,3}\.){3}\d{1,3}\b/gu, '[redacted-ip]');
  };
  const redact = (value: unknown, field: string | undefined): unknown => {
    if (Array.isArray(value)) {
      return value.map((item) => redact(item, field));
    }
    if (typeof value === 'object' && value !== null) {
      return Object.fromEntries(Object.entries(value).map(([name, item]) => [mask(name), redact(item, name)]));
    }
    if (field !== undefined && (keptReplyFields.has(field) || /err/iu.test(field))) {
      return typeof value === 'string' ? mask(value) : value;
    }
    return value === null ? null : `<${typeof value}>`;
  };
  return redact(reply, undefined);
};

export type ProjectFileReply = Readonly<{ receivedAt: string; reply: unknown }>;

/** The tap stops watching at a larger MQTT packet. */
const maximumTappedPacketBytes = 1024 * 1024;

/** Where the next MQTT packet's body starts and ends, read from its fixed header. */
const mqttPacketBounds = (
  bytes: Uint8Array<ArrayBuffer>,
): Readonly<{ body: number; end: number }> | 'incomplete' | 'malformed' => {
  let length = 0;
  // The remaining length: up to four bytes of seven bits each, least significant first.
  for (let index = 1; index <= 4; index += 1) {
    const byte = bytes[index];
    if (byte === undefined) {
      return 'incomplete';
    }
    length += (byte % 128) * 128 ** (index - 1);
    if (byte < 128) {
      return { body: index + 1, end: index + 1 + length };
    }
  }
  return 'malformed';
};

/**
 * Collect the printer's `project_file` replies from the provider's MQTT stream, redacted as they arrive, without
 * changing a byte the provider reads. The evidence is best effort: the tap stops watching at anything it cannot frame.
 *
 * @param stream - The provider's pinned MQTT stream.
 * @param replies - Where each redacted reply goes; at most 16 are kept.
 * @param sensitive - Values to mask wherever they appear: the printer's serial, address and access code.
 * @returns The same stream, observed.
 */
export const tapProjectFileReplies = (
  stream: MachineNetworkStream,
  replies: ProjectFileReply[],
  sensitive: readonly string[],
): MachineNetworkStream => {
  let pending: Uint8Array<ArrayBuffer> | undefined = new Uint8Array(0);
  const record = (header: number, body: Uint8Array<ArrayBuffer>): void => {
    // A PUBLISH (type 3) holds its topic, then a packet id at QoS 1 or 2, then the payload.
    if (Math.floor(header / 16) !== 3 || body.byteLength < 2 || replies.length >= 16) {
      return;
    }
    let message: unknown;
    try {
      const topicLength = (body[0] ?? 0) * 256 + (body[1] ?? 0);
      message = JSON.parse(Buffer.from(body.subarray(2 + topicLength + (header % 8 >= 2 ? 2 : 0))).toString('utf8'));
    } catch {
      return;
    }
    const print = typeof message === 'object' && message !== null && 'print' in message ? message.print : undefined;
    if (typeof print === 'object' && print !== null && 'command' in print && print.command === 'project_file') {
      replies.push(
        Object.freeze({ receivedAt: new Date().toISOString(), reply: redactProjectFileReply(message, sensitive) }),
      );
    }
  };
  const observe = (chunk: Uint8Array<ArrayBuffer>): void => {
    let bytes = pending === undefined ? undefined : Buffer.concat([pending, chunk]);
    while (bytes !== undefined) {
      const bounds = mqttPacketBounds(bytes);
      if (bounds === 'malformed' || (bounds !== 'incomplete' && bounds.end > maximumTappedPacketBytes)) {
        bytes = undefined;
        break;
      }
      if (bounds === 'incomplete' || bytes.byteLength < bounds.end) {
        break;
      }
      record(bytes[0] ?? 0, bytes.subarray(bounds.body, bounds.end));
      bytes = bytes.subarray(bounds.end);
    }
    pending = bytes;
  };
  return Object.freeze({
    ...stream,
    readable: (async function* (): AsyncGenerator<Uint8Array<ArrayBuffer>> {
      for await (const chunk of stream.readable) {
        try {
          observe(chunk);
        } catch {
          pending = undefined;
        }
        yield chunk;
      }
    })(),
  });
};
