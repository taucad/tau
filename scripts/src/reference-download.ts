import { createHash, randomUUID } from 'node:crypto';
import type { LookupAddress } from 'node:dns';
import { lookup as dnsLookup } from 'node:dns/promises';
import {
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readSync,
  renameSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import type { IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { LookupFunction } from 'node:net';
import { basename, dirname, join } from 'node:path';

import ipaddr from 'ipaddr.js';

import type { ReferenceFormat } from '#reference-to-md.js';

const maximumRedirects = 3;
const totalTimeoutMilliseconds = 30_000;
const idleTimeoutMilliseconds = 10_000;
const maximumBytes: Record<ReferenceFormat, number> = {
  pdf: 100 * 1024 * 1024,
  latex: 5 * 1024 * 1024,
};
const artifactHosts: Record<ReferenceFormat, ReadonlySet<string>> = {
  pdf: new Set(['arxiv.org', 'export.arxiv.org']),
  latex: new Set(),
};

type DownloadDependencies = {
  request: typeof httpsRequest;
  lookup(hostname: string, options: { all: true; verbatim: true }): Promise<LookupAddress[]>;
};

export type DownloadArtifactOptions = {
  id: string;
  format: ReferenceFormat;
  url: string;
  destination: string;
  force: boolean;
};

const defaultDependencies: DownloadDependencies = {
  lookup: async (hostname, options) => dnsLookup(hostname, options),
  request: httpsRequest,
};

const headerValue = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const printableUrl = (url: URL): string => `${url.origin}${url.pathname}`;

export const assertPublicAddresses = (addresses: readonly LookupAddress[]): void => {
  if (addresses.length === 0) {
    throw new Error('artifact host did not resolve to an address');
  }

  for (const { address } of addresses) {
    if (!ipaddr.isValid(address) || ipaddr.process(address).range() !== 'unicast') {
      throw new Error(`artifact host resolved to a non-public address (${address})`);
    }
  }
};

export const validateArtifactUrl = (value: string, format: ReferenceFormat): URL => {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== '' ||
    (url.port !== '' && url.port !== '443')
  ) {
    throw new Error('artifact downloads require credential-free HTTPS on port 443 without a query or fragment');
  }
  if (!artifactHosts[format].has(hostname)) {
    const detail =
      format === 'latex' ? 'remote LaTeX downloads are not enabled' : `artifact host is not allowed (${hostname})`;
    throw new Error(detail);
  }
  return url;
};

const requestOnce = async (
  url: URL,
  deadline: number,
  dependencies: DownloadDependencies,
): Promise<IncomingMessage> => {
  const addresses = await dependencies.lookup(url.hostname, { all: true, verbatim: true });
  assertPublicAddresses(addresses);
  const pinned = [...addresses].sort((left, right) =>
    `${left.family}:${left.address}`.localeCompare(`${right.family}:${right.address}`),
  )[0];
  if (!pinned) {
    throw new Error('artifact host did not resolve to an address');
  }

  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    throw new Error('artifact download exceeded the 30 second total timeout');
  }

  return new Promise<IncomingMessage>((resolve, reject) => {
    const pinnedLookup = ((
      _hostname: string,
      options: unknown,
      // oxlint-disable-next-line typescript/no-restricted-types -- Node's LookupFunction callback requires null.
      callback: (error: NodeJS.ErrnoException | null, address: unknown, family?: number) => void,
    ): void => {
      // Node >=21 invokes lookup with { all: true } and expects an address array; the
      // legacy (address, family) form then reads `addresses[0].address` as undefined.
      if (typeof options === 'object' && options !== null && (options as { all?: boolean }).all) {
        callback(null, [{ address: pinned.address, family: pinned.family }]);
        return;
      }
      callback(null, pinned.address, pinned.family);
    }) as LookupFunction;

    const request = dependencies.request(
      url,
      {
        headers: { accept: '*/*', 'accept-encoding': 'identity', 'user-agent': 'TauReferenceBot/1.0' },
        lookup: pinnedLookup,
        method: 'GET',
        servername: url.hostname,
      },
      (response) => {
        const clear = (): void => {
          clearTimeout(totalTimer);
        };
        response.once('end', clear);
        response.once('close', clear);
        resolve(response);
      },
    );
    const totalTimer = setTimeout(() => {
      request.destroy(new Error('artifact download exceeded the 30 second total timeout'));
    }, remaining);
    request.setTimeout(idleTimeoutMilliseconds, () => {
      request.destroy(new Error('artifact download exceeded the 10 second idle timeout'));
    });
    request.once('error', (error) => {
      clearTimeout(totalTimer);
      reject(error);
    });
    request.end();
  });
};

