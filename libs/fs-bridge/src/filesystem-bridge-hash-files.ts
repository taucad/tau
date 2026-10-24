/**
 * `hashFiles` on the host's side of the filesystem bridge.
 *
 * A client that must prove a set of files unchanged used to read every body
 * across the wire and digest it on its own side. The host holds the bytes, so it
 * digests them there and answers once with the digests: one round trip, no
 * bodies. Bytes stay the evidence; a size or mtime stamp would let a same-length
 * rewrite inside one mtime tick read as unchanged.
 */

import type { StringKeyedObject } from '@taucad/rpc/bridge';
import { sha256Bytes } from '@taucad/utils/hash';
import type { FileSystemBridgeHashFiles } from '#filesystem-bridge-protocol.js';

/**
 * Files digested at once. Each holds its body only until it is hashed, so this
 * bounds the host's transient peak to a few bodies rather than the whole set.
 */
const hashConcurrency = 8;

const isNotFound = (error: unknown): boolean => {
  const code = (error as { code?: unknown } | undefined)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
};

type ByteReader = (path: string) => Promise<Uint8Array<ArrayBuffer>>;

/**
 * Digest each path from the host's own reader, absence included.
 *
 * @param readFile - The host's binary read for the connection's view.
 * @returns A `hashFiles` answering for the same view, masking included.
 */
const hashFilesFromReader =
  (readFile: ByteReader): FileSystemBridgeHashFiles =>
  async (paths) => {
    const unique = [...new Set(paths)];
    const digests: Record<string, string> = {};
    let next = 0;
    const drain = async (): Promise<void> => {
      while (next < unique.length) {
        const path = unique[next++]!;
        let bytes: Uint8Array<ArrayBuffer>;
        try {
          // oxlint-disable-next-line no-await-in-loop -- bounded pool: each lane reads one body at a time.
          bytes = await readFile(path);
        } catch (error) {
          if (!isNotFound(error)) {
            throw error;
          }
          digests[path] = 'missing';
          continue;
        }
        // oxlint-disable-next-line no-await-in-loop -- bounded pool: the body is released once hashed.
        digests[path] = await sha256Bytes(bytes);
      }
    };
    await Promise.all(Array.from({ length: Math.min(hashConcurrency, unique.length) }, drain));
    return digests;
  };

/**
 * Serve `hashFiles` beside a rooted handler set that reads files.
 *
 * A handler that brings its own `hashFiles` keeps it. One that can `readFile`
 * gains one derived from that read, so every host the bridge fronts answers the
 * call where the bytes live. Members are bound to the original handler set, so
 * class instances with private state stay intact.
 *
 * @param handlers - The handlers one connection is served.
 * @returns The same handlers, answering `hashFiles` when they can read.
 */
export const withHostHashFiles = <Handlers extends StringKeyedObject>(handlers: Handlers): Handlers => {
  const served = handlers as Record<string, unknown>;
  if (typeof served['hashFiles'] === 'function' || typeof served['readFile'] !== 'function') {
    return handlers;
  }
  const readFile = served['readFile'] as (path: string) => Promise<Uint8Array<ArrayBuffer>>;
  const hashFiles = hashFilesFromReader(async (path) => readFile.call(handlers, path));
  return new Proxy(handlers, {
    get(target, property) {
      if (property === 'hashFiles') {
        return hashFiles;
      }
      const value: unknown = Reflect.get(target, property, target);
      const descriptor = Reflect.getOwnPropertyDescriptor(target, property);
      /* A frozen member must be returned as itself (proxy invariant). */
      const frozen = descriptor?.configurable === false && descriptor.writable === false;
      return typeof value === 'function' && !frozen ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
    has(target, property) {
      return property === 'hashFiles' || Reflect.has(target, property);
    },
  });
};

/**
 * Whether a handler set answers `hashFiles`, which its hello then advertises.
 *
 * @param handlers - The handlers one connection is served.
 * @returns `true` when `hashFiles` is callable on them.
 */
export const answersHashFiles = (handlers: StringKeyedObject): boolean =>
  typeof (handlers as { hashFiles?: unknown }).hashFiles === 'function';
