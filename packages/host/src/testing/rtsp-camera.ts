/**
 * A loopback RTSP camera for tests of the still capture.
 *
 * It speaks plain TCP: pinning is the caller's concern, so a test hands
 * `captureRtspsStill` an `openUpstream` that connects here. It answers
 * `OPTIONS`, challenges every other request that lacks a valid Digest response
 * (offering Basic first, to check the proxy prefers Digest), and after `PLAY`
 * streams RTP H.264 over interleaved TCP, looping an Annex-B fixture as RFC 6184
 * single NAL unit packets and FU-A fragments.
 *
 * @internal
 */

import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import type { Socket } from 'node:net';

/** How a request's credentials fared at the camera. @internal */
export type RtspCameraAuthorization = 'missing' | 'rejected' | 'verified';

/** One request the camera received. @internal */
export type RtspCameraRequest = Readonly<{
  method: string;
  /** The request line's URI; a verified Digest response names the same URI. */
  uri: string;
  authorization: RtspCameraAuthorization;
}>;

/** Options for {@link listenRtspCamera}. @internal */
export type RtspCameraOptions = Readonly<{
  username: string;
  password: string;
  /** Whether the Digest challenge offers `qop="auth"`, so every response must carry a rising nonce count. */
  qop: boolean;
  /** Annex-B H.264 whose access units the camera loops, starting at the first. */
  h264: Uint8Array<ArrayBuffer>;
}>;

/** A listening fake camera. @internal */
export type RtspCamera = Readonly<{
  port: number;
  /** Every request received so far, across connections, in order. */
  requests: readonly RtspCameraRequest[];
  close(): Promise<void>;
}>;

type CameraRequest = Readonly<{ method: string; uri: string; headers: ReadonlyMap<string, string> }>;

/** A realm with a comma in it, which only a quoted-string parser reads whole. */
const realm = 'Tau, fake camera';
const sessionId = '7A75F00D';
/** The largest RTP payload; the fixture's IDR slice goes as FU-A fragments. */
const maximumPayload = 256;
/** How often the camera sends the next access unit. Milliseconds. */
const frameSpacing = 10;
/** 90 kHz clock ticks per access unit: 30 frames per second of stream time. */
const frameTicks = 3000;
/** Access units one `PLAY` streams at most, so a stuck test stops after ten seconds. */
const maximumFrames = 1000;
const startCode = Buffer.from([0, 0, 1]);

const md5 = (text: string): string => createHash('md5').update(text).digest('hex');

/**
 * Split an Annex-B stream into its NAL units.
 *
 * @param annexB - The stream, start codes included.
 * @returns The NAL units without their start codes.
 */
const nalUnits = (annexB: Uint8Array<ArrayBuffer>): Array<Uint8Array<ArrayBuffer>> => {
  const bytes = Buffer.from(annexB);
  const starts: Array<Readonly<{ code: number; nal: number }>> = [];
  for (let index = bytes.indexOf(startCode); index !== -1; index = bytes.indexOf(startCode, index + 3)) {
    /* A four-byte start code's leading zero belongs to it, not to the unit before. */
    starts.push({ code: index > 0 && bytes[index - 1] === 0 ? index - 1 : index, nal: index + 3 });
  }
  return starts.map((start, position) => bytes.subarray(start.nal, starts[position + 1]?.code ?? bytes.byteLength));
};

/**
 * Group NAL units into access units.
 *
 * @param nals - The stream's NAL units in order.
 * @returns The access units, each ending at its single slice (NAL types 1 to 5).
 */
const accessUnits = (nals: ReadonlyArray<Uint8Array<ArrayBuffer>>): Array<Array<Uint8Array<ArrayBuffer>>> => {
  const units: Array<Array<Uint8Array<ArrayBuffer>>> = [];
  let current: Array<Uint8Array<ArrayBuffer>> = [];
  for (const nal of nals) {
    current.push(nal);
    const type = (nal[0] ?? 0) % 32;
    if (type >= 1 && type <= 5) {
      units.push(current);
      current = [];
    }
  }
  return units;
};

/**
 * Packetize one NAL unit per RFC 6184.
 *
 * @param nal - The unit, header byte first.
 * @returns Its RTP payloads: the unit whole when it fits, else FU-A fragments.
 */
const rtpPayloads = (nal: Uint8Array<ArrayBuffer>): Array<Uint8Array<ArrayBuffer>> => {
  if (nal.byteLength <= maximumPayload) {
    return [nal];
  }
  const header = nal[0] ?? 0;
  /* The FU indicator keeps the unit's F and NRI bits under type 28; the FU header carries S, E and the unit's type. */
  const indicator = header - (header % 32) + 28;
  const fragments: Array<Uint8Array<ArrayBuffer>> = [];
  for (let offset = 1; offset < nal.byteLength; offset += maximumPayload - 2) {
    const end = Math.min(offset + maximumPayload - 2, nal.byteLength);
    const edges = (offset === 1 ? 128 : 0) + (end === nal.byteLength ? 64 : 0);
    fragments.push(Buffer.concat([Buffer.from([indicator, edges + (header % 32)]), nal.subarray(offset, end)]));
  }
  return fragments;
};

