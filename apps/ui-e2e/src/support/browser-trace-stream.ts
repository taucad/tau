import { writeFile } from 'node:fs/promises';

/**
 * Drain the existing finite CDP trace stream without decoding proto as text.
 *
 * @param read - Next IO.read response from the owned trace stream.
 * @param tracePath - Existing raw artifact destination.
 * @param format - JSON by default; proto requires binary responses.
 * @returns Number of decoded bytes retained in the raw artifact.
 */
export const writeBrowserTraceStream = async (
  read: () => Promise<{ data: string; base64Encoded?: boolean; eof: boolean }>,
  tracePath: string,
  format: 'json' | 'proto' = 'json',
): Promise<number> => {
  let traceBytes = 0;
  await writeFile(tracePath, '');
  for (let chunk = 0; chunk < 1024; chunk += 1) {
    // oxlint-disable-next-line no-await-in-loop -- Stream chunks must be appended in the returned order.
    const result = await read();
    if (format === 'proto' ? result.base64Encoded !== true : result.base64Encoded) {
      throw new Error(
        format === 'proto'
          ? 'Scale proto trace requires a binary transport.'
          : 'Scale trace unexpectedly uses a binary transport.',
      );
    }
    const data = format === 'proto' ? Buffer.from(result.data, 'base64') : result.data;
    traceBytes += typeof data === 'string' ? new TextEncoder().encode(data).byteLength : data.byteLength;
    if (traceBytes > 67_108_864) {
      throw new Error('Scale trace exceeded its 64 MiB artifact cap.');
    }
    // oxlint-disable-next-line no-await-in-loop -- Append the checked raw chunk before requesting another.
    await writeFile(tracePath, data, { flag: 'a' });
    if (result.eof) {
      break;
    }
    if (chunk === 1023) {
      throw new Error('Scale trace did not finish inside its finite stream limit.');
    }
  }
  return traceBytes;
};
