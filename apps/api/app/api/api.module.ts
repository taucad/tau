import { Module } from '@nestjs/common';
import { ChatModule } from '#api/chat/chat.module.js';
import { CodeCompletionModule } from '#api/code-completion/code-completion.module.js';
import { FileEditModule } from '#api/file-edit/file-edit.module.js';
import { ModelModule } from '#api/models/model.module.js';
import { ProviderModule } from '#api/providers/provider.module.js';
import { TestApiModule } from '#api/test-api/test-api.module.js';
import { ToolModule } from '#api/tools/tool.module.js';

@Module({
  imports: [
    // Production modules
    ChatModule,
    CodeCompletionModule,
    ModelModule,
    ProviderModule,
    ToolModule,
    FileEditModule,

    // Testing modules
    ...(import.meta.env.DEV ? [TestApiModule] : []),
  ],
})
export class ApiModule {}