/**
 * Wrap one RTP payload for interleaved TCP.
 *
 * @param payload - The RTP payload.
 * @param packet - Its sequence number, timestamp and marker bit.
 * @returns An RTP packet (version 2, payload type 96) in a `$` frame on channel 0.
 */
const interleavedPacket = (
  payload: Uint8Array<ArrayBuffer>,
  packet: Readonly<{ sequence: number; timestamp: number; marker: boolean }>,
): Uint8Array<ArrayBuffer> => {
  const head = Buffer.alloc(16);
  head[0] = 0x24;
  head.writeUInt16BE(12 + payload.byteLength, 2);
  head[4] = 0x80;
  head[5] = (packet.marker ? 128 : 0) + 96;
  head.writeUInt16BE(packet.sequence % 65_536, 6);
  head.writeUInt32BE(packet.timestamp % 2 ** 32, 8);
  head.writeUInt32BE(0x74_61_75_31, 12);
  return Buffer.concat([head, payload]);
};

/**
 * Take the complete requests off the front of what a client has sent, skipping its interleaved RTCP.
 *
 * @param received - The bytes not yet taken.
 * @returns The complete requests and the bytes still arriving.
 */
const takeRequests = (
  received: Uint8Array<ArrayBuffer>,
): Readonly<{ requests: CameraRequest[]; rest: Uint8Array<ArrayBuffer> }> => {
  const requests: CameraRequest[] = [];
  let rest = Buffer.from(received.buffer, received.byteOffset, received.byteLength);
  for (;;) {
    if (rest[0] === 0x24) {
      const size = rest.byteLength < 4 ? Number.POSITIVE_INFINITY : 4 + rest.readUInt16BE(2);
      if (rest.byteLength < size) {
        return { requests, rest };
      }
      rest = rest.subarray(size);
      continue;
    }
    const end = rest.indexOf('\r\n\r\n');
    if (end === -1) {
      return { requests, rest };
    }
    const [start = '', ...lines] = rest.subarray(0, end).toString('latin1').split('\r\n');
    const headers = new Map(
      lines.map((line) => [
        line.slice(0, line.indexOf(':')).trim().toLowerCase(),
        line.slice(line.indexOf(':') + 1).trim(),
      ]),
    );
    const size = end + 4 + Number(headers.get('content-length') ?? 0);
    if (rest.byteLength < size) {
      return { requests, rest };
    }
    const [method = '', uri = ''] = start.split(' ');
    requests.push({ method, uri, headers });
    rest = rest.subarray(size);
  }
};

/**
 * Read an `Authorization: Digest …` value.
 *
 * @param authorization - The header value.
 * @returns Its `name=value` fields, names lower-cased and quoted values unescaped.
 */
const digestFields = (authorization: string): ReadonlyMap<string, string> =>
  new Map(
    [...authorization.matchAll(/(\w+)=(?:"((?:[^"\\]|\\.)*)"|([^\s,]+))/gu)].map(([, name = '', text, token]) => [
      name.toLowerCase(),
      (text ?? token ?? '').replaceAll(/\\(.)/gu, '$1'),
    ]),
  );

const reply = (
  socket: Socket,
  message: Readonly<{ sequence: string; status: string; headers?: readonly string[]; body?: string }>,
): void => {
  const headers = [
    `CSeq: ${message.sequence}`,
    ...(message.headers ?? []),
    ...(message.body === undefined ? [] : [`Content-Length: ${Buffer.byteLength(message.body)}`]),
  ];
  socket.write(
    `RTSP/1.0 ${message.status}\r\n${headers.map((header) => `${header}\r\n`).join('')}\r\n${message.body ?? ''}`,
  );
};

/**
 * Listen on a loopback port as a camera that challenges with Digest and plays
 * the fixture.
 *
 * @internal
 * @param options - The credentials it accepts, whether it asks for `qop=auth`,
 * and the H.264 it streams.
 * @returns The listening camera and the requests it has seen.
 */
