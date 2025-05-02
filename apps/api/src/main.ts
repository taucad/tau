/* eslint-disable unicorn/prefer-top-level-await, promise/prefer-await-to-then -- TODO: emit ESM and fix this */
/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import process from 'node:process';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { AppModule } from './app/app.module';

// Create Fastify adapter with custom options for body size limits
const fastifyAdapter = new FastifyAdapter({
  bodyLimit: 50 * 1024 * 1024, // 50MB in bytes
});
const globalPrefix = 'v1';
const app = NestFactory.create<NestFastifyApplication>(AppModule, fastifyAdapter).then((app) => {
  app.setGlobalPrefix(globalPrefix);
  app.enableCors();
  return app;
});

if (import.meta.env.PROD) {
  const port = process.env.PORT;
  void app.then(async (app) => app.listen(port, '0.0.0.0')); // Listen on all network interfaces
  Logger.log(`🚀 Application is running on: http://localhost:${port}/${globalPrefix}`);
}

export const viteNodeApp = app;
