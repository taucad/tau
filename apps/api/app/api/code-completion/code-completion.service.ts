import { Injectable } from '@nestjs/common';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { CompletionCopilot } from 'monacopilot';
import type { CompletionRequestBody } from 'monacopilot';

@Injectable()
export class CodeCompletionService {
  private readonly copilot: CompletionCopilot;

  public constructor() {
    this.copilot = new CompletionCopilot(undefined, {
      async model(prompt) {
        const { text } = await generateText({
          model: openai('gpt-4.1-nano'),
          system: prompt.context,
          prompt: `<instructions>${prompt.instruction}</instructions><file-content>${prompt.fileContent}</file-content>`,
          temperature: 0.2,
          maxOutputTokens: 256,
        });

        return {
          text,
        };
      },
    });
  }

  public async complete(body: CompletionRequestBody): Promise<unknown> {
    return this.copilot.complete({ body: { completionMetadata: { ...body.completionMetadata, technologies: [] } } });
  }
}
