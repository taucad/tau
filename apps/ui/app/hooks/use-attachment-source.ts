/**
 * Resolve a file part's URL to something an `<img>` or download link can use
 * (blueprint §Flows: Render).
 *
 * An `attachments/<hash>.<ext>` reference is read from the directory that owns
 * it and served as an object URL. One object URL exists per absolute path,
 * however many consumers show it, and it is revoked when the last of them
 * unmounts. A `data:` URL (legacy rows, D14) passes through unchanged.
 *
 * `absent` is settled for the life of the consumer: bytes that arrive later (a
 * sync still landing) show once the part remounts. D19 asks only for the
 * placeholder.
 */

import { useEffect, useMemo, useState } from 'react';
import { createAttachmentStore } from '#db/attachment-store.js';
import { useOptionalFileManager } from '#hooks/use-file-manager.js';
import {
  attachmentFileName,
  attachmentReferenceOf,
  attachmentUrlPrefix,
  isSupportedAttachmentMediaType,
} from '#utils/attachment.utils.js';

/** What a consumer renders for one file part. */
export type AttachmentSource =
  | { readonly status: 'loading' }
  /** The bytes are not on this device (yet); render the placeholder. */
  | { readonly status: 'absent' }
  /** `byteLength` is known when the bytes were read here, not for a passthrough URL. */
  | { readonly status: 'ready'; readonly src: string; readonly byteLength?: number };

const loading: AttachmentSource = { status: 'loading' };
const absent: AttachmentSource = { status: 'absent' };

/** The label a consumer shows for an `absent` source. */
export const attachmentAbsentLabel = 'Not available on this device yet';

type CacheEntry = {
  consumers: number;
  source: Promise<AttachmentSource>;
  /** Set once the object URL exists, so the last release can revoke it. */
  url?: string;
};

// Ponytail: one module-level map keyed by absolute path; the path already names its directory.
const cache = new Map<string, CacheEntry>();

type AttachmentReader = Parameters<typeof createAttachmentStore>[0];

type AttachmentRequest = {
  readonly client: AttachmentReader;
  readonly directory: string;
  readonly url: string;
  readonly mediaType: string;
};

const pathOf = (directory: string, url: string): string => `${directory}/${url.slice(attachmentUrlPrefix.length)}`;

const load = async (entry: CacheEntry, request: AttachmentRequest): Promise<AttachmentSource> => {
  const bytes = await createAttachmentStore(request.client, request.directory).read(request.url);
  if (bytes === undefined) {
    return absent;
  }
  const objectUrl = URL.createObjectURL(new Blob([bytes], { type: request.mediaType }));
  if (entry.consumers === 0) {
    // Every consumer left while the bytes were loading.
    URL.revokeObjectURL(objectUrl);
  } else {
    entry.url = objectUrl;
  }
  return { status: 'ready', src: objectUrl, byteLength: bytes.byteLength };
};

const acquire = (request: AttachmentRequest): CacheEntry => {
  const path = pathOf(request.directory, request.url);
  const existing = cache.get(path);
  if (existing) {
    existing.consumers += 1;
    return existing;
  }
  const entry: CacheEntry = { consumers: 1, source: Promise.resolve(loading) };
  entry.source = load(entry, request);
  cache.set(path, entry);
  return entry;
};

const release = (path: string, entry: CacheEntry): void => {
  entry.consumers -= 1;
  if (entry.consumers > 0) {
    return;
  }
  cache.delete(path);
  if (entry.url !== undefined) {
    URL.revokeObjectURL(entry.url);
  }
};

/**
 * The name a download of this part is saved under: its own `filename`, else
 * the attachment's stored name, else `undefined` for the caller's fallback.
 */
export const attachmentDownloadName = (part: {
  readonly url: string;
  readonly mediaType: string;
  readonly filename?: string;
}): string | undefined => {
  if (part.filename !== undefined) {
    return part.filename;
  }
  const reference = attachmentReferenceOf(part);
  return reference && isSupportedAttachmentMediaType(reference.mediaType) ? attachmentFileName(reference) : undefined;
};

/**
 * Where a part's `attachments/` reference may live, most likely first. An open
 * edit names its composer's directory and then its chat's, because a sent
 * attachment it re-references stays only in the chat's.
 */
export type AttachmentDirectories = string | readonly string[] | undefined;

/**
 * The renderable source of one file part.
 *
 * @param directories - The absolute directories that may own the part's `attachments/` reference, in order; the
 *   first that holds the bytes wins.
 * @param part - The file part's URL and media type.
 * @returns `ready` with a URL to render, `loading`, or `absent` when no directory on this device holds the bytes.
 */
export function useAttachmentSource(
  directories: AttachmentDirectories,
  part: { readonly url: string; readonly mediaType: string },
): AttachmentSource {
  // Optional: a surface without a filesystem still renders `data:` parts, and shows references as absent.
  const client = useOptionalFileManager()?.files;
  const [resolved, setResolved] = useState<{ key: string; source: AttachmentSource } | undefined>(undefined);
  const isReference = attachmentReferenceOf(part) !== undefined;
  const listed = typeof directories === 'string' ? [directories] : (directories ?? []);
  // A string, so a caller's fresh array of the same directories does not re-read.
  const key =
    isReference && listed.length > 0 && client !== undefined
      ? listed.map((directory) => pathOf(directory, part.url)).join('\n')
      : undefined;
  const passthrough = useMemo<AttachmentSource>(() => ({ status: 'ready', src: part.url }), [part.url]);

  useEffect(() => {
    if (key === undefined || client === undefined) {
      return undefined;
    }
    const held: Array<{ path: string; entry: CacheEntry }> = [];
    let active = true;
    const settle = async (): Promise<void> => {
      for (const path of key.split('\n')) {
        const directory = path.slice(0, path.lastIndexOf('/'));
        const entry = acquire({ client, directory, url: part.url, mediaType: part.mediaType });
        held.push({ path, entry });
        // oxlint-disable-next-line no-await-in-loop -- directories are tried in order; a later one is read only when an earlier one lacks the bytes
        const source = await entry.source;
        if (!active) {
          return;
        }
        if (source.status !== 'absent') {
          setResolved({ key, source });
          return;
        }
      }
      setResolved({ key, source: absent });
    };
    // async-iife: bootstrap — the shared entries own the reads; a consumer that unmounted ignores their results
    void settle();
    return () => {
      active = false;
      for (const { path, entry } of held) {
        release(path, entry);
      }
    };
  }, [client, key, part.mediaType, part.url]);

  if (!isReference) {
    // `data:` and other legacy URLs render as they are.
    return passthrough;
  }
  if (key === undefined) {
    // Nowhere to read the bytes from on this surface.
    return absent;
  }
  return resolved?.key === key ? resolved.source : loading;
}
