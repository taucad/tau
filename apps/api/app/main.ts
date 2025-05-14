/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */
import process from 'node:process';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { AppModule } from '~/app.module.js';

// Create Fastify adapter with custom options for body size limits
const fastifyAdapter = new FastifyAdapter({
  bodyLimit: 50 * 1024 * 1024, // 50MB in bytes
});
const globalPrefix = 'v1';
const app = await NestFactory.create<NestFastifyApplication>(AppModule, fastifyAdapter);
app.setGlobalPrefix(globalPrefix);
app.enableCors();

if (import.meta.env.PROD) {
  async function bootstrap() {
    const port = process.env.PORT;
    await app.listen(port, '0.0.0.0'); // Listen on all network interfaces
    Logger.log(`🚀 Application is running on: http://localhost:${port}/${globalPrefix}`);
  }

  await bootstrap();
}

export const viteNodeApp = app;
