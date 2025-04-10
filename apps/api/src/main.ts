/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { urlencoded, json } from 'express';
import { AppModule } from './app/app.module';
import { urlencoded, json } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const globalPrefix = 'v1';
  app.setGlobalPrefix(globalPrefix);
  app.enableCors();
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));
  const port = process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(`🚀 Application is running on: http://localhost:${port}/${globalPrefix}`);
}

// eslint-disable-next-line unicorn/prefer-top-level-await
bootstrap();
