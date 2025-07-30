import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import type { OpenAIProvider } from '@ai-sdk/openai';
import { generateText } from 'ai';
import type { Environment } from '#config/environment.config.js';

export type FileEditRequest = {
  targetFile: string;
  originalContent: string;
  codeEdit: string;
};

export type FileEditResult = {
  success: boolean;
  message: string;
  error?: string;
  editedContent?: string;
};

@Injectable()
export class FileEditService {
  private readonly openai: OpenAIProvider;

  public constructor(private readonly configService: ConfigService<Environment, true>) {
    const morphApiKey = this.configService.get<string>('MORPH_API_KEY', { infer: true });

    if (!morphApiKey) {
      throw new Error('MORPH_API_KEY is required for file editing functionality');
    }

    this.openai = createOpenAI({
      apiKey: morphApiKey,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- baseURL is the correct property name for OpenAI SDK
      baseURL: 'https://api.morphllm.com/v1',
    });
  }

  public async applyFileEdit(request: FileEditRequest): Promise<FileEditResult> {
    try {
      // Use the provided original content instead of reading from filesystem
      const { originalContent, codeEdit } = request;

      // Send to Morph API using AI SDK
      const { text } = await generateText({
        model: this.openai('morph-v2'),
        prompt: `<code>${originalContent}</code>\n<update>${codeEdit}</update>`,
      });

      return {
        success: true,
        message: `File edit applied successfully`,
        editedContent: text,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      return {
        success: false,
        message: `Error applying file edit`,
        error: errorMessage,
      };
    }
  }
}
