import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ChatModule } from './chat/chat.module';
import { ModelModule } from './chat/model.module';

@Module({
  imports: [ChatModule, ModelModule, ConfigModule.forRoot()],
  controllers: [],
  providers: [],
})
export class AppModule {}
