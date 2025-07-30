import { Module } from '@nestjs/common';
import { CodeCompletionController } from '#api/code-completion/code-completion.controller.js';
import { CodeCompletionService } from '#api/code-completion/code-completion.service.js';

@Module({
  imports: [],
  controllers: [CodeCompletionController],
  providers: [CodeCompletionService],
  exports: [CodeCompletionService],
})
export class CodeCompletionModule {}
