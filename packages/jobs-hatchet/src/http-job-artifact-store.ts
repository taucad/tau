import { createHash } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { maximumJobActionRecordBytes, maximumJobArtifactBytes } from '@taucad/jobs';
import type { JobArtifactStore, JobAttemptIdentity, JobComputeActionRecord } from '@taucad/jobs';

const multipartUploadConcurrency = 4;
const multipartPartAttempts = 3;
const maximumMultipartParts = 10_000;
const maximumControlPlaneBytes = maximumJobActionRecordBytes * 2;

const readBoundedResponseBytes = async (response: Response, limit: number): Promise<Uint8Array<ArrayBuffer>> => {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new TypeError('Tau response contains an invalid Content-Length header.');
    }
    if (length > limit) {
      await response.body?.cancel().catch(() => undefined);
      throw new RangeError(`Tau response exceeds the ${String(limit)} byte limit.`);
    }
  }

  if (response.body === null) {
    return new Uint8Array();
  }
  const reader = response.body.getReader();
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  let size = 0;
  try {
    for (;;) {
      // oxlint-disable-next-line no-await-in-loop -- the response stream is consumed sequentially.
      const result = await reader.read();
      if (result.done) {
        break;
      }
      const chunk = new Uint8Array(result.value);
      size += chunk.byteLength;
      if (size > limit) {
        // oxlint-disable-next-line no-await-in-loop -- cancellation must precede rejecting an oversized response.
        await reader.cancel().catch(() => undefined);
        throw new RangeError(`Tau response exceeds the ${String(limit)} byte limit.`);
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
};

const readBoundedResponseObject = async (response: Response, name: string): Promise<Record<string, unknown>> => {
  const bytes = await readBoundedResponseBytes(response, maximumControlPlaneBytes);
  try {
    return parseObject(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), name);
  } catch (error) {
    if (error instanceof TypeError && error.message.startsWith('Tau ')) {
      throw error;
    }
    throw new TypeError(`Tau ${name} response must contain valid UTF-8 JSON.`, { cause: error });
  }
};

const parseObject = (value: unknown, name: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`Tau ${name} response must be an object.`);
  }
  return value as Record<string, unknown>;
};

const parseString = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`Tau ${name} response must include ${name}.`);
  }
  return value;
};

const parsePositiveInteger = (value: unknown, name: string): number => {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new TypeError(`Tau response must include a positive integer ${name}.`);
  }
  return Number(value);
};

const parseNonnegativeInteger = (value: unknown, name: string): number => {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new TypeError(`Tau response must include a non-negative integer ${name}.`);
  }
  return Number(value);
};

const parseDigest = (value: unknown, name: string): `sha256:${string}` => {
  const digest = parseString(value, name);
  if (!/^sha256:[\da-f]{64}$/u.test(digest)) {
    throw new TypeError(`Tau ${name} response must contain a lowercase SHA-256 digest.`);
  }
  return digest as `sha256:${string}`;
};

const parseActionDigest = (value: unknown, name: string): JobComputeActionRecord['actionDigest'] =>
  parseDigest(value, name) as JobComputeActionRecord['actionDigest'];

const parseContentDigest = (value: unknown, name: string): JobComputeActionRecord['output']['digest'] =>
  parseDigest(value, name) as JobComputeActionRecord['output']['digest'];

const assertKeys = (value: Record<string, unknown>, expected: readonly string[], name: string): void => {
  const actual = Object.keys(value).toSorted();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`Tau ${name} response contains an unexpected field.`);
  }
};

const parseActionRecord = (value: unknown): JobComputeActionRecord => {
  const record = parseObject(value, 'action record');
  assertKeys(record, ['actionDigest', 'codec', 'dependencies', 'output', 'schemaVersion'], 'action record');
  if (record['schemaVersion'] !== 1) {
    throw new TypeError('Tau action record response must use schemaVersion 1.');
  }
  const codec = parseObject(record['codec'], 'action codec');
  assertKeys(codec, ['id', 'version'], 'action codec');
  const output = parseObject(record['output'], 'action output');
  assertKeys(output, ['digest', 'mediaType', 'size'], 'action output');
  if (!Array.isArray(record['dependencies']) || record['dependencies'].length > 1024) {
    throw new TypeError('Tau action record response must include bounded dependencies.');
  }
  const dependencies = record['dependencies'].map((dependency) => parseActionDigest(dependency, 'dependency'));
  if (new Set(dependencies).size !== dependencies.length) {
    throw new TypeError('Tau action record response contains duplicate dependencies.');
  }
  const outputSize = parseNonnegativeInteger(output['size'], 'output.size');
  if (outputSize > maximumJobArtifactBytes) {
    throw new RangeError(`Tau action output exceeds the ${String(maximumJobArtifactBytes)} byte limit.`);
  }
  return {
    schemaVersion: 1,
    actionDigest: parseActionDigest(record['actionDigest'], 'actionDigest'),
    codec: { id: parseString(codec['id'], 'codec.id'), version: parseString(codec['version'], 'codec.version') },
    output: {
      digest: parseContentDigest(output['digest'], 'output.digest'),
      size: outputSize,
      mediaType: parseString(output['mediaType'], 'output.mediaType'),
    },
    dependencies,
  };
};

