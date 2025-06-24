import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '~/database/database.module.js';
import { AuthModule } from '~/auth/auth.module.js';
import { getEnvironment } from '~/config/environment.config.js';
import { ApiModule } from '~/api/api.module.js';

@Module({
  imports: [
    ApiModule,
    DatabaseModule,
    AuthModule.forRootAsync(),
    ConfigModule.forRoot({ validate: getEnvironment, isGlobal: true }),
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
