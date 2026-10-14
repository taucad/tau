/**
 * Read a remote response while enforcing the byte budget before buffering it.
 * @internal
 * @param response - Remote response stream.
 * @param maximumBytes - Maximum allowed response bytes.
 * @returns Bounded decoded source text.
 */
export const readPackageResponse = async (response: Response, maximumBytes: number): Promise<string> => {
  if (Number(response.headers.get('content-length')) > maximumBytes) {
    throw new Error(`Response exceeds ${maximumBytes} bytes.`);
  }
  if (response.body === null) {
    return '';
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytes = 0;
  try {
    for (;;) {
      // oxlint-disable-next-line no-await-in-loop -- streaming enforces a bounded response budget
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      bytes += chunk.value.byteLength;
      if (bytes > maximumBytes) {
        // oxlint-disable-next-line no-await-in-loop -- cancel an oversized stream immediately
        await reader.cancel();
        throw new Error(`Response exceeds ${maximumBytes} bytes.`);
      }
      chunks.push(decoder.decode(chunk.value, { stream: true }));
    }
    return chunks.join('') + decoder.decode();
  } finally {
    reader.releaseLock();
  }
};