const validateActionRecordPublication = (record: JobComputeActionRecord): JobComputeActionRecord => {
  const validated = parseActionRecord(record);
  const size = new TextEncoder().encode(JSON.stringify(validated)).byteLength;
  if (size > maximumJobActionRecordBytes) {
    throw new RangeError(`Tau action record exceeds the ${String(maximumJobActionRecordBytes)} byte limit.`);
  }
  return validated;
};

/**
 * Store job artifacts through Tau's authenticated private, content-addressed data plane.
 * @param options - Tau API origin, paired-agent credential, and optional fetch implementation.
 * @returns A content-addressed artifact store backed by Tau's private object storage.
 * @public
 */
export const createHttpJobArtifactStore = (options: {
  readonly apiUrl: string;
  readonly credential: string;
  readonly runnerId: string;
  readonly fetch?: typeof globalThis.fetch;
}): JobArtifactStore => {
  const baseUrl = new URL(options.apiUrl);
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  if (!options.credential) {
    throw new TypeError('createHttpJobArtifactStore: credential must be non-empty.');
  }
  if (!options.runnerId.trim()) {
    throw new TypeError('createHttpJobArtifactStore: runnerId must be non-empty.');
  }

  const authorize = { authorization: `Bearer ${options.credential}`, 'content-type': 'application/json' };
  const request = async (path: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const response = await fetchImplementation(new URL(`/v1/jobs/worker-artifacts/${path}`, baseUrl), {
      method: 'POST',
      headers: authorize,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`Tau job artifact ${path} request failed with HTTP ${String(response.status)}.`);
    }
    if (response.status === 204) {
      return {};
    }
    return readBoundedResponseObject(response, path);
  };

  const responseHeaders = (value: unknown): Readonly<Record<string, string>> =>
    Object.fromEntries(
      Object.entries(parseObject(value, 'headers')).map(([key, entry]) => [key, parseString(entry, `headers.${key}`)]),
    );

  const uploadMultipart = async (input: {
    readonly bytes: Uint8Array<ArrayBuffer>;
    readonly digest: `sha256:${string}`;
    readonly uploadId: string;
    readonly partSize: number;
    readonly attempt: JobAttemptIdentity;
  }): Promise<void> => {
    const partCount = Math.ceil(input.bytes.byteLength / input.partSize);
    if (partCount > maximumMultipartParts) {
      throw new RangeError(`Tau multipart upload exceeds the ${String(maximumMultipartParts)} part limit.`);
    }
    const parts: Array<{ partNumber: number; etag: string; checksumSha256: string }> = [];
    let nextPart = 1;
    const uploadNext = async (): Promise<void> => {
      while (nextPart <= partCount) {
        const partNumber = nextPart++;
        const start = (partNumber - 1) * input.partSize;
        const bytes = input.bytes.slice(start, Math.min(start + input.partSize, input.bytes.byteLength));
        const checksumSha256 = createHash('sha256').update(bytes).digest('base64');
        let lastError: unknown;
        for (let attempt = 1; attempt <= multipartPartAttempts; attempt += 1) {
          try {
            // A fresh signed URL on every retry survives an expired or interrupted request.
            // oxlint-disable-next-line no-await-in-loop -- retries are deliberately sequential per immutable part.
            const part = await request('uploads/parts', {
              jobId: input.attempt.jobId,
              attemptId: input.attempt.attemptId,
              attempt: input.attempt.attempt,
              digest: input.digest,
              uploadId: input.uploadId,
              partNumber,
              checksumSha256,
            });
            // oxlint-disable-next-line no-await-in-loop -- the retry boundary includes the object-store request.
            const response = await fetchImplementation(parseString(part['uploadUrl'], 'uploadUrl'), {
              method: 'PUT',
              headers: responseHeaders(part['headers']),
              body: bytes,
              signal: AbortSignal.timeout(5 * 60_000),
            });
            if (!response.ok) {
              throw new Error(
                `Tau job artifact part ${String(partNumber)} failed with HTTP ${String(response.status)}.`,
              );
            }
            const etag = response.headers.get('etag');
            if (!etag) {
              throw new Error(`Tau job artifact part ${String(partNumber)} response omitted ETag.`);
            }
            parts.push({ partNumber, etag, checksumSha256 });
            lastError = undefined;
            break;
          } catch (error) {
            lastError = error;
            if (attempt < multipartPartAttempts) {
              // oxlint-disable-next-line no-await-in-loop -- bounded retry delay is part-local.
              await setTimeout(50 * 2 ** (attempt - 1));
            }
          }
        }
        if (lastError !== undefined) {
          throw lastError instanceof Error ? lastError : new Error('Tau job artifact part upload failed.');
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(multipartUploadConcurrency, partCount) }, uploadNext));
    await request('uploads/complete', {
      jobId: input.attempt.jobId,
      attemptId: input.attempt.attemptId,
      attempt: input.attempt.attempt,
      digest: input.digest,
      uploadId: input.uploadId,
      parts: parts.toSorted((left, right) => left.partNumber - right.partNumber),
    });
  };

  return Object.freeze({
    async put({ bytes, mediaType, attempt }) {
      if (!attempt || attempt.runnerId !== options.runnerId) {
        throw new TypeError('Tau HTTP artifact writes require the configured runner attempt identity.');
      }
      if (bytes.byteLength > maximumJobArtifactBytes) {
        throw new RangeError(`Tau job artifact exceeds the ${String(maximumJobArtifactBytes)} byte limit.`);
      }
      const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}` as const;
      const attemptPayload = { jobId: attempt.jobId, attemptId: attempt.attemptId, attempt: attempt.attempt };
      const upload = await request('uploads', { ...attemptPayload, digest, size: bytes.byteLength, mediaType });
      const storageKey = parseString(upload['storageKey'], 'storageKey');
      const mode = parseString(upload['mode'], 'mode');
      if (mode === 'existing') {
        return { digest, size: bytes.byteLength, storageKey };
      }
      if (mode === 'single') {
        const response = await fetchImplementation(parseString(upload['uploadUrl'], 'uploadUrl'), {
          method: 'PUT',
          headers: responseHeaders(upload['headers']),
          body: bytes,
        });
        if (!response.ok) {
          throw new Error(`Tau job artifact upload failed with HTTP ${String(response.status)}.`);
        }
        return { digest, size: bytes.byteLength, storageKey };
      }
      if (mode !== 'multipart') {
        throw new TypeError(`Tau artifact upload response used unsupported mode ${mode}.`);
      }
      const uploadId = parseString(upload['uploadId'], 'uploadId');
      try {
        await uploadMultipart({
          bytes,
          digest,
          uploadId,
          partSize: parsePositiveInteger(upload['partSize'], 'partSize'),
          attempt,
        });
      } catch (error) {
        await request('uploads/abort', { ...attemptPayload, digest, uploadId }).catch(() => undefined);
        throw error;
      }
      return { digest, size: bytes.byteLength, storageKey };
    },
    async read({ digest, attempt }) {
      if (!attempt || attempt.runnerId !== options.runnerId) {
        throw new TypeError('Tau HTTP artifact reads require the configured runner attempt identity.');
      }
      const download = await request('downloads', {
        jobId: attempt.jobId,
        attemptId: attempt.attemptId,
        attempt: attempt.attempt,
        digest,
      });
      const downloadUrl = parseString(download['downloadUrl'], 'downloadUrl');
      const response = await fetchImplementation(downloadUrl, { signal: AbortSignal.timeout(5 * 60_000) });
      if (response.status === 404) {
        return { found: false, reason: 'not-found' };
      }
      if (!response.ok) {
        throw new Error(`Tau job artifact download failed with HTTP ${String(response.status)}.`);
      }
      const bytes = await readBoundedResponseBytes(response, maximumJobArtifactBytes);
      const actualDigest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
      if (actualDigest !== digest) {
        throw new Error(`Tau job artifact download integrity failure: expected ${digest}, received ${actualDigest}.`);
      }
      return { found: true, bytes };
    },
    computeReuse: {
      status: 'supported',
      async readAction({ digest, attempt }) {
        if (attempt.runnerId !== options.runnerId) {
          throw new TypeError('Tau HTTP action reads require the configured runner attempt identity.');
        }
        const response = await request('actions/read', {
          jobId: attempt.jobId,
          attemptId: attempt.attemptId,
          attempt: attempt.attempt,
          actionDigest: digest,
        });
        const status = parseString(response['status'], 'status');
        if (status === 'miss') {
          return { status: 'miss' };
        }
        if (status !== 'hit') {
          throw new TypeError(`Tau action read response used unsupported status ${status}.`);
        }
        const record = parseActionRecord(response['record']);
        if (record.actionDigest !== digest) {
          throw new TypeError('Tau action read response returned a different action digest.');
        }
        return { status: 'hit', record };
      },
      async publishAction({ record, attempt }) {
        if (attempt.runnerId !== options.runnerId) {
          throw new TypeError('Tau HTTP action writes require the configured runner attempt identity.');
        }
        const validated = validateActionRecordPublication(record);
        const response = await request('actions/publish', {
          jobId: attempt.jobId,
          attemptId: attempt.attemptId,
          attempt: attempt.attempt,
          record: validated,
        });
        const status = parseString(response['status'], 'status');
        if (status !== 'published' && status !== 'existing') {
          throw new TypeError(`Tau action publication response used unsupported status ${status}.`);
        }
        return { status };
      },
    },
  });
};
