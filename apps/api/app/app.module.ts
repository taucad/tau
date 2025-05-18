import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChatModule } from '~/chat/chat-module.js';
import { CodeCompletionModule } from '~/code-completion/code-completion-module.js';
import { getEnvironment } from '~/config.js';

@Module({
  imports: [ChatModule, CodeCompletionModule, ConfigModule.forRoot({ validate: getEnvironment })],
  controllers: [],
  providers: [],
})
export class AppModule {}
