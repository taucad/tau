/**
 * Git smart-HTTP framing for the browser leg: pkt-lines, side-band
 * demultiplexing, and the two service `POST`s a fetch and a push make.
 *
 * The wire only: nothing here reads or writes a store. `isomorphic-git` keeps
 * the advertisement (`getRemoteInfo2`, `listServerRefs`); these helpers carry
 * the requests Tau composes itself (W13d, E4).
 *
 * @module
 */

import { PackCeilingError } from '#object-store/object-store.js';
import { Errors } from 'isomorphic-git';
import { concatBytes } from '#object-hash.js';
import type { RevisionHttpClient } from '#http-client.js';

export const pktEncoder = new TextEncoder();
const pktDecoder = new TextDecoder();

/**
 * One pkt-line: four hex digits of length, then the payload.
 *
 * @param payload - The line's text.
 * @returns The encoded line.
 */
export const pktLine = (payload: string): Uint8Array<ArrayBuffer> => {
  const bytes = pktEncoder.encode(payload);
  return concatBytes(pktEncoder.encode((bytes.byteLength + 4).toString(16).padStart(4, '0')), bytes);
};

/**
 * The payloads of a pkt-line stream, flushes dropped.
 *
 * @param bytes - The whole stream.
 * @returns Each line's payload, in order.
 */
const pktPayloads = (bytes: Uint8Array<ArrayBuffer>): Array<Uint8Array<ArrayBuffer>> => {
  const payloads: Array<Uint8Array<ArrayBuffer>> = [];
  let offset = 0;
  while (offset + 4 <= bytes.byteLength) {
    const length = Number.parseInt(pktDecoder.decode(bytes.subarray(offset, offset + 4)), 16);
    if (Number.isNaN(length)) {
      throw new TypeError('The remote answered with something that is not git’s pkt-line protocol.');
    }
    if (length < 4) {
      offset += 4;
      continue;
    }
    payloads.push(bytes.subarray(offset + 4, offset + length));
    offset += length;
  }
  return payloads;
};

/** What one `receive-pack` answered: its per-ref report and its sideband. */
type ReceivePackReport = Readonly<{
  /** `ok`/`ng` per remote ref name; an `ng` carries the remote's reason. */
  refs: ReadonlyMap<string, Readonly<{ ok: boolean; reason: string }>>;
  /** The server's `remote:` lines, which is where a hook says *why*. */
  said: readonly string[];
}>;

/**
 * Split a `side-band-64k` stream into its data and what the server said.
 *
 * @param body - The sideband pkt-lines.
 * @returns Channel 1's bytes and channel 2's lines; channel 3 is thrown.
 */
const demuxSideband = (
  body: Uint8Array<ArrayBuffer>,
): Readonly<{ data: Uint8Array<ArrayBuffer>; said: readonly string[] }> => {
  const data: Array<Uint8Array<ArrayBuffer>> = [];
  const said: string[] = [];
  for (const payload of pktPayloads(body)) {
    switch (payload[0]) {
      case 1: {
        data.push(payload.subarray(1));
        break;
      }
      case 2: {
        said.push(...pktDecoder.decode(payload.subarray(1)).split(/\r?\n|\r/u));
        break;
      }
      case 3: {
        throw new Error(pktDecoder.decode(payload.subarray(1)));
      }
      default: {
        break;
      }
    }
  }
  return Object.freeze({
    data: concatBytes(...data),
    said: said.map((line) => line.trim()).filter((line) => line !== ''),
  });
};

/**
 * Read a `receive-pack` result: sideband-demuxed when asked for, then the
 * `report-status` lines.
 *
 * @param body - The whole response body.
 * @param sideband - Whether the request asked for `side-band-64k`.
 * @returns The per-ref report and what the server said.
 */
