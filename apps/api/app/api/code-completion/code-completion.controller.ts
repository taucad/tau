import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import type { CompletionRequestBody } from 'monacopilot';
import { CodeCompletionService } from '~/api/code-completion/code-completion.service.js';
import { AuthGuard } from '~/auth/auth.guard.js';

@UseGuards(AuthGuard)
@Controller({ path: 'code-completion', version: '1' })
export class CodeCompletionController {
  public constructor(private readonly codeCompletionService: CodeCompletionService) {}

  @Post()
  public async getCompletion(@Body() body: CompletionRequestBody): Promise<unknown> {
    return this.codeCompletionService.complete(body);
  }
}
