import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ChatModule } from './chat/chat.module';
import { getEnvironment } from './config';

@Module({
  imports: [ChatModule, ConfigModule.forRoot({ validate: getEnvironment })],
  controllers: [],
  providers: [],
})
export class AppModule {}
