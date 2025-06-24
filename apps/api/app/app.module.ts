import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChatModule } from '~/chat/chat.module.js';
import { CodeCompletionModule } from '~/code-completion/code-completion.module.js';
import { DatabaseModule } from '~/database/database.module.js';
import { AuthModule } from '~/auth/auth.module.js';
import { getEnvironment } from '~/config/environment.config.js';

@Module({
  imports: [
    ChatModule,
    CodeCompletionModule,
    DatabaseModule,
    AuthModule.forRootAsync(),
    ConfigModule.forRoot({ validate: getEnvironment, isGlobal: true }),
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
