import type { MachineNetworkStream } from '@taucad/runtime/machine';
import { describe, expect, it } from 'vitest';

// oxlint-disable-next-line no-restricted-imports -- The monitor test covers the qualification script's own module.
import { printCubeOutcome } from '../scripts/print-cube-outcome.mjs';
// oxlint-disable-next-line no-restricted-imports -- The start-evidence test covers the qualification script's own module.
import { redactProjectFileReply, tapProjectFileReplies } from '../scripts/project-file-reply.mjs';
// oxlint-disable-next-line no-restricted-imports -- The reply type belongs to the same module.
import type { ProjectFileReply } from '../scripts/project-file-reply.mjs';

const serial = '00M09C123456789';
const address = '198.51.100.23';

/* Wire field names are the firmware's, so the payloads are JSON text. */
const reply = `{
  "print": {
    "command": "project_file",
    "sequence_id": "20000",
    "result": "FAIL",
    "reason": "printer ${serial} at ${address} via 203.0.113.9 is busy",
    "subtask_id": "1234567",
    "task_id": "1234567",
    "project_id": "0",
    "err_code": 84033545,
    "print_error": 0,
    "param": "Metadata/plate_1.gcode",
    "url": "ftp://tau-cube.gcode.3mf",
    "dev_id": "${serial}",
    "sn": "${serial}",
    "ip": "${address}",
    "access_code": "Zq8Wx3Kp",
    "ams_mapping": [0],
    "net": { "info": [{ "ip": 1684300900, "mask": 16777215 }] },
    "timelapse": false,
    "cfg": null
  }
}`;
const redacted = `{
  "print": {
    "command": "project_file",
    "sequence_id": "20000",
    "result": "FAIL",
    "reason": "printer [redacted] at [redacted] via [redacted-ip] is busy",
    "subtask_id": "1234567",
    "task_id": "1234567",
    "project_id": "0",
    "err_code": 84033545,
    "print_error": 0,
    "param": "<string>",
    "url": "<string>",
    "dev_id": "<string>",
    "sn": "<string>",
    "ip": "<string>",
    "access_code": "<string>",
    "ams_mapping": ["<number>"],
    "net": { "info": [{ "ip": "<number>", "mask": "<number>" }] },
    "timelapse": "<boolean>",
    "cfg": null
  }
}`;

/** One MQTT 3.1.1 PUBLISH packet, with a packet id at QoS 1. */
const publish = (topic: string, payload: string, qos: 0 | 1): Uint8Array<ArrayBuffer> => {
  const topicLength = Buffer.alloc(2);
  topicLength.writeUInt16BE(Buffer.byteLength(topic));
  const body = Buffer.concat([
    topicLength,
    Buffer.from(topic),
    qos === 1 ? Buffer.from([0, 7]) : Buffer.alloc(0),
    Buffer.from(payload),
  ]);
  /* The remaining length: seven bits per byte, least significant first, the high bit marking another. */
  const length: number[] = [];
  let rest = body.byteLength;
  do {
    const digit = rest % 128;
    rest = Math.floor(rest / 128);
    length.push(rest > 0 ? digit + 128 : digit);
  } while (rest > 0);
  return Buffer.concat([Buffer.from([qos === 1 ? 0x32 : 0x30, ...length]), body]);
};

describe('redactProjectFileReply', () => {
  it('should keep the outcome, ids and error codes and reduce everything else to its JSON type', () => {
    const result = redactProjectFileReply(JSON.parse(reply), [serial, address]);

    expect(result).toEqual(JSON.parse(redacted));
    expect(JSON.stringify(result)).not.toMatch(/00M09C123456789|198\.51\.100\.23|203\.0\.113\.9|Zq8Wx3Kp/u);
  });

  it('should mask the access code inside a kept string', () => {
    const accessCode = 'Fk3Qa9Zt';
    const result = redactProjectFileReply(
      JSON.parse(`{"print":{"command":"project_file","result":"FAIL","reason":"code ${accessCode} refused"}}`),
      [serial, address, accessCode],
    );

    expect(result).toEqual(
      JSON.parse('{"print":{"command":"project_file","result":"FAIL","reason":"code [redacted] refused"}}'),
    );
    expect(JSON.stringify(result)).not.toContain(accessCode);
  });

  it('should keep a numeric sequence_id a number', () => {
    expect(redactProjectFileReply(JSON.parse('{"print":{"command":"project_file","sequence_id":20000}}'), [])).toEqual(
      JSON.parse('{"print":{"command":"project_file","sequence_id":20000}}'),
    );
  });
});

describe('tapProjectFileReplies', () => {
  it('should pass every byte through and collect only the redacted project_file reply', async () => {
    const topic = `device/${serial}/report`;
    const bytes = Buffer.concat([
      /* A CONNACK, a status report and the reply, which needs a two-byte remaining length. */
      Buffer.from([0x20, 2, 0, 0]),
      publish(topic, '{"print":{"command":"push_status","nozzle_temper":24}}', 0),
      publish(topic, reply, 1),
    ]);
    const chunks = Array.from({ length: Math.ceil(bytes.byteLength / 7) }, (_, index) =>
      Uint8Array.from(bytes.subarray(index * 7, index * 7 + 7)),
    );
    const stream: MachineNetworkStream = {
      readable: (async function* () {
        yield* chunks;
      })(),
      async write() {
        /* The tap only reads. */
      },
      async close() {
        /* Nothing to close. */
      },
    };
    const replies: ProjectFileReply[] = [];
    const read: Array<Uint8Array<ArrayBuffer>> = [];

    for await (const chunk of tapProjectFileReplies(stream, replies, [serial, address]).readable) {
      read.push(chunk);
    }

    expect(Buffer.concat(read)).toEqual(bytes);
    const expected: unknown = JSON.parse(redacted);
    expect(replies.map(({ reply: captured }) => captured)).toEqual([expected]);
    expect(Date.parse(replies[0]?.receivedAt ?? '')).not.toBeNaN();
  });
});

describe('print-cube monitor', () => {
  it('should finish on its own run reaching FINISH, which a Bambu printer keeps reporting', () => {
    expect(printCubeOutcome({ runId: 'cube', state: 'completed' }, 'cube')).toBe('completed');
  });

  it('should end at once on its own run cancelled or failed', () => {
    expect(printCubeOutcome({ runId: 'cube', state: 'cancelled' }, 'cube')).toBe('cancelled');
    expect(printCubeOutcome({ runId: 'cube', state: 'failed' }, 'cube')).toBe('failed');
  });

  it('should keep printing while the run runs, and wait on any other run or none', () => {
    expect(printCubeOutcome({ runId: 'cube', state: 'paused' }, 'cube')).toBe('printing');
    // The previous print's FINISH is not this stage's.
    expect(printCubeOutcome({ runId: 'earlier', state: 'completed' }, 'cube')).toBe('waiting');
    expect(printCubeOutcome(undefined, 'cube')).toBe('waiting');
    expect(printCubeOutcome({ runId: 'cube', state: 'running' }, undefined)).toBe('waiting');
  });
});
