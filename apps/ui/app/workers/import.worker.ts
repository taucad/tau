import JSZip from 'jszip';

/**
 * Messages sent TO the import worker.
 */
export type ImportWorkerRequest =
  | { type: 'startDownload'; url: string; headers?: Record<string, string> }
  | { type: 'cancel' };

/**
 * Messages sent FROM the import worker.
 */
export type ImportWorkerResponse =
  | { type: 'downloadProgress'; loaded: number; total: number }
  | { type: 'extractProgress'; processed: number; total: number }
  | {
      type: 'extractComplete';
      filePaths: string[];
      /** Same paths + contents so the main thread can populate `context.files` for the review UI and createProject. */
      files: Array<{ path: string; content: Uint8Array<ArrayBuffer> }>;
    }
  | { type: 'error'; message: string; phase: 'download' | 'extract' };

let extractedFiles: Map<string, Uint8Array<ArrayBuffer>> | undefined;
let abortController: AbortController | undefined;

function postResponse(response: ImportWorkerResponse): void {
  self.postMessage(response);
}

async function handleDownloadAndExtract(url: string, headers?: Record<string, string>): Promise<void> {
  abortController = new AbortController();

  try {
    const response = await fetch(url, {
      signal: abortController.signal,
      headers,
    });

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    }

    const contentLength = Number(response.headers.get('content-length') ?? 0);
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const chunks: Array<Uint8Array<ArrayBuffer>> = [];
    let receivedLength = 0;
    let lastProgressUpdate = 0;
    const progressInterval = 100;

    try {
      // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- standard stream reading pattern
      while (true) {
        if (abortController.signal.aborted) {
          // oxlint-disable-next-line no-await-in-loop -- need to cancel stream before returning
          await reader.cancel();
          return;
        }

        // oxlint-disable-next-line no-await-in-loop -- reading stream sequentially
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        chunks.push(value);
        receivedLength += value.length;

        const now = Date.now();
        if (now - lastProgressUpdate >= progressInterval || lastProgressUpdate === 0) {
          postResponse({ type: 'downloadProgress', loaded: receivedLength, total: contentLength });
          lastProgressUpdate = now;
        }
      }
    } finally {
      reader.releaseLock();
    }

    postResponse({ type: 'downloadProgress', loaded: receivedLength, total: contentLength });

    const zipData = new Uint8Array(receivedLength);
    let position = 0;
    for (const chunk of chunks) {
      zipData.set(chunk, position);
      position += chunk.length;
    }

    const zip = await JSZip.loadAsync(zipData);

    const fileEntries = Object.entries(zip.files).filter(([, file]) => !file.dir);
    const totalFiles = fileEntries.length;
    let processedFiles = 0;

    extractedFiles = new Map();

    for (const [path, file] of fileEntries) {
      const normalizedPath = path.split('/').slice(1).join('/');
      if (normalizedPath) {
        // oxlint-disable-next-line no-await-in-loop -- sequential file extraction for progress tracking
        const content = await file.async('uint8array');
        extractedFiles.set(normalizedPath, content as Uint8Array<ArrayBuffer>);
      }

      processedFiles++;
      postResponse({ type: 'extractProgress', processed: processedFiles, total: totalFiles });
    }

    postResponse({
      type: 'extractComplete',
      filePaths: [...extractedFiles.keys()],
      files: [...extractedFiles.entries()].map(([path, content]) => ({
        path,
        content,
      })),
    });
  } catch (error) {
    if (abortController.signal.aborted) {
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    postResponse({ type: 'error', message, phase: 'download' });
  }
}

globalThis.addEventListener('message', (event: MessageEvent<ImportWorkerRequest>) => {
  const message = event.data;

  switch (message.type) {
    case 'startDownload': {
      void handleDownloadAndExtract(message.url, message.headers);
      break;
    }
    case 'cancel': {
      abortController?.abort();
      extractedFiles = undefined;
      break;
    }
  }
});
