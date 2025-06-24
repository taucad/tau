import { Body, Controller, Post } from '@nestjs/common';
import type { CompletionRequestBody } from 'monacopilot';
import { CodeCompletionService } from '~/api/code-completion/code-completion.service.js';

@Controller('code-completion')
export class CodeCompletionController {
  public constructor(private readonly codeCompletionService: CodeCompletionService) {}

  @Post()
  public async getCompletion(@Body() body: CompletionRequestBody): Promise<unknown> {
    return this.codeCompletionService.complete(body);
  }
}
