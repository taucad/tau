import { createRuntimeClient } from '@taucad/runtime/client';
import { createElectronClientOptions } from '@taucad/runtime/electron/renderer';
import { ENV } from '#environment.config.js';
import { createUiRuntimeConfig } from '#runtime/ui-runtime.config.js';
import { observeRuntimeClient } from '#telemetry/runtime-telemetry.js';
import type { runtime } from '#runtime/ui-runtime.definition.js';
import type { AttachmentImageBackend } from '#services/attachment-image.service.js';

/**
 * Desktop conversion: an ephemeral Electron utility process running the `default` runtime, which registers the raster
 * transcoder through `image()`. One scratch utility per client; the service releases it when idle or after a failure.
 */
export const attachmentImageBackend: AttachmentImageBackend = {
  async createClient() {
    const options = await createElectronClientOptions<typeof runtime>({
      config: createUiRuntimeConfig(ENV),
      context: { purpose: 'ephemeral', definition: 'default' },
    })();
    const client = createRuntimeClient(options);
    /* Runtime observability (FR-14): conversion attempts, attached before `connect()`. */
    const stopObserving = observeRuntimeClient(client, 'attachment');
    return {
      connect: async () => client.connect(),
      setTranscodeTimeout: (milliseconds) => {
        client.setTranscodeTimeout(milliseconds);
      },
      transcode: client.transcode.bind(client),
      terminate: () => {
        client.terminate();
        stopObserving();
      },
    };
  },
};
