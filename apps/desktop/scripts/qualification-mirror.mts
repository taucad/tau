/* oxlint-disable no-await-in-loop -- Bound artifact hashing memory by verifying sequentially. */
/** Isolated HTTPS transport for signed candidate bytes; never a public release publisher. */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat } from 'node:fs/promises';
import { createServer } from 'node:https';
import { pipeline } from 'node:stream/promises';

export type QualificationMirrorObject = {
  path: string;
  sha256: string;
  size: number;
  contentType: string;
};
export type QualificationMirrorRequest = { path: string; status: number; at: string };

/** Hash every admitted object before it can become reachable, including mutable index snapshots. */
export const verifyQualificationMirrorObject = async (object: QualificationMirrorObject): Promise<void> => {
  const info = await lstat(object.path);
  if (!info.isFile() || info.isSymbolicLink() || info.size !== object.size || !/^[a-f\d]{64}$/u.test(object.sha256)) {
    throw new Error('Qualification mirror object is not a regular, size-bound artifact');
  }
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(object.path)) {
    if (!(chunk instanceof Uint8Array)) {
      throw new TypeError('Expected artifact bytes');
    }
    hash.update(chunk);
  }
  if (hash.digest('hex') !== object.sha256) {
    throw new Error('Qualification mirror artifact digest differs');
  }
};

const admitPath = (path: string): void => {
  if (
    !/^\/(?:[A-Za-z0-9._~%-]+\/)*[A-Za-z0-9._~%-]+$/u.test(path) ||
    path.split('/').some((part) => part === '..' || part === '.')
  ) {
    throw new Error('Qualification mirror path refused');
  }
};

/**
 * Serve only an explicit object inventory on loopback. TLS trust is installed by the guarded host owner.
 * Each latest switch is atomic in memory; immutable release paths cannot be replaced.
 */
export const startQualificationMirror = async (options: {
  key: string;
  certificate: string;
  objects: ReadonlyMap<string, QualificationMirrorObject>;
  onRequest?: (request: QualificationMirrorRequest) => void;
}): Promise<{
  origin: string;
  requests: QualificationMirrorRequest[];
  addImmutable(objects: ReadonlyMap<string, QualificationMirrorObject>): Promise<void>;
  switchLatest(objects: ReadonlyMap<string, QualificationMirrorObject>): Promise<void>;
  setAvailable(available: boolean): void;
  close(): Promise<void>;
}> => {
  for (const [path, object] of options.objects) {
    admitPath(path);
    await verifyQualificationMirrorObject(object);
  }
  let inventory = new Map(options.objects);
  const requests: QualificationMirrorRequest[] = [];
  let available = true;
  const server = createServer({ key: options.key, cert: options.certificate }, (request, response) => {
    const path = request.url ?? '';
    const object = request.method === 'GET' && !request.headers.authorization ? inventory.get(path) : undefined;
    response.once('close', () => {
      const observation = {
        path: path.split('?')[0] ?? '',
        status: response.writableFinished ? response.statusCode : 499,
        at: new Date().toISOString(),
      };
      requests.push(observation);
      options.onRequest?.(observation);
    });
    if (!available) {
      response.writeHead(503).end();
      return;
    }
    if (!object) {
      response.writeHead(404).end();
      return;
    }
    // Verify immediately before streaming so a changed artifact never silently becomes trusted transport.
    const serve = async (): Promise<void> => {
      try {
        await verifyQualificationMirrorObject(object);
        response.writeHead(200, {
          'content-type': object.contentType,
          'content-length': object.size,
          'cache-control': 'no-store',
        });
        await pipeline(createReadStream(object.path), response);
      } catch {
        if (response.headersSent) {
          response.destroy();
        } else {
          response.writeHead(500).end();
        }
      }
    };
    // async-iife: the HTTP callback owns settlement and closes the response on failure.
    void serve();
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Qualification mirror has no loopback address');
  }
  return {
    origin: `https://127.0.0.1:${address.port}`,
    requests,
    async addImmutable(objects) {
      for (const [path, object] of objects) {
        admitPath(path);
        if (
          inventory.has(path) ||
          (!/^\/(?:releases|pool|snapshots)\//u.test(path) &&
            !/^\/dists\/(?:stable|staging)\/main\/binary-amd64\/by-hash\//u.test(path))
        ) {
          throw new Error('Immutable mirror path already exists or is outside releases');
        }
        await verifyQualificationMirrorObject(object);
      }
      inventory = new Map([...inventory, ...objects]);
    },
    async switchLatest(objects) {
      for (const [path, object] of objects) {
        admitPath(path);
        if (
          !path.startsWith('/latest/') &&
          !/^\/dists\/(?:stable|staging)\/(?:InRelease|Release(?:\.gpg)?|main\/binary-amd64\/Packages(?:\.gz)?)$/u.test(
            path,
          )
        ) {
          throw new Error('Qualification mirror cannot replace an immutable release');
        }
        await verifyQualificationMirrorObject(object);
      }
      inventory = new Map([...inventory, ...objects]);
    },
    setAvailable(value) {
      available = value;
    },
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    },
  };
};