export const listenRtspCamera = async (options: RtspCameraOptions): Promise<RtspCamera> => {
  const requests: RtspCameraRequest[] = [];
  const sockets = new Set<Socket>();
  const nonce = randomBytes(12).toString('hex');
  const nals = nalUnits(options.h264);
  const units = accessUnits(nals);
  const [sps = Buffer.alloc(4), pps = Buffer.alloc(0)] = [7, 8].map((type) =>
    Buffer.from(nals.find((nal) => (nal[0] ?? 0) % 32 === type) ?? []),
  );
  const description = [
    'v=0',
    'o=- 0 0 IN IP4 127.0.0.1',
    's=Tau fake camera',
    'c=IN IP4 0.0.0.0',
    't=0 0',
    'm=video 0 RTP/AVP 96',
    'a=rtpmap:96 H264/90000',
    `a=fmtp:96 packetization-mode=1;profile-level-id=${sps.subarray(1, 4).toString('hex')};sprop-parameter-sets=${sps.toString('base64')},${pps.toString('base64')}`,
    'a=control:trackID=0',
    '',
  ].join('\r\n');
  let lastNonceCount = 0;
  const verify = (authorization: string | undefined, request: CameraRequest): RtspCameraAuthorization => {
    if (authorization === undefined) {
      return 'missing';
    }
    const fields = digestFields(authorization);
    const nonceCount = Number.parseInt(fields.get('nc') ?? '', 16);
    const qop = options.qop ? `${fields.get('nc') ?? ''}:${fields.get('cnonce') ?? ''}:auth:` : '';
    const secret = md5(`${options.username}:${realm}:${options.password}`);
    const expected = md5(`${secret}:${nonce}:${qop}${md5(`${request.method}:${request.uri}`)}`);
    const isVerified =
      authorization.startsWith('Digest ') &&
      fields.get('username') === options.username &&
      fields.get('realm') === realm &&
      fields.get('nonce') === nonce &&
      fields.get('uri') === request.uri &&
      fields.get('response') === expected &&
      (!options.qop || (fields.get('qop') === 'auth' && nonceCount > lastNonceCount));
    if (isVerified && options.qop) {
      lastNonceCount = nonceCount;
    }
    return isVerified ? 'verified' : 'rejected';
  };
  const play = (socket: Socket): void => {
    let sequence = 0;
    let timestamp = 0;
    let sent = 0;
    const streamTimer = setInterval(() => {
      const payloads = (units[sent % units.length] ?? []).flatMap((nal) => rtpPayloads(nal));
      socket.write(
        Buffer.concat(
          payloads.map((payload, index) =>
            interleavedPacket(payload, {
              sequence: sequence + index,
              timestamp,
              marker: index === payloads.length - 1,
            }),
          ),
        ),
      );
      sequence += payloads.length;
      timestamp += frameTicks;
      sent += 1;
      if (sent >= maximumFrames) {
        clearInterval(streamTimer);
      }
    }, frameSpacing);
    socket.once('close', () => {
      clearInterval(streamTimer);
    });
  };
  const respond = (socket: Socket, request: CameraRequest): void => {
    const sequence = request.headers.get('cseq') ?? '0';
    const authorization = verify(request.headers.get('authorization'), request);
    requests.push({ method: request.method, uri: request.uri, authorization });
    if (request.method !== 'OPTIONS' && authorization !== 'verified') {
      reply(socket, {
        sequence,
        status: '401 Unauthorized',
        headers: [
          `WWW-Authenticate: Basic realm="${realm}"`,
          `WWW-Authenticate: Digest realm="${realm}", nonce="${nonce}"${options.qop ? ', qop="auth"' : ''}, algorithm=MD5`,
        ],
      });
      return;
    }
    switch (request.method) {
      case 'OPTIONS': {
        reply(socket, { sequence, status: '200 OK', headers: ['Public: OPTIONS, DESCRIBE, SETUP, PLAY, TEARDOWN'] });
        return;
      }
      case 'DESCRIBE': {
        reply(socket, { sequence, status: '200 OK', headers: ['Content-Type: application/sdp'], body: description });
        return;
      }
      case 'SETUP': {
        reply(socket, {
          sequence,
          status: '200 OK',
          headers: ['Transport: RTP/AVP/TCP;unicast;interleaved=0-1', `Session: ${sessionId};timeout=60`],
        });
        return;
      }
      case 'PLAY': {
        reply(socket, { sequence, status: '200 OK', headers: [`Session: ${sessionId}`] });
        play(socket);
        return;
      }
      case 'TEARDOWN': {
        reply(socket, { sequence, status: '200 OK', headers: [`Session: ${sessionId}`] });
        socket.end();
        return;
      }
      default: {
        reply(socket, { sequence, status: '405 Method Not Allowed' });
      }
    }
  };
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('error', () => undefined);
    socket.once('close', () => sockets.delete(socket));
    let buffered: Uint8Array<ArrayBuffer> = new Uint8Array(0);
    socket.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
      const taken = takeRequests(Buffer.concat([buffered, chunk]));
      buffered = taken.rest;
      for (const request of taken.requests) {
        respond(socket, request);
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('The fake camera has no TCP address.');
  }
  return Object.freeze({
    port: address.port,
    requests,
    async close() {
      for (const socket of sockets) {
        socket.destroy();
      }
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    },
  });
};