const readReceivePackReport = (body: Uint8Array<ArrayBuffer>, sideband: boolean): ReceivePackReport => {
  const { data: status, said } = sideband ? demuxSideband(body) : { data: body, said: [] };
  const references = new Map<string, { ok: boolean; reason: string }>();
  for (const payload of pktPayloads(status)) {
    const line = pktDecoder.decode(payload).replace(/\n$/u, '');
    const [kind, name = '', ...reason] = line.split(' ');
    if (kind === 'ok' || kind === 'ng') {
      references.set(name, { ok: kind === 'ok', reason: reason.join(' ') });
    }
  }
  return Object.freeze({ refs: references, said });
};

/**
 * The pack an `upload-pack` answered: past its `ACK`/`NAK` lines, and
 * sideband-demuxed when asked for.
 *
 * @param body - The whole response body.
 * @param sideband - Whether the request asked for `side-band-64k`.
 * @returns The packfile's bytes.
 */
export const readUploadPackPack = (body: Uint8Array<ArrayBuffer>, sideband: boolean): Uint8Array<ArrayBuffer> => {
  let offset = 0;
  while (offset + 4 <= body.byteLength) {
    const length = Number.parseInt(pktDecoder.decode(body.subarray(offset, offset + 4)), 16);
    if (length === 0) {
      offset += 4;
      continue;
    }
    /* A raw pack starts `PACK`, a sideband line with its channel byte: either
     * ends the negotiation's text lines. */
    if (
      Number.isNaN(length) ||
      !/^(?:ACK|NAK|shallow|unshallow)\b/u.test(pktDecoder.decode(body.subarray(offset + 4, offset + length)))
    ) {
      break;
    }
    offset += length;
  }
  const rest = body.subarray(offset);
  return sideband ? demuxSideband(rest).data : rest;
};

/**
 * One smart-HTTP `POST` to a git service, answered as its body.
 *
 * A status other than 200 is thrown as the library's own `HttpError` *with*
 * the body, so the classifier reads the remote's code and sentence (N1).
 *
 * @param http - The client this request goes through.
 * @param request - The remote's URL, the service and the request body.
 * @returns The whole response body.
 */
export const postService = async (
  http: RevisionHttpClient,
  {
    url,
    service,
    body,
    maximumBytes,
  }: Readonly<{
    url: string;
    service: 'git-receive-pack' | 'git-upload-pack';
    body: Uint8Array<ArrayBuffer>;
    /** Read the answer as it streams, and stop with a {@link PackCeilingError} past this many bytes. */
    maximumBytes?: number;
  }>,
): Promise<Uint8Array<ArrayBuffer>> => {
  const response = await http.request({
    method: 'POST',
    url: `${url}/${service}`,
    headers: {
      'content-type': `application/x-${service}-request`,
      accept: `application/x-${service}-result`,
    },
    body: (async function* once(): AsyncGenerator<Uint8Array<ArrayBuffer>> {
      yield body;
    })(),
  });
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  let received = 0;
  for await (const chunk of response.body) {
    received += chunk.byteLength;
    if (maximumBytes !== undefined && received > maximumBytes && response.statusCode === 200) {
      /* Leaving the loop ends the body: the rest of the answer is never read. */
      throw new PackCeilingError(received, maximumBytes);
    }
    chunks.push(new Uint8Array(chunk));
  }
  const answered = concatBytes(...chunks);
  if (response.statusCode !== 200) {
    throw new Errors.HttpError(response.statusCode, response.statusMessage, pktDecoder.decode(answered));
  }
  return answered;
};

/**
 * One `receive-pack` request, answered as its per-ref report.
 *
 * @param http - The client this push goes through.
 * @param request - The remote's URL; the commands, a flush and the pack; and
 *   whether the commands asked for `side-band-64k`.
 * @returns The per-ref report.
 */
export const receivePack = async (
  http: RevisionHttpClient,
  { url, body, sideband }: Readonly<{ url: string; body: Uint8Array<ArrayBuffer>; sideband: boolean }>,
): Promise<ReceivePackReport> => {
  const report = readReceivePackReport(await postService(http, { url, service: 'git-receive-pack', body }), sideband);
  /* No per-ref report means the remote never got as far as the refs, so it is
   * not "the remote refused this ref" for any of them (seam 3 of 3, N1). */
  if (report.refs.size === 0) {
    throw new Error(report.said.join(' '));
  }
  return report;
};