const validateDownloadedArtifact = (path: string, format: ReferenceFormat): void => {
  const descriptor = openSync(path, constants.O_RDONLY);
  try {
    const header = Buffer.alloc(8);
    const length = readSync(descriptor, header, 0, header.length, 0);
    if (format === 'pdf' && header.subarray(0, Math.min(length, 5)).toString('latin1') !== '%PDF-') {
      throw new Error('downloaded artifact is not a PDF');
    }
  } finally {
    closeSync(descriptor);
  }
};

// oxlint-disable-next-line eslint/complexity -- The downloader validates every transport boundary before persisting.
export const downloadArtifact = async (
  options: DownloadArtifactOptions,
  dependencies: DownloadDependencies = defaultDependencies,
): Promise<{ bytes: number; sha256: string }> => {
  if (existsSync(options.destination) && !options.force) {
    throw new Error(`${options.id}: cached artifact already exists`);
  }

  let url = validateArtifactUrl(options.url, options.format);
  const deadline = Date.now() + totalTimeoutMilliseconds;
  let response: IncomingMessage | undefined;

  for (let redirects = 0; redirects <= maximumRedirects; redirects += 1) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Redirect validation is necessarily sequential.
    response = await requestOnce(url, deadline, dependencies);
    if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400) {
      const location = headerValue(response.headers.location);
      response.resume();
      if (!location || redirects === maximumRedirects) {
        throw new Error(`${options.id}: artifact redirect limit exceeded`);
      }
      const redirected = new URL(location, url);
      if (url.protocol === 'https:' && redirected.protocol !== 'https:') {
        throw new Error(`${options.id}: artifact redirect attempted an HTTPS downgrade`);
      }
      url = validateArtifactUrl(redirected.href, options.format);
      continue;
    }
    break;
  }

  if (response?.statusCode !== 200) {
    const status = response?.statusCode ?? 'unknown';
    response?.resume();
    throw new Error(`${options.id}: artifact download failed (${status})`);
  }

  const encoding = headerValue(response.headers['content-encoding']);
  if (encoding && encoding.toLowerCase() !== 'identity') {
    response.resume();
    throw new Error(`${options.id}: unexpected content encoding (${encoding})`);
  }

  const declaredText = headerValue(response.headers['content-length']);
  const declaredLength = declaredText === undefined ? undefined : Number(declaredText);
  if (declaredLength !== undefined && (!Number.isSafeInteger(declaredLength) || declaredLength < 0)) {
    response.resume();
    throw new Error(`${options.id}: invalid Content-Length`);
  }
  if (declaredLength !== undefined && declaredLength > maximumBytes[options.format]) {
    response.resume();
    throw new Error(`${options.id}: artifact exceeds ${maximumBytes[options.format]} bytes`);
  }

  const contentType = headerValue(response.headers['content-type'])?.split(';', 1)[0]?.trim().toLowerCase();
  if (options.format === 'pdf' && contentType !== 'application/pdf') {
    response.resume();
    throw new Error(`${options.id}: unexpected content type (${contentType ?? 'missing'})`);
  }

  mkdirSync(dirname(options.destination), { recursive: true });
  const temporaryPath = join(dirname(options.destination), `.${basename(options.destination)}.tmp-${randomUUID()}`);
  const descriptor = openSync(temporaryPath, constants.O_CREAT + constants.O_EXCL + constants.O_WRONLY, 0o600);
  const hash = createHash('sha256');
  let bytes = 0;

  try {
    for await (const value of response) {
      const chunk = Uint8Array.from(value as Uint8Array<ArrayBuffer>);
      bytes += chunk.length;
      if (bytes > maximumBytes[options.format]) {
        throw new Error(`${options.id}: artifact exceeds ${maximumBytes[options.format]} bytes`);
      }
      hash.update(chunk);
      writeSync(descriptor, chunk);
    }
    if (declaredLength !== undefined && bytes !== declaredLength) {
      throw new Error(`${options.id}: Content-Length did not match downloaded bytes`);
    }
    fsyncSync(descriptor);
    closeSync(descriptor);
    validateDownloadedArtifact(temporaryPath, options.format);
    renameSync(temporaryPath, options.destination);
  } catch (error) {
    try {
      closeSync(descriptor);
    } catch {
      // The successful path already closed it.
    }
    if (existsSync(temporaryPath)) {
      unlinkSync(temporaryPath);
    }
    throw error;
  }

  console.log(`${options.id}: downloaded ${bytes} bytes from ${printableUrl(url)}`);
  return { bytes, sha256: hash.digest('hex') };
};
