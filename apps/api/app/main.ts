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

async function bootstrap() {
  // Create Fastify adapter with custom options for body size limits
  const fastifyAdapter = new FastifyAdapter({
    bodyLimit: 50 * 1024 * 1024, // 50MB in bytes
  });
  const globalPrefix = 'v1';
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, fastifyAdapter);

  app.setGlobalPrefix(globalPrefix);
  app.enableCors({
    origin: [process.env.TAU_FRONTEND_URL],
    credentials: true,
  });

  if (import.meta.env.PROD) {
    const port = process.env.PORT;
    await app.listen(port, '0.0.0.0'); // Listen on all network interfaces
    Logger.log(`🚀 Application is running on: http://localhost:${port}/${globalPrefix}`, 'Bootstrap');
  }

  return app;
}

// Hot Module Replacement using Vite's HMR API
let app!: NestFastifyApplication;

if (import.meta.hot) {
  const startApp = async () => {
    app = await bootstrap();
  };

  await startApp();

  import.meta.hot.accept();
  import.meta.hot.dispose(async () => {
    await app.close();
  });
} else {
  // Production or non-HMR environment
  app = await bootstrap();
}

// Export as const to satisfy linter
export const viteNodeApp = app;
