import { describe, it, expect } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { ChatVertexAI } from '@langchain/google-vertexai';
import { ProviderService } from '#api/providers/provider.service.js';
import type { Environment } from '#config/environment.config.js';

describe('ProviderService vertexai', () => {
  /**
   * `streamFunctionCallArguments` is the native-wire twin of the
   * `extra_body.google` flag the funded gateway refuses: the Google client
   * turns it into `toolConfig.functionCallingConfig.streamFunctionCallArguments`
   * on `generateContent`, and emits that `toolConfig` even for a tool-free turn.
   * Vertex sheds requests carrying it with a pre-stream 499 under shared-quota
   * pressure, so the API's own helper turns must not construct it either
   * (blueprint Finding 1; review finding 3).
   */
  it('should construct the Vertex model without the streamed tool-argument flag', () => {
    const configService: Pick<ConfigService, 'get'> = {
      get: (key: string) =>
        key === 'GOOGLE_VERTEX_AI_CREDENTIALS'
          ? /* eslint-disable-next-line @typescript-eslint/naming-convention -- Google's service-account JSON keys. */
            { client_email: 'test@example.com', private_key: 'test-key', project_id: 'test-project' }
          : undefined,
    };

    const providerService = new ProviderService(configService as unknown as ConfigService<Environment, true>);
    const model = providerService.createModelClass('vertexai', { model: 'gemini-3.8-flash' }) as ChatVertexAI;

    expect(model.invocationParams({}).streamFunctionCallArguments).toBeUndefined();
  });
});
