import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile, realpath, rename, rm } from 'node:fs/promises';
import { basename, dirname, join, relative, sep } from 'node:path';

/** Keep the previous resource available if installing a verified replacement fails. */
export const replaceResourceDirectory = async (temporary: string, output: string): Promise<void> => {
  const backup = join(dirname(output), `.${basename(output)}.backup-${randomUUID()}`);
  let backedUp = false;
  try {
    await rename(output, backup);
    backedUp = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
  try {
    await rename(temporary, output);
  } catch (error) {
    if (backedUp) {
      try {
        await rename(backup, output);
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          `Resource replacement failed; previous resource remains at ${backup}`,
        );
      }
    }
    throw error;
  }
  if (backedUp) {
    await rm(backup, { recursive: true });
  }
};

const sha256 = async (path: string): Promise<string> => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk as Uint8Array<ArrayBuffer>);
  }
  return hash.digest('hex');
};

/** Verify the selected OCP wheel's installed payload without executing target Python. */
export const verifyOcpWheel = async (
  sitePackages: string,
  options: { readonly ocpVersion: string; readonly targetName: string; readonly expectedRecordSha256?: string },
): Promise<string> => {
  const { ocpVersion, targetName, expectedRecordSha256 } = options;
  const recordPath = join(sitePackages, `cadquery_ocp_novtk-${ocpVersion}.dist-info`, 'RECORD');
  const record = await readFile(recordPath);
  const recordSha256 = createHash('sha256').update(record).digest('hex');
  if (expectedRecordSha256 && recordSha256 !== expectedRecordSha256) {
    throw new Error('OCP wheel RECORD integrity mismatch');
  }

  const root = await realpath(sitePackages);
  const seen = new Set<string>();
  const extension = targetName.startsWith('win32-') ? 'pyd' : 'so';
  let nativeCount = 0;
  for (const line of record.toString('utf8').split(/\r?\n/)) {
    if (!line.startsWith('OCP/') && !line.startsWith('"OCP/')) {
      continue;
    }
    const fields = /^(OCP\/[^\n\r,]+),sha256=([\w-]{43}),(0|[1-9]\d*)$/.exec(line);
    if (!fields) {
      throw new Error('Malformed OCP wheel RECORD entry');
    }
    const [, path, expectedDigest, sizeText] = fields;
    const segments = path!.split('/');
    if (segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.includes('\\'))) {
      throw new Error(`Unsafe OCP wheel path: ${path}`);
    }
    if (seen.has(path!)) {
      throw new Error(`Duplicate OCP wheel path: ${path}`);
    }
    seen.add(path!);
    if (new RegExp(`^OCP/OCP\\.[^/]+\\.${extension}$`).test(path!)) {
      nativeCount += 1;
    }

    const file = join(root, ...segments);
    // oxlint-disable-next-line no-await-in-loop -- sequential hashing bounds disk pressure and memory use.
    const metadata = await lstat(file);
    // oxlint-disable-next-line no-await-in-loop -- inspect each path before reading its bytes.
    const actual = await realpath(file);
    const within = relative(root, actual);
    if (!metadata.isFile() || !within || within === '..' || within.startsWith(`..${sep}`)) {
      throw new Error(`Unsafe OCP wheel file: ${path}`);
    }
    if (metadata.size !== Number(sizeText)) {
      throw new Error(`OCP wheel payload integrity mismatch: ${path}`);
    }
    // oxlint-disable-next-line no-await-in-loop -- stream one wheel payload at a time.
    const actualDigest = await sha256(file);
    if (actualDigest !== Buffer.from(expectedDigest!, 'base64url').toString('hex')) {
      throw new Error(`OCP wheel payload integrity mismatch: ${path}`);
    }
  }
  if (nativeCount !== 1) {
    throw new Error(`Expected one OCP native extension, found ${String(nativeCount)}`);
  }
  return recordSha256;
};
