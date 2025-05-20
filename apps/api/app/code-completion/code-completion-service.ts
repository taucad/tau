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
          model: openai('gpt-4o-mini'),
          system: prompt.context,
          prompt: `${prompt.instruction}\n\n${prompt.fileContent}`,
          temperature: 0.2,
          maxTokens: 256,
        });

        return {
          text,
        };
      },
    });
  }

  public async complete(body: CompletionRequestBody): Promise<unknown> {
    return this.copilot.complete({ body });
  }
}
